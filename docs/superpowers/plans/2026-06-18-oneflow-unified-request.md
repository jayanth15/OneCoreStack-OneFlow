# OneFlow Unified Request System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify OneFlow's `PurchaseRequest` and `MarketingRequest` into a single `Request` system that handles all three flows (internal transfer, vendor purchase, customer dispatch), with a Strangler Fig migration that keeps old URLs working.

**Architecture:** New tables (`request`, `request_item`, `request_history`, `request_customer_dispatch`, `request_receipt`) created alongside old ones. Migration script copies data, leaves old tables as read-only shadow. New `/api/v1/requests` router handles all flows. Old `/purchase-requests` and `/marketing-requests` routers become thin compat shims. Frontend consolidates into single `/requests` page with type tabs.

**Tech Stack:** FastAPI + SQLModel (Python 3.13), Next.js 16 (App Router) + React 19, SQLite (dev) / PostgreSQL (prod), pytest, Playwright

**Spec:** `docs/superpowers/specs/2026-06-18-oneflow-unified-request-design.md`

---

## File Structure

### NEW files (backend)
- `backend/app/models/request.py` — Request model
- `backend/app/models/request_item.py` — RequestItem model (line items)
- `backend/app/models/request_history.py` — RequestHistory model
- `backend/app/models/request_customer_dispatch.py` — Customer-dispatch child (1:1)
- `backend/app/models/request_receipt.py` — RequestReceipt model
- `backend/app/routers/requests.py` — New unified requests router
- `backend/app/routers/request_receipts.py` — New unified receipts router
- `backend/scripts/__init__.py` — Empty marker for scripts package
- `backend/scripts/migrate_unified_request.py` — One-time migration script
- `backend/tests/test_request_validators.py` — Unit tests for validators
- `backend/tests/test_requests_router.py` — Integration tests for new router
- `backend/tests/test_request_receipts_router.py` — Integration tests for receipts
- `backend/tests/test_migration.py` — Migration idempotency test

### MODIFY (backend)
- `backend/app/main.py` — Add new routers, keep shim routers
- `backend/app/routers/purchase_requests.py` — Convert to thin shim
- `backend/app/routers/marketing_requests.py` — Convert to thin shim
- `backend/app/routers/receipts.py` — Convert to thin shim
- `backend/scripts/__init__.py` — already created above

### DELETE (later release, not in this plan)
- `backend/app/routers/purchase_requests.py` (after frontend fully migrated)
- `backend/app/routers/marketing_requests.py` (after frontend fully migrated)
- `backend/app/routers/receipts.py` (after frontend fully migrated)
- Old tables: `purchase_request`, `purchase_request_item`, `purchase_request_history`, `receipt`, `marketing_request`, `marketing_request_history` (after shim routers are removed)

### NEW files (frontend)
- `frontend/lib/api/requests.ts` — API client for new /requests endpoints
- `frontend/lib/api/request-receipts.ts` — API client for new /request-receipts endpoints
- `frontend/components/requests/type-tabs.tsx` — Tab bar for request_type filter
- `frontend/components/requests/request-form.tsx` — Unified create/edit form
- `frontend/components/requests/request-detail-drawer.tsx` — Detail view
- `frontend/components/requests/customer-dispatch-block.tsx` — Customer-dispatch fields

### MODIFY (frontend)
- `frontend/app/dashboard/requests/page.tsx` — Complete rewrite
- `frontend/app/dashboard/receipts/page.tsx` — Update to new API
- `frontend/app/dashboard/purchase-requests/page.tsx` — Convert to redirect
- `frontend/components/layout/desktop-sidebar.tsx` — Update badge to new API
- `frontend/components/layout/bottom-nav.tsx` — Update badge to new API

### TEST files
- All backend test files (see above)

---

## Phase 0: Pre-flight

### Task 0: Verify baseline backend + tests run

**Files:** None (verification)

- [ ] **Step 1: Verify backend imports cleanly**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.main import app; print('OK')"`

Expected: prints `OK`

- [ ] **Step 2: Verify existing tests pass**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest tests/ -q 2>&1 | tail -20`

Expected: existing tests pass (baseline)

- [ ] **Step 3: Verify frontend builds**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm build 2>&1 | tail -10`

Expected: build succeeds

- [ ] **Step 4: Create feature flag in backend config**

File: `backend/app/core/config.py`

Add this line inside the `Settings` class (after the existing settings):

```python
    # Unified requests feature flag — controls shim router activation
    unified_requests_enabled: bool = True
```

- [ ] **Step 5: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/core/config.py
git commit -m "chore: add unified_requests_enabled feature flag"
```

---

## Phase 1: Backend — New Models

### Task 1: Create `Request` model

**Files:**
- Create: `backend/app/models/request.py`

- [ ] **Step 1: Create the model file**

File: `backend/app/models/request.py`

```python
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


# Valid request_type values
REQUEST_TYPE_INTERNAL_TRANSFER = "internal_transfer"
REQUEST_TYPE_VENDOR_PURCHASE = "vendor_purchase"
REQUEST_TYPE_CUSTOMER_DISPATCH = "customer_dispatch"
REQUEST_TYPES = (
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
)


class Request(SQLModel, table=True):
    """Unified request: internal transfer | vendor purchase | customer dispatch.

    Replaces PurchaseRequest (internal transfer + vendor purchase) and
    MarketingRequest (customer dispatch). Migration: see scripts/migrate_unified_request.py.
    """
    __tablename__ = "request"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial — REQ-YYYY-NNNN
    sn_no: str = Field(index=True)

    # Type discriminator
    request_type: str = Field(default=REQUEST_TYPE_INTERNAL_TRANSFER, index=True)

    # Routing — header-level department (fallback if no per-item depts)
    department: Optional[str] = None

    # Vendor purchase fields (set when request_type=vendor_purchase)
    from_whom: Optional[str] = None

    # Common
    quantity: float = Field(default=0.0)  # denormalised total of line-item quantities
    notes: Optional[str] = None

    # Status — pending | approved | in_progress | awaiting_signoff | received
    #        | not_approved | cancelled
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

- [ ] **Step 2: Verify it imports**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.models.request import Request, REQUEST_TYPES; print(len(REQUEST_TYPES), 'types')"`

Expected: prints `3 types`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/models/request.py
git commit -m "feat(models): add Request model (unified internal/purchase/dispatch)"
```

---

### Task 2: Create `RequestItem` model

**Files:**
- Create: `backend/app/models/request_item.py`

- [ ] **Step 1: Create the model file**

File: `backend/app/models/request_item.py`

```python
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestItem(SQLModel, table=True):
    """Line item for a Request.

    Used for internal_transfer and vendor_purchase types. Customer-dispatch
    has no line items; use RequestCustomerDispatch instead.
    """
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

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.models.request_item import RequestItem; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/models/request_item.py
git commit -m "feat(models): add RequestItem model"
```

---

### Task 3: Create `RequestHistory` model

**Files:**
- Create: `backend/app/models/request_history.py`

- [ ] **Step 1: Create the model file**

File: `backend/app/models/request_history.py`

```python
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestHistory(SQLModel, table=True):
    """Change log entry for a Request."""
    __tablename__ = "request_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)

    changed_by_user_id: Optional[int] = None
    changed_by_username: Optional[str] = None
    change_type: str  # created | edited | approved | rejected | cancelled | responded
                      # | deleted | status_change | receipt_created | receipt_acknowledged
                      # | receipt_deleted
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    changed_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.models.request_history import RequestHistory; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/models/request_history.py
git commit -m "feat(models): add RequestHistory model"
```

---

### Task 4: Create `RequestCustomerDispatch` model

**Files:**
- Create: `backend/app/models/request_customer_dispatch.py`

- [ ] **Step 1: Create the model file**

File: `backend/app/models/request_customer_dispatch.py`

```python
from typing import Optional

from sqlmodel import Field, SQLModel


# Valid inventory_type values for customer dispatch
DISPATCH_INVENTORY_TYPE_WEEDER = "weeder"
DISPATCH_INVENTORY_TYPE_ATTACHMENT = "attachment"
DISPATCH_INVENTORY_TYPES = (DISPATCH_INVENTORY_TYPE_WEEDER, DISPATCH_INVENTORY_TYPE_ATTACHMENT)

# Valid delivery_type values
DELIVERY_TYPE_DIRECT = "direct"
DELIVERY_TYPE_TRANSPORT = "transport"
DELIVERY_TYPES = (DELIVERY_TYPE_DIRECT, DELIVERY_TYPE_TRANSPORT)


class RequestCustomerDispatch(SQLModel, table=True):
    """Customer-dispatch child entity (1:1 with Request when request_type=customer_dispatch).

    Stores customer contact info and the single item being dispatched.
    """
    __tablename__ = "request_customer_dispatch"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(unique=True, index=True)  # FK to request.id (1:1)

    # Customer info
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None

    # Delivery method
    delivery_type: Optional[str] = None  # direct | transport

    # The single item being dispatched
    inventory_type: str = Field(default=DISPATCH_INVENTORY_TYPE_WEEDER)
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = Field(default=1.0)
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.models.request_customer_dispatch import RequestCustomerDispatch, DISPATCH_INVENTORY_TYPES; print(len(DISPATCH_INVENTORY_TYPES), 'inventory types')"`

Expected: prints `2 inventory types`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/models/request_customer_dispatch.py
git commit -m "feat(models): add RequestCustomerDispatch child model"
```

---

### Task 5: Create `RequestReceipt` model

**Files:**
- Create: `backend/app/models/request_receipt.py`

- [ ] **Step 1: Create the model file**

File: `backend/app/models/request_receipt.py`

```python
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestReceipt(SQLModel, table=True):
    """Goods-received record — created when an approved Request is delivered.

    Renamed from Receipt and re-pointed to Request. See migration script.
    """
    __tablename__ = "request_receipt"

    id: Optional[int] = Field(default=None, primary_key=True)
    sn_no: str = Field(index=True)  # RCPT-YYYY-NNNN

    request_id: int = Field(index=True)  # FK to request.id
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float = Field(default=0.0)
    quantity_received: float = Field(default=0.0)
    notes: Optional[str] = None
    department: Optional[str] = None

    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_by_username: Optional[str] = None
    status: str = Field(default="pending_ack", index=True)  # pending_ack | acknowledged
    acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.models.request_receipt import RequestReceipt; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/models/request_receipt.py
git commit -m "feat(models): add RequestReceipt model (renamed from Receipt)"
```

---

### Task 6: Create the database tables

**Files:**
- Modify: `backend/app/core/database.py` (if needed for table creation)

- [ ] **Step 1: Verify auto-table-creation works**

The new models are SQLModel `table=True` instances, so they should be auto-created by the existing `init_db()` function in `app/main.py` or `app/core/database.py`.

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.core.database import init_db; from app.models.request import Request; from app.models.request_item import RequestItem; from app.models.request_history import RequestHistory; from app.models.request_customer_dispatch import RequestCustomerDispatch; from app.models.request_receipt import RequestReceipt; from app.core.database import engine; init_db(); print('OK')"`

Expected: prints `OK` (new tables created in dev DB)

- [ ] **Step 2: Verify tables exist**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from sqlmodel import inspect, create_engine; from app.core.database import SQLITE_URL; eng = create_engine(SQLITE_URL); print(inspect(eng).get_table_names())"`

Expected: list includes `request`, `requestitem`, `requesthistory`, `requestcustomerdispatch`, `requestreceipt`

- [ ] **Step 3: Commit (no code change, but mark the milestone)**

```bash
cd /home/jayanth/workspace/One/OneFlow
git commit --allow-empty -m "chore: new request tables created in dev DB"
```

---

## Phase 2: Backend — Data Migration Script

