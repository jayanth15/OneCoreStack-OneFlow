# OneFlow Internal Request Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the internal request flow so the fulfilling department drives delivery and asks the requester for confirmation, by merging the orphaned `RequestReceipt` subsystem into the `Request` entity, wiring up dead notification infrastructure, restricting cancellation to admin, and adding a dept-targeted inbox.

**Architecture:** Add delivery/acknowledgment fields to the existing `Request` SQLModel + two new endpoints (`/deliver`, `/acknowledge-delivery`) + one new `GET /inbox` endpoint on the existing `/api/v1/requests` router. Delete the entire `RequestReceipt` subsystem (model, schemas, router, shim, frontend page, API client). Wire the existing `create_notification` helper into each lifecycle transition with a new `notify_department_users` fan-out helper. Repoint the sidebar red badge from coarse `status=pending` to dept-targeted `/requests/inbox`. Remove the dead `can_create_receipt` user flag.

**Tech Stack:** Backend: FastAPI + SQLModel (SQLAlchemy 2.0 + Pydantic 2) + SQLite. Frontend: Next.js 16 App Router + React 19 + TypeScript + Tailwind v4 + shadcn/ui. Migrations: idempotent `ALTER TABLE` blocks in `main.py` (no Alembic).

**Spec:** `docs/superpowers/specs/2026-06-19-internal-request-rework-design.md`

**Verification commands (run after each task group):**
- Backend imports cleanly: `python -c "import app.main"` (run from `backend/`)
- Frontend types/lint: `npm run typecheck` then `npm run lint` (run from `frontend/`)

---

## File Structure

**Backend — modified:**
- `backend/app/models/request.py` — add 8 delivery/acknowledgment fields to `Request`
- `backend/app/models/notification.py` — update `type` enum doc comment
- `backend/app/models/request_history.py` — update `change_type` enum doc comment
- `backend/app/schemas/request.py` — add `RequestDeliverAction`, `RequestAcknowledgeDeliveryAction`; extend `RequestRead`/`RequestListRead`
- `backend/app/routers/requests.py` — add `deliver`, `acknowledge_delivery`, `inbox` endpoints; modify `delete_request` (admin only); wire notifications into `review_request`/`accept_fulfilment`; extend `_build_read` with new fields
- `backend/app/routers/requests_helpers.py` — add `notify_department_users` helper
- `backend/app/models/user.py` — remove `can_create_receipt` field
- `backend/app/routers/users.py` — remove `can_create_receipt` from `UserCreate`/`UserUpdate`/`UserResponse`/read/write
- `backend/app/routers/auth.py` — remove `can_create_receipt` from `UserMeResponse` and `/me` builder
- `backend/app/main.py` — remove both receipt router imports/includes; add new migration function `_migrate_request_delivery_fields()` + `_migrate_receipts_into_requests()`; call them from `lifespan`
- `backend/app/core/database.py` — leave `can_create_receipt` migration in place (harmless); remove `request_receipt`/`receipt` table creation if present
- `backend/app/models/__init__.py` — remove `RequestReceipt` + `Receipt` imports

**Backend — deleted:**
- `backend/app/models/request_receipt.py`
- `backend/app/schemas/request_receipt.py`
- `backend/app/routers/request_receipts.py`
- `backend/app/routers/receipts.py`

**Frontend — modified:**
- `frontend/lib/requests.ts` — add `delivered_*`/`acknowledged_*` fields to `UnifiedRequest`; add `inbox()`/`deliver()`/`acknowledgeDelivery()` to `requestsApi`
- `frontend/lib/user.ts` — remove `can_create_receipt` from `CurrentUser`
- `frontend/app/login/page.tsx` — remove `can_create_receipt` from stored user state
- `frontend/components/layout/desktop-sidebar.tsx` — remove `requestReceiptsApi` import + `receiptCount` state + amber badge + "Receipts" nav entry; repoint red badge fetch from `requestsApi.list({status:"pending"})` to `requestsApi.inbox()`
- `frontend/components/layout/bottom-nav.tsx` — same as desktop-sidebar (remove receipts, repoint red badge to inbox)
- `frontend/components/requests/request-detail-dialog.tsx` — add "Mark Delivered" and "Confirm Receipt" action buttons with note dialogs; add "Delivered by/on/note" and "Confirmed by/on/note" read sections; restrict Cancel to admin only; friendly history labels for `delivered`/`delivery_acknowledged`
- `frontend/app/dashboard/requests/page.tsx` — add "Inbox"/"Needs Action" tab calling `requestsApi.inbox()`; honor `?highlight=<id>` query param; remove any receipts logic
- `frontend/app/dashboard/admin/users/new/page.tsx` — remove `can_create_receipt` from `BLANK` state + checkbox JSX
- `frontend/app/dashboard/admin/users/[id]/edit/page.tsx` — remove `can_create_receipt` checkbox and state

**Frontend — deleted:**
- `frontend/app/dashboard/receipts/page.tsx`
- `frontend/lib/request-receipts.ts`
- `frontend/components/app-sidebar.tsx` (dead, never rendered)

---

## Task 1: Add delivery/acknowledgment fields to `Request` model

**Files:**
- Modify: `backend/app/models/request.py:66` (append after `is_active`)

- [ ] **Step 1: Add the 8 new fields to `Request`**

Edit `backend/app/models/request.py`. After the existing `is_active: bool = Field(default=True)` line (line 66), add:

```python

    # Delivery (set when fulfilling dept marks delivered → status awaiting_signoff)
    delivered_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivery_note: Optional[str] = None

    # Acknowledgment (set when requester confirms receipt → status received)
    acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
```

- [ ] **Step 2: Verify the model imports cleanly**

Run from `backend/`:
```bash
python -c "from app.models.request import Request; print([f for f in Request.model_fields if 'deliver' in f or 'acknowledg' in f])"
```
Expected output: `['delivered_by_user_id', 'delivered_by_username', 'delivered_at', 'delivery_note', 'acknowledged_by_user_id', 'acknowledged_by_username', 'acknowledged_at', 'acknowledgment_note']`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/request.py
git commit -m "feat(requests): add delivery + acknowledgment fields to Request model"
```

---

## Task 2: Add DB migration for the new `Request` columns

**Files:**
- Modify: `backend/app/main.py` (add new `_migrate_*` function + call from `lifespan`)

- [ ] **Step 1: Add the migration function**

In `backend/app/main.py`, add this new function near the other `_migrate_*` functions (before the `lifespan` definition). It uses the same idempotent `ALTER TABLE ... ADD COLUMN` wrapped in `try/except` pattern as existing migrations:

```python
def _migrate_request_delivery_fields() -> None:
    """Add delivery + acknowledgment columns to the request table (idempotent)."""
    from sqlmodel import Session
    from app.core.database import engine
    cols = [
        ("delivered_by_user_id", "INTEGER"),
        ("delivered_by_username", "VARCHAR"),
        ("delivered_at", "DATETIME"),
        ("delivery_note", "TEXT"),
        ("acknowledged_by_user_id", "INTEGER"),
        ("acknowledged_by_username", "VARCHAR"),
        ("acknowledged_at", "DATETIME"),
        ("acknowledgment_note", "TEXT"),
    ]
    with Session(engine) as s:
        for col, sqltype in cols:
            try:
                s.exec(text(f"ALTER TABLE request ADD COLUMN {col} {sqltype}"))
            except Exception:
                pass  # column already exists
        s.commit()
