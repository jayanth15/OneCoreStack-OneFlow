"""Idempotency + correctness test for the unified-request migration script."""
import pytest
from datetime import datetime, timezone
from sqlmodel import Session, SQLModel, select

from app.core.database import engine  # use real engine so SQLModel registry matches
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_history import RequestHistory
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.request_receipt import RequestReceipt
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.purchase_request_history import PurchaseRequestHistory
from app.models.marketing_request import MarketingRequest
from app.models.marketing_request_history import MarketingRequestHistory
from app.models.receipt import Receipt
from app.models.user import User  # noqa: F401
from scripts.migrate_unified_request import (
    migrate_purchase_requests,
    migrate_marketing_requests,
    migrate_receipts,
    main as run_migration,
)


@pytest.fixture(autouse=True)
def _clean_tables():
    """Truncate every table touched by migration (and `users`) before each test."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (
            RequestHistory, RequestItem, RequestCustomerDispatch, RequestReceipt, Request,
            PurchaseRequestHistory, PurchaseRequestItem, PurchaseRequest,
            MarketingRequestHistory, MarketingRequest,
            Receipt,
            User,
        ):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


def test_migrate_purchase_request_creates_request_with_items():
    user = User(id=1, username="alice", password_hash="x", role="admin", is_active=True)
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
        s.add(PurchaseRequestItem(request_id=1, item_name="Hammer", quantity=10.0))
        s.commit()

    with Session(engine) as s:
        rc, ic, hc, _skipped, _pr_map = migrate_purchase_requests(s)
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
    """Re-running the migration on the same source data is a no-op."""
    with Session(engine) as s:
        s.add(PurchaseRequest(id=1, sn_no="PR-2024-0001", quantity=1.0, status="pending"))
        s.commit()
        rc, *_ = migrate_purchase_requests(s)
        assert rc == 1
        # second and third calls see existing REQ-* and skip
        rc2, *_ = migrate_purchase_requests(s)
        rc3, *_ = migrate_purchase_requests(s)
        assert rc2 == 0
        assert rc3 == 0
    with Session(engine) as s:
        assert len(s.exec(select(Request)).all()) == 1


def test_migrate_marketing_request_creates_dispatch_child():
    with Session(engine) as s:
        s.add(MarketingRequest(
            id=1, sn_no="MR-2024-0001", customer_name="Bob", customer_phone="123",
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
            id=1, sn_no="RCPT-2024-0001", request_id=1,
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
        s.add(Receipt(sn_no="RCPT-2024-0001", request_id=999, quantity_received=1.0))
        s.commit()
        rc, skipped = migrate_receipts(s)
    assert rc == 0 and skipped == 1


def test_full_migration_main_runs_without_error():
    """End-to-end: main() is a no-op on clean DB, succeeds on populated DB."""
    with Session(engine) as s:
        s.add(PurchaseRequest(id=1, sn_no="PR-2024-0001", quantity=1.0, status="pending"))
        s.add(MarketingRequest(id=1, sn_no="MR-2024-0001", customer_name="X", inventory_type="weeder", quantity=1.0))
        s.commit()
    # Should not raise
    assert run_migration() == 0
    # Re-run is a no-op
    assert run_migration() == 0