### Task 7: Create migration script

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/migrate_unified_request.py`
- Create: `backend/tests/test_migration.py`

- [ ] **Step 1: Create scripts package init**

File: `backend/scripts/__init__.py`

```python
"""One-off data migration scripts. Run with: ./venv-linux/bin/python -m backend.scripts.<name>"""
```

- [ ] **Step 2: Create the migration script**

File: `backend/scripts/migrate_unified_request.py`

```python
"""One-time data migration: PurchaseRequest + MarketingRequest → Request.

Idempotent — re-runnable. Re-execution is a no-op if all new tables already
contain their source data. Old tables are NOT dropped; they remain as
read-only shadow for one release cycle.

Run:
    cd backend && ./venv-linux/bin/python -m backend.scripts.migrate_unified_request
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the backend app importable when run as a module from repo root
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from sqlmodel import Session, select, SQLModel, create_engine  # noqa: E402

from app.core.database import engine, SQLITE_URL  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.models.request import (  # noqa: E402
    Request,
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
)
from app.models.request_item import RequestItem  # noqa: E402
from app.models.request_history import RequestHistory  # noqa: E402
from app.models.request_customer_dispatch import RequestCustomerDispatch  # noqa: E402
from app.models.request_receipt import RequestReceipt  # noqa: E402
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, PurchaseRequestHistory  # noqa: E402
from app.models.marketing_request import MarketingRequest, MarketingRequestHistory  # noqa: E402
from app.models.receipt import Receipt  # noqa: E402


def _generate_sn(prefix: str, year: int, seq: int) -> str:
    return f"{prefix}-{year}-{seq:04d}"


def _map_status(old_status: str | None, request_type: str) -> str:
    """Map old statuses to new 7-status enum."""
    if old_status is None:
        return "pending"
    s = old_status.lower()
    if s in ("approved", "approve", "accepted", "accept"):
        return "approved"
    if s in ("rejected", "reject", "not_approved", "denied", "deny"):
        return "not_approved"
    if s in ("cancelled", "cancel", "closed"):
        return "cancelled"
    if s in ("in_progress", "in-progress", "inprogress", "processing", "in_process"):
        return "in_progress"
    if s in ("awaiting_signoff", "awaiting-signoff", "awaiting signoff", "pending_signoff"):
        return "awaiting_signoff"
    if s in ("received", "delivered", "fulfilled", "complete", "completed"):
        return "received"
    return "pending"


def migrate_purchase_requests(session: Session) -> tuple[int, int, int, int]:
    """Returns (requests_created, items_created, history_created, skipped)."""
    # Idempotency check
    existing_sns = set(session.exec(select(Request.sn_no).where(Request.sn_no.like("REQ-%"))).all())
    if len(existing_sns) > 0:
        print(f"  Skipping purchase-request migration: {len(existing_sns)} REQ-* rows already exist")
        return 0, 0, 0, 0

    rows = session.exec(select(PurchaseRequest)).all()
    requests_created = 0
    items_created = 0
    history_created = 0

    for pr in rows:
        # Determine request_type
        # Old model: a row with `from_whom` set means vendor_purchase, else internal_transfer
        rt = REQUEST_TYPE_VENDOR_PURCHASE if pr.from_whom else REQUEST_TYPE_INTERNAL_TRANSFER

        # Map SN: old format "PR-2024-0001" → "REQ-2024-0001"
        sn_no = pr.sn_no.replace("PR-", "REQ-", 1) if pr.sn_no else _generate_sn("REQ", pr.created_at.year if pr.created_at else 2024, requests_created + 1)

        new_req = Request(
            sn_no=sn_no,
            request_type=rt,
            department=pr.department,
            from_whom=pr.from_whom,
            quantity=pr.quantity or 0.0,
            notes=pr.notes,
            status=_map_status(pr.status, rt),
            requested_by_user_id=pr.requested_by_user_id,
            requested_by_username=pr.requested_by_username,
            created_at=pr.created_at or datetime.now(tz=timezone.utc),
            updated_at=pr.updated_at or datetime.now(tz=timezone.utc),
            reviewed_by_user_id=pr.reviewed_by_user_id,
            reviewed_by_username=pr.reviewed_by_username,
            reviewed_at=pr.reviewed_at,
            review_note=pr.review_note,
            fulfilled_by_user_id=pr.fulfilled_by_user_id,
            fulfilled_by_username=pr.fulfilled_by_username,
            fulfillment_accepted_at=pr.fulfillment_accepted_at,
            fulfillment_note=pr.fulfillment_note,
            is_active=pr.is_active,
        )
        session.add(new_req)
        session.flush()
        requests_created += 1

        # Migrate line items
        old_items = session.exec(select(PurchaseRequestItem).where(PurchaseRequestItem.purchase_request_id == pr.id)).all()
        for oi in old_items:
            new_item = RequestItem(
                request_id=new_req.id,
                inventory_item_id=oi.inventory_item_id,
                item_name=oi.item_name,
                item_code=oi.item_code,
                item_type=oi.item_type,
                description=oi.description,
                quantity=oi.quantity or 1.0,
                timeline_days=oi.timeline_days,
                department=oi.department,
                item_status=oi.item_status,
                accepted_by_username=oi.accepted_by_username,
                accepted_at=oi.accepted_at,
                acceptance_note=oi.acceptance_note,
            )
            session.add(new_item)
            items_created += 1

        # Migrate history
        old_hist = session.exec(select(PurchaseRequestHistory).where(PurchaseRequestHistory.purchase_request_id == pr.id)).all()
        for oh in old_hist:
            new_hist = RequestHistory(
                request_id=new_req.id,
                changed_by_user_id=oh.changed_by_user_id,
                changed_by_username=oh.changed_by_username,
                change_type=oh.change_type,
                field_name=oh.field_name,
                old_value=oh.old_value,
                new_value=oh.new_value,
                note=oh.note,
                changed_at=oh.changed_at or datetime.now(tz=timezone.utc),
            )
            session.add(new_hist)
            history_created += 1

        # History snapshot of creation
        session.add(RequestHistory(
            request_id=new_req.id,
            changed_by_username="migration",
            change_type="migrated_from_purchase_request",
            note=f"Migrated from PurchaseRequest id={pr.id}, sn={pr.sn_no}",
        ))
        history_created += 1

    session.commit()
    return requests_created, items_created, history_created, 0


def migrate_marketing_requests(session: Session) -> tuple[int, int, int]:
    """Returns (requests_created, dispatches_created, history_created)."""
    existing_sns = set(session.exec(select(Request.sn_no).where(Request.sn_no.like("MKT-%"))).all())
    if len(existing_sns) > 0:
        print(f"  Skipping marketing-request migration: {len(existing_sns)} MKT-* rows already exist")
        return 0, 0, 0

    rows = session.exec(select(MarketingRequest)).all()
    requests_created = 0
    dispatches_created = 0
    history_created = 0

    for mr in rows:
        sn_no = mr.sn_no.replace("MKT-", "MKT-", 1) if mr.sn_no else _generate_sn("MKT", mr.created_at.year if mr.created_at else 2024, requests_created + 1)

        new_req = Request(
            sn_no=sn_no,
            request_type=REQUEST_TYPE_CUSTOMER_DISPATCH,
            department=mr.department,
            quantity=mr.quantity or 1.0,
            notes=mr.notes,
            status=_map_status(mr.status, REQUEST_TYPE_CUSTOMER_DISPATCH),
            requested_by_user_id=mr.requested_by_user_id,
            requested_by_username=mr.requested_by_username,
            created_at=mr.created_at or datetime.now(tz=timezone.utc),
            updated_at=mr.updated_at or datetime.now(tz=timezone.utc),
            is_active=mr.is_active,
        )
        session.add(new_req)
        session.flush()
        requests_created += 1

        # Create 1:1 customer-dispatch child
        dispatch = RequestCustomerDispatch(
            request_id=new_req.id,
            customer_name=mr.customer_name,
            customer_phone=mr.customer_phone,
            customer_address=mr.customer_address,
            customer_bought_by=mr.customer_bought_by,
            delivery_type=mr.delivery_type,
            inventory_type=mr.inventory_type or "weeder",
            item_id=mr.item_id,
            item_sn_no=mr.item_sn_no,
            item_description=mr.item_description,
            quantity=mr.quantity or 1.0,
        )
        session.add(dispatch)
        dispatches_created += 1

        # History
        old_hist = session.exec(select(MarketingRequestHistory).where(MarketingRequestHistory.marketing_request_id == mr.id)).all()
        for oh in old_hist:
            new_hist = RequestHistory(
                request_id=new_req.id,
                changed_by_user_id=oh.changed_by_user_id,
                changed_by_username=oh.changed_by_username,
                change_type=oh.change_type,
                field_name=oh.field_name,
                old_value=oh.old_value,
                new_value=oh.new_value,
                note=oh.note,
                changed_at=oh.changed_at or datetime.now(tz=timezone.utc),
            )
            session.add(new_hist)
            history_created += 1

        session.add(RequestHistory(
            request_id=new_req.id,
            changed_by_username="migration",
            change_type="migrated_from_marketing_request",
            note=f"Migrated from MarketingRequest id={mr.id}, sn={mr.sn_no}",
        ))
        history_created += 1

    session.commit()
    return requests_created, dispatches_created, history_created


def migrate_receipts(session: Session) -> tuple[int, int]:
    """Migrate Receipt → RequestReceipt.

    Receipts historically point to PurchaseRequest. Map old purchase_request_id
    to new request.sn_no.
    """
    existing_sns = set(session.exec(select(RequestReceipt.sn_no).where(RequestReceipt.sn_no.like("RCPT-%"))).all())
    if len(existing_sns) > 0:
        print(f"  Skipping receipt migration: {len(existing_sns)} RCPT-* rows already exist")
        return 0, 0

    # Build SN → new Request id map for purchase requests
    pr_sns = session.exec(select(Request.sn_no).where(Request.sn_no.like("REQ-%"))).all()
    sn_to_req_id: dict[str, int] = {}
    for r in session.exec(select(Request).where(Request.sn_no.in_(pr_sns))).all():
        sn_to_req_id[r.sn_no] = r.id

    old_sns = session.exec(select(Receipt.sn_no).where(Receipt.sn_no.like("RCPT-%"))).all()
    sn_to_receipt = {r.sn_no: r for r in session.exec(select(Receipt).where(Receipt.sn_no.in_(old_sns))).all()}

    # Map old PR-…-NNNN SNs to new REQ-…-NNNN ids
    pr_sn_to_new_id: dict[str, int] = {}
    for r in session.exec(select(Request)).all():
        # new SN format is REQ-<year>-NNNN (was PR-<year>-NNNN)
        if r.sn_no.startswith("REQ-"):
            old_pr_sn = "PR-" + r.sn_no[4:]
            pr_sn_to_new_id[old_pr_sn] = r.id

    receipts_created = 0
    skipped = 0
    for old in session.exec(select(Receipt)).all():
        new_req_id = pr_sn_to_new_id.get(old.purchase_request_sn_no or "")
        if not new_req_id:
            skipped += 1
            continue

        new_receipt = RequestReceipt(
            sn_no=old.sn_no,  # keep RCPT-… SN unchanged
            request_id=new_req_id,
            item_name=old.item_name,
            item_code=old.item_code,
            quantity_requested=old.quantity_requested or 0.0,
            quantity_received=old.quantity_received or 0.0,
            notes=old.notes,
            department=old.department,
            created_by_user_id=old.created_by_user_id,
            created_by_username=old.created_by_username,
            status=old.status or "pending_ack",
            acknowledged_by_user_id=old.acknowledged_by_user_id,
            acknowledged_by_username=old.acknowledged_by_username,
            acknowledged_at=old.acknowledged_at,
            acknowledgment_note=old.acknowledgment_note,
            is_active=old.is_active,
            created_at=old.created_at or datetime.now(tz=timezone.utc),
            updated_at=old.updated_at or datetime.now(tz=timezone.utc),
        )
        session.add(new_receipt)
        receipts_created += 1

    session.commit()
    return receipts_created, skipped


def main() -> int:
    print("=" * 60)
    print("Unified Request migration")
    print(f"DB: {SQLITE_URL}")
    print("=" * 60)

    # Auto-create new tables (idempotent)
    from app.core.database import init_db
    init_db()
    print("New tables verified/created.")

    with Session(engine) as session:
        print("\n[1/3] Migrating purchase_request → request")
        r, i, h, s = migrate_purchase_requests(session)
        print(f"       requests={r} items={i} history={h} skipped={s}")

        print("\n[2/3] Migrating marketing_request → request")
        r, d, h = migrate_marketing_requests(session)
        print(f"       requests={r} dispatches={d} history={h}")

        print("\n[3/3] Migrating receipt → request_receipt")
        r, s = migrate_receipts(session)
        print(f"       receipts={r} skipped={s}")

    print("\nMigration complete. Old tables left in place as read-only shadow.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Verify script imports cleanly**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from backend.scripts.migrate_unified_request import main; print('OK')"`

Expected: prints `OK`

- [ ] **Step 4: Run migration on dev DB**

Run: `cd /home/jayanth/workspace/One/OneFlow && ./backend/venv-linux/bin/python -m backend.scripts.migrate_unified_request`

Expected: prints migration report, no errors. If dev DB is empty (no purchase requests), all counts will be 0.

- [ ] **Step 5: Verify row counts match**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "
from sqlmodel import Session, select, func
from app.core.database import engine
from app.models.request import Request
from app.models.purchase_request import PurchaseRequest
from app.models.marketing_request import MarketingRequest
from app.models.request_receipt import RequestReceipt
from app.models.receipt import Receipt
with Session(engine) as s:
    pr_old = s.exec(select(func.count()).select_from(PurchaseRequest)).one()
    pr_new = s.exec(select(func.count()).select_from(Request).where(Request.request_type != 'customer_dispatch')).one()
    mr_old = s.exec(select(func.count()).select_from(MarketingRequest)).one()
    mr_new = s.exec(select(func.count()).select_from(Request).where(Request.request_type == 'customer_dispatch')).one()
    rc_old = s.exec(select(func.count()).select_from(Receipt)).one()
    rc_new = s.exec(select(func.count()).select_from(RequestReceipt)).one()
    print(f'PurchaseRequest {pr_old} -> Request(internal+vendor) {pr_new}')
    print(f'MarketingRequest {mr_old} -> Request(customer) {mr_new}')
    print(f'Receipt {rc_old} -> RequestReceipt {rc_new}')
"

Expected: counts match

- [ ] **Step 6: Commit migration script**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/scripts/
git commit -m "feat(backend): one-time migration script (PurchaseRequest + MarketingRequest + Receipt -> unified)"
```

---

### Task 8: Migration test (idempotency + correctness)

**Files:**
- Create: `backend/tests/test_migration.py`

- [ ] **Step 1: Create test**

File: `backend/tests/test_migration.py`

```python
"""Idempotency + correctness test for the unified-request migration script."""
import pytest
from datetime import datetime, timezone
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.pool import StaticPool

from app.core.database import engine  # use real engine so SQLModel registry matches
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_history import RequestHistory
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.request_receipt import RequestReceipt
from app.models.purchase_request import PurchaseRequest, PurchaseRequestItem, PurchaseRequestHistory
from app.models.marketing_request import MarketingRequest, MarketingRequestHistory
from app.models.receipt import Receipt
from app.models.user import User  # noqa: F401
from backend.scripts.migrate_unified_request import (
    migrate_purchase_requests,
    migrate_marketing_requests,
    migrate_receipts,
    main as run_migration,
)


@pytest.fixture(autouse=True)
def _clean_tables():
    """Truncate every table touched by migration before each test."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (
            RequestHistory, RequestItem, RequestCustomerDispatch, RequestReceipt, Request,
            PurchaseRequestHistory, PurchaseRequestItem, PurchaseRequest,
            MarketingRequestHistory, MarketingRequest,
            Receipt,
        ):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