```

> **Note:** If `text` is not already imported at the top of `main.py`, add `from sqlalchemy import text` to the imports. Check existing `_migrate_*` functions — they already use `text(...)` so the import should be present.

- [ ] **Step 2: Call the migration from `lifespan`**

Find the `lifespan` function in `main.py` (it's the async context manager that calls `init_db()`, `run_migrations()`, and the other `_migrate_*` functions). Add a call to `_migrate_request_delivery_fields()` right after the other `_migrate_*` calls. Match the existing calling style — if the others are called as bare statements, add `_migrate_request_delivery_fields()` on its own line in the same block.

- [ ] **Step 3: Verify the migration runs without error**

Run from `backend/`:
```bash
python -c "
from app.main import _migrate_request_delivery_fields
_migrate_request_delivery_fields()
print('migration OK')
"
```
Expected output: `migration OK` (running it twice should also succeed due to the try/except idempotency).

- [ ] **Step 4: Verify the columns exist in the DB**

Run from `backend/`:
```bash
python -c "
import sqlite3
con = sqlite3.connect('app/db/oneflow.db')
cols = [r[1] for r in con.execute('PRAGMA table_info(request)').fetchall()]
print([c for c in cols if 'deliver' in c or 'acknowledg' in c])
"
```
Expected: a list of the 8 new column names.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(db): migration to add request delivery + acknowledgment columns"
```

---

## Task 3: Extend request schemas with delivery/acknowledgment fields + new action schemas

**Files:**
- Modify: `backend/app/schemas/request.py`

- [ ] **Step 1: Add new action schemas**

In `backend/app/schemas/request.py`, append after the `RequestStatusUpdate` class (at the end of the file):

```python
class RequestDeliverAction(BaseModel):
    delivery_note: Optional[str] = None


class RequestAcknowledgeDeliveryAction(BaseModel):
    acknowledgment_note: Optional[str] = None
```

- [ ] **Step 2: Extend `RequestRead` with the new fields**

In the `RequestRead` class (around line 128), add these fields after `fulfillment_note: Optional[str] = None` and before `is_active: bool`:

```python
    delivered_by_user_id: Optional[int] = None
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivery_note: Optional[str] = None
    acknowledged_by_user_id: Optional[int] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
```

- [ ] **Step 3: Extend `RequestListRead` with delivered/acknowledged username + timestamps**

In the `RequestListRead` class (around line 158), add after `is_active: bool`:

```python
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
```

- [ ] **Step 4: Verify schemas import cleanly**

Run from `backend/`:
```bash
python -c "from app.schemas.request import RequestDeliverAction, RequestAcknowledgeDeliveryAction, RequestRead, RequestListRead; print('schemas OK')"
```
Expected: `schemas OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/request.py
git commit -m "feat(schemas): add RequestDeliverAction, RequestAcknowledgeDeliveryAction + extend read schemas"
```

---

## Task 4: Add `notify_department_users` helper

**Files:**
- Modify: `backend/app/routers/requests_helpers.py`

- [ ] **Step 1: Add the helper function**

In `backend/app/routers/requests_helpers.py`, add these imports at the top (alongside the existing imports):

```python
from app.models.user import User
from app.routers.notifications import create_notification
```

Then append this function at the end of the file:

```python
def notify_department_users(
    session: Session,
    department_code: str,
    notif_type: str,
    title: str,
    body: str,
    request_id: int,
) -> None:
    """Create a notification for every active user belonging to the department
    whose code matches `department_code`.

    Resolves department.code -> department.id, then user_departments.user_id,
    then creates one Notification per active user. Silently no-ops if the
    department code is unknown or has no members.
    """
    dept = session.exec(
        select(Department).where(Department.code == department_code)
    ).one_or_none()
    if not dept:
        return
    links = session.exec(
        select(UserDepartment).where(UserDepartment.department_id == dept.id)
    ).all()
    if not links:
        return
    user_ids = [lnk.user_id for lnk in links]
    users = session.exec(select(User).where(User.id.in_(user_ids), User.is_active == True)).all()  # noqa: E712
    for u in users:
        create_notification(
            session,
            user_id=u.id,  # type: ignore[arg-type]
            notif_type=notif_type,
            title=title,
            body=body,
            request_id=request_id,
        )
```

- [ ] **Step 2: Verify the helper imports cleanly**

Run from `backend/`:
```bash
python -c "from app.routers.requests_helpers import notify_department_users; print('helper OK')"
```
Expected: `helper OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/requests_helpers.py
git commit -m "feat(requests): add notify_department_users fan-out helper"
```

---

## Task 5: Update `_build_read` to populate the new fields

**Files:**
- Modify: `backend/app/routers/requests.py` (the `_build_read` function at line 439)

- [ ] **Step 1: Extend the `RequestRead(...)` construction in `_build_read`**

In `backend/app/routers/requests.py`, find the `_build_read` function (line 439). In the `return RequestRead(...)` call, add these keyword arguments after `fulfillment_note=req.fulfillment_note,` and before `is_active=req.is_active,`:

```python
        delivered_by_user_id=req.delivered_by_user_id,
        delivered_by_username=req.delivered_by_username,
        delivered_at=req.delivered_at,
        delivery_note=req.delivery_note,
        acknowledged_by_user_id=req.acknowledged_by_user_id,
        acknowledged_by_username=req.acknowledged_by_username,
        acknowledged_at=req.acknowledged_at,
        acknowledgment_note=req.acknowledgment_note,
```

- [ ] **Step 2: Extend the `RequestListRead(...)` construction in `list_requests`**

In the same file, find the `list_requests` function (line 100). In the list comprehension that builds `RequestListRead(...)` (around line 128), add these keyword arguments after `is_active=r.is_active,`:

```python
            delivered_by_username=r.delivered_by_username,
            delivered_at=r.delivered_at,
            acknowledged_by_username=r.acknowledged_by_username,
            acknowledged_at=r.acknowledged_at,
```

- [ ] **Step 3: Verify the router imports cleanly**

Run from `backend/`:
```bash
python -c "from app.routers.requests import router; print('router OK')"
```
Expected: `router OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(requests): populate delivery + acknowledgment fields in _build_read and list"
```

---

## Task 6: Add `POST /{id}/deliver` endpoint

**Files:**
- Modify: `backend/app/routers/requests.py` (add new endpoint after `accept_fulfilment`)

