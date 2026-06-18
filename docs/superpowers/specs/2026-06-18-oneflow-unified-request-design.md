# OneFlow Unified Request System — Design

**Date:** 2026-06-18
**Status:** Approved (awaiting user review of written spec)
**Owner:** OneFlow

## Context

OneFlow's request workflow currently has **two parallel models**:

1. **`PurchaseRequest`** — for internal team-to-team transfers and vendor purchases. Has line items, per-item department routing, full state machine (`pending → approved → in_progress → awaiting_signoff → received`), and a separate `Receipt` model for goods-received acknowledgement.
2. **`MarketingRequest`** — for customer-outbound weeder/attachment dispatch. Simpler single-item state machine, no line items, no fulfilment-response step, no receipt.

The naming is also misleading: "PurchaseRequest" is used for both internal transfers and vendor purchases, while "MarketingRequest" is actually a different concept (outbound customer dispatch).

## Goals

- One request system that handles all three flows: internal transfer, vendor purchase, customer dispatch
- Single page in the frontend for employees to create and track requests
- Preserve all current functionality (line items, dept routing, acceptance, receipts) for all three flows
- Migrate existing data without downtime

## Non-goals (YAGNI)

- New request types (e.g., "return", "transfer to other company") — defer until a real use case
- New state machine — keep the current 7-status enum
- Request templates / saved favourites — defer
- File attachments on requests — defer
- SLA tracking with overdue alerts — defer
- Customer self-service portal — defer

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Unify Purchase + Marketing? | **Yes, all 3 flows** (internal_transfer, vendor_purchase, customer_dispatch) |
| 2 | Model name | **`Request`**, table `requests`, URL `/api/v1/requests`, SN prefix `REQ-YYYY-NNNN` |
| 3 | `request_type` enum values | `internal_transfer \| vendor_purchase \| customer_dispatch` |
| 4 | Customer fields modeling | **Separate `RequestCustomerDispatch` child table** (1:1, only populated for `customer_dispatch` type) |
| 5 | Receipt model | **Keep separate**, rename to `RequestReceipt`, table `request_receipt` |
| 6 | Data migration | **Migrate existing data** to new tables, keep old tables as read-only shadow for 1 release |
| 7 | Implementation approach | **Strangler Fig** — new router + shim routers, old URLs still work, delete old code after migration window |

## Data Model

### `Request` (replaces `PurchaseRequest`)

```python
class Request(SQLModel, table=True):
    __tablename__ = "request"

    id: Optional[int] = Field(default=None, primary_key=True)
    sn_no: str = Field(index=True)  # REQ-YYYY-NNNN

    # Type discriminator
    request_type: str = Field(default="internal_transfer", index=True)
    # Values: internal_transfer | vendor_purchase | customer_dispatch

    # Routing
    department: Optional[str] = None  # header dept, optional fallback

    # Vendor purchase fields (only set when request_type=vendor_purchase)
    from_whom: Optional[str] = None

    # Common fields
    quantity: float = Field(default=0.0)  # denormalised total of line-item quantities (recomputed on item add/update)
    needed_by: Optional[str] = None  # ISO date "YYYY-MM-DD" — when the requester needs the items (deadline target)
    notes: Optional[str] = None

    # Status — single state machine for all 3 types
    # pending | approved | in_progress | awaiting_signoff | received
    # | not_approved | cancelled
    status: str = Field(default="pending", index=True)

    # Authoring
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    requested_by_username: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    # Review (admin approve/reject)
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_by_username: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

    # Fulfilment (dept accepts the request)
    fulfilled_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    fulfilled_by_username: Optional[str] = None
    fulfillment_accepted_at: Optional[datetime] = None
    fulfillment_note: Optional[str] = None

    is_active: bool = Field(default=True)
```

### `RequestItem` (replaces `PurchaseRequestItem`)

```python
class RequestItem(SQLModel, table=True):
    __tablename__ = "request_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)  # FK to request.id

    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float = Field(default=1.0)
    timeline_days: Optional[int] = None
    department: Optional[str] = None  # per-item target department

    # Per-item acceptance
    item_status: Optional[str] = None  # None=pending, "in_progress", "delivered"
    accepted_by_username: Optional[str] = None
    accepted_at: Optional[datetime] = None
    acceptance_note: Optional[str] = None
```

### `RequestCustomerDispatch` (new — child of Request for customer_dispatch type)

```python
class RequestCustomerDispatch(SQLModel, table=True):
    __tablename__ = "request_customer_dispatch"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(unique=True, index=True)  # FK to request.id (1:1)

    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None
    delivery_type: Optional[str] = None  # direct | transport

    # The single item being dispatched (for customer dispatch, no line items)
    inventory_type: str = Field(default="weeder")  # weeder | attachment
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = Field(default=1.0)
```