def test_migrate_purchase_request_creates_request_with_items():
    user = User(id=1, username="alice", email="a@x.com", hashed_password="x", role="admin", is_active=True)
    with Session(engine) as s:
        s.add(user)
        pr = PurchaseRequest(
            id=1, sn_no="PR-2024-0001", department="sales", quantity=10.0, status="pending",
            requested_by_user_id=1, requested_by_username="alice",
            created_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
            updated_at=datetime(2024, 6, 1, tzinfo=timezone.utc),
        )
        s.add(pr)
        s.flush()
        s.add(PurchaseRequestItem(purchase_request_id=1, item_name="Hammer", quantity=10.0))
        s.commit()

    with Session(engine) as s:
        rc, ic, hc, _ = migrate_purchase_requests(s)
    assert rc == 1 and ic == 1 and hc >= 1

    with Session(engine) as s:
        new_req = s.exec(select(Request)).one()
        assert new_req.sn_no == "REQ-2024-0001"
        assert new_req.request_type == "internal_transfer"
        assert new_req.requested_by_username == "alice"
        items = s.exec(select(RequestItem).where(RequestItem.request_id == new_req.id)).all()
        assert len(items) == 1
        assert items[0].item_name == "Hammer"


def test_migrate_purchase_request_with_from_whom_marks_vendor():
    with Session(engine) as s:
        s.add(PurchaseRequest(
            id=1, sn_no="PR-2024-0002", from_whom="ABC Supplies", quantity=5.0, status="approved",
        ))
        s.commit()
        rc, *_ = migrate_purchase_requests(s)
    assert rc == 1
    with Session(engine) as s:
        new_req = s.exec(select(Request)).one()
        assert new_req.request_type == "vendor_purchase"
        assert new_req.from_whom == "ABC Supplies"
        assert new_req.status == "approved"


def test_migration_is_idempotent_on_purchase_requests():
    for i in range(3):
        with Session(engine) as s:
            s.add(PurchaseRequest(id=i + 1, sn_no=f"PR-2024-{i + 1:04d}", quantity=1.0, status="pending"))
            s.commit()
            rc, *_ = migrate_purchase_requests(s)
        assert rc == 1
    with Session(engine) as s:
        assert len(s.exec(select(Request)).all()) == 1


def test_migrate_marketing_request_creates_dispatch_child():
    with Session(engine) as s:
        s.add(MarketingRequest(
            id=1, sn_no="MKT-2024-0001", customer_name="Bob", customer_phone="123",
            customer_address="42 MG Road", inventory_type="weeder", item_sn_no="WP-001",
            quantity=1.0, status="pending",
        ))
        s.commit()
        rc, dc, _ = migrate_marketing_requests(s)
    assert rc == 1 and dc == 1
    with Session(engine) as s:
        req = s.exec(select(Request)).one()
        assert req.request_type == "customer_dispatch"
        dispatch = s.exec(select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)).one()
        assert dispatch.customer_name == "Bob"
        assert dispatch.item_sn_no == "WP-001"


def test_migrate_receipt_repoints_to_new_request_id():
    with Session(engine) as s:
        s.add(PurchaseRequest(id=1, sn_no="PR-2024-0050", quantity=5.0, status="approved"))
        s.commit()
        migrate_purchase_requests(s)
    with Session(engine) as s:
        s.add(Receipt(
            id=1, sn_no="RCPT-2024-0001", purchase_request_sn_no="PR-2024-0050",
            item_name="Hammer", quantity_requested=5.0, quantity_received=5.0, status="acknowledged",
        ))
        s.commit()
        rc, skipped = migrate_receipts(s)
    assert rc == 1 and skipped == 0
    with Session(engine) as s:
        new_rc = s.exec(select(RequestReceipt)).one()
        assert new_rc.sn_no == "RCPT-2024-0001"
        # points to the new request (not the old purchase request id)
        new_req = s.exec(select(Request)).one()
        assert new_rc.request_id == new_req.id


def test_migrate_receipt_skips_orphans():
    with Session(engine) as s:
        s.add(Receipt(sn_no="RCPT-2024-0001", purchase_request_sn_no="PR-2099-9999", quantity_received=1.0))
        s.commit()
        rc, skipped = migrate_receipts(s)
    assert rc == 0 and skipped == 1


def test_full_migration_main_runs_without_error():
    """End-to-end: main() is a no-op on clean DB, succeeds on populated DB."""
    with Session(engine) as s:
        s.add(PurchaseRequest(id=1, sn_no="PR-2024-0001", quantity=1.0, status="pending"))
        s.add(MarketingRequest(id=1, sn_no="MKT-2024-0001", customer_name="X", inventory_type="weeder", quantity=1.0))
        s.commit()
    # Should not raise
    assert run_migration() == 0
    # Re-run is a no-op
    assert run_migration() == 0
```

- [ ] **Step 2: Run test**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest tests/test_migration.py -v 2>&1 | tail -30`

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/tests/test_migration.py
git commit -m "test(backend): migration idempotency + correctness tests"
```

---

## Phase 3: Backend — New Unified Requests Router

### Task 9: Create shared schemas (Pydantic)

**Files:**
- Create: `backend/app/schemas/request.py`

- [ ] **Step 1: Create schemas**

File: `backend/app/schemas/request.py`

```python
"""Pydantic schemas for the unified Request API."""
from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field, model_validator

from app.models.request import (
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
)
from app.models.request_customer_dispatch import (
    DISPATCH_INVENTORY_TYPE_WEEDER,
    DISPATCH_INVENTORY_TYPE_ATTACHMENT,
    DELIVERY_TYPE_DIRECT,
    DELIVERY_TYPE_TRANSPORT,
)


RequestType = Literal["internal_transfer", "vendor_purchase", "customer_dispatch"]
DispatchInventoryType = Literal["weeder", "attachment"]
DeliveryType = Literal["direct", "transport"]
RequestStatus = Literal["pending", "approved", "in_progress", "awaiting_signoff", "received", "not_approved", "cancelled"]


class RequestItemCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 1.0
    timeline_days: Optional[int] = None
    department: Optional[str] = None


class RequestItemRead(BaseModel):
    id: int
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float
    timeline_days: Optional[int] = None
    department: Optional[str] = None
    item_status: Optional[str] = None
    accepted_by_username: Optional[str] = None
    accepted_at: Optional[datetime] = None
    acceptance_note: Optional[str] = None

    model_config = {"from_attributes": True}


class RequestCustomerDispatchCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None
    delivery_type: Optional[DeliveryType] = None
    inventory_type: DispatchInventoryType = DISPATCH_INVENTORY_TYPE_WEEDER
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = 1.0


class RequestCustomerDispatchRead(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None
    delivery_type: Optional[str] = None
    inventory_type: str
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float

    model_config = {"from_attributes": True}


class RequestHistoryRead(BaseModel):
    id: int
    changed_by_username: Optional[str] = None
    change_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    changed_at: datetime

    model_config = {"from_attributes": True}


class RequestCreate(BaseModel):
    request_type: RequestType
    department: Optional[str] = None
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    items: List[RequestItemCreate] = Field(default_factory=list)
    dispatch: Optional[RequestCustomerDispatchCreate] = None

    @model_validator(mode="after")
    def _validate_type_specific(self):
        if self.request_type == REQUEST_TYPE_VENDOR_PURCHASE and not self.from_whom:
            raise ValueError("from_whom is required when request_type=vendor_purchase")
        if self.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
            if not self.dispatch:
                raise ValueError("dispatch is required when request_type=customer_dispatch")
            if not self.dispatch.customer_name:
                raise ValueError("dispatch.customer_name is required for customer dispatch")
        if self.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
            if not self.items:
                raise ValueError("at least one line item is required for internal_transfer / vendor_purchase")
        return self


class RequestUpdate(BaseModel):
    department: Optional[str] = None
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[RequestItemCreate]] = None
    dispatch: Optional[RequestCustomerDispatchCreate] = None