- [ ] **Step 1: Add the `deliver` endpoint**

In `backend/app/routers/requests.py`, first update the imports at the top. Add `RequestDeliverAction, RequestAcknowledgeDeliveryAction` to the import from `app.schemas.request`:

```python
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestRead, RequestListRead,
    RequestReviewAction, RequestItemAcceptAction, RequestStatusUpdate,
    RequestItemRead, RequestCustomerDispatchRead, RequestHistoryRead,
    RequestDeliverAction, RequestAcknowledgeDeliveryAction,
)
```

Add `notify_department_users` to the import from `app.routers.requests_helpers`:

```python
from app.routers.requests_helpers import (
    generate_sn, log_history, get_user_departments,
    build_department_label_map, label_for_code, notify_department_users,
)
```

Add `create_notification` import (from notifications router):

```python
from app.routers.notifications import create_notification
```

Then add this endpoint after the `accept_fulfilment` function (after line 357) and before the `accept_item` function:

```python
# --- deliver (fulfilling dept marks delivered → awaiting_signoff) ---

@router.post("/{request_id}/deliver", response_model=RequestRead)
def deliver_request(
    request_id: int,
    payload: RequestDeliverAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="deliver is not applicable to customer_dispatch requests")
    if req.status != "in_progress":
        raise HTTPException(status_code=409, detail=f"Cannot deliver a request in status '{req.status}'")
    if not _user_can_accept(current_user, req, session, get_user_departments(session, current_user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail="Not allowed to deliver this request")

    old_status = req.status
    req.status = "awaiting_signoff"
    req.delivered_by_user_id = current_user.id
    req.delivered_by_username = current_user.username
    req.delivered_at = datetime.now(tz=timezone.utc)
    req.delivery_note = payload.delivery_note
    req.updated_at = datetime.now(tz=timezone.utc)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="delivered", field_name="status", old_value=old_status, new_value="awaiting_signoff",
                note=payload.delivery_note)

    # Notify the requester that items are ready for confirmation
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_delivered",
            title=f"Request {req.sn_no} delivered",
            body=f"Items for {req.sn_no} have been delivered by {current_user.username}. Please confirm receipt.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(req)
    return _build_read(req, session)
```

- [ ] **Step 2: Verify the router imports cleanly**

Run from `backend/`:
```bash
python -c "from app.routers.requests import deliver_request; print('deliver endpoint OK')"
```
Expected: `deliver endpoint OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(requests): add POST /{id}/deliver endpoint (in_progress → awaiting_signoff)"
```

---

## Task 7: Add `POST /{id}/acknowledge-delivery` endpoint

**Files:**
- Modify: `backend/app/routers/requests.py` (add after `deliver_request`)

- [ ] **Step 1: Add the `acknowledge_delivery` endpoint**

In `backend/app/routers/requests.py`, add this endpoint right after the `deliver_request` function:

```python
# --- acknowledge delivery (requester confirms receipt → received) ---

@router.post("/{request_id}/acknowledge-delivery", response_model=RequestRead)
def acknowledge_delivery(
    request_id: int,
    payload: RequestAcknowledgeDeliveryAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="acknowledge-delivery is not applicable to customer_dispatch requests")
    if req.status != "awaiting_signoff":
        raise HTTPException(status_code=409, detail=f"Cannot acknowledge a request in status '{req.status}'")
    # Only the original requester or an admin can confirm receipt
    if req.requested_by_user_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the requester or an admin can confirm receipt")

    old_status = req.status
    req.status = "received"
    req.acknowledged_by_user_id = current_user.id
    req.acknowledged_by_username = current_user.username
    req.acknowledged_at = datetime.now(tz=timezone.utc)
    req.acknowledgment_note = payload.acknowledgment_note
    req.updated_at = datetime.now(tz=timezone.utc)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="delivery_acknowledged", field_name="status", old_value=old_status, new_value="received",
                note=payload.acknowledgment_note)

    # Notify the fulfilling department that the request was confirmed
    if req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_received",
            title=f"Request {req.sn_no} confirmed",
            body=f"Requester {current_user.username} confirmed receipt of {req.sn_no}.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(req)
    return _build_read(req, session)
```

- [ ] **Step 2: Verify the router imports cleanly**

Run from `backend/`:
```bash
python -c "from app.routers.requests import acknowledge_delivery; print('acknowledge endpoint OK')"
```
Expected: `acknowledge endpoint OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(requests): add POST /{id}/acknowledge-delivery endpoint (awaiting_signoff → received)"
```

---

## Task 8: Add `GET /inbox` endpoint

**Files:**
- Modify: `backend/app/routers/requests.py` (add after `list_requests`)

- [ ] **Step 1: Add the `inbox` endpoint**

In `backend/app/routers/requests.py`, add this endpoint right after the `list_requests` function (after line 136) and before the `create_request` function:

```python
# --- inbox (dept-targeted "needs my action") ---

@router.get("/inbox", response_model=List[RequestListRead])
def list_inbox(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return requests targeting the current user's department that need their action:
    status in (approved, in_progress, awaiting_signoff) and the user belongs to a
    department whose code matches the request's target department. Admins see all
    such requests. Excludes customer_dispatch (outbound flow, no dept acceptance).
    """
    user_depts = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    stmt = select(Request).where(
        Request.is_active == True,  # noqa: E712
        Request.status.in_(["approved", "in_progress", "awaiting_signoff"]),
        Request.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH,
    )
    rows = session.exec(stmt.order_by(Request.created_at.desc())).all()
    label_map = build_department_label_map(session)
    out = []
    for r in rows:
        if current_user.role in ("admin", "super_admin"):
            pass  # admins see all
        else:
            if not _user_can_accept(current_user, r, session, user_depts):
                continue
        out.append(RequestListRead(
            id=r.id, sn_no=r.sn_no, request_type=r.request_type, department=r.department,
            department_label=label_for_code(r.department, label_map),
            from_whom=r.from_whom, quantity=r.quantity, status=r.status,
            requested_by_username=r.requested_by_username, created_at=r.created_at,
            is_active=r.is_active,
            delivered_by_username=r.delivered_by_username,
            delivered_at=r.delivered_at,
            acknowledged_by_username=r.acknowledged_by_username,
            acknowledged_at=r.acknowledged_at,
        ))
    return out
```

> **Route ordering note:** FastAPI matches routes in declaration order. `/inbox` must be declared before `/{request_id}` to avoid being captured by the path param. Since `list_inbox` is added right after `list_requests` (the `GET ""` handler) and before `create_request` (`POST ""`), and the `/{request_id}` paths are `GET /{request_id}` declared later — this is correct. Verify in Step 2.

- [ ] **Step 2: Verify route ordering (inbox should not be shadowed)**

Run from `backend/`:
```bash
python -c "
from app.routers.requests import router
for r in router.routes:
    if hasattr(r, 'path') and 'inbox' in r.path:
        print('inbox route:', r.path, r.methods)
"
```
Expected: `inbox route: /api/v1/requests/inbox {'GET'}`