### `RequestHistory` (replaces `PurchaseRequestHistory`)

```python
class RequestHistory(SQLModel, table=True):
    __tablename__ = "request_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)
    changed_by_user_id: Optional[int] = None
    changed_by_username: Optional[str] = None
    change_type: str  # created | edited | approved | rejected | cancelled | responded | deleted | status_change | receipt_created | receipt_acknowledged | receipt_deleted
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    changed_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
```

### `RequestReceipt` (replaces `Receipt`)

```python
class RequestReceipt(SQLModel, table=True):
    __tablename__ = "request_receipt"

    id: Optional[int] = Field(default=None, primary_key=True)
    sn_no: str = Field(index=True)  # RCPT-YYYY-NNNN (prefix unchanged)
    request_id: int = Field(index=True)  # FK to request.id
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float = Field(default=0.0)
    quantity_received: float = Field(default=0.0)
    notes: Optional[str] = None
    department: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    status: str = Field(default="pending_ack", index=True)  # pending_ack | acknowledged
    acknowledged_by_user_id: Optional[int] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
```

## Router & Endpoints

### New: `app/routers/requests.py`

Prefix: `/api/v1/requests`, Tag: `requests`

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List with filters: `request_type`, `status`, `search`, `page`, `page_size` |
| GET | `/active-count` | Sidebar badge (count across types user can see) |
| POST | `/` | Create. Body: `request_type` + items + type-specific block |
| GET | `/{id}` | Get one |
| PUT | `/{id}` | Edit (only `pending`, requester or admin) |
| POST | `/{id}/approve` | Admin only (only `pending`) |
| POST | `/{id}/reject` | Admin only (only `pending`) |
| POST | `/{id}/cancel` | Requester or admin |
| POST | `/{id}/respond` | Fulfilling dept accepts (only `approved`) |
| GET | `/{id}/history` | Change log |
| GET | `/{id}/receipts` | List receipts for this request |
| DELETE | `/{id}` | Admin soft-delete |

### New: `app/routers/request_receipts.py`

Prefix: `/api/v1/request-receipts`, Tag: `request-receipts`

Same endpoints as today's `receipts.py`:
- `GET /pending-count`
- `GET /` (with `request_id` and `status` filters)
- `POST /` (create)
- `GET /{id}`
- `POST /{id}/acknowledge`
- `DELETE /{id}`

### Compat shims (Strangler Fig)

Keep existing routers as thin wrappers that read/write the new tables:

- `app/routers/purchase_requests.py` — handlers become thin adapters that call the new `requests` router logic. Old URLs `/api/v1/purchase-requests/...` still work.
- `app/routers/marketing_requests.py` — same treatment. Old URLs `/api/v1/marketing-requests/...` still work.
- `app/routers/receipts.py` — adapters to new `request_receipts` router.

Shim handlers convert old request bodies to new shape, call the new logic, then convert responses back to the old shape. Marked `@deprecated` in OpenAPI.

### `main.py` updates

```python
# Add new
from app.routers import requests as requests_router
from app.routers import request_receipts as request_receipts_router

app.include_router(requests_router.router)
app.include_router(request_receipts_router.router)
# Keep existing
app.include_router(purchase_requests_router.router)  # shim
app.include_router(marketing_requests_router.router)  # shim
app.include_router(receipts_router.router)  # shim
```

## Frontend

### `frontend/app/dashboard/requests/page.tsx` (replaces current)

- `Tabs` row at top: All | Internal transfer | Vendor purchase | Customer dispatch
- Each tab shows the same table, filtered by `request_type` query param
- Tab label shows count badge (e.g., "Internal (3)")
- Table columns: SN | Type | Items | Qty | Department → Department | Status | Timeline | People | Actions

**Create form (one form, fields shown by `request_type`):**
- Always: `items[]`, `timeline_days`, `notes`
- `internal_transfer`: per-item `department` required
- `vendor_purchase`: per-item `department` optional, `from_whom` required at header
- `customer_dispatch`: single item only, `customer_dispatch: { customer_name, customer_phone, customer_address, delivery_type, ... }` block visible

**Detail view (drawer/modal):**
- Header: type badge, SN, status badge
- Items list (with per-item status + accept button if user is fulfiller)
- Customer dispatch block (if type=customer_dispatch)
- History timeline
- Receipts list + create-receipt + acknowledge buttons (if applicable)

### Old pages — kept as redirect shims

- `frontend/app/dashboard/purchase-requests/page.tsx` → redirect to `/requests?type=vendor_purchase`
- (If a marketing requests page exists in the frontend, redirect to `/requests?type=customer_dispatch`)
- Old shim pages removed in a later release when zero traffic.

### Sidebar

