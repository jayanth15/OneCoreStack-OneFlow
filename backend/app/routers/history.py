"""Aggregate history browser — admin only."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, and_, func, select, text

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.attachment_history import AttachmentHistory
from app.models.attachment_item import AttachmentItem
from app.models.consumable import Consumable
from app.models.consumable_history import ConsumableHistory
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.job_card import JobCard
from app.models.job_card_history import JobCardHistory
from app.models.marketing_request import MarketingRequest
from app.models.marketing_request_history import MarketingRequestHistory
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_history import PurchaseRequestHistory
from app.models.schedule import Schedule
from app.models.schedule_history import ScheduleHistory
from app.models.spare_item import SpareItem
from app.models.spare_item_history import SpareItemHistory
from app.models.user import User
from app.models.weeder_history import WeederHistory
from app.models.weeder_item import WeederItem

router = APIRouter(prefix="/api/v1/history", tags=["history"])

VALID_CATEGORIES = {
    "inventory",
    "raw-materials",
    "finished-goods",
    "semi-finished",
    "purchase-requests",
    "marketing-requests",
    "job-cards",
    "schedules",
    "consumables",
    "spares",
    "weeders",
    "attachments",
}

# ── Schemas ────────────────────────────────────────────────────────────────────


class HistoryItem(BaseModel):
    id: int
    entity_id: int
    entity_name: Optional[str]
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    qty_before: Optional[float] = None
    qty_after: Optional[float] = None
    qty_delta: Optional[float] = None
    variant_label: Optional[str] = None


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Helpers ────────────────────────────────────────────────────────────────────


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ── Endpoint ───────────────────────────────────────────────────────────────────


@router.get("/{category}", response_model=HistoryPage)
def list_history(
    category: str,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    changed_by: Optional[str] = None,
) -> HistoryPage:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown category '{category}'. Valid: {sorted(VALID_CATEGORIES)}",
        )

    start_dt = _parse_dt(start_date)
    end_dt = _parse_dt(end_date)

    import math
    offset = (page - 1) * page_size

    if category == "inventory":
        return _inventory_history(session, page, page_size, offset, start_dt, end_dt, changed_by, item_type=None)
    elif category == "raw-materials":
        return _inventory_history(session, page, page_size, offset, start_dt, end_dt, changed_by, item_type="raw_material")
    elif category == "finished-goods":
        return _inventory_history(session, page, page_size, offset, start_dt, end_dt, changed_by, item_type="finished_good")
    elif category == "semi-finished":
        return _inventory_history(session, page, page_size, offset, start_dt, end_dt, changed_by, item_type="semi_finished")
    elif category == "scraps":
        return _inventory_history(session, page, page_size, offset, start_dt, end_dt, changed_by, item_type="scrap")
    elif category == "purchase-requests":
        return _pr_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "marketing-requests":
        return _mr_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "job-cards":
        return _job_card_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "schedules":
        return _schedule_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "consumables":
        return _consumable_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "spares":
        return _spare_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "weeders":
        return _weeder_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    elif category == "attachments":
        return _attachment_history(session, page, page_size, offset, start_dt, end_dt, changed_by)
    # Should never reach here
    raise HTTPException(status_code=500, detail="Unhandled category")


# ── Per-category helpers ───────────────────────────────────────────────────────

import math as _math


def _page_result(items: list[HistoryItem], total: int, page: int, page_size: int) -> HistoryPage:
    return HistoryPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, _math.ceil(total / page_size)),
    )


def _apply_filters(q, model, start_dt, end_dt, changed_by):  # type: ignore[no-untyped-def]
    if start_dt:
        q = q.where(model.changed_at >= start_dt.isoformat())
    if end_dt:
        q = q.where(model.changed_at <= end_dt.isoformat())
    if changed_by:
        q = q.where(model.changed_by_username.like(f"%{changed_by}%"))  # type: ignore[union-attr]
    return q


def _inventory_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
    item_type: Optional[str] = None,
) -> HistoryPage:
    if item_type is not None:
        # Filter by item_type via a join to InventoryItem
        q = (
            select(InventoryHistory)
            .join(InventoryItem, InventoryHistory.inventory_item_id == InventoryItem.id)
            .where(InventoryItem.item_type == item_type)
        )
    else:
        q = select(InventoryHistory)
    q = _apply_filters(q, InventoryHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(InventoryHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    # Batch-load item names
    ids = {r.inventory_item_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        items = session.exec(select(InventoryItem).where(InventoryItem.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {i.id: f"{i.code} — {i.name}" for i in items if i.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.inventory_item_id,
            entity_name=name_map.get(r.inventory_item_id),
            changed_by_username=getattr(r, "changed_by_username", None),
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            note=r.notes,
            qty_before=r.quantity_before,
            qty_after=r.quantity_after,
            qty_delta=r.quantity_delta,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _pr_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(PurchaseRequestHistory)
    q = _apply_filters(q, PurchaseRequestHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(PurchaseRequestHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.request_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        reqs = session.exec(select(PurchaseRequest).where(PurchaseRequest.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {r.id: r.sn_no for r in reqs if r.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.request_id,
            entity_name=name_map.get(r.request_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            field_name=r.field_name,
            old_value=r.old_value,
            new_value=r.new_value,
            note=r.note,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _mr_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(MarketingRequestHistory)
    q = _apply_filters(q, MarketingRequestHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(MarketingRequestHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.request_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        reqs = session.exec(select(MarketingRequest).where(MarketingRequest.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {r.id: r.sn_no for r in reqs if r.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.request_id,
            entity_name=name_map.get(r.request_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            field_name=r.field_name,
            old_value=r.old_value,
            new_value=r.new_value,
            note=r.note,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _job_card_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(JobCardHistory)
    q = _apply_filters(q, JobCardHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(JobCardHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.job_card_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        cards = session.exec(select(JobCard).where(JobCard.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {c.id: f"Job #{c.id}" for c in cards if c.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.job_card_id,
            entity_name=name_map.get(r.job_card_id),
            changed_by_username=getattr(r, "changed_by_username", None),
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            field_name=r.field_name,
            old_value=r.old_value,
            new_value=r.new_value,
            note=r.notes,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _schedule_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(ScheduleHistory)
    q = _apply_filters(q, ScheduleHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(ScheduleHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.schedule_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        scheds = session.exec(select(Schedule).where(Schedule.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {s.id: (s.customer_name or f"Schedule #{s.id}") for s in scheds if s.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.schedule_id,
            entity_name=name_map.get(r.schedule_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type="status_change",
            old_value=r.old_status,
            new_value=r.new_status,
            note=r.note,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _consumable_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(ConsumableHistory)
    q = _apply_filters(q, ConsumableHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(ConsumableHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.consumable_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        items = session.exec(select(Consumable).where(Consumable.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {i.id: i.name for i in items if i.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.consumable_id,
            entity_name=name_map.get(r.consumable_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            note=r.note,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _spare_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(SpareItemHistory)
    q = _apply_filters(q, SpareItemHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(SpareItemHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.spare_item_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        items = session.exec(select(SpareItem).where(SpareItem.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {i.id: i.name for i in items if i.id}

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.spare_item_id,
            entity_name=name_map.get(r.spare_item_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            note=r.note,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
            variant_label=getattr(r, "variant_label", None),
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _weeder_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(WeederHistory)
    q = _apply_filters(q, WeederHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(WeederHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.weeder_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        items = session.exec(select(WeederItem).where(WeederItem.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {i.id: (i.sn_no or i.description or f"Weeder #{i.id}") for i in items if i.id}  # type: ignore[attr-defined]

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.weeder_id,
            entity_name=name_map.get(r.weeder_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            note=r.note,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)


def _attachment_history(
    session: Session, page: int, page_size: int, offset: int,
    start_dt, end_dt, changed_by,
) -> HistoryPage:
    q = select(AttachmentHistory)
    q = _apply_filters(q, AttachmentHistory, start_dt, end_dt, changed_by)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(q.order_by(AttachmentHistory.changed_at.desc()).offset(offset).limit(page_size)).all()  # type: ignore[union-attr]

    ids = {r.attachment_id for r in rows}
    name_map: dict[int, str] = {}
    if ids:
        items = session.exec(select(AttachmentItem).where(AttachmentItem.id.in_(list(ids)))).all()  # type: ignore[union-attr]
        name_map = {i.id: (i.sn_no or i.description or f"Attachment #{i.id}") for i in items if i.id}  # type: ignore[attr-defined]

    out = [
        HistoryItem(
            id=r.id,  # type: ignore[arg-type]
            entity_id=r.attachment_id,
            entity_name=name_map.get(r.attachment_id),
            changed_by_username=r.changed_by_username,
            changed_at=r.changed_at.isoformat() if r.changed_at else "",
            change_type=r.change_type,
            note=r.note,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
        )
        for r in rows
    ]
    return _page_result(out, total, page, page_size)