- [ ] **Step 3: Verify the full app imports**

Run from `backend/`:
```bash
python -c "import app.main; print('app imports OK')"
```
Expected: `app imports OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(requests): add GET /inbox endpoint (dept-targeted needs-my-action list)"
```

---

## Task 9: Restrict cancellation to admin only + wire notifications into review/accept

**Files:**
- Modify: `backend/app/routers/requests.py` (`delete_request`, `review_request`, `accept_fulfilment`)

- [ ] **Step 1: Change `delete_request` to admin-only**

In `backend/app/routers/requests.py`, find the `delete_request` function (line 281). Replace the authorization check:

```python
    if req.requested_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the requester or an admin can delete")
```

with:

```python
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can cancel requests")
```

Then add notification fan-out before `session.commit()` in `delete_request`:

```python
    # Notify the requester and the fulfilling department that the request was cancelled
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_cancelled",
            title=f"Request {req.sn_no} cancelled",
            body=f"Request {req.sn_no} was cancelled by {current_user.username}.",
            request_id=req.id,
        )
    if req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_cancelled",
            title=f"Request {req.sn_no} cancelled",
            body=f"Request {req.sn_no} targeting your department was cancelled by {current_user.username}.",
            request_id=req.id,
        )
```

Insert this block right after the `log_history(...)` call for the cancel and before `session.commit()`.

- [ ] **Step 2: Wire notification into `review_request` (approve/reject)**

Find the `review_request` function (line 302). After the existing `log_history(...)` call and before `session.commit()`, add:

```python
    # Notify the requester of the review decision
    if req.requested_by_user_id:
        if payload.decision == "approve":
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="request_approved",
                title=f"Request {req.sn_no} approved",
                body=f"Your request {req.sn_no} was approved by {current_user.username}.",
                request_id=req.id,
            )
        else:
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="request_rejected",
                title=f"Request {req.sn_no} not approved",
                body=f"Your request {req.sn_no} was not approved by {current_user.username}.{f' Note: {payload.note}' if payload.note else ''}",
                request_id=req.id,
            )
    # On approve, also fan-out to the fulfilling department so they know to accept
    if payload.decision == "approve" and req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_approved",
            title=f"New request {req.sn_no} for your department",
            body=f"Request {req.sn_no} was approved and is awaiting acceptance by your department.",
            request_id=req.id,
        )
```

- [ ] **Step 3: Wire notification into `accept_fulfilment`**

Find the `accept_fulfilment` function (line 334). After the existing `log_history(...)` call and before `session.commit()`, add:

```python
    # Notify the requester that the request was accepted
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_accepted",
            title=f"Request {req.sn_no} accepted",
            body=f"Your request {req.sn_no} was accepted by {current_user.username} and is now in progress.",
            request_id=req.id,
        )
```

- [ ] **Step 4: Verify the router imports cleanly**

Run from `backend/`:
```bash
python -c "import app.main; print('app imports OK')"
```
Expected: `app imports OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/requests.py
git commit -m "feat(requests): admin-only cancel + wire notifications into review/accept/cancel"
```

---

## Task 10: Remove `can_create_receipt` from backend (user model, users router, auth router)

**Files:**
- Modify: `backend/app/models/user.py:36`
- Modify: `backend/app/routers/users.py` (lines 44, 62, 80, 149, 192, 261-262)
- Modify: `backend/app/routers/auth.py` (lines 51, 222)

- [ ] **Step 1: Remove the field from `User` model**

In `backend/app/models/user.py`, delete these lines (36 and the comment 34-35):

```python
    # Whether this user may create goods-received receipts for purchase requests.
    # Admin / super_admin can always create receipts regardless of this flag.
    can_create_receipt: bool = Field(default=False)
```

- [ ] **Step 2: Remove from `UserCreate` schema in `users.py`**

In `backend/app/routers/users.py`, find the `UserCreate` class (line ~44) and delete the line:
```python
    can_create_receipt: bool = False
```

- [ ] **Step 3: Remove from `UserUpdate` schema in `users.py`**

In the `UserUpdate` class (line ~62), delete the line:
```python
    can_create_receipt: Optional[bool] = None
```

- [ ] **Step 4: Remove from `UserResponse` schema in `users.py`**

In the `UserResponse` class (line ~80), delete the line:
```python
    can_create_receipt: bool = False
```

- [ ] **Step 5: Remove from the `_to_response` builder in `users.py`**

In `users.py` (line ~149), find the `can_create_receipt=user.can_create_receipt,` line inside the function that builds `UserResponse` and delete it.

- [ ] **Step 6: Remove from `create_user` in `users.py`**

In `users.py` (line ~192), find `can_create_receipt=body.can_create_receipt,` in the `User(...)` constructor call and delete it.

- [ ] **Step 7: Remove from `update_user` in `users.py`**

In `users.py` (lines ~261-262), find and delete:
```python
    if body.can_create_receipt is not None:
        user.can_create_receipt = body.can_create_receipt
```

- [ ] **Step 8: Remove from `UserMeResponse` in `auth.py`**

In `backend/app/routers/auth.py` (line ~51), find the `UserMeResponse` class and delete:
```python
    can_create_receipt: bool = False
```

- [ ] **Step 9: Remove from the `/me` response builder in `auth.py`**

In `auth.py` (line ~222), find `can_create_receipt=user.can_create_receipt,` and delete it.

- [ ] **Step 10: Verify the backend imports cleanly**

Run from `backend/`:
```bash
python -c "import app.main; print('app imports OK')"
```
Expected: `app imports OK`

- [ ] **Step 11: Commit**

```bash
git add backend/app/models/user.py backend/app/routers/users.py backend/app/routers/auth.py
git commit -m "chore(backend): remove dead can_create_receipt user flag"
```

---

## Task 11: Delete the `RequestReceipt` subsystem (backend)

**Files:**
- Delete: `backend/app/models/request_receipt.py`
- Delete: `backend/app/schemas/request_receipt.py`
- Delete: `backend/app/routers/request_receipts.py`
- Delete: `backend/app/routers/receipts.py`
- Modify: `backend/app/models/__init__.py` (remove `RequestReceipt` + `Receipt` imports)
- Modify: `backend/app/main.py` (remove both receipt router imports/includes)

- [ ] **Step 1: Delete the four files**

Run from the repo root:
```bash
rm backend/app/models/request_receipt.py
rm backend/app/schemas/request_receipt.py
rm backend/app/routers/request_receipts.py
rm backend/app/routers/receipts.py
```

- [ ] **Step 2: Remove imports from `models/__init__.py`**

In `backend/app/models/__init__.py`, find and delete the two import lines:
```python
from app.models.request_receipt import RequestReceipt  # noqa: F401
```
and:
```python
from app.models.receipt import Receipt  # noqa: F401
```

