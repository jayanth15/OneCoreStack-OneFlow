# OneFlow Internal Request Rework — Design

**Date:** 2026-06-19
**Status:** Approved (awaiting user review of written spec)
**Owner:** OneFlow
**Builds on:** `2026-06-18-oneflow-unified-request-design.md` (the unified `Request` model)

## Context

OneFlow's unified `Request` model (introduced 2026-06-18) handles three request types: `internal_transfer`, `vendor_purchase`, and `customer_dispatch`. The "internal request" feature corresponds to `request_type = "internal_transfer"`.

The current internal request flow has a critical gap in the **delivery → confirmation loop**:

- The `awaiting_signoff` status exists in the enum but is **never set by any endpoint** (dead status).
- Per-item `item_status = "delivered"` exists in the model/API but has **no UI**.
- Delivery confirmation lives in a separate, mostly-orphaned `RequestReceipt` entity whose `create` endpoint is never called from any frontend page, whose `can_create_receipt` permission flag is plumbed but never enforced, and whose notification hooks (`create_notification`) are never invoked.
- The **fulfilling department has no way to discover** that an approved request is waiting for them — there is no dept-targeted inbox, badge, or notification. The red sidebar "Requests" badge counts `status=pending` for all users (not dept-targeted), and once an admin approves a request it drops out of every badge.
- The requester can currently cancel a request while `pending` — the user requirement is that **only admin can cancel**.

## Goals

- Rework the internal request flow so the **fulfilling department** drives delivery and asks the requester for confirmation (currently the direction is reversed / incomplete).
- Merge the `RequestReceipt` subsystem into the `Request` entity itself — eliminating a mostly-dead subsystem and its dead permission plumbing.
- Wire up the existing (dead) notification infrastructure so the bell + sidebar badges actually surface request lifecycle events, including dept-targeted "needs my action" indication on the sidebar.
- Restrict cancellation to admin only.
- Preserve the admin approval gate (`pending` → `approved`).
- Preserve existing department-based acceptance authorization (`_user_can_accept` dept-code matching).
- Preserve the user-creation "Can Raise Requests To" department grid (already works, no change).

## Non-goals (YAGNI)

- Partial / multi-batch deliveries — the fulfilling department delivers all items at once before raising confirmation (decided).
- Per-item delivery UI — delivery is all-at-once, so no per-item accept/deliver UI is needed.
- Auto-close of `awaiting_signoff` requests after a timeout — admin can override if needed (decided).
- New request types or status values — reuse the existing 7-status enum; only activate `awaiting_signoff`.
- Removing the legacy `PurchaseRequest` / `MarketingRequest` shadow tables — they are already read-only shadows from the previous migration and out of scope for this rework.
- Replacing the legacy `PurchaseRequest` references in the GRN system and `purchase-orders` / `gate-passes` frontend pages — GRN is a separate domain (vendor goods into inventory) with zero `RequestReceipt` coupling; leave as-is.
- Adding a dedicated notifications page — the existing bell + dropdown in the top bar is sufficient once `create_notification` is wired.
- Email / push notifications — in-app notifications only.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Admin approval gate | **Keep** (`pending` → `approved` before dept can accept) |
| 2 | Delivery granularity | **All-at-once** (whole request marked delivered in one action) |
| 3 | Confirmation timeout | **None** — request stays in `awaiting_signoff` until requester confirms; admin can override |
| 4 | Receipt entity | **Merge into `Request`** — remove `RequestReceipt` entirely; add delivery/acknowledgment fields to `Request` |
| 5 | Confirmation direction | Fulfilling dept marks delivered → requester acknowledges → `received` |
| 6 | Cancel permission | **Admin only**, at any status (was: requester-or-admin while `pending`) |
| 7 | Existing receipts page | **Remove entirely** — delivery/confirmation happens inside the request detail dialog |
| 8 | Dept discovery of pending action | New `GET /api/v1/requests/inbox` endpoint + repoint sidebar red badge to it |
| 9 | Notifications | Wire existing `create_notification` helper into each lifecycle transition (fan-out to dept users on approve) |
| 10 | `can_create_receipt` user flag | **Remove** — dead, unenforced |
| 11 | Legacy `Receipt` shadow table | **Remove** (no runtime code reads it) |

