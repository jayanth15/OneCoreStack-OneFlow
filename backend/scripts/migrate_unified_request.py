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

from sqlmodel import Session, select, SQLModel  # noqa: E402

from app.core.database import engine  # noqa: E402
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
from app.models.purchase_request import PurchaseRequest  # noqa: E402
from app.models.purchase_request_item import PurchaseRequestItem  # noqa: E402
from app.models.purchase_request_history import PurchaseRequestHistory  # noqa: E402
from app.models.marketing_request import MarketingRequest  # noqa: E402
from app.models.marketing_request_history import MarketingRequestHistory  # noqa: E402
from app.models.receipt import Receipt  # noqa: E402


def _generate_sn(prefix: str, year: int, seq: int) -> str:
    return f"{prefix}-{year}-{seq:04d}"


def _build_pr_id_to_new_req_id(session: Session) -> dict[int, int]:
    """Build old PurchaseRequest.id → new Request.id by SN comparison.

    Migrated purchase requests keep their original year/seq (e.g. PR-2024-0001
    → REQ-2024-0001) so we can match by SN.
    """
    new_reqs: dict[str, int] = {}
    for r in session.exec(select(Request).where(Request.sn_no.like("REQ-%"))).all():
        if r.sn_no.startswith("REQ-"):
            # Reverse the REQ- → PR- rename so we can join with old PurchaseRequest.sn_no
            new_reqs["PR-" + r.sn_no[4:]] = r.id
    mapping: dict[int, int] = {}
    for pr in session.exec(select(PurchaseRequest)).all():
        if pr.sn_no in new_reqs:
            mapping[pr.id] = new_reqs[pr.sn_no]
    return mapping


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


def migrate_purchase_requests(
    session: Session,
) -> tuple[int, int, int, int, dict[int, int]]:
    """Returns (requests_created, items_created, history_created, skipped, old_id_to_new_id).

    The last element maps the old PurchaseRequest.id → new Request.id so that
    downstream migrators (e.g. Receipt → RequestReceipt) can re-point FKs.
    """
    # Idempotency check
    existing_sns = set(session.exec(select(Request.sn_no).where(Request.sn_no.like("REQ-%"))).all())
    if len(existing_sns) > 0:
        print(f"  Skipping purchase-request migration: {len(existing_sns)} REQ-* rows already exist")
        return 0, 0, 0, 0, {}

    rows = session.exec(select(PurchaseRequest)).all()
    requests_created = 0
    items_created = 0
    history_created = 0
    old_id_to_new_id: dict[int, int] = {}

    for pr in rows:
        # Determine request_type
        # Old model: a row with `from_whom` set means vendor_purchase, else internal_transfer
        rt = REQUEST_TYPE_VENDOR_PURCHASE if pr.from_whom else REQUEST_TYPE_INTERNAL_TRANSFER

        # Map SN: old format "PR-2024-0001" → "REQ-2024-0001"
        if pr.sn_no and pr.sn_no.startswith("PR-"):
            sn_no = "REQ-" + pr.sn_no[3:]
        elif pr.sn_no:
            sn_no = pr.sn_no
        else:
            year = pr.created_at.year if pr.created_at else 2024
            sn_no = _generate_sn("REQ", year, requests_created + 1)

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
        if pr.id is not None:
            old_id_to_new_id[pr.id] = new_req.id

        # Migrate line items
        # Note: PurchaseRequestItem uses `request_id` (not `purchase_request_id`)
        old_items = session.exec(
            select(PurchaseRequestItem).where(PurchaseRequestItem.request_id == pr.id)
        ).all()
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
        # Note: PurchaseRequestHistory uses `request_id` (not `purchase_request_id`)
        old_hist = session.exec(
            select(PurchaseRequestHistory).where(PurchaseRequestHistory.request_id == pr.id)
        ).all()
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
    return requests_created, items_created, history_created, 0, old_id_to_new_id


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
        # Preserve MR-… SN (or whatever the old format was) and prepend MKT-
        # so dispatch SNs are clearly distinguishable from REQ-* in the new system.
        if mr.sn_no and mr.sn_no.startswith("MR-"):
            sn_no = "MKT-" + mr.sn_no[3:]
        elif mr.sn_no and mr.sn_no.startswith("MKT-"):
            sn_no = mr.sn_no
        elif mr.sn_no:
            sn_no = mr.sn_no
        else:
            year = mr.created_at.year if mr.created_at else 2024
            sn_no = _generate_sn("MKT", year, requests_created + 1)

        new_req = Request(
            sn_no=sn_no,
            request_type=REQUEST_TYPE_CUSTOMER_DISPATCH,
            department=mr.department,
            quantity=mr.quantity or 1.0,
            notes=mr.remarks,
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
        # Note: MarketingRequest.bought_by → RequestCustomerDispatch.customer_bought_by
        dispatch = RequestCustomerDispatch(
            request_id=new_req.id,
            customer_name=mr.customer_name,
            customer_phone=mr.customer_phone,
            customer_address=mr.customer_address,
            customer_bought_by=mr.bought_by,
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
        # Note: MarketingRequestHistory uses `request_id` (not `marketing_request_id`)
        old_hist = session.exec(
            select(MarketingRequestHistory).where(MarketingRequestHistory.request_id == mr.id)
        ).all()
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


def migrate_receipts(
    session: Session, old_pr_id_to_new_req_id: dict[int, int] | None = None
) -> tuple[int, int]:
    """Migrate Receipt → RequestReceipt.

    Receipts historically have `request_id` (an FK to the OLD purchase_request.id).
    We translate that to the new Request.id by walking the new Request rows
    (sn_no pattern REQ-…-NNNN) and reverse-engineering the old PR id from the
    original PurchaseRequest's `sn_no` (PR-…-NNNN). The optional
    `old_pr_id_to_new_req_id` override is used by main() to avoid the extra
    lookup when the mapping is already in hand.
    """
    existing_sns = set(session.exec(select(RequestReceipt.sn_no).where(RequestReceipt.sn_no.like("RCPT-%"))).all())
    if len(existing_sns) > 0:
        print(f"  Skipping receipt migration: {len(existing_sns)} RCPT-* rows already exist")
        return 0, 0

    if old_pr_id_to_new_req_id is None:
        old_pr_id_to_new_req_id = _build_pr_id_to_new_req_id(session)

    receipts_created = 0
    skipped = 0
    for old in session.exec(select(Receipt)).all():
        new_req_id = old_pr_id_to_new_req_id.get(old.request_id)
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
    print(f"DB: {engine.url}")
    print("=" * 60)

    # Auto-create new tables (idempotent)
    from app.core.database import init_db
    init_db()
    print("New tables verified/created.")

    with Session(engine) as session:
        print("\n[1/3] Migrating purchase_request → request")
        r, i, h, s, pr_map = migrate_purchase_requests(session)
        print(f"       requests={r} items={i} history={h} skipped={s}")

        print("\n[2/3] Migrating marketing_request → request")
        r, d, h = migrate_marketing_requests(session)
        print(f"       requests={r} dispatches={d} history={h}")

        print("\n[3/3] Migrating receipt → request_receipt")
        r, s = migrate_receipts(session, pr_map)
        print(f"       receipts={r} skipped={s}")

    print("\nMigration complete. Old tables left in place as read-only shadow.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