- [ ] **Step 3: Remove the legacy `Receipt` model file too**

The legacy `Receipt` model (`backend/app/models/receipt.py`) is a dead shadow table with no runtime readers. Delete it:
```bash
rm backend/app/models/receipt.py
```

- [ ] **Step 4: Remove receipt router imports + includes from `main.py`**

In `backend/app/main.py`, find and delete these two import lines (around lines 32 and 34):
```python
from app.routers import receipts as receipts_router
from app.routers.request_receipts import router as request_receipts_router
```

Then find and delete these two `include_router` calls (around lines 1361 and 1363):
```python
app.include_router(receipts_router.router)
app.include_router(request_receipts_router)
```

- [ ] **Step 5: Verify the backend imports cleanly**

Run from `backend/`:
```bash
python -c "import app.main; print('app imports OK')"
```
Expected: `app imports OK`

- [ ] **Step 6: Commit**

```bash
git add -A backend/app/
git commit -m "chore(backend): delete RequestReceipt subsystem (model, schemas, routers, legacy Receipt)"
```

---

## Task 12: Backfill in-flight `RequestReceipt` rows into `Request` + drop tables

**Files:**
- Modify: `backend/app/main.py` (add `_migrate_receipts_into_requests` function + call from lifespan)

- [ ] **Step 1: Add the backfill migration function**

In `backend/app/main.py`, add this function near `_migrate_request_delivery_fields`:

```python
def _migrate_receipts_into_requests() -> None:
    """One-time backfill: copy in-flight RequestReceipt rows onto their parent
    Request's delivery/acknowledgment fields, then drop the request_receipt and
    receipt tables. Idempotent — if the tables no longer exist, no-ops silently."""
    from sqlmodel import Session, select
    from app.core.database import engine
    from sqlalchemy import text

    with Session(engine) as s:
        # Detect whether the request_receipt table still exists
        try:
            s.exec(text("SELECT 1 FROM request_receipt LIMIT 1"))
        except Exception:
            return  # table already gone — nothing to do

        # Pull rows via raw SQL since the RequestReceipt model may be deleted
        rows = s.exec(text(
            "SELECT request_id, status, created_by_user_id, created_by_username, "
            "created_at, notes, acknowledged_by_user_id, acknowledged_by_username, "
            "acknowledged_at, acknowledgment_note FROM request_receipt WHERE is_active = 1"
        )).all()

        for row in rows:
            (request_id, rcpt_status, created_by_uid, created_by_uname, created_at,
             notes, ack_uid, ack_uname, ack_at, ack_note) = row
            req = s.exec(text("SELECT id, status FROM request WHERE id = :rid"), params={"rid": request_id}).one_or_none()  # type: ignore[arg-type]
            if not req:
                continue
            req_id, req_status = req
            new_status = "awaiting_signoff" if rcpt_status == "pending_ack" else "received"
            s.exec(text(
                "UPDATE request SET status = :st, "
                "delivered_by_user_id = :dbi, delivered_by_username = :dbu, delivered_at = :dat, delivery_note = :dn, "
                "acknowledged_by_user_id = :abi, acknowledged_by_username = :abu, acknowledged_at = :aat, "
                "acknowledgment_note = :an, updated_at = :uat WHERE id = :rid"
            ), params={  # type: ignore[arg-type]
                "st": new_status,
                "dbi": created_by_uid, "dbu": created_by_uname, "dat": created_at, "dn": notes,
                "abi": ack_uid, "abu": ack_uname, "aat": ack_at, "an": ack_note,
                "uat": datetime.now(tz=timezone.utc),
                "rid": req_id,
            })

        # Drop the tables (data has been folded into request)
        try:
            s.exec(text("DROP TABLE IF EXISTS request_receipt"))
        except Exception:
            pass
        try:
            s.exec(text("DROP TABLE IF EXISTS receipt"))
        except Exception:
            pass
        s.commit()
```

> **Note:** `datetime` and `timezone` are already imported at the top of `main.py` (used by other migrations). If not, add `from datetime import datetime, timezone`.

- [ ] **Step 2: Call the backfill from `lifespan`**

In `main.py` `lifespan`, add `_migrate_receipts_into_requests()` on its own line **after** `_migrate_request_delivery_fields()` (the backfill depends on the new columns existing).

- [ ] **Step 3: Run the backfill migration and verify**

Run from `backend/`:
```bash
python -c "
from app.main import _migrate_receipts_into_requests
_migrate_receipts_into_requests()
print('backfill OK')
"
```
Expected: `backfill OK`

- [ ] **Step 4: Verify the tables are gone**

Run from `backend/`:
```bash
python -c "
import sqlite3
con = sqlite3.connect('app/db/oneflow.db')
tables = [r[0] for r in con.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('request_receipt','receipt')\").fetchall()]
print('remaining receipt tables:', tables)
"
```
Expected: `remaining receipt tables: []`

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(db): backfill RequestReceipt rows into Request + drop receipt tables"
```

---

## Task 13: Update `Notification.type` and `RequestHistory.change_type` doc comments

**Files:**
- Modify: `backend/app/models/notification.py`
- Modify: `backend/app/models/request_history.py`

- [ ] **Step 1: Update `Notification.type` doc comment**

In `backend/app/models/notification.py`, find the `type: str` field with the comment listing the old values, and replace the comment with:

```python
    type: str  # request_approved | request_rejected | request_accepted | request_delivered | request_received | request_cancelled
```

- [ ] **Step 2: Update `RequestHistory.change_type` doc comment**

In `backend/app/models/request_history.py`, find the `change_type` field and update its comment. The existing comment lists `receipt_created | receipt_acknowledged | receipt_deleted` — replace those three with `delivered | delivery_acknowledged`. Keep the other values (`created | edited | approved | rejected | cancelled | responded | deleted | status_change | migrated_from_*`).

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/notification.py backend/app/models/request_history.py
git commit -m "docs(models): update Notification.type + RequestHistory.change_type enum comments"
```

---

## Task 14: Frontend — extend `requests.ts` API client

**Files:**
- Modify: `frontend/lib/requests.ts`

- [ ] **Step 1: Add delivery/acknowledgment fields to `UnifiedRequest` interface**

In `frontend/lib/requests.ts`, find the `UnifiedRequest` interface (line 49). After `fulfillment_note?: string | null;` and before `is_active: boolean;`, add:

```typescript
  delivered_by_user_id?: number | null;
  delivered_by_username?: string | null;
  delivered_at?: string | null;
  delivery_note?: string | null;
  acknowledged_by_user_id?: number | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
  acknowledgment_note?: string | null;
```

- [ ] **Step 2: Add delivery/acknowledgment fields to `RequestListItem` interface**

In the same file, find `RequestListItem` (line 77). After `is_active: boolean;`, add:

```typescript
  delivered_by_username?: string | null;
  delivered_at?: string | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
```

- [ ] **Step 3: Add `inbox`, `deliver`, `acknowledgeDelivery` methods to `requestsApi`**

