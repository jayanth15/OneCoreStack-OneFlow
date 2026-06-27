"""Dashboard analytics endpoint — aggregates key metrics across all modules."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.attachment_item import AttachmentItem
from app.models.unit import Unit
from app.models.consumable import Consumable
from app.models.vendor import Vendor
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.job_card import JobCard
from app.models.production_order import ProductionOrder
from app.models.production_plan import ProductionPlan
from app.models.spare_item_variant import SpareItemVariant
from app.models.user import User
from app.models.weeder_item import WeederItem

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# ── Response schemas ───────────────────────────────────────────────────────────


class OverviewCounts(BaseModel):
    total_inventory_items: int
    raw_materials: int
    finished_goods: int
    semi_finished: int
    low_stock_alerts: int  # qty_on_hand <= reorder_level (where reorder_level > 0)
    total_vendors: int
    total_schedules: int
    total_plans: int
    total_orders: int
    total_job_cards: int


class PlanStatusBreakdown(BaseModel):
    draft: int
    approved: int
    in_progress: int
    completed: int


class JobCardStatusBreakdown(BaseModel):
    open: int
    in_progress: int
    completed: int


class InventoryByType(BaseModel):
    item_type: str
    count: int
    total_qty: float
    total_value: Optional[float] = None  # sum(qty * rate) where rate is set; null for non-admin


class RecentInventoryActivity(BaseModel):
    id: int
    item_code: str
    item_name: str
    change_type: str
    quantity_delta: Optional[float]
    quantity_after: Optional[float]
    changed_at: str  # ISO
    notes: Optional[str]


class RecentProductionActivity(BaseModel):
    id: int
    card_number: str
    order_number: str
    process_name: str
    worker_name: Optional[str]
    qty_produced: float
    status: str
    work_date: Optional[str]


class LowStockItem(BaseModel):
    id: int
    code: str
    name: str
    item_type: str
    quantity_on_hand: float
    reorder_level: float
    unit_id: Optional[int] = None
    unit_name: Optional[str] = None


class DashboardResponse(BaseModel):
    overview: OverviewCounts
    plan_status: PlanStatusBreakdown
    job_card_status: JobCardStatusBreakdown
    inventory_by_type: list[InventoryByType]
    recent_inventory: list[RecentInventoryActivity]
    recent_production: list[RecentProductionActivity]
    low_stock_items: list[LowStockItem]


# ── Helper: count by status ───────────────────────────────────────────────────

def _count_status(session: Session, model, statuses: list[str]) -> dict[str, int]:
    """Count active records for each status value."""
    result = {}
    for st in statuses:
        q = select(func.count()).where(
            model.status == st,
            model.is_active == True,  # noqa: E712
        )
        result[st] = session.exec(q).one()
    return result


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("", response_model=DashboardResponse)
def get_dashboard(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DashboardResponse:

    # ── Overview counts ────────────────────────────────────────────────────
    inv_total = session.exec(
        select(func.count()).where(InventoryItem.is_active == True)  # noqa: E712
    ).one()
    inv_rm = session.exec(
        select(func.count()).where(InventoryItem.is_active == True, InventoryItem.item_type == "raw_material")  # noqa: E712
    ).one()
    inv_fg = session.exec(
        select(func.count()).where(InventoryItem.is_active == True, InventoryItem.item_type == "finished_good")  # noqa: E712
    ).one()
    inv_sfg = session.exec(
        select(func.count()).where(InventoryItem.is_active == True, InventoryItem.item_type == "semi_finished")  # noqa: E712
    ).one()
    low_stock_inv = session.exec(
        select(func.count()).where(
            InventoryItem.is_active == True,  # noqa: E712
            InventoryItem.reorder_level > 0,
            InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
        )
    ).one()
    low_stock_spares = session.exec(
        select(func.count()).where(
            SpareItemVariant.is_active == True,  # noqa: E712
            SpareItemVariant.reorder_level > 0,
            SpareItemVariant.qty <= SpareItemVariant.reorder_level,
        )
    ).one()
    low_stock_consumables = session.exec(
        select(func.count()).where(
            Consumable.is_active == True,  # noqa: E712
            Consumable.reorder_level > 0,
            Consumable.qty <= Consumable.reorder_level,
        )
    ).one()
    low_stock_attachments = session.exec(
        select(func.count()).where(
            AttachmentItem.is_active == True,  # noqa: E712
            AttachmentItem.reorder_level > 0,
            AttachmentItem.qty <= AttachmentItem.reorder_level,
        )
    ).one()
    low_stock_weeders = session.exec(
        select(func.count()).where(
            WeederItem.is_active == True,  # noqa: E712
            WeederItem.reorder_level > 0,
            WeederItem.qty <= WeederItem.reorder_level,
        )
    ).one()
    low_stock = low_stock_inv + low_stock_spares + low_stock_consumables + low_stock_attachments + low_stock_weeders
    total_vendors = session.exec(select(func.count()).select_from(Vendor)).one()
    total_schedules = session.exec(select(func.count()).where(Schedule.is_active == True)).one()  # noqa: E712
    total_plans = session.exec(select(func.count()).where(ProductionPlan.is_active == True)).one()  # noqa: E712
    total_orders = session.exec(select(func.count()).where(ProductionOrder.is_active == True)).one()  # noqa: E712
    total_jc = session.exec(select(func.count()).where(JobCard.is_active == True)).one()  # noqa: E712

    overview = OverviewCounts(
        total_inventory_items=inv_total,
        raw_materials=inv_rm,
        finished_goods=inv_fg,
        semi_finished=inv_sfg,
        low_stock_alerts=low_stock,
        total_vendors=total_vendors,
        total_schedules=total_schedules,
        total_plans=total_plans,
        total_orders=total_orders,
        total_job_cards=total_jc,
    )

    # ── Status breakdowns ──────────────────────────────────────────────────
    plan_st = _count_status(session, ProductionPlan, ["draft", "approved", "in_progress", "completed"])
    jc_st = _count_status(session, JobCard, ["open", "in_progress", "completed"])

    # ── Inventory by type (with value) ─────────────────────────────────────
    inv_by_type_rows = session.exec(
        select(
            InventoryItem.item_type,
            func.count().label("cnt"),
            func.coalesce(func.sum(InventoryItem.quantity_on_hand), 0).label("total_qty"),
            func.coalesce(
                func.sum(InventoryItem.quantity_on_hand * func.coalesce(InventoryItem.rate, 0)),
                0,
            ).label("total_value"),
        )
        .where(InventoryItem.is_active == True)  # noqa: E712
        .group_by(InventoryItem.item_type)
    ).all()
    inventory_by_type = [
        InventoryByType(
            item_type=r[0],
            count=r[1],
            total_qty=float(r[2]),
            total_value=float(r[3]) if is_admin_or_above(current_user) else None,
        )
        for r in inv_by_type_rows
    ]

    # ── Recent inventory activity (last 10) ────────────────────────────────
    recent_inv_rows = list(
        session.exec(
            select(InventoryHistory, InventoryItem)
            .join(InventoryItem, InventoryHistory.inventory_item_id == InventoryItem.id)
            .order_by(InventoryHistory.changed_at.desc())  # type: ignore[union-attr]
            .limit(10)
        ).all()
    )
    recent_inventory = [
        RecentInventoryActivity(
            id=h.id,  # type: ignore[union-attr]
            item_code=item.code,
            item_name=item.name,
            change_type=h.change_type,
            quantity_delta=h.quantity_delta,
            quantity_after=h.quantity_after,
            changed_at=h.changed_at.isoformat() if h.changed_at else "",
            notes=h.notes,
        )
        for h, item in recent_inv_rows
    ]

    # ── Recent production activity (latest 10 job cards by id desc) ────────
    recent_jc_rows = list(
        session.exec(
            select(JobCard, ProductionOrder)
            .join(ProductionOrder, JobCard.production_order_id == ProductionOrder.id)
            .where(JobCard.is_active == True)  # noqa: E712
            .order_by(JobCard.id.desc())  # type: ignore[union-attr]
            .limit(10)
        ).all()
    )
    recent_production = [
        RecentProductionActivity(
            id=jc.id,  # type: ignore[union-attr]
            card_number=jc.card_number,
            order_number=order.order_number,
            process_name=jc.process_name,
            worker_name=jc.worker_name,
            qty_produced=jc.qty_produced,
            status=jc.status,
            work_date=jc.work_date,
        )
        for jc, order in recent_jc_rows
    ]

    # ── Low stock items ────────────────────────────────────────────────────
    low_stock_rows = list(
        session.exec(
            select(InventoryItem)
            .where(
                InventoryItem.is_active == True,  # noqa: E712
                InventoryItem.reorder_level > 0,
                InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
            )
            .order_by(
                (InventoryItem.quantity_on_hand / InventoryItem.reorder_level)  # type: ignore[operator]
            )
            .limit(10)
        ).all()
    )
    unit_ids = {i.unit_id for i in low_stock_rows if i.unit_id}
    unit_map = {u.id: u.name for u in session.exec(select(Unit).where(Unit.id.in_(unit_ids))).all()} if unit_ids else {}
    low_stock_items = [
        LowStockItem(
            id=i.id, code=i.code, name=i.name, item_type=i.item_type,  # type: ignore[arg-type]
            quantity_on_hand=i.quantity_on_hand, reorder_level=i.reorder_level,
            unit_id=i.unit_id, unit_name=unit_map.get(i.unit_id),
        )
        for i in low_stock_rows
    ]

    return DashboardResponse(
        overview=overview,
        plan_status=PlanStatusBreakdown(**plan_st),
        job_card_status=JobCardStatusBreakdown(**jc_st),
        inventory_by_type=inventory_by_type,
        recent_inventory=recent_inventory,
        recent_production=recent_production,
        low_stock_items=low_stock_items,
    )


# ── Spares & Consumables low-stock for dashboard widget ───────────────────────

class SpareLowStockItem(BaseModel):
    item_id: int
    variant_id: int
    item_name: str
    variant_name: str
    part_number: Optional[str]
    category_name: str
    sub_category_name: Optional[str]
    recorded_qty: float
    reorder_level: float
    unit_id: Optional[int] = None
    unit_name: Optional[str] = None


class ConsumableLowStockItem(BaseModel):
    item_id: int
    name: str
    code: Optional[str]
    qty: float
    reorder_level: float


class AttachmentLowStockItem(BaseModel):
    item_id: int
    sn_no: Optional[str]
    description: Optional[str]
    qty: float
    reorder_level: float


class WeederLowStockItem(BaseModel):
    item_id: int
    sn_no: Optional[str]
    description: Optional[str]
    qty: float
    reorder_level: float


class LowStockSummary(BaseModel):
    spares: list[SpareLowStockItem]
    consumables: list[ConsumableLowStockItem]
    attachments: list[AttachmentLowStockItem]
    weeders: list[WeederLowStockItem]


@router.get("/low-stock", response_model=LowStockSummary)
def get_low_stock_summary(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> LowStockSummary:
    from app.models.spare_item import SpareItem
    from app.models.spare_item_variant import SpareItemVariant
    from app.models.spare_category import SpareCategory
    from app.models.spare_sub_category import SpareSubCategory
    from app.models.consumable import Consumable
    from app.models.attachment_item import AttachmentItem
    from app.models.weeder_item import WeederItem

    # Spares low stock — variant-level reorder tracking
    variant_rows = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.is_active == True,  # noqa: E712
            SpareItemVariant.reorder_level > 0,
            SpareItemVariant.qty <= SpareItemVariant.reorder_level,
        )
    ).all()

    # Collect unique unit IDs from all spare items
    all_si_ids = set()
    for v in variant_rows:
        all_si_ids.add(v.spare_item_id)
    all_unit_ids = set()
    for si_id in all_si_ids:
        si = session.get(SpareItem, si_id)
        if si and si.unit_id:
            all_unit_ids.add(si.unit_id)
    unit_map = {u.id: u.name for u in session.exec(select(Unit).where(Unit.id.in_(all_unit_ids))).all()} if all_unit_ids else {}

    cat_cache: dict = {}
    sub_cache: dict = {}
    item_cache: dict = {}
    spares_out = []
    for v in variant_rows:
        if v.spare_item_id not in item_cache:
            si = session.get(SpareItem, v.spare_item_id)
            item_cache[v.spare_item_id] = si
        si = item_cache.get(v.spare_item_id)
        if not si or not si.is_active:
            continue
        if si.category_id not in cat_cache:
            c = session.get(SpareCategory, si.category_id)
            cat_cache[si.category_id] = c
        cat = cat_cache.get(si.category_id)
        if cat and not cat.is_active:
            continue
        sub = None
        if si.sub_category_id:
            if si.sub_category_id not in sub_cache:
                sc = session.get(SpareSubCategory, si.sub_category_id)
                sub_cache[si.sub_category_id] = sc
            sub = sub_cache.get(si.sub_category_id)
            if sub and not sub.is_active:
                continue
        # Build variant label: prefer color, fallback to serial/part number
        variant_name = v.variant_color or v.serial_number or f"Variant #{v.id}"
        spares_out.append(SpareLowStockItem(
            item_id=si.id,  # type: ignore[arg-type]
            variant_id=v.id,  # type: ignore[arg-type]
            item_name=si.name,
            variant_name=variant_name,
            part_number=si.part_number,
            category_name=cat.name if cat else "Unknown",
            sub_category_name=sub.name if sub else None,
            recorded_qty=v.qty,
            reorder_level=v.reorder_level,
            unit_id=si.unit_id, unit_name=unit_map.get(si.unit_id),
        ))
    spares_out.sort(key=lambda x: (x.item_name, x.variant_name))

    # Consumables low stock
    cons_rows = session.exec(
        select(Consumable).where(
            Consumable.is_active == True,  # noqa: E712
            Consumable.reorder_level > 0,
            Consumable.qty <= Consumable.reorder_level,
        ).order_by(Consumable.name)
    ).all()
    consumables_out = [
        ConsumableLowStockItem(
            item_id=c.id,  # type: ignore[arg-type]
            name=c.name,
            code=c.code,
            qty=c.qty,
            reorder_level=getattr(c, 'reorder_level', 0.0) or 0.0,
        )
        for c in cons_rows
    ]

    # Attachments low stock
    att_rows = session.exec(
        select(AttachmentItem).where(
            AttachmentItem.is_active == True,  # noqa: E712
            AttachmentItem.reorder_level > 0,
            AttachmentItem.qty <= AttachmentItem.reorder_level,
        ).order_by(AttachmentItem.sn_no)
    ).all()
    attachments_out = [
        AttachmentLowStockItem(
            item_id=a.id,  # type: ignore[arg-type]
            sn_no=a.sn_no,
            description=a.description,
            qty=a.qty,
            reorder_level=a.reorder_level,
        )
        for a in att_rows
    ]

    # Weeders low stock
    weed_rows = session.exec(
        select(WeederItem).where(
            WeederItem.is_active == True,  # noqa: E712
            WeederItem.reorder_level > 0,
            WeederItem.qty <= WeederItem.reorder_level,
        ).order_by(WeederItem.sn_no)
    ).all()
    weeders_out = [
        WeederLowStockItem(
            item_id=w.id,  # type: ignore[arg-type]
            sn_no=w.sn_no,
            description=w.description,
            qty=w.qty,
            reorder_level=w.reorder_level,
        )
        for w in weed_rows
    ]

    return LowStockSummary(spares=spares_out, consumables=consumables_out, attachments=attachments_out, weeders=weeders_out)