## Status Lifecycle (reworked)

```
pending  →  approved  →  in_progress  →  awaiting_signoff  →  received
 [create]   [admin       [fulfilling      [fulfilling dept     [requester
             approve]     dept accepts]    marks delivered]     confirms]
   ↓            ↓
 not_approved  cancelled  (admin only, at any status)
```

| Status | Meaning | Who acts next |
|---|---|---|
| `pending` | Requester created; awaiting admin approval | admin |
| `approved` | Admin approved; awaiting fulfilling dept to accept | fulfilling dept |
| `in_progress` | Fulfilling dept accepted; handling the request | fulfilling dept |
| `awaiting_signoff` | Fulfilling dept marked items delivered; awaiting requester confirmation | requester |
| `received` | Requester confirmed delivery → request fulfilled | (terminal) |
| `not_approved` | Admin rejected | (terminal) |
| `cancelled` | Admin cancelled at any status | (terminal) |

`awaiting_signoff` already exists in the enum (`backend/app/schemas/request.py`) but is currently never set by any endpoint. This rework activates it.

## Data Model Changes

### `Request` model — add fields (replacing `RequestReceipt`)

File: `backend/app/models/request.py`

```python
# New delivery fields (set when fulfilling dept marks delivered)
delivered_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
delivered_by_username: Optional[str] = Field(default=None)
delivered_at: Optional[datetime] = Field(default=None)
delivery_note: Optional[str] = Field(default=None)

# New acknowledgment fields (set when requester confirms receipt)
acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
acknowledged_by_username: Optional[str] = Field(default=None)
acknowledged_at: Optional[datetime] = Field(default=None)
acknowledgment_note: Optional[str] = Field(default=None)
```

Existing fields `fulfilled_by_user_id` / `fulfilled_by_username` / `fulfillment_accepted_at` / `fulfillment_note` already cover the "dept accepts" → `in_progress` step. No change to those.

### `Notification.type` — extend documented enum

File: `backend/app/models/notification.py`

Documented `type` values become: `request_approved | request_rejected | request_accepted | request_delivered | request_received | request_cancelled` (replaces the old `request_responded | receipt_created | receipt_acknowledged` list that was never used).

### `RequestHistory.change_type` — extend documented enum

File: `backend/app/models/request_history.py`

Documented `change_type` values gain: `delivered | delivery_acknowledged` (replaces `receipt_created | receipt_acknowledged | receipt_deleted` which will no longer be emitted).

### Removed models / tables / schemas / routers

| File | Action |
|---|---|
| `backend/app/models/request_receipt.py` (`request_receipt` table) | delete |
| `backend/app/schemas/request_receipt.py` | delete |
| `backend/app/routers/request_receipts.py` | delete |
| `backend/app/routers/receipts.py` (shim) | delete |
| `backend/app/models/receipt.py` (legacy shadow `receipt` table) | delete |
| `backend/app/models/__init__.py` | remove `RequestReceipt` + `Receipt` imports |
| `backend/app/main.py` | remove both receipt router includes/imports |
| `backend/app/core/database.py` | remove `receipt` / `request_receipt` table migration blocks |
| `backend/app/models/user.py` | remove `can_create_receipt` field |
| `backend/app/routers/users.py` | remove `can_create_receipt` from `UserCreate`/`UserUpdate`/`UserResponse`/read/write |
| `backend/app/routers/auth.py` | remove `can_create_receipt` from `/me` response |
| `backend/app/core/database.py` | leave the `can_create_receipt` add-column migration in place (idempotent/harmless on existing DBs); the column becomes dead-but-present on SQLite (dropping a column requires a full table rebuild, not worth the risk) |

### Frontend removals

| File | Action |
|---|---|
| `frontend/app/dashboard/receipts/page.tsx` | delete |
| `frontend/lib/request-receipts.ts` | delete |
| `frontend/components/app-sidebar.tsx` (dead, never rendered) | delete |
| `frontend/lib/user.ts` | remove `can_create_receipt` from `CurrentUser` |
| `frontend/app/login/page.tsx` | remove `can_create_receipt` from stored user state |
| `frontend/app/dashboard/admin/users/new/page.tsx` | remove `can_create_receipt` checkbox |
| `frontend/app/dashboard/admin/users/[id]/edit/page.tsx` | remove `can_create_receipt` checkbox |