class RequestRead(BaseModel):
    id: int
    sn_no: str
    request_type: str
    department: Optional[str] = None
    from_whom: Optional[str] = None
    quantity: float
    notes: Optional[str] = None
    status: str
    requested_by_user_id: Optional[int] = None
    requested_by_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    reviewed_by_user_id: Optional[int] = None
    reviewed_by_username: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    fulfilled_by_user_id: Optional[int] = None
    fulfilled_by_username: Optional[str] = None
    fulfillment_accepted_at: Optional[datetime] = None
    fulfillment_note: Optional[str] = None
    is_active: bool
    items: List[RequestItemRead] = Field(default_factory=list)
    dispatch: Optional[RequestCustomerDispatchRead] = None
    history: List[RequestHistoryRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class RequestListRead(BaseModel):
    id: int
    sn_no: str
    request_type: str
    department: Optional[str] = None
    from_whom: Optional[str] = None
    quantity: float
    status: str
    requested_by_username: Optional[str] = None
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class RequestReviewAction(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = None


class RequestItemAcceptAction(BaseModel):
    item_id: int
    decision: Literal["accept", "reject"] = "accept"
    note: Optional[str] = None


class RequestStatusUpdate(BaseModel):
    new_status: RequestStatus
    note: Optional[str] = None
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.schemas.request import RequestCreate, RequestRead; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/schemas/request.py
git commit -m "feat(backend): Pydantic schemas for unified Request API"
```

---

### Task 10: Implement helpers (SN generator, history logger)

**Files:**
- Create: `backend/app/routers/requests_helpers.py`

- [ ] **Step 1: Create helpers**

File: `backend/app/routers/requests_helpers.py`

```python
"""Helpers used by both the new /requests router and the legacy shims."""
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select, func

from app.models.request import Request, REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE, REQUEST_TYPE_CUSTOMER_DISPATCH
from app.models.request_history import RequestHistory


def _prefix_for(request_type: str) -> str:
    if request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        return "MKT"
    return "REQ"


def generate_sn(session: Session, request_type: str) -> str:
    """Generate the next serial number, e.g. REQ-2026-0001 / MKT-2026-0001.

    Strategy: SELECT MAX(sequence) for current year.
    """
    prefix = _prefix_for(request_type)
    year = datetime.utcnow().year
    sn_prefix = f"{prefix}-{year}-"
    rows = session.exec(
        select(Request.sn_no).where(Request.sn_no.like(f"{sn_prefix}%"))
    ).all()
    max_seq = 0
    for sn in rows:
        try:
            seq = int(sn.split("-")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            continue
    return f"{sn_prefix}{max_seq + 1:04d}"


def log_history(
    session: Session,
    request_id: int,
    *,
    changed_by_user_id: Optional[int],
    changed_by_username: Optional[str],
    change_type: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    note: Optional[str] = None,
) -> RequestHistory:
    h = RequestHistory(
        request_id=request_id,
        changed_by_user_id=changed_by_user_id,
        changed_by_username=changed_by_username,
        change_type=change_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        note=note,
    )
    session.add(h)
    return h
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.requests_helpers import generate_sn, log_history; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/requests_helpers.py
git commit -m "feat(backend): SN generator + history logger helpers"
```

---

### Task 11: Implement new /requests router (CRUD + list + filters)

**Files:**
- Create: `backend/app/routers/requests.py`

- [ ] **Step 1: Create the router file (part 1: imports, deps, list + create)**

File: `backend/app/routers/requests.py`

```python
"""Unified /api/v1/requests router.

Handles all three request types: internal_transfer | vendor_purchase | customer_dispatch.
Old /api/v1/purchase-requests and /api/v1/marketing-requests routers
are thin shims around this code.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, or_

from app.core.database import get_session
from app.core.config import settings
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import (
    Request,
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
    REQUEST_TYPES,
)
from app.models.request_item import RequestItem
from app.models.request_history import RequestHistory
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestRead, RequestListRead,
    RequestReviewAction, RequestItemAcceptAction, RequestStatusUpdate,
)
from app.routers.requests_helpers import generate_sn, log_history

router = APIRouter(prefix="/api/v1/requests", tags=["requests"])


# --- auth/visibility helpers ---

def _user_can_see_type(user: User, request_type: str) -> bool:
    """Authorisation model (from spec): by request_type.

    internal_transfer → any user can see (their own dept by default)
    vendor_purchase  → admin only
    customer_dispatch → marketing/sales dept
    """
    if request_type == REQUEST_TYPE_VENDOR_PURCHASE:
        return user.role == "admin"
    if request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        return user.department in ("marketing", "sales") or user.role == "admin"
    return True  # internal_transfer: all users


def _apply_visibility_filter(stmt, user: User):
    """Restrict stmt to request types the user is allowed to see."""
    allowed = [rt for rt in REQUEST_TYPES if _user_can_see_type(user, rt)]
    return stmt.where(Request.request_type.in_(allowed))


# --- list ---

@router.get("", response_model=List[RequestListRead])
def list_requests(
    request_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Request)
    if only_active:
        stmt = stmt.where(Request.is_active == True)  # noqa: E712
    if request_type:
        if request_type not in REQUEST_TYPES:
            raise HTTPException(status_code=400, detail=f"request_type must be one of {REQUEST_TYPES}")
        stmt = stmt.where(Request.request_type == request_type)
    if status:
        stmt = stmt.where(Request.status == status)
    if department:
        stmt = stmt.where(Request.department == department)
    stmt = _apply_visibility_filter(stmt, current_user)
    stmt = stmt.order_by(Request.created_at.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()


# --- create ---

@router.post("", response_model=RequestRead, status_code=201)
def create_request(
    payload: RequestCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not _user_can_see_type(current_user, payload.request_type):
        raise HTTPException(status_code=403, detail=f"Not allowed to create {payload.request_type} requests")

    sn_no = generate_sn(session, payload.request_type)
    new_req = Request(
        sn_no=sn_no,
        request_type=payload.request_type,
        department=payload.department,
        from_whom=payload.from_whom,
        quantity=sum(i.quantity for i in payload.items) if payload.items else (payload.dispatch.quantity if payload.dispatch else 0.0),
        notes=payload.notes,
        status="pending",
        requested_by_user_id=current_user.id,
        requested_by_username=current_user.username,
    )
    session.add(new_req)
    session.flush()  # need id

    if payload.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        for item_in in payload.items:
            session.add(RequestItem(
                request_id=new_req.id,
                inventory_item_id=item_in.inventory_item_id,
                item_name=item_in.item_name,
                item_code=item_in.item_code,
                item_type=item_in.item_type,
                description=item_in.description,
                quantity=item_in.quantity,
                timeline_days=item_in.timeline_days,
                department=item_in.department,
            ))
    elif payload.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH and payload.dispatch:
        session.add(RequestCustomerDispatch(
            request_id=new_req.id,
            customer_name=payload.dispatch.customer_name,
            customer_phone=payload.dispatch.customer_phone,
            customer_address=payload.dispatch.customer_address,
            customer_bought_by=payload.dispatch.customer_bought_by,
            delivery_type=payload.dispatch.delivery_type,
            inventory_type=payload.dispatch.inventory_type,
            item_id=payload.dispatch.item_id,
            item_sn_no=payload.dispatch.item_sn_no,
            item_description=payload.dispatch.item_description,
            quantity=payload.dispatch.quantity,
        ))

    log_history(session, new_req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="created", note=f"Created {payload.request_type} request {sn_no}")
    session.commit()
    session.refresh(new_req)
    return _build_read(new_req, session)


# --- read one ---

@router.get("/{request_id}", response_model=RequestRead)
def get_request(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _user_can_see_type(current_user, req.request_type):
        raise HTTPException(status_code=403, detail="Not allowed to view this request")
    return _build_read(req, session)


# --- update ---

@router.put("/{request_id}", response_model=RequestRead)
def update_request(
    request_id: int,
    payload: RequestUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.requested_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the requester or an admin can edit")

    if req.status not in ("pending",):
        raise HTTPException(status_code=409, detail=f"Cannot edit a request in status '{req.status}'")

    changes = []
    for field in ("department", "from_whom", "notes"):
        new_val = getattr(payload, field)
        old_val = getattr(req, field)
        if new_val is not None and new_val != old_val:
            setattr(req, field, new_val)
            changes.append((field, old_val, new_val))

    if payload.items is not None and req.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        for old in session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all():
            session.delete(old)
        session.flush()
        for item_in in payload.items:
            session.add(RequestItem(
                request_id=req.id, inventory_item_id=item_in.inventory_item_id,
                item_name=item_in.item_name, item_code=item_in.item_code,
                item_type=item_in.item_type, description=item_in.description,
                quantity=item_in.quantity, timeline_days=item_in.timeline_days,
                department=item_in.department,
            ))
        req.quantity = sum(i.quantity for i in payload.items)
        changes.append(("items", "replaced", f"{len(payload.items)} items"))

    if payload.dispatch is not None and req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        dispatch = session.exec(select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)).one_or_none()
        if not dispatch:
            dispatch = RequestCustomerDispatch(request_id=req.id)
            session.add(dispatch)
        for field in ("customer_name", "customer_phone", "customer_address", "customer_bought_by",
                      "delivery_type", "inventory_type", "item_id", "item_sn_no", "item_description", "quantity"):
            new_val = getattr(payload.dispatch, field)
            if new_val is not None:
                setattr(dispatch, field, new_val)
        req.quantity = payload.dispatch.quantity or req.quantity

    req.updated_at = datetime.now(tz=timezone.utc)
    for f, o, n in changes:
        log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                    change_type="edited", field_name=f, old_value=str(o) if o else None, new_value=str(n) if n else None)

    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- delete (soft) ---

@router.delete("/{request_id}", status_code=204)
def delete_request(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.requested_by_user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the requester or an admin can delete")
    req.is_active = False
    req.status = "cancelled"
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="cancelled", note="Soft-deleted")
    session.commit()
    return None


# --- review (admin approve/reject) ---

@router.post("/{request_id}/review", response_model=RequestRead)
def review_request(
    request_id: int,
    payload: RequestReviewAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can review requests")
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot review a request in status '{req.status}'")

    old_status = req.status
    req.status = "approved" if payload.decision == "approve" else "not_approved"
    req.reviewed_by_user_id = current_user.id
    req.reviewed_by_username = current_user.username
    req.reviewed_at = datetime.now(tz=timezone.utc)
    req.review_note = payload.note

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="approved" if payload.decision == "approve" else "rejected",
                field_name="status", old_value=old_status, new_value=req.status, note=payload.note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- fulfilment (target dept accepts) ---

@router.post("/{request_id}/accept", response_model=RequestRead)
def accept_fulfilment(
    request_id: int,
    note: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "approved":
        raise HTTPException(status_code=409, detail=f"Cannot accept a request in status '{req.status}'")
    req.status = "in_progress"
    req.fulfilled_by_user_id = current_user.id
    req.fulfilled_by_username = current_user.username
    req.fulfillment_accepted_at = datetime.now(tz=timezone.utc)
    req.fulfillment_note = note
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="responded", field_name="status", old_value="approved", new_value="in_progress", note=note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- per-item acceptance (dept marks item received) ---

@router.post("/{request_id}/items/accept", response_model=RequestRead)
def accept_item(
    request_id: int,
    payload: RequestItemAcceptAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    item = session.get(RequestItem, payload.item_id)
    if not item or item.request_id != req.id:
        raise HTTPException(status_code=404, detail="Item not found")
    item.item_status = "in_progress" if payload.decision == "accept" else "rejected"
    item.accepted_by_username = current_user.username
    item.accepted_at = datetime.now(tz=timezone.utc)
    item.acceptance_note = payload.note
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="responded", field_name=f"item:{item.item_name}",
                old_value=item.item_status, new_value=item.item_status, note=payload.note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- manual status update (admin) ---

@router.post("/{request_id}/status", response_model=RequestRead)
def set_status(
    request_id: int,
    payload: RequestStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change status manually")
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    old_status = req.status
    req.status = payload.new_status
    req.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="status_change", field_name="status", old_value=old_status, new_value=payload.new_status, note=payload.note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- history ---

@router.get("/{request_id}/history", response_model=List[RequestHistoryRead])
def get_history(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _user_can_see_type(current_user, req.request_type):
        raise HTTPException(status_code=403, detail="Not allowed to view this request's history")
    return session.exec(
        select(RequestHistory).where(RequestHistory.request_id == request_id).order_by(RequestHistory.changed_at.asc())
    ).all()


# --- build read ---

def _build_read(req: Request, session: Session) -> RequestRead:
    items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    dispatch = session.exec(select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)).one_or_none()
    history = session.exec(
        select(RequestHistory).where(RequestHistory.request_id == req.id).order_by(RequestHistory.changed_at.asc())
    ).all()
    return RequestRead(
        id=req.id, sn_no=req.sn_no, request_type=req.request_type, department=req.department,
        from_whom=req.from_whom, quantity=req.quantity, notes=req.notes, status=req.status,
        requested_by_user_id=req.requested_by_user_id, requested_by_username=req.requested_by_username,
        created_at=req.created_at, updated_at=req.updated_at,
        reviewed_by_user_id=req.reviewed_by_user_id, reviewed_by_username=req.reviewed_by_username,
        reviewed_at=req.reviewed_at, review_note=req.review_note,
        fulfilled_by_user_id=req.fulfilled_by_user_id, fulfilled_by_username=req.fulfilled_by_username,
        fulfillment_accepted_at=req.fulfillment_accepted_at, fulfillment_note=req.fulfillment_note,
        is_active=req.is_active,
        items=[RequestItemRead.model_validate(i) for i in items],
        dispatch=RequestCustomerDispatchRead.model_validate(dispatch) if dispatch else None,
        history=[RequestHistoryRead.model_validate(h) for h in history],
    )
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.requests import router; print('OK')"`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/requests.py
git commit -m "feat(backend): unified /api/v1/requests router"
```

---

### Task 12: New /request-receipts router

**Files:**
- Create: `backend/app/routers/request_receipts.py`
- Create: `backend/app/schemas/request_receipt.py`

- [ ] **Step 1: Create schemas**

File: `backend/app/schemas/request_receipt.py`

```python
"""Pydantic schemas for the RequestReceipt API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class RequestReceiptCreate(BaseModel):
    request_id: int
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float = 0.0
    quantity_received: float = 0.0
    notes: Optional[str] = None
    department: Optional[str] = None


class RequestReceiptRead(BaseModel):
    id: int
    sn_no: str
    request_id: int
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float
    quantity_received: float
    notes: Optional[str] = None
    department: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    status: str
    acknowledged_by_user_id: Optional[int] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequestReceiptAcknowledge(BaseModel):
    note: Optional[str] = None
```

- [ ] **Step 2: Create router**

File: `backend/app/routers/request_receipts.py`

```python
"""Unified /api/v1/request-receipts router.

Renamed from /api/v1/receipts. Old router kept as a thin shim.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, or_

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import Request
from app.models.request_receipt import RequestReceipt
from app.models.request_history import RequestHistory
from app.schemas.request_receipt import (
    RequestReceiptCreate, RequestReceiptRead, RequestReceiptAcknowledge,
)
from app.routers.requests_helpers import log_history

router = APIRouter(prefix="/api/v1/request-receipts", tags=["request-receipts"])


def _generate_rcpt_sn(session: Session) -> str:
    year = datetime.utcnow().year
    sn_prefix = f"RCPT-{year}-"
    rows = session.exec(
        select(RequestReceipt.sn_no).where(RequestReceipt.sn_no.like(f"{sn_prefix}%"))
    ).all()
    max_seq = 0
    for sn in rows:
        try:
            seq = int(sn.split("-")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            continue
    return f"{sn_prefix}{max_seq + 1:04d}"


@router.get("", response_model=List[RequestReceiptRead])
def list_receipts(
    request_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    stmt = select(RequestReceipt)
    if only_active:
        stmt = stmt.where(RequestReceipt.is_active == True)  # noqa: E712
    if request_id is not None:
        stmt = stmt.where(RequestReceipt.request_id == request_id)
    if status:
        stmt = stmt.where(RequestReceipt.status == status)
    stmt = stmt.order_by(RequestReceipt.created_at.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()


@router.post("", response_model=RequestReceiptRead, status_code=201)
def create_receipt(
    payload: RequestReceiptCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, payload.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("approved", "in_progress", "awaiting_signoff"):
        raise HTTPException(status_code=409, detail=f"Cannot create receipt for a request in status '{req.status}'")

    sn_no = _generate_rcpt_sn(session)
    new_receipt = RequestReceipt(
        sn_no=sn_no,
        request_id=payload.request_id,
        item_name=payload.item_name,
        item_code=payload.item_code,
        quantity_requested=payload.quantity_requested,
        quantity_received=payload.quantity_received,
        notes=payload.notes,
        department=payload.department,
        created_by_user_id=current_user.id,
        created_by_username=current_user.username,
        status="pending_ack",
    )
    session.add(new_receipt)
    session.flush()
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_created", note=f"Created receipt {sn_no} for qty={payload.quantity_received}")
    session.commit()
    session.refresh(new_receipt)
    return new_receipt


@router.get("/{receipt_id}", response_model=RequestReceiptRead)
def get_receipt(
    receipt_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return r


@router.post("/{receipt_id}/acknowledge", response_model=RequestReceiptRead)
def acknowledge_receipt(
    receipt_id: int,
    payload: RequestReceiptAcknowledge,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if r.status == "acknowledged":
        raise HTTPException(status_code=409, detail="Receipt is already acknowledged")
    r.status = "acknowledged"
    r.acknowledged_by_user_id = current_user.id
    r.acknowledged_by_username = current_user.username
    r.acknowledged_at = datetime.now(tz=timezone.utc)
    r.acknowledgment_note = payload.note
    r.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, r.request_id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_acknowledged", note=payload.note)
    # Update request status: if all items have receipts and they're acknowledged, mark received
    req = session.get(Request, r.request_id)
    if req and req.status != "received":
        req.status = "received"
        req.updated_at = datetime.now(tz=timezone.utc)
    session.commit()
    session.refresh(r)
    return r


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(
    receipt_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if current_user.role != "admin" and r.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator or admin can delete")
    r.is_active = False
    r.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, r.request_id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_deleted", note=f"Receipt {r.sn_no} soft-deleted")
    session.commit()
    return None
```

- [ ] **Step 3: Verify imports**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.request_receipts import router; from app.schemas.request_receipt import RequestReceiptRead; print('OK')"`

Expected: prints `OK`

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/request_receipts.py backend/app/schemas/request_receipt.py
git commit -m "feat(backend): unified /api/v1/request-receipts router + schemas"
```

---

### Task 13: Register new routers in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Find the current router registrations**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && grep -n "include_router\|purchase_requests\|marketing_requests\|receipts" app/main.py`

Expected: shows the existing router include lines and the file paths

- [ ] **Step 2: Add the new routers (keep the old shims in place)**

Open `backend/app/main.py` and add these two import lines near the top of the imports block:

```python
from app.routers.requests import router as requests_router
from app.routers.request_receipts import router as request_receipts_router
```

Then in the same section as the other `app.include_router(...)` calls, add:

```python
app.include_router(requests_router)
app.include_router(request_receipts_router)
```

(Keep the old `app.include_router(purchase_requests_router)`, `marketing_requests_router`, `receipts_router` lines so the shim URLs still work.)

- [ ] **Step 3: Verify app starts**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.main import app; routes = [r.path for r in app.routes if hasattr(r, 'path')]; print('\n'.join(sorted([r for r in routes if 'request' in r])))"`

Expected: list includes BOTH old (`/api/v1/purchase-requests`, `/api/v1/marketing-requests`, `/api/v1/receipts`) AND new (`/api/v1/requests`, `/api/v1/request-receipts`) routes.

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/main.py
git commit -m "feat(backend): register unified /requests + /request-receipts routers"
```

---

## Phase 4: Backend — Shim Routers (back-compat)

### Task 14: Convert `purchase_requests` router to shim

**Files:**
- Modify: `backend/app/routers/purchase_requests.py`

- [ ] **Step 1: Inspect the current router file**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && head -30 app/routers/purchase_requests.py && echo "----" && grep -n "^@router\|^def\|return\|session.exec\|session.add" app/routers/purchase_requests.py | head -40`

Expected: shows all the endpoints defined in the current router

- [ ] **Step 2: Write the shim**

File: `backend/app/routers/purchase_requests.py` — REPLACE the entire file with:

```python
"""Shim router for /api/v1/purchase-requests.

Delegates to the unified /api/v1/requests router. Kept for back-compat
with old frontend clients and external integrations. The implementation
lives in app/routers/requests.py.
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE
from app.schemas.request import RequestCreate, RequestUpdate, RequestRead, RequestListRead, RequestReviewAction, RequestStatusUpdate
from app.routers.requests import (
    list_requests as _list_requests,
    create_request as _create_request,
    get_request as _get_request,
    update_request as _update_request,
    delete_request as _delete_request,
    review_request as _review_request,
    set_status as _set_status,
)
from app.routers.requests_helpers import log_history
from app.models.request_history import RequestHistory
from sqlmodel import select
from fastapi import Query, HTTPException
from typing import Optional, List

router = APIRouter(prefix="/api/v1/purchase-requests", tags=["purchase-requests"])


@router.get("", response_model=List[RequestListRead])
def list_purchase_requests(
    status: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List internal_transfer + vendor_purchase requests."""
    items = _list_requests(
        request_type=None,
        status=status, department=department, only_active=only_active,
        limit=limit, offset=offset, session=session, current_user=current_user,
    )
    return [r for r in items if r.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE)]


@router.post("", response_model=RequestRead, status_code=201)
def create_purchase_request(payload: RequestCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if payload.request_type not in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        raise HTTPException(status_code=400, detail="This endpoint accepts internal_transfer or vendor_purchase only")
    return _create_request(payload=payload, session=session, current_user=current_user)


@router.get("/{request_id}", response_model=RequestRead)
def get_purchase_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_request(request_id=request_id, session=session, current_user=current_user)


@router.put("/{request_id}", response_model=RequestRead)
def update_purchase_request(request_id: int, payload: RequestUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _update_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{request_id}", status_code=204)
def delete_purchase_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_request(request_id=request_id, session=session, current_user=current_user)


@router.post("/{request_id}/review", response_model=RequestRead)
def review_purchase_request(request_id: int, payload: RequestReviewAction, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _review_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.post("/{request_id}/status", response_model=RequestRead)
def set_purchase_status(request_id: int, payload: RequestStatusUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _set_status(request_id=request_id, payload=payload, session=session, current_user=current_user)
```

- [ ] **Step 3: Verify the shim imports**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.purchase_requests import router; print('OK', len(router.routes), 'routes')"`

Expected: prints `OK 7 routes`

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/purchase_requests.py
git commit -m "refactor(backend): convert /purchase-requests to thin shim over /requests"
```

---

### Task 15: Convert `marketing_requests` router to shim

**Files:**
- Modify: `backend/app/routers/marketing_requests.py`

- [ ] **Step 1: Write the shim**

File: `backend/app/routers/marketing_requests.py` — REPLACE the entire file with:

```python
"""Shim router for /api/v1/marketing-requests.

Delegates to the unified /api/v1/requests router.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import Session
from typing import Optional, List

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import REQUEST_TYPE_CUSTOMER_DISPATCH
from app.schemas.request import RequestCreate, RequestUpdate, RequestRead, RequestListRead, RequestStatusUpdate
from app.routers.requests import (
    list_requests as _list_requests,
    create_request as _create_request,
    get_request as _get_request,
    update_request as _update_request,
    delete_request as _delete_request,
    set_status as _set_status,
)

router = APIRouter(prefix="/api/v1/marketing-requests", tags=["marketing-requests"])


@router.get("", response_model=List[RequestListRead])
def list_marketing_requests(
    status: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    items = _list_requests(
        request_type=None, status=status, department=department,
        only_active=only_active, limit=limit, offset=offset,
        session=session, current_user=current_user,
    )
    return [r for r in items if r.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH]


@router.post("", response_model=RequestRead, status_code=201)
def create_marketing_request(payload: RequestCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if payload.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="This endpoint accepts customer_dispatch only")
    return _create_request(payload=payload, session=session, current_user=current_user)


@router.get("/{request_id}", response_model=RequestRead)
def get_marketing_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_request(request_id=request_id, session=session, current_user=current_user)


@router.put("/{request_id}", response_model=RequestRead)
def update_marketing_request(request_id: int, payload: RequestUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _update_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{request_id}", status_code=204)
def delete_marketing_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_request(request_id=request_id, session=session, current_user=current_user)


@router.post("/{request_id}/status", response_model=RequestRead)
def set_marketing_status(request_id: int, payload: RequestStatusUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _set_status(request_id=request_id, payload=payload, session=session, current_user=current_user)
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.marketing_requests import router; print('OK', len(router.routes), 'routes')"`

Expected: prints `OK 6 routes`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/marketing_requests.py
git commit -m "refactor(backend): convert /marketing-requests to thin shim over /requests"
```

---

### Task 16: Convert `receipts` router to shim

**Files:**
- Modify: `backend/app/routers/receipts.py`

- [ ] **Step 1: Write the shim**

File: `backend/app/routers/receipts.py` — REPLACE the entire file with:

```python
"""Shim router for /api/v1/receipts.

Delegates to the unified /api/v1/request-receipts router.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import Session
from typing import Optional, List

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.request_receipt import RequestReceiptCreate, RequestReceiptRead, RequestReceiptAcknowledge
from app.routers.request_receipts import (
    list_receipts as _list_receipts,
    create_receipt as _create_receipt,
    get_receipt as _get_receipt,
    acknowledge_receipt as _acknowledge_receipt,
    delete_receipt as _delete_receipt,
)

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])


@router.get("", response_model=List[RequestReceiptRead])
def list_receipts(
    request_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return _list_receipts(
        request_id=request_id, status=status, only_active=only_active,
        limit=limit, offset=offset, session=session, current_user=current_user,
    )


@router.post("", response_model=RequestReceiptRead, status_code=201)
def create_receipt(payload: RequestReceiptCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _create_receipt(payload=payload, session=session, current_user=current_user)


@router.get("/{receipt_id}", response_model=RequestReceiptRead)
def get_receipt(receipt_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_receipt(receipt_id=receipt_id, session=session, current_user=current_user)


@router.post("/{receipt_id}/acknowledge", response_model=RequestReceiptRead)
def acknowledge_receipt(receipt_id: int, payload: RequestReceiptAcknowledge, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _acknowledge_receipt(receipt_id=receipt_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(receipt_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_receipt(receipt_id=receipt_id, session=session, current_user=current_user)
```

- [ ] **Step 2: Verify import**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -c "from app.routers.receipts import router; print('OK', len(router.routes), 'routes')"`

Expected: prints `OK 5 routes`

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/app/routers/receipts.py
git commit -m "refactor(backend): convert /receipts to thin shim over /request-receipts"
```

---

## Phase 5: Backend — Integration Tests for new router

### Task 17: End-to-end test for /api/v1/requests

**Files:**
- Create: `backend/tests/test_requests_router.py`

- [ ] **Step 1: Create test file**

File: `backend/tests/test_requests_router.py`

```python
"""Integration tests for the unified /api/v1/requests router."""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, select

from app.main import app
from app.core.database import engine
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.dependencies.auth import create_access_token


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (
            RequestItem, RequestCustomerDispatch, Request, User,
        ):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


@pytest.fixture
def admin_user():
    u = User(
        username="admin", email="admin@x.com",
        hashed_password=hash_password("pw"), role=UserRole.ADMIN, is_active=True,
        department="admin",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


@pytest.fixture
def marketing_user():
    u = User(
        username="mkt", email="mkt@x.com",
        hashed_password=hash_password("pw"), role=UserRole.STAFF, is_active=True,
        department="marketing",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


@pytest.fixture
def staff_user():
    u = User(
        username="staff", email="staff@x.com",
        hashed_password=hash_password("pw"), role=UserRole.STAFF, is_active=True,
        department="sales",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


def _bearer(user: User) -> dict:
    token = create_access_token(subject=str(user.id))
    return {"Authorization": f"Bearer {token}"}


def test_list_empty(client):
    r = client.get("/api/v1/requests", headers=_bearer(admin_user := _admin()))
    # ^ note: pytest fixture inlined for brevity, see _admin helper below
    assert r.status_code == 200
    assert r.json() == []


def _admin():
    u = User(username="_admin", email="_a@x.com", hashed_password=hash_password("pw"),
             role=UserRole.ADMIN, is_active=True, department="admin")
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


# ---------------- happy paths ----------------

def test_create_internal_transfer(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "Laptop", "quantity": 2.0}],
        "notes": "For new hire",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("REQ-")
    assert body["request_type"] == "internal_transfer"
    assert body["quantity"] == 2.0
    assert len(body["items"]) == 1


def test_create_vendor_purchase_requires_from_whom(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "vendor_purchase",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    assert r.status_code == 422  # pydantic validation


def test_create_vendor_purchase_admin_only(client, staff_user):
    """Non-admin cannot create vendor_purchase."""
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "vendor_purchase",
        "from_whom": "ABC",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    assert r.status_code == 403


def test_create_customer_dispatch_marketing_only(client, staff_user, marketing_user):
    """Sales staff cannot create customer_dispatch."""
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "Bob", "inventory_type": "weeder", "quantity": 1.0},
    })
    assert r.status_code == 403

    # Marketing user can
    r = client.post("/api/v1/requests", headers=_bearer(marketing_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "Bob", "inventory_type": "weeder", "item_sn_no": "WP-1", "quantity": 1.0},
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("MKT-")
    assert body["request_type"] == "customer_dispatch"
    assert body["dispatch"]["customer_name"] == "Bob"


def test_list_filters_by_type(client, staff_user, marketing_user):
    client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer", "items": [{"item_name": "A", "quantity": 1.0}],
    })
    client.post("/api/v1/requests", headers=_bearer(marketing_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "X", "inventory_type": "weeder", "quantity": 1.0},
    })
    r = client.get("/api/v1/requests?request_type=internal_transfer", headers=_bearer(staff_user))
    assert r.status_code == 200
    assert all(x["request_type"] == "internal_transfer" for x in r.json())
    assert len(r.json()) >= 1


def test_review_approve_then_accept_flow(client, staff_user, admin_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    # admin reviews
    r = client.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin_user), json={"decision": "approve"})
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    # staff accepts fulfilment
    r = client.post(f"/api/v1/requests/{rid}/accept", headers=_bearer(staff_user))
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


def test_history_recorded_on_create_and_review(client, staff_user, admin_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    client.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin_user), json={"decision": "approve"})
    r = client.get(f"/api/v1/requests/{rid}/history", headers=_bearer(staff_user))
    types = [h["change_type"] for h in r.json()]
    assert "created" in types
    assert "approved" in types


def test_soft_delete(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    r = client.delete(f"/api/v1/requests/{rid}", headers=_bearer(staff_user))
    assert r.status_code == 204
    # list with only_active=True (default) should hide it
    r = client.get("/api/v1/requests", headers=_bearer(staff_user))
    assert all(x["id"] != rid for x in r.json())


def test_only_requester_or_admin_can_edit(client, staff_user, marketing_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer", "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    # different user, not admin → 403
    r = client.put(f"/api/v1/requests/{rid}", headers=_bearer(marketing_user),
                   json={"notes": "hijack"})
    assert r.status_code == 403
```

- [ ] **Step 2: Inspect existing tests for naming conventions**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && head -10 app/models/user.py && echo "----" && grep -n "UserRole\|class User" app/models/user.py | head -5`

Expected: shows the User model and UserRole enum so the test imports the right names

- [ ] **Step 3: Run test**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest tests/test_requests_router.py -v 2>&1 | tail -40`

Expected: all tests pass. If UserRole / User fields differ, adjust the fixtures to match (most likely 1-2 line tweaks).

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/tests/test_requests_router.py
git commit -m "test(backend): integration tests for unified /requests router"
```

---

### Task 18: End-to-end test for /api/v1/request-receipts

**Files:**
- Create: `backend/tests/test_request_receipts_router.py`

- [ ] **Step 1: Create test**

File: `backend/tests/test_request_receipts_router.py`

```python
"""Integration tests for /api/v1/request-receipts."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

from app.main import app
from app.core.database import engine
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_receipt import RequestReceipt
from app.dependencies.auth import create_access_token


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (RequestReceipt, RequestItem, Request, User):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


def _user(name: str, role: str = "staff", dept: str = "sales") -> User:
    u = User(username=name, email=f"{name}@x.com", hashed_password=hash_password("pw"),
             role=UserRole(role.upper()) if hasattr(UserRole, role.upper()) else UserRole.STAFF,
             is_active=True, department=dept)
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


def _bearer(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(subject=str(u.id))}"}


def _create_approved_internal_request(staff: User) -> int:
    admin = _user("_adm", role="admin", dept="admin")
    c = TestClient(app)
    r = c.post("/api/v1/requests", headers=_bearer(staff), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 2.0}],
    })
    rid = r.json()["id"]
    c.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin), json={"decision": "approve"})
    return rid


def test_create_receipt_after_approval(client):
    staff = _user("alice")
    rid = _create_approved_internal_request(staff)
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "item_name": "X", "quantity_requested": 2.0, "quantity_received": 2.0,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("RCPT-")
    assert body["status"] == "pending_ack"


def test_create_receipt_rejects_pending_request(client):
    staff = _user("bob")
    c = TestClient(app)
    r = c.post("/api/v1/requests", headers=_bearer(staff), json={
        "request_type": "internal_transfer",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "quantity_received": 1.0,
    })
    assert r.status_code == 409


def test_acknowledge_receipt_marks_request_received(client):
    staff = _user("carol")
    rid = _create_approved_internal_request(staff)
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "quantity_received": 2.0,
    })
    rcpt_id = r.json()["id"]
    r = client.post(f"/api/v1/request-receipts/{rcpt_id}/acknowledge", headers=_bearer(staff), json={"note": "OK"})
    assert r.status_code == 200
    assert r.json()["status"] == "acknowledged"
    # request status auto-promoted
    r = client.get(f"/api/v1/requests/{rid}", headers=_bearer(staff))
    assert r.json()["status"] == "received"