In the `requestsApi` object (line 100), add these three methods after `history:` and before the closing `}`:

```typescript
  inbox: () =>
    apiFetchJson<RequestListItem[]>(`/api/v1/requests/inbox`),

  deliver: (id: number, delivery_note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/deliver`, { method: "POST", body: JSON.stringify({ delivery_note }) }),

  acknowledgeDelivery: (id: number, acknowledgment_note?: string) =>
    apiFetchJson<UnifiedRequest>(`/api/v1/requests/${id}/acknowledge-delivery`, { method: "POST", body: JSON.stringify({ acknowledgment_note }) }),
```

- [ ] **Step 4: Verify typecheck passes**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: no errors (may show pre-existing errors in other files — only confirm no new errors in `requests.ts`).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/requests.ts
git commit -m "feat(frontend): add delivery/ack fields + inbox/deliver/acknowledgeDelivery to requestsApi"
```

---

## Task 15: Frontend — remove `can_create_receipt` from user types and forms

**Files:**
- Modify: `frontend/lib/user.ts:33`
- Modify: `frontend/app/login/page.tsx:49`
- Modify: `frontend/app/dashboard/admin/users/new/page.tsx`
- Modify: `frontend/app/dashboard/admin/users/[id]/edit/page.tsx`

- [ ] **Step 1: Remove from `CurrentUser` interface in `user.ts`**

In `frontend/lib/user.ts`, find and delete the line:
```typescript
  can_create_receipt?: boolean;
```

- [ ] **Step 2: Remove from login page user-state**

In `frontend/app/login/page.tsx`, find where `can_create_receipt` is referenced (around line 49) and remove it from the object being stored into the user state. Read the surrounding lines first to find the exact form.

- [ ] **Step 3: Remove from new-user page**