## API Endpoints

### New endpoints on `/api/v1/requests`

> **Type guard:** the `deliver` and `acknowledge-delivery` endpoints apply to `internal_transfer` and `vendor_purchase` only. `customer_dispatch` is an outbound flow (goods leaving to a customer) and never had delivery confirmation — calling these endpoints on a `customer_dispatch` request returns `400 Bad Request`. The `inbox` endpoint returns `internal_transfer` + `vendor_purchase` requests only (filtered by dept targeting).

| Method | Path | Auth | Effect |
|---|---|---|---|
| `POST` | `/{id}/deliver` | fulfilling dept user (passes `_user_can_accept`) or admin | only when `status == "in_progress"`; sets `delivered_by_*`, `delivered_at`, `delivery_note`; status → `awaiting_signoff`; logs `delivered` history; notifies requester (`request_delivered`) |
| `POST` | `/{id}/acknowledge-delivery` | original requester (`requested_by_user_id == current_user.id`) or admin | only when `status == "awaiting_signoff"`; sets `acknowledged_by_*`, `acknowledged_at`, `acknowledgment_note`; status → `received`; logs `delivery_acknowledged` history; notifies fulfilling dept users (`request_received`) |
| `GET` | `/inbox` | any auth user | returns requests where `status ∈ {approved, in_progress, awaiting_signoff}` AND the target department ∈ the current user's departments (reuses `_user_can_accept` targeting logic). Drives the sidebar "needs my action" badge and the requests-page "Inbox" tab. |

### New request schemas (in `backend/app/schemas/request.py`)

```python
class RequestDeliverAction(BaseModel):
    delivery_note: Optional[str] = None

class RequestAcknowledgeDeliveryAction(BaseModel):
    acknowledgment_note: Optional[str] = None
```

### Modified endpoints