def test_list_receipts_filter_by_request(client):
    staff = _user("dave")
    rid = _create_approved_internal_request(staff)
    client.post("/api/v1/request-receipts", headers=_bearer(staff), json={"request_id": rid, "quantity_received": 1.0})
    r = client.get(f"/api/v1/request-receipts?request_id={rid}", headers=_bearer(staff))
    assert r.status_code == 200
    assert all(x["request_id"] == rid for x in r.json())
```

- [ ] **Step 2: Run test**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest tests/test_request_receipts_router.py -v 2>&1 | tail -30`

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/tests/test_request_receipts_router.py
git commit -m "test(backend): integration tests for /request-receipts router"
```

---

### Task 19: Run full backend test suite

- [ ] **Step 1: Run all tests**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest -q 2>&1 | tail -10`

Expected: all tests pass. If any existing tests fail because they were tied to the old router internals, fix the old tests to use the new endpoints OR mark them as expected-to-fail (with `xfail` and a note) until the frontend is fully migrated.

- [ ] **Step 2: Commit test fixups if needed**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add backend/tests/
git commit -m "test(backend): full suite passes with unified requests" || echo "No changes"
```

---

## Phase 6: Frontend — API Clients + Components

### Task 20: Frontend API client for /api/v1/requests

**Files:**
- Create: `frontend/lib/api/requests.ts`

- [ ] **Step 1: Inspect existing API client patterns**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && ls lib/api/ && head -30 lib/api/purchase-requests.ts 2>/dev/null || head -30 lib/api/$(ls lib/api/ | head -1)`