In `frontend/app/dashboard/admin/users/new/page.tsx`:
1. In the `BLANK` object (around line 17), delete the line `can_create_receipt: false,`.
2. Find the "Receipt Creation Permission" JSX block (search for `can_create_receipt` — it's a `<div className="flex items-center gap-3 rounded-md border px-3 py-3">` containing an `<input type="checkbox" id="can_create_receipt">` and a `<label htmlFor="can_create_receipt">`). Delete the entire block.

- [ ] **Step 4: Remove from edit-user page**

In `frontend/app/dashboard/admin/users/[id]/edit/page.tsx`, find every `can_create_receipt` reference (the state, the form field, the checkbox JSX) and delete them. Mirror what you did in the new-user page.

- [ ] **Step 5: Verify typecheck passes**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: no errors related to `can_create_receipt`.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/user.ts frontend/app/login/page.tsx frontend/app/dashboard/admin/users/new/page.tsx "frontend/app/dashboard/admin/users/[id]/edit/page.tsx"
git commit -m "chore(frontend): remove dead can_create_receipt checkbox + type field"
```

---

## Task 16: Frontend — delete receipts page, API client, and dead app-sidebar

**Files:**
- Delete: `frontend/app/dashboard/receipts/page.tsx`
- Delete: `frontend/lib/request-receipts.ts`
- Delete: `frontend/components/app-sidebar.tsx`

- [ ] **Step 1: Delete the three files**

Run from the repo root:
```bash
rm frontend/app/dashboard/receipts/page.tsx
rm frontend/lib/request-receipts.ts
rm frontend/components/app-sidebar.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A frontend/
git commit -m "chore(frontend): delete receipts page, request-receipts API client, dead app-sidebar"
```

---

## Task 17: Frontend — repoint sidebar + bottom-nav badges to inbox, remove receipts nav

**Files:**
- Modify: `frontend/components/layout/desktop-sidebar.tsx`
- Modify: `frontend/components/layout/bottom-nav.tsx`

- [ ] **Step 1: Update `desktop-sidebar.tsx`**

In `frontend/components/layout/desktop-sidebar.tsx`:

1. Delete the import line `import { requestReceiptsApi } from "@/lib/request-receipts";` (line 29).
2. In the `CORE_NAV` array (line 37), delete the "Receipts" entry: `{ label: "Receipts", href: "/dashboard/receipts", icon: PackageCheck },`.
3. Remove the `PackageCheck` import from the lucide-react import block if it's now unused (it's used only by the Receipts entry and possibly the Dispatch conditional — check `grnAccess || isAdmin ? [{ label: "GRN", ... ClipboardCheck }]` and `dispatchAccess || isAdmin ? [{ label: "Dispatch", ... PackageCheck }]`. `PackageCheck` is used by the Dispatch entry, so **keep** the import).
4. Delete the `receiptCount` state declaration: `const [receiptCount, setReceiptCount] = useState(0);` (line 69).
5. In the `fetchCounts` async function (line 83), replace the `Promise.all` block with:

```typescript
      const [notif, reqs] = await Promise.all([
        apiFetchJson<{ count: number }>("/api/v1/notifications/unread-count"),
        requestsApi.inbox(),
      ]);
      setNotifCount(notif.count);
      setRequestCount(reqs.length);
```

(Remove the `rcpts` binding and `setReceiptCount` call.)

6. In the badge rendering block (around line 144), delete the entire `{item.href === "/dashboard/receipts" && receiptCount > 0 && (...)}` JSX block (lines 150-154).

- [ ] **Step 2: Update `bottom-nav.tsx`**

In `frontend/components/layout/bottom-nav.tsx`:

1. Delete the import line `import { requestReceiptsApi } from "@/lib/request-receipts";` (line 36).
2. In `GENERAL_MORE_NAV` (line 53), delete the "Receipts" entry: `{ label: "Receipts", href: "/dashboard/receipts", icon: PackageCheck },`.
3. Remove `PackageCheck` from the lucide-react import block only if unused. Check usage: the Dispatch conditional `dispatchAccess || isAdmin ? [{ label: "Dispatch", href: "/dashboard/dispatch", icon: PackageCheck }]` uses it — **keep** the import.
4. Delete the `receiptCount` state declaration: `const [receiptCount, setReceiptCount] = useState(0);` (line 79).
5. In the `fetchCounts` async function (line 83), replace the `Promise.all` block with:

```typescript
      const [reqs] = await Promise.all([
        requestsApi.inbox(),
      ]);
      setRequestCount(reqs.length);
```

(Remove the `rcpts` binding and `setReceiptCount` call.)

6. In the more-nav rendering block (around line 219), delete the entire `{item.href === "/dashboard/receipts" && receiptCount > 0 && (...)}` JSX block (lines 224-228).

- [ ] **Step 3: Verify typecheck passes**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: no errors related to `requestReceiptsApi` or `receiptCount`.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/layout/desktop-sidebar.tsx frontend/components/layout/bottom-nav.tsx
git commit -m "feat(frontend): repoint red badge to requestsApi.inbox + remove receipts nav entries"
```

---

## Task 18: Frontend — add Mark Delivered + Confirm Receipt buttons to request detail dialog

**Files:**
- Modify: `frontend/components/requests/request-detail-dialog.tsx`

- [ ] **Step 1: Add state for the note dialogs**

In `frontend/components/requests/request-detail-dialog.tsx`, find the component function (line 33). After the existing `const [loading, setLoading] = useState(false);` line, add:

```typescript
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliverNote, setDeliverNote] = useState("");
  const [ackOpen, setAckOpen] = useState(false);
  const [ackNote, setAckNote] = useState("");
```

- [ ] **Step 2: Add the `deliver` and `acknowledgeDelivery` handlers**

After the existing `accept` handler (around line 71), add:

```typescript
  const deliver = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.deliver(data.id, deliverNote);
      setData(updated);
      setDeliverOpen(false);
      setDeliverNote("");
    } catch (e: any) {
      console.error("Deliver failed:", e);
      alert(`Deliver failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const acknowledgeDelivery = async () => {
    if (!data) return;
    try {
      const updated = await requestsApi.acknowledgeDelivery(data.id, ackNote);
      setData(updated);
      setAckOpen(false);
      setAckNote("");
    } catch (e: any) {
      console.error("Acknowledge failed:", e);
      alert(`Confirm failed: ${e?.message ?? "unknown error"}`);
    }
  };
```

- [ ] **Step 3: Add delivery + acknowledgment read sections**

After the items section (around line 177, after the closing `)}` of `{data.items.length > 0 && (...)}`) and before the History section, add:

```tsx

            {data.delivered_by_username && (
              <div className="rounded-lg border bg-purple-50/40 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Delivered
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Delivered by</p>
                    <p className="font-medium">{data.delivered_by_username}</p>
                  </div>
                  {data.delivered_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Delivered on</p>
                      <p className="font-medium">{new Date(data.delivered_at).toLocaleString()}</p>
                    </div>
                  )}
                  {data.delivery_note && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Note</p>
                      <p className="font-medium whitespace-pre-wrap">{data.delivery_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.acknowledged_by_username && (
              <div className="rounded-lg border bg-emerald-50/40 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Confirmed
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Confirmed by</p>
                    <p className="font-medium">{data.acknowledged_by_username}</p>
                  </div>
                  {data.acknowledged_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Confirmed on</p>
                      <p className="font-medium">{new Date(data.acknowledged_at).toLocaleString()}</p>
                    </div>
                  )}
                  {data.acknowledgment_note && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Note</p>
                      <p className="font-medium whitespace-pre-wrap">{data.acknowledgment_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
```

- [ ] **Step 4: Add friendly history labels**

Find the history list rendering (around line 184). Replace the raw `{h.change_type}` with a friendly label. Add this helper at the top of the file (after the `STATUS_COLORS` constant, around line 31):

```typescript
const HISTORY_LABELS: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  responded: "Responded",
  delivered: "Delivered",
  delivery_acknowledged: "Delivery confirmed",
  status_change: "Status changed",
  deleted: "Deleted",
};
```

Then in the history `<li>` rendering, change `{h.change_type}` to `{HISTORY_LABELS[h.change_type] ?? h.change_type}`.

- [ ] **Step 5: Replace the Cancel button condition (admin only) + add new action buttons**

Find the `DialogFooter` block (around line 196). Replace the existing action-button section (lines 197-210) with:

```tsx
          {data && reviewerIsAdmin && data.status === "pending" && (
            <>
              <Button onClick={() => review("approve")}>Approve</Button>
              <Button variant="destructive" onClick={() => review("reject")}>Reject</Button>
            </>
          )}
          {data && data.status === "approved" && (
            <Button onClick={accept}>Accept fulfilment</Button>
          )}
          {data && data.status === "in_progress" && (
            <Button onClick={() => setDeliverOpen(true)}>Mark Delivered</Button>
          )}
          {data && data.status === "awaiting_signoff" && (
            <Button onClick={() => setAckOpen(true)}>Confirm Receipt</Button>
          )}
          {data && reviewerIsAdmin && data.status !== "received" && data.status !== "not_approved" && data.status !== "cancelled" && (
            <Button variant="ghost" onClick={cancelRequest}>
              Cancel request
            </Button>
          )}
```

> **Auth note:** `Mark Delivered` and `Accept fulfilment` are shown to any viewer when the status matches, but the **backend** enforces the real dept-membership check via `_user_can_accept`. The frontend doesn't pre-filter because the current user's department codes aren't readily compared to the request's target dept here without extra API calls — the backend 403 is the source of truth, matching the existing pattern for `Accept fulfilment`. `Confirm Receipt` is shown to any viewer when `awaiting_signoff`, but the backend enforces requester-or-admin. This mirrors the existing UX where the server is the authority.

- [ ] **Step 6: Add the Mark Delivered note dialog**

Just before the closing `</Dialog>` tag (at the end of the component), add a second `Dialog` for the delivery note:

```tsx

      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Delivered</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm that all items for <strong>{data?.sn_no}</strong> have been delivered to the requester.
              The requester will be asked to confirm receipt.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="deliver_note" className="text-sm font-medium">Delivery note (optional)</label>
              <textarea
                id="deliver_note"
                value={deliverNote}
                onChange={(e) => setDeliverNote(e.target.value)}
                placeholder="e.g. items handed over at the loading bay"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeliverOpen(false)}>Cancel</Button>
            <Button onClick={deliver}>Mark Delivered</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Confirm that you have received all items for <strong>{data?.sn_no}</strong>.
              This will close the request as <strong>received</strong>.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="ack_note" className="text-sm font-medium">Confirmation note (optional)</label>
              <textarea
                id="ack_note"
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                placeholder="e.g. all items received in good condition"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAckOpen(false)}>Cancel</Button>
            <Button onClick={acknowledgeDelivery}>Confirm Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 7: Verify typecheck passes**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: no errors in `request-detail-dialog.tsx`.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/requests/request-detail-dialog.tsx
git commit -m "feat(frontend): Mark Delivered + Confirm Receipt buttons + delivery/ack sections + admin-only cancel"
```

---

## Task 19: Frontend — add "Inbox" tab to requests page + honor `?highlight`

**Files:**
- Modify: `frontend/app/dashboard/requests/page.tsx`

- [ ] **Step 1: Read the current requests page to understand its structure**

Read `frontend/app/dashboard/requests/page.tsx` fully before editing. It uses `TypeTabs` (type filter tabs), a "New request" dialog, and a list of clickable rows opening `RequestDetailDialog`. Understand where the `requestsApi.list(...)` call lives and how the type tabs drive filtering.

- [ ] **Step 2: Add an "Inbox" tab alongside the type tabs**

In the requests page, add a new state `const [showInbox, setShowInbox] = useState(false);`. Add an "Inbox" button/tab at the start of the tabs row. When active, it sets `showInbox=true` and the type tabs become inactive. When a type tab is clicked, `showInbox=false` and the type filter is applied.

In the data-fetching effect, add a branch:
- If `showInbox` is true → call `requestsApi.inbox()` instead of `requestsApi.list(params)`.
- Otherwise → existing `requestsApi.list(params)` call.

The inbox count for the tab label can reuse the same fetch (the list returned by `requestsApi.inbox()` has `.length`).

- [ ] **Step 3: Honor the `?highlight=<request_id>` query param**

At the top of the component, add:
```typescript
import { useSearchParams } from "next/navigation";
const searchParams = useSearchParams();
const highlightId = searchParams.get("highlight");
const [highlightRequestId, setHighlightRequestId] = useState<number | null>(null);
useEffect(() => {
  if (highlightId) {
    setHighlightRequestId(Number(highlightId));
    // auto-open the detail dialog for this request
    setDetailRequestId(Number(highlightId));
    setDetailOpen(true);
  }
}, [highlightId]);
```

> **Note:** Check the existing state variable names for the detail dialog (likely `detailRequestId`/`detailOpen` or similar) and adjust to match. The intent: when the URL has `?highlight=42`, automatically open the detail dialog for request 42 so notification deep-links work.

- [ ] **Step 4: Optionally highlight the row in the list**

When `highlightRequestId` matches a row's id, add a temporary CSS ring/border (e.g. `ring-2 ring-primary`) to that row for visual emphasis. Clear it when the detail dialog closes.

- [ ] **Step 5: Verify typecheck passes**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Verify lint passes**

Run from `frontend/`:
```bash
npm run lint
```
Expected: no errors (fix any new ones you introduced).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/dashboard/requests/page.tsx
git commit -m "feat(frontend): add Inbox tab to requests page + honor ?highlight deep-link"
```

---

## Task 20: End-to-end verification

- [ ] **Step 1: Verify backend imports + starts**

Run from `backend/`:
```bash
python -c "import app.main; print('app imports OK')"
```
Expected: `app imports OK`

- [ ] **Step 2: Verify frontend typecheck + lint**

Run from `frontend/`:
```bash
npm run typecheck && npm run lint
```
Expected: both pass with no new errors.

- [ ] **Step 3: Start the stack**

Run from the repo root:
```bash
./start-linux.sh
```
(Or follow `SETUP.md` if the start script differs.) Wait for both backend and frontend to be ready.

- [ ] **Step 4: Manual flow test — happy path**

1. Open the app in a browser, log in as `admin` / `admin123`.
2. Go to Admin → Users → New User. Create a worker `worker_y` belonging to Department `PRD` (or any dept), with "Can Raise Requests To" = `MKT` (or another dept). Confirm there is **no** "Can Create Receipts" checkbox.
3. Create a second user `worker_x` belonging to Department `MKT`.
4. Log out, log in as `worker_y`.
5. Go to Requests → New Request → Internal Transfer. Select Department `MKT`. Add an item. Submit.
6. Verify the request appears in the list with status `pending`.
7. Log out, log in as `admin`. Open the request → Approve.
8. Log in as `worker_x` (belongs to `MKT`). Verify the red sidebar badge shows `1` (inbox count). Click the badge / go to Requests → Inbox tab → see the approved request.
9. Open the request → "Accept fulfilment" → status becomes `in_progress`.
10. With the request in `in_progress`, click "Mark Delivered" → enter a delivery note → confirm. Status becomes `awaiting_signoff`.
11. Log in as `worker_y` (the requester). The notification bell should show a `request_delivered` notification. The Inbox tab / red badge should show the request awaiting confirmation.
12. Open the request → "Confirm Receipt" → enter a confirmation note → confirm. Status becomes `received`.
13. Log in as `worker_x`. The notification bell should show a `request_received` notification.
14. Open the request — verify "Delivered by/on/note" and "Confirmed by/on/note" sections are displayed, and the history timeline shows "Delivered" and "Delivery confirmed" with friendly labels.

- [ ] **Step 5: Manual flow test — admin-only cancel**

1. As `admin`, create a new internal request (or use one in `pending`).
2. Log in as the requester (non-admin). Open the request → verify there is **no** "Cancel request" button.
3. Log in as `admin`. Open the request → verify "Cancel request" button is present. Click it → status becomes `cancelled`. Verify `request_cancelled` notifications fire.

- [ ] **Step 6: Manual flow test — receipts page is gone**

1. Confirm `/dashboard/receipts` returns 404 or redirects (the page file is deleted).
2. Confirm the sidebar and bottom-nav "More" drawer have no "Receipts" entry.
3. Confirm no amber badge appears anywhere.

- [ ] **Step 7: Stop the stack**

```bash
./stop-linux.sh
```

- [ ] **Step 8: Final commit (if any verification fixes were needed)**

If verification surfaced issues, fix them and commit:
```bash
git add -A
git commit -m "fix: verification adjustments from end-to-end testing"
```

---

## Spec Coverage Self-Check

| Spec section | Tasks |
|---|---|
| Status lifecycle (activate `awaiting_signoff`) | T6 (deliver), T7 (acknowledge) |
| `Request` model — add delivery/ack fields | T1 |
| `Notification.type` — extend enum | T13 |
| `RequestHistory.change_type` — extend enum | T13 |
| Remove `RequestReceipt` + `Receipt` models/tables/routers | T11, T12 |
| Remove `can_create_receipt` (backend) | T10 |
| Remove `can_create_receipt` (frontend) | T15 |
| `POST /{id}/deliver` endpoint | T6 |
| `POST /{id}/acknowledge-delivery` endpoint | T7 |
| `GET /inbox` endpoint | T8 |
| `DELETE /{id}` admin-only + notifications | T9 |
| `POST /{id}/review` notifications (approve fan-out + reject) | T9 |
| `POST /{id}/accept` notification | T9 |
| `notify_department_users` helper | T4 |
| `create_notification` wiring | T6, T7, T9 |
| Red sidebar badge repoint to inbox | T17 |
| Amber receipts badge + nav removal | T17 |
| Blue notification badge (auto-lights) | T9 (creates the data) |
| Request detail dialog — Mark Delivered + Confirm Receipt buttons | T18 |
| Request detail dialog — delivery/ack read sections | T18 |
| Request detail dialog — admin-only Cancel | T18 |
| Request detail dialog — friendly history labels | T18 |
| Requests page — Inbox tab | T19 |
| Requests page — `?highlight` deep-link | T19 |
| User form — remove `can_create_receipt` checkbox | T15 |
| User form — "Can Raise Requests To" grid (no change) | (no task — already works) |
| Delete receipts page | T16 |
| Delete `request-receipts.ts` API client | T16 |
| Delete dead `app-sidebar.tsx` | T16 |
| DB migration — add columns | T2 |
| DB migration — backfill + drop tables | T12 |
| `frontend/lib/requests.ts` — add fields + methods | T14 |
| Manual verification | T20 |

All spec sections covered. No gaps.