| Endpoint | Change |
|---|---|
| `DELETE /{id}` (cancel) | **admin only** — change dependency from "requester or admin" to `require_admin`. Requester can no longer cancel. Notifies requester + fulfilling dept users (`request_cancelled`). |
| `POST /{id}/review` (approve) | on approve → fan-out `create_notification(request_approved)` to **all users in the target department** (resolved via `user_departments` M2M for the request's `department` code) **and** to the requester. |
| `POST /{id}/review` (reject) | on reject → notify requester (`request_rejected`). |
| `POST /{id}/accept` | on accept → notify requester (`request_accepted`). |
| `GET /{id}/history` | unchanged — returns history including new `delivered` / `delivery_acknowledged` change types. |
| `GET /{id}` and list endpoints | `RequestRead` / `RequestListRead` extended with the new delivery + acknowledgment fields (read-only). |

### Removed endpoints

- All of `/api/v1/request-receipts` (delete router)
- All of `/api/v1/receipts` (delete shim router)

## Authorization Rules

| Action | Who can do it | Enforcement |
|---|---|---|
| Create internal request | any active user, limited to their `request_departments` (non-admin) | unchanged (existing `request_departments` CSV check) |
| Approve / reject | admin / super_admin | unchanged (`require_admin`) |
| Accept fulfilment (`approved` → `in_progress`) | user in target dept (dept-code match) or admin | unchanged (`_user_can_accept`) |
| Mark delivered (`in_progress` → `awaiting_signoff`) | user in target dept (dept-code match) or admin | reuse `_user_can_accept` logic |
| Confirm receipt (`awaiting_signoff` → `received`) | original requester (`requested_by_user_id`) or admin | new check in `acknowledge_delivery` |
| Cancel | **admin only**, at any active status | changed — `require_admin` dependency |
| Manual status override | admin only | unchanged (no UI) |

## Notifications & Sidebar Badges

The `create_notification` helper (`backend/app/routers/notifications.py:50`) exists but is never called. This rework wires it into each lifecycle transition. The bell UI + blue sidebar badge (`top-bar.tsx` `NotificationBell` + `desktop-sidebar.tsx` blue badge) already work once data flows — no frontend notification work needed beyond the badge repoint below.

### Notification events

| Event | Notify whom | `type` |
|---|---|---|
| Admin approves | all users in target department + requester | `request_approved` |
| Admin rejects | requester | `request_rejected` |
| Fulfilling dept accepts | requester | `request_accepted` |
| Fulfilling dept marks delivered | requester | `request_delivered` |
| Requester confirms receipt | all users in target department | `request_received` |
| Admin cancels | requester + fulfilling dept users (if a target dept is set) | `request_cancelled` |

### Dept fan-out helper (new, in `requests_helpers.py`)

```python
def notify_department_users(session, department_code: str, notif_type: str, title: str, body: str, request_id: int) -> None:
    """Create a notification for every active user belonging to the department with the given code."""
    # resolve department.code -> department.id
    # resolve user_departments.user_id where department_id matches
    # for each user_id, call create_notification(...)
```

### Sidebar / bottom-nav badges (repoint)

File: `frontend/components/layout/desktop-sidebar.tsx` and `frontend/components/layout/bottom-nav.tsx`

| Badge | Before | After |
|---|---|---|
| Red "Requests" badge | `requestsApi.list({ status: "pending" })` — coarse, shown to all | `requestsApi.inbox()` → `GET /api/v1/requests/inbox` — dept-targeted "needs my action" count |
| Amber "Receipts" badge + nav entry | `requestReceiptsApi.list({ status: "pending_ack" })` | **removed** (receipts page gone) |
| Blue notification badge | `/api/v1/notifications/unread-count` (always 0) | unchanged — lights up automatically once `create_notification` is wired |

The red badge repoint is what the user described as "indication on the left sidebar if there is a request pending" — it becomes dept-targeted so a fulfilling dept user sees count of requests awaiting their action.

### Frontend API client additions

File: `frontend/lib/requests.ts`

Add `requestsApi.inbox()` → `GET /api/v1/requests/inbox`, `requestsApi.deliver(id, payload)` → `POST /{id}/deliver`, `requestsApi.acknowledgeDelivery(id, payload)` → `POST /{id}/acknowledge-delivery`.

## Frontend UI Changes

### Request detail dialog (`frontend/components/requests/request-detail-dialog.tsx`)

Add action buttons (visibility logic per the authorization rules above):

| Button | Shown when | Who sees it | Action |
|---|---|---|---|
| Approve / Reject | `status == "pending"` | admin | (exists) |
| Accept Fulfilment | `status == "approved"` | target dept user / admin | (exists) → `in_progress` |
| **Mark Delivered** | `status == "in_progress"` | target dept user / admin | NEW → opens dialog for `delivery_note` → `POST /{id}/deliver` → `awaiting_signoff` |
| **Confirm Receipt** | `status == "awaiting_signoff"` | requester / admin | NEW → opens dialog for `acknowledgment_note` → `POST /{id}/acknowledge-delivery` → `received` |
| Cancel | any active status | **admin only** | (changed from requester-or-admin) |

Read-view additions: surface "Delivered by / on / note" and "Confirmed by / on / note" sections when the fields are populated; the history timeline shows `delivered` and `delivery_acknowledged` events with friendly labels.

### Requests list page (`frontend/app/dashboard/requests/page.tsx`)

- Add an **"Inbox" / "Needs Action" tab** (alongside the existing `All / Internal / Vendor / Customer` type tabs) that calls `GET /requests/inbox` — shows requests targeting the user's department pending accept/deliver/confirm.
- Remove any receipts-related logic.
- Consume the `?highlight=<request_id>` query param so clicking a notification scrolls to / highlights the request row (the `NotificationBell` already navigates here — make the page honor it).

### User creation / edit form (`admin/users/new/page.tsx` + `[id]/edit/page.tsx`)

- The **"Can Raise Requests To"** department grid already exists and works — **no change**.
- Remove the `can_create_receipt` checkbox (dead flag).
- Leave `grn_access` / `dispatch_access` / `gate_pass_access` / `purchase_access` checkboxes — they gate separate modules.

### Removed frontend files

See "Frontend removals" in Data Model Changes above.

## Migration Approach

OneFlow does not use Alembic for SQLite — migrations are idempotent `ALTER TABLE` blocks in `backend/app/core/database.py::run_migrations()` and `backend/app/main.py` `_migrate_*` functions.

### Add columns to `request` table

New idempotent migration function `_migrate_request_delivery_fields()` in `main.py`:
- `ALTER TABLE request ADD COLUMN delivered_by_user_id INTEGER`
- `ALTER TABLE request ADD COLUMN delivered_by_username VARCHAR`
- `ALTER TABLE request ADD COLUMN delivered_at DATETIME`
- `ALTER TABLE request ADD COLUMN delivery_note TEXT`
- `ALTER TABLE request ADD COLUMN acknowledged_by_user_id INTEGER`
- `ALTER TABLE request ADD COLUMN acknowledged_by_username VARCHAR`
- `ALTER TABLE request ADD COLUMN acknowledged_at DATETIME`
- `ALTER TABLE request ADD COLUMN acknowledgment_note TEXT`

Each wrapped in `try/except` (column already exists) — matches the existing migration pattern.

### Backfill in-flight `RequestReceipt` rows

Before dropping the `request_receipt` table, a one-time migration `_migrate_receipts_into_requests()`:
- For each active `RequestReceipt` row:
  - If `status == "pending_ack"` → set parent `Request.status = "awaiting_signoff"`, copy `created_by_user_id`/`created_by_username` → `delivered_by_*`, `created_at` → `delivered_at`, `notes` → `delivery_note`.
  - If `status == "acknowledged"` → set parent `Request.status = "received"`, copy delivered fields as above, plus `acknowledged_by_*` / `acknowledged_at` / `acknowledgment_note`.
  - Log a `delivered` / `delivery_acknowledged` `RequestHistory` row so the audit trail survives.
- Hard-delete the `RequestReceipt` rows after backfill (the table is being dropped anyway, so soft-delete is pointless).

### Drop tables

- `DROP TABLE IF EXISTS request_receipt`
- `DROP TABLE IF EXISTS receipt` (legacy shadow)

SQLite supports `DROP TABLE`. Wrap in try/except. The `models/__init__.py` import removals ensure SQLModel won't recreate them.

### `can_create_receipt` column

Leave the column in place (nullable, unused) to avoid an SQLite table rebuild. Just stop reading/writing it. (Dropping a column on SQLite requires a full table rebuild which is riskier than leaving a dead column.)

## Testing

There are **no tests** in this repository (no pytest, no vitest/jest config, no test files). Bootstrapping test infrastructure is out of scope for this rework.

**Verification approach** (manual, post-implementation):
1. Start backend + frontend (`start-linux.sh`).
2. Log in as admin (`admin` / `admin123`).
3. Create a worker user belonging to Department Y with "Can Raise Requests To" = Department X.
4. Log in as the worker; create an `internal_transfer` request targeting Department X.
5. Log in as a user in Department X; verify the red sidebar badge shows the inbox count; accept the request (`approved` → `in_progress`).
6. As the Department X user, mark delivered (`in_progress` → `awaiting_signoff`); verify the requester gets a `request_delivered` notification (bell lights up).
7. Log in as the worker (requester); verify the red badge / inbox tab shows the request awaiting confirmation; confirm receipt (`awaiting_signoff` → `received`).
8. Verify the Department X users get a `request_received` notification.
9. As admin, cancel an in-flight request at each status; verify `request_cancelled` notifications fire and status → `cancelled`.
10. Verify the old `/dashboard/receipts` page is gone and no receipts nav entry remains.
11. Verify the request detail dialog shows "Delivered by/on/note" and "Confirmed by/on/note" sections with the history timeline.
12. Run `npm run lint` + `npm run typecheck` (frontend) and confirm the backend imports cleanly (`python -c "import app.main"`).

## Open Questions

None — all design decisions resolved during brainstorming.

## References

- Previous design: `docs/superpowers/specs/2026-06-18-oneflow-unified-request-design.md`
- Previous implementation plan: `docs/superpowers/plans/2026-06-18-oneflow-unified-request.md`
- Request router (heart of the rework): `backend/app/routers/requests.py`
- Receipt router (to be deleted): `backend/app/routers/request_receipts.py`
- Notification helper (to be wired): `backend/app/routers/notifications.py:50` (`create_notification`)
- Sidebar badges (to be repointed): `frontend/components/layout/desktop-sidebar.tsx`, `frontend/components/layout/bottom-nav.tsx`
- Request detail dialog (to gain new action buttons): `frontend/components/requests/request-detail-dialog.tsx`