Expected: shows the existing fetch wrapper pattern (probably uses `apiClient` or `fetcher`)

- [ ] **Step 2: Create the new client**

File: `frontend/lib/api/requests.ts`

```typescript
import { apiClient } from "./client";

export type RequestType = "internal_transfer" | "vendor_purchase" | "customer_dispatch";
export type RequestStatus =
  | "pending" | "approved" | "in_progress" | "awaiting_signoff"
  | "received" | "not_approved" | "cancelled";

export interface RequestItem {
  id?: number;
  inventory_item_id?: number | null;
  item_name?: string | null;
  item_code?: string | null;
  item_type?: string | null;
  description?: string | null;
  quantity: number;
  timeline_days?: number | null;
  department?: string | null;
  item_status?: string | null;
  accepted_by_username?: string | null;
  accepted_at?: string | null;
  acceptance_note?: string | null;
}

export interface RequestCustomerDispatch {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_bought_by?: string | null;
  delivery_type?: "direct" | "transport" | null;
  inventory_type: "weeder" | "attachment";
  item_id?: number | null;
  item_sn_no?: string | null;
  item_description?: string | null;
  quantity: number;
}

export interface RequestHistory {
  id: number;
  changed_by_username?: string | null;
  change_type: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  note?: string | null;
  changed_at: string;
}

export interface UnifiedRequest {
  id: number;
  sn_no: string;
  request_type: RequestType;
  department?: string | null;
  from_whom?: string | null;
  quantity: number;
  notes?: string | null;
  status: RequestStatus;
  requested_by_user_id?: number | null;
  requested_by_username?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by_user_id?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  fulfilled_by_user_id?: number | null;
  fulfilled_by_username?: string | null;
  fulfillment_accepted_at?: string | null;
  fulfillment_note?: string | null;
  is_active: boolean;
  items: RequestItem[];
  dispatch: RequestCustomerDispatch | null;
  history: RequestHistory[];
}

export interface RequestListItem {
  id: number;
  sn_no: string;
  request_type: RequestType;
  department?: string | null;
  from_whom?: string | null;
  quantity: number;
  status: RequestStatus;
  requested_by_username?: string | null;
  created_at: string;
  is_active: boolean;
}

export interface CreateRequestPayload {
  request_type: RequestType;
  department?: string;
  from_whom?: string;
  notes?: string;
  items: RequestItem[];
  dispatch?: RequestCustomerDispatch;
}

export const requestsApi = {
  list: (params?: { request_type?: RequestType; status?: RequestStatus; department?: string; only_active?: boolean }) =>
    apiClient.get<RequestListItem[]>("/api/v1/requests", { params }),

  get: (id: number) => apiClient.get<UnifiedRequest>(`/api/v1/requests/${id}`),

  create: (payload: CreateRequestPayload) =>
    apiClient.post<UnifiedRequest>("/api/v1/requests", payload),

  update: (id: number, payload: Partial<CreateRequestPayload>) =>
    apiClient.put<UnifiedRequest>(`/api/v1/requests/${id}`, payload),

  delete: (id: number) => apiClient.delete<void>(`/api/v1/requests/${id}`),

  review: (id: number, decision: "approve" | "reject", note?: string) =>
    apiClient.post<UnifiedRequest>(`/api/v1/requests/${id}/review`, { decision, note }),

  accept: (id: number, note?: string) =>
    apiClient.post<UnifiedRequest>(`/api/v1/requests/${id}/accept`, null, { params: { note } }),

  acceptItem: (id: number, item_id: number, decision: "accept" | "reject" = "accept", note?: string) =>
    apiClient.post<UnifiedRequest>(`/api/v1/requests/${id}/items/accept`, { item_id, decision, note }),

  setStatus: (id: number, new_status: RequestStatus, note?: string) =>
    apiClient.post<UnifiedRequest>(`/api/v1/requests/${id}/status`, { new_status, note }),

  history: (id: number) =>
    apiClient.get<RequestHistory[]>(`/api/v1/requests/${id}/history`),
};
```