`DesktopSidebar` and `BottomNav` keep the single "Requests" entry with a total active-count badge.

## Data Migration

**One-time script:** `backend/scripts/migrate_unified_request.py` (runnable via `python -m scripts.migrate_unified_request`)

**Steps:**

1. Create new tables: `request`, `request_item`, `request_history`, `request_customer_dispatch`, `request_receipt`. Keep old tables intact.
2. **Copy `PurchaseRequest` → `Request`** (id preserved, `sn_no` rewritten to `REQ-YYYY-NNNN` preserving last 4 digits):
   - `request_type = "vendor_purchase"` if `from_whom` is set OR `fulfilled_by_user_id` is None
   - Else `request_type = "internal_transfer"`
3. Copy `PurchaseRequestItem` → `RequestItem` (preserving `request_id`).
4. Copy `PurchaseRequestHistory` → `RequestHistory`.
5. Copy `Receipt` → `RequestReceipt` (all fields identical, just renamed).
6. Copy `MarketingRequest` → `Request` (new id, `sn_no` rewritten from `MR-...` to `REQ-...`, `request_type = "customer_dispatch"`).
7. Build `RequestCustomerDispatch` rows for customer-dispatch requests, pulling from the MarketingRequest fields.
8. **Verify counts:** number of rows in old tables == number in new tables (split by `request_type`). Log any rows that fail migration.
9. **DO NOT drop old tables** in the same release. They stay as read-only shadows for one release cycle.
10. **In a later release** (after shim routers show zero traffic): drop `purchase_request*`, `receipt`, `marketing_request*` tables, delete shim routers.

**Idempotency:** migration uses `INSERT OR IGNORE` (SQLite) / `ON CONFLICT DO NOTHING` (Postgres). Re-running is safe.

**Tested in CI:** ephemeral Docker DB. Migration is part of CI pipeline.

## Validation Rules

- `request_type` must be one of: `internal_transfer`, `vendor_purchase`, `customer_dispatch`
- If `request_type = customer_dispatch`:
  - `customer_dispatch` block required
  - `items` must be exactly 1
- If `request_type = internal_transfer`:
  - At least 1 item must have `department` set
- If `request_type = vendor_purchase`:
  - `from_whom` required at header
- Common: `quantity > 0`, `timeline_days >= 0`, `notes` length <= 2000 chars

## Auth Model

- **Admin:** full CRUD
- **Requester:** create, edit (only `pending`), cancel, acknowledge receipt
- **Fulfilling member** (any authenticated user from a permitted group): respond, create receipt. Permitted groups by `request_type`:
  - `internal_transfer`: users belonging to a department that matches either the request header `department` or any line item's `department`
  - `vendor_purchase`: any user with role admin or above (no dept routing for vendor purchases)
  - `customer_dispatch`: users belonging to a "marketing" or "sales" department (configurable; default to "marketing")
- **Other employees:** read-only on dept-visible requests (same rules as today — requester, fulfiller, or member of a relevant dept)

## Error Handling

- 4xx return JSON `{ "detail": "..." }` (FastAPI default)
- 5xx log to logger, return generic `"Internal server error"`
- Validation errors return 422 with Pydantic detail list

## Testing

- **Unit tests** for validators in `app/models/request.py`
- **Integration tests** for the new router in `backend/tests/test_requests_router.py`:
  - All endpoints
  - All 3 request_types
  - Auth variants (admin, requester, fulfiller, other)
  - Receipt flows (create, acknowledge, partial delivery)
- **Migration test** in CI (ephemeral DB)
- **Frontend Playwright** test: create a request of each type, verify it appears in the right tab

## Rollback Plan

- Migration is non-destructive on old tables. If new system has issues, restore DB from pre-migration backup, drop new tables, keep shim routers pointing to old tables.
- Feature flag `UNIFIED_REQUESTS_ENABLED=false` keeps the frontend on old endpoints during rollout.

## Out of Scope (YAGNI)

- New request types (`return`, `transfer_other_company`)
- New state machine (current 7-status enum is sufficient)
- Request templates / saved favourites
- File attachments on requests
- SLA tracking with overdue alerts
- Customer self-service portal

## Effort Estimate

- Backend model + migration script: 1-2 days
- Backend router + tests: 2-3 days
- Frontend: 2-3 days
- Migration cutover + monitoring: 1 day
- **Total:** ~7-9 working days

## Execution Strategy

Per the Strangler Fig approach:
1. Backend: models + migration + new router + tests (foundation)
2. Backend: receipt router + tests
3. Backend: shim routers (old URLs work)
4. Frontend: unified page with tabs
5. Frontend: redirect old pages
6. Deploy + monitor
7. Cleanup: drop old tables, delete shim routers (later release)