- [ ] **Step 3: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -20`

Expected: 0 errors in `lib/api/requests.ts`

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/lib/api/requests.ts
git commit -m "feat(frontend): API client for unified /api/v1/requests"
```

---

### Task 21: Frontend API client for /api/v1/request-receipts

**Files:**
- Create: `frontend/lib/api/request-receipts.ts`

- [ ] **Step 1: Create the client**

File: `frontend/lib/api/request-receipts.ts`

```typescript
import { apiClient } from "./client";

export interface RequestReceipt {
  id: number;
  sn_no: string;
  request_id: number;
  item_name?: string | null;
  item_code?: string | null;
  quantity_requested: number;
  quantity_received: number;
  notes?: string | null;
  department?: string | null;
  created_by_user_id?: number | null;
  created_by_username?: string | null;
  status: "pending_ack" | "acknowledged";
  acknowledged_by_user_id?: number | null;
  acknowledged_by_username?: string | null;
  acknowledged_at?: string | null;
  acknowledgment_note?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateReceiptPayload {
  request_id: number;
  item_name?: string;
  item_code?: string;
  quantity_requested?: number;
  quantity_received: number;
  notes?: string;
  department?: string;
}

export const requestReceiptsApi = {
  list: (params?: { request_id?: number; status?: string; only_active?: boolean }) =>
    apiClient.get<RequestReceipt[]>("/api/v1/request-receipts", { params }),

  get: (id: number) => apiClient.get<RequestReceipt>(`/api/v1/request-receipts/${id}`),

  create: (payload: CreateReceiptPayload) =>
    apiClient.post<RequestReceipt>("/api/v1/request-receipts", payload),

  acknowledge: (id: number, note?: string) =>
    apiClient.post<RequestReceipt>(`/api/v1/request-receipts/${id}/acknowledge`, { note }),

  delete: (id: number) => apiClient.delete<void>(`/api/v1/request-receipts/${id}`),
};
```

- [ ] **Step 2: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -10`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/lib/api/request-receipts.ts
git commit -m "feat(frontend): API client for /api/v1/request-receipts"
```

---

## Phase 7: Frontend — Unified /requests page

### Task 22: TypeTabs component

**Files:**
- Create: `frontend/components/requests/type-tabs.tsx`

- [ ] **Step 1: Create component**

File: `frontend/components/requests/type-tabs.tsx`

```typescript
"use client";

import { cn } from "@/lib/utils";
import type { RequestType } from "@/lib/api/requests";

export interface TypeTabsProps {
  value: RequestType | "all";
  onChange: (v: RequestType | "all") => void;
  counts?: Partial<Record<RequestType | "all", number>>;
}

const TABS: Array<{ value: RequestType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "internal_transfer", label: "Internal" },
  { value: "vendor_purchase", label: "Vendor" },
  { value: "customer_dispatch", label: "Customer" },
];

export function TypeTabs({ value, onChange, counts }: TypeTabsProps) {
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto" role="tablist">
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
            {counts && counts[t.value] != null && (
              <span className="ml-1.5 inline-flex items-center justify-center text-xs min-w-[1.25rem] h-5 px-1.5 rounded-full bg-slate-100 text-slate-700">
                {counts[t.value]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -10`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/components/requests/type-tabs.tsx
git commit -m "feat(frontend): TypeTabs component for /requests page"
```

---

### Task 23: Customer-dispatch block (used inside the unified form)

**Files:**
- Create: `frontend/components/requests/customer-dispatch-block.tsx`

- [ ] **Step 1: Create component**

File: `frontend/components/requests/customer-dispatch-block.tsx`

```typescript
"use client";

import type { RequestCustomerDispatch } from "@/lib/api/requests";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface CustomerDispatchBlockProps {
  value: RequestCustomerDispatch;
  onChange: (v: RequestCustomerDispatch) => void;
}

export function CustomerDispatchBlock({ value, onChange }: CustomerDispatchBlockProps) {
  const set = (patch: Partial<RequestCustomerDispatch>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 border border-slate-200 rounded-md p-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cust-name">Customer name *</Label>
          <Input id="cust-name" value={value.customer_name ?? ""} onChange={(e) => set({ customer_name: e.target.value })} required />
        </div>
        <div>
          <Label htmlFor="cust-phone">Phone</Label>
          <Input id="cust-phone" value={value.customer_phone ?? ""} onChange={(e) => set({ customer_phone: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cust-addr">Address</Label>
          <Textarea id="cust-addr" rows={2} value={value.customer_address ?? ""} onChange={(e) => set({ customer_address: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cust-bought">Bought by</Label>
          <Input id="cust-bought" value={value.customer_bought_by ?? ""} onChange={(e) => set({ customer_bought_by: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cust-delivery">Delivery</Label>
          <select
            id="cust-delivery"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={value.delivery_type ?? ""}
            onChange={(e) => set({ delivery_type: (e.target.value || null) as "direct" | "transport" | null })}
          >
            <option value="">—</option>
            <option value="direct">Direct</option>
            <option value="transport">Transport</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-type">Inventory type</Label>
          <select
            id="inv-type"
            className="w-full h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={value.inventory_type}
            onChange={(e) => set({ inventory_type: e.target.value as "weeder" | "attachment" })}
          >
            <option value="weeder">Weeder</option>
            <option value="attachment">Attachment</option>
          </select>
        </div>
        <div>
          <Label htmlFor="inv-sn">Item SN</Label>
          <Input id="inv-sn" value={value.item_sn_no ?? ""} onChange={(e) => set({ item_sn_no: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="inv-desc">Item description</Label>
          <Textarea id="inv-desc" rows={2} value={value.item_description ?? ""} onChange={(e) => set({ item_description: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="inv-qty">Quantity</Label>
          <Input
            id="inv-qty"
            type="number"
            min={1}
            step={1}
            value={value.quantity}
            onChange={(e) => set({ quantity: Number(e.target.value) || 1 })}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -10`

Expected: 0 errors (or fix any import path issues — `@/components/ui/input` etc. — to match your actual shadcn setup)

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/components/requests/customer-dispatch-block.tsx
git commit -m "feat(frontend): CustomerDispatchBlock component"
```

---

### Task 24: Unified request form (create/edit)

**Files:**
- Create: `frontend/components/requests/request-form.tsx`

- [ ] **Step 1: Create component**

File: `frontend/components/requests/request-form.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerDispatchBlock } from "./customer-dispatch-block";
import type {
  CreateRequestPayload, RequestType, RequestItem, RequestCustomerDispatch,
} from "@/lib/api/requests";

const DEFAULT_ITEM: RequestItem = { item_name: "", quantity: 1 };

export interface RequestFormProps {
  defaultType?: RequestType;
  defaultValues?: Partial<CreateRequestPayload>;
  onSubmit: (payload: CreateRequestPayload) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function RequestForm({
  defaultType = "internal_transfer",
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Create request",
}: RequestFormProps) {
  const [type, setType] = useState<RequestType>(defaultValues?.request_type ?? defaultType);
  const [department, setDepartment] = useState(defaultValues?.department ?? "");
  const [fromWhom, setFromWhom] = useState(defaultValues?.from_whom ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [items, setItems] = useState<RequestItem[]>(defaultValues?.items ?? [DEFAULT_ITEM]);
  const [dispatch, setDispatch] = useState<RequestCustomerDispatch>(
    defaultValues?.dispatch ?? { inventory_type: "weeder", quantity: 1 }
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: CreateRequestPayload = {
        request_type: type,
        department: department || undefined,
        from_whom: type === "vendor_purchase" ? fromWhom : undefined,
        notes: notes || undefined,
        items: type === "customer_dispatch" ? [] : items.filter((i) => i.item_name),
        dispatch: type === "customer_dispatch" ? dispatch : undefined,
      };
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Type</Label>
        <div className="flex gap-2 mt-1">
          {(["internal_transfer", "vendor_purchase", "customer_dispatch"] as RequestType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                type === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="dept">Department</Label>
        <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>

      {type === "vendor_purchase" && (
        <div>
          <Label htmlFor="from-whom">From whom (vendor) *</Label>
          <Input id="from-whom" required value={fromWhom} onChange={(e) => setFromWhom(e.target.value)} />
        </div>
      )}

      {type === "customer_dispatch" ? (
        <CustomerDispatchBlock value={dispatch} onChange={setDispatch} />
      ) : (
        <div className="space-y-2">
          <Label>Line items</Label>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Item name"
                value={it.item_name ?? ""}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, item_name: e.target.value } : x)))}
              />
              <Input
                type="number"
                min={1}
                step={1}
                className="w-24"
                value={it.quantity}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { ...DEFAULT_ITEM }])}>
            + Add item
          </Button>
        </div>
      )}

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -10`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/components/requests/request-form.tsx
git commit -m "feat(frontend): unified RequestForm component"
```

---

### Task 25: Request detail drawer

**Files:**
- Create: `frontend/components/requests/request-detail-drawer.tsx`

- [ ] **Step 1: Create component**

File: `frontend/components/requests/request-detail-drawer.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import { requestsApi, type UnifiedRequest, type RequestStatus } from "@/lib/api/requests";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface RequestDetailDrawerProps {
  requestId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: { id: number; role: string };
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  pending: "bg-slate-100 text-slate-800",
  approved: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  awaiting_signoff: "bg-purple-100 text-purple-800",
  received: "bg-emerald-100 text-emerald-800",
  not_approved: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-600",
};

export function RequestDetailDrawer({ requestId, open, onOpenChange, currentUser }: RequestDetailDrawerProps) {
  const [data, setData] = useState<UnifiedRequest | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || requestId == null) return;
    setLoading(true);
    requestsApi.get(requestId).then(setData).finally(() => setLoading(false));
  }, [open, requestId]);

  const isAdmin = currentUser.role === "admin";
  const isOwner = data?.requested_by_user_id === currentUser.id;

  const review = async (decision: "approve" | "reject") => {
    if (!data) return;
    const updated = await requestsApi.review(data.id, decision);
    setData(updated);
  };

  const accept = async () => {
    if (!data) return;
    const updated = await requestsApi.accept(data.id);
    setData(updated);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.sn_no ?? "Loading…"}</SheetTitle>
        </SheetHeader>

        {loading && <p className="text-sm text-slate-500 mt-4">Loading…</p>}

        {data && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[data.status]}`}>
                {data.status}
              </span>
              <span className="text-xs text-slate-500">{data.request_type.replace(/_/g, " ")}</span>
            </div>

            {data.department && <p className="text-sm"><span className="text-slate-500">Department:</span> {data.department}</p>}
            {data.from_whom && <p className="text-sm"><span className="text-slate-500">From:</span> {data.from_whom}</p>}
            {data.notes && <p className="text-sm whitespace-pre-wrap"><span className="text-slate-500">Notes:</span><br />{data.notes}</p>}

            {data.request_type === "customer_dispatch" && data.dispatch && (
              <div className="border border-slate-200 rounded-md p-3 text-sm">
                <h3 className="font-medium mb-1">Customer</h3>
                <p>{data.dispatch.customer_name} {data.dispatch.customer_phone && `· ${data.dispatch.customer_phone}`}</p>
                {data.dispatch.customer_address && <p className="text-slate-600">{data.dispatch.customer_address}</p>}
                <p className="text-slate-600">{data.dispatch.inventory_type} · SN {data.dispatch.item_sn_no} · qty {data.dispatch.quantity}</p>
                {data.dispatch.delivery_type && <p className="text-slate-600">Delivery: {data.dispatch.delivery_type}</p>}
              </div>
            )}

            {data.items.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-1">Items</h3>
                <ul className="text-sm border border-slate-200 rounded-md divide-y">
                  {data.items.map((it) => (
                    <li key={it.id} className="px-3 py-2 flex justify-between">
                      <span>{it.item_name} {it.item_code && `· ${it.item_code}`}</span>
                      <span className="text-slate-500">qty {it.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium mb-1">History</h3>
              <ol className="text-xs space-y-1 text-slate-600">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-slate-400">{new Date(h.changed_at).toLocaleString()}</span> ·{" "}
                    <span className="font-medium">{h.changed_by_username ?? "—"}</span> {h.change_type}
                    {h.note && <span className="text-slate-500"> — {h.note}</span>}
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              {isAdmin && data.status === "pending" && (
                <>
                  <Button onClick={() => review("approve")}>Approve</Button>
                  <Button variant="destructive" onClick={() => review("reject")}>Reject</Button>
                </>
              )}
              {data.status === "approved" && (
                <Button onClick={accept}>Accept fulfilment</Button>
              )}
              {isOwner && data.status === "pending" && (
                <Button variant="ghost" onClick={async () => { await requestsApi.delete(data.id); onOpenChange(false); }}>
                  Cancel request
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -10`

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/components/requests/request-detail-drawer.tsx
git commit -m "feat(frontend): RequestDetailDrawer component"
```

---

### Task 26: Rewrite /dashboard/requests page

**Files:**
- Modify: `frontend/app/dashboard/requests/page.tsx`

- [ ] **Step 1: Read current page**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && head -40 app/dashboard/requests/page.tsx && echo "---" && wc -l app/dashboard/requests/page.tsx`

Expected: shows existing structure (list of purchase-requests probably)

- [ ] **Step 2: Backup the old file and write the new one**

```bash
cd /home/jayanth/workspace/One/OneFlow/frontend
mv app/dashboard/requests/page.tsx app/dashboard/requests/page.tsx.old
```

Then create `frontend/app/dashboard/requests/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { requestsApi, type RequestType, type RequestListItem, type CreateRequestPayload } from "@/lib/api/requests";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TypeTabs } from "@/components/requests/type-tabs";
import { RequestForm } from "@/components/requests/request-form";
import { RequestDetailDrawer } from "@/components/requests/request-detail-drawer";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  awaiting_signoff: "bg-purple-100 text-purple-700",
  received: "bg-emerald-100 text-emerald-700",
  not_approved: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500",
};

export default function RequestsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<RequestType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["requests", tab],
    queryFn: () => requestsApi.list(tab === "all" ? undefined : { request_type: tab }),
  });

  const create = useMutation({
    mutationFn: (payload: CreateRequestPayload) => requestsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      setCreateOpen(false);
    },
  });

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  if (!user) return null;

  // Counts for tabs
  const counts: Record<string, number> = { all: data?.length ?? 0 };
  for (const r of data ?? []) {
    counts[r.request_type] = (counts[r.request_type] ?? 0) + 1;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Requests</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New request</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New request</DialogTitle>
            </DialogHeader>
            <RequestForm
              onSubmit={async (p) => { await create.mutateAsync(p); }}
              onCancel={() => setCreateOpen(false)}
              submitLabel="Create"
            />
          </DialogContent>
        </Dialog>
      </div>

      <TypeTabs value={tab} onChange={setTab} counts={counts} />

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-slate-500">No requests yet.</CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setDetailId(r.id)}
                className="w-full text-left bg-white border border-slate-200 rounded-md p-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{r.sn_no}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {r.request_type.replace(/_/g, " ")}
                      {r.department && ` · ${r.department}`}
                      {r.from_whom && ` · from ${r.from_whom}`}
                      {r.requested_by_username && ` · ${r.requested_by_username}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">qty {r.quantity}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[r.status]}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RequestDetailDrawer
        requestId={detailId}
        open={detailId != null}
        onOpenChange={(o) => !o && setDetailId(null)}
        currentUser={user}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check + build**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm tsc --noEmit 2>&1 | tail -20 && echo "---" && pnpm build 2>&1 | tail -10`

Expected: 0 type errors, build succeeds

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/app/dashboard/requests/page.tsx
git rm frontend/app/dashboard/requests/page.tsx.old 2>/dev/null || true
git commit -m "feat(frontend): unified /dashboard/requests page with type tabs"
```

---

## Phase 8: Frontend — Redirects + Sidebar + Receipts

### Task 27: Convert old /purchase-requests and /marketing-requests pages to redirects

**Files:**
- Modify: `frontend/app/dashboard/purchase-requests/page.tsx`
- Modify: `frontend/app/dashboard/marketing-requests/page.tsx` (if exists)

- [ ] **Step 1: Find the old page files**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && find app/dashboard -type d -maxdepth 2 && ls app/dashboard/purchase-requests/ 2>/dev/null; ls app/dashboard/marketing-requests/ 2>/dev/null`

Expected: shows `purchase-requests/page.tsx` and possibly `marketing-requests/page.tsx`

- [ ] **Step 2: Replace both with redirect pages**

File: `frontend/app/dashboard/purchase-requests/page.tsx` (REPLACE existing file):

```typescript
import { redirect } from "next/navigation";

export default function PurchaseRequestsLegacyPage() {
  redirect("/dashboard/requests?tab=internal");
}
```

If `frontend/app/dashboard/marketing-requests/page.tsx` exists, REPLACE with:

```typescript
import { redirect } from "next/navigation";

export default function MarketingRequestsLegacyPage() {
  redirect("/dashboard/requests?tab=customer");
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm build 2>&1 | tail -10`

Expected: build succeeds (redirects are valid Next.js pages)

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/app/dashboard/purchase-requests/page.tsx
git add frontend/app/dashboard/marketing-requests/page.tsx 2>/dev/null || true
git commit -m "refactor(frontend): redirect old /purchase-requests and /marketing-requests to /requests"
```

---

### Task 28: Update /receipts page to use new API

**Files:**
- Modify: `frontend/app/dashboard/receipts/page.tsx`

- [ ] **Step 1: Inspect current receipts page**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && head -30 app/dashboard/receipts/page.tsx && echo "---" && grep -n "from \"" app/dashboard/receipts/page.tsx | head -10`

Expected: shows which API client it imports

- [ ] **Step 2: Swap the API import**

In `frontend/app/dashboard/receipts/page.tsx`, change:

```typescript
// OLD
import { receiptsApi, type Receipt } from "@/lib/api/receipts";

// NEW
import { requestReceiptsApi, type RequestReceipt } from "@/lib/api/request-receipts";
```

Then update all uses:
- `Receipt` → `RequestReceipt`
- `receiptsApi.list(...)` → `requestReceiptsApi.list(...)`
- `receiptsApi.create(...)` → `requestReceiptsApi.create(...)`
- `receiptsApi.acknowledge(...)` → `requestReceiptsApi.acknowledge(...)`
- `receiptsApi.delete(...)` → `requestReceiptsApi.delete(...)`

(The field names `sn_no`, `request_id`, `quantity_requested`, `quantity_received`, `status` are unchanged.)

- [ ] **Step 3: Build**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm build 2>&1 | tail -10`

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/app/dashboard/receipts/page.tsx
git commit -m "refactor(frontend): /receipts page now uses /api/v1/request-receipts"
```

---

### Task 29: Update sidebar + bottom-nav badges

**Files:**
- Modify: `frontend/components/layout/desktop-sidebar.tsx`
- Modify: `frontend/components/layout/bottom-nav.tsx`

- [ ] **Step 1: Find badge code in sidebar**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && grep -n "badge\|pending\|purchase-requests\|marketing-requests" components/layout/desktop-sidebar.tsx | head -20`

Expected: shows badge query (probably uses old API)

- [ ] **Step 2: Update badge to use new API**

In both `desktop-sidebar.tsx` and `bottom-nav.tsx`, change the badge query to:

```typescript
// OLD (likely)
useQuery({ queryKey: ["dashboard-badges"], queryFn: () => dashboardApi.getCounts() });

// NEW
useQuery({
  queryKey: ["requests", "pending"],
  queryFn: () => requestsApi.list({ only_active: true }),
  select: (data) => data.filter((r) => r.status === "pending").length,
});
```

And change the import from `dashboardApi` to `requestsApi` if needed (both files might share the same query).

- [ ] **Step 3: Build**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm build 2>&1 | tail -10`

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
cd /home/jayanth/workspace/One/OneFlow
git add frontend/components/layout/desktop-sidebar.tsx frontend/components/layout/bottom-nav.tsx
git commit -m "refactor(frontend): sidebar/bottom-nav badges now use /api/v1/requests"
```

---

## Phase 9: End-to-End Smoke Test

### Task 30: Full e2e check

- [ ] **Step 1: Backend tests all green**

Run: `cd /home/jayanth/workspace/One/OneFlow/backend && ./venv-linux/bin/python -m pytest -q 2>&1 | tail -5`

Expected: all tests pass, 0 failures

- [ ] **Step 2: Frontend builds**

Run: `cd /home/jayanth/workspace/One/OneFlow/frontend && pnpm build 2>&1 | tail -5`

Expected: build succeeds

- [ ] **Step 3: Manual smoke (in browser)**

Run: `cd /home/jayanth/workspace/One/OneFlow && (cd backend && ./venv-linux/bin/uvicorn app.main:app --reload --port 8000) & (cd frontend && pnpm dev) &`

Then in browser:
1. Log in
2. Navigate to `/dashboard/requests` — see tabs (All/Internal/Vendor/Customer)
3. Click "New request", create a `customer_dispatch` — verify the SN starts with `MKT-`
4. Create a `internal_transfer` — verify the SN starts with `REQ-`
5. Open one of the new rows — verify the detail drawer shows items, history, and the right action buttons
6. Navigate to `/dashboard/purchase-requests` — should redirect to `/dashboard/requests?tab=internal`
7. Log in as admin → review the pending request → verify status changes to `approved`
8. Acknowledge fulfilment → verify status changes to `in_progress`
9. Create a receipt for it → acknowledge the receipt → verify request status becomes `received`

Expected: every step works without errors

- [ ] **Step 4: Tag the release**

```bash
cd /home/jayanth/workspace/One/OneFlow
git tag unified-request-v1
git push origin unified-request-v1
```

---

## Acceptance criteria

- [ ] New `request`, `request_item`, `request_history`, `request_customer_dispatch`, `request_receipt` tables exist
- [ ] Migration script runs idempotently and copies all rows from the old tables
- [ ] `/api/v1/requests` returns requests of all 3 types, filtered by `request_type`
- [ ] Auth model is enforced: vendor_purchase admin-only, customer_dispatch marketing/sales-only
- [ ] Status transitions follow the 7-status enum
- [ ] All history events are recorded
- [ ] Old `/api/v1/purchase-requests` and `/api/v1/marketing-requests` URLs still work (shim)
- [ ] Old `/api/v1/receipts` URL still works (shim)
- [ ] Frontend `/dashboard/requests` is the single unified page with type tabs
- [ ] Old frontend URLs redirect to the new page
- [ ] Sidebar/bottom-nav badges show the right count
- [ ] All tests pass (backend `pytest` + frontend `tsc` + `next build`)

---

## Out of scope (future releases)

- Dropping the old tables (run a separate `cleanup_old_tables.py` script after the next release once we're confident the shims aren't needed)
- Soft-deleting the old `/api/v1/purchase-requests` and `/api/v1/marketing-requests` shim routes (return 410 Gone + `Sunset` header to give clients a migration deadline)
- WebSocket real-time updates for status changes
- Email/Slack notifications on state transitions
- Bulk operations (e.g. bulk approve)
- Filter by inventory type, item name, date range on the list view
