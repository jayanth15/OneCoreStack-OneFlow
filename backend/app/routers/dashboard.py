"""Dashboard analytics endpoint — aggregates key metrics across all modules."""

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import case
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.attachment_item import AttachmentItem
from app.models.schedule import Schedule
from app.models.unit import Unit
from app.models.consumable import Consumable
from app.models.vendor import Vendor
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.job_card import JobCard
from app.models.production_order import ProductionOrder
from app.models.production_plan import ProductionPlan
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
from app.models.user import User
from app.models.weeder_item import WeederItem
from app.routers.inventory import _user_inventory_types

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
    inventory_by_type: list[InventoryByType]
    recent_inventory: list[RecentInventoryActivity]
    recent_production: list[RecentProductionActivity]
    low_stock_items: list[LowStockItem]


class InventoryTypeSummary(BaseModel):
    count: int
    low_stock: int
    value: Optional[float] = None  # sum of active stock value; null for non-admin


class InventorySummaryResponse(BaseModel):
    types: dict[str, InventoryTypeSummary]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("", response_model=DashboardResponse)
def get_dashboard(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    response: Response,
) -> DashboardResponse:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    # ── Overview counts ────────────────────────────────────────────────────
    allowed_types = _user_inventory_types(current_user)

    def count_inventory(*where_clauses: Any) -> int:
        """Count active inventory items, restricted to the user's allowed types."""
        query = select(func.count()).where(*where_clauses)
        if allowed_types is not None:
            query = query.where(InventoryItem.item_type.in_(allowed_types))  # type: ignore[union-attr]
        return session.exec(query).one()

    inv_total = count_inventory(InventoryItem.is_active == True)  # noqa: E712
    inv_rm = count_inventory(InventoryItem.is_active == True, InventoryItem.item_type == "raw_material")  # noqa: E712
    inv_fg = count_inventory(InventoryItem.is_active == True, InventoryItem.item_type == "finished_good")  # noqa: E712
    inv_sfg = count_inventory(InventoryItem.is_active == True, InventoryItem.item_type == "semi_finished")  # noqa: E712
    low_stock_inv = count_inventory(
        InventoryItem.is_active == True,  # noqa: E712
        InventoryItem.reorder_level > 0,
        InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
    )

    # Aux-module low-stock counts follow the same visibility rule as the
    # inventory cards: only counted when the user's inventory_access covers
    # (or does not restrict) that module type.
    def aux_allowed(aux_type: str) -> bool:
        if allowed_types is None:
            return True
        raw = {
            t.strip()
            for t in (current_user.inventory_access or "").split(",")
            if t.strip()
        }
        return aux_type in raw

    low_stock_spares = (
        session.exec(
            select(func.count()).where(
                SpareItemVariant.is_active == True,  # noqa: E712
                SpareItemVariant.reorder_level > 0,
                SpareItemVariant.qty <= SpareItemVariant.reorder_level,
            )
        ).one()
        if aux_allowed("spare") else 0
    )
    low_stock_consumables = (
        session.exec(
            select(func.count()).where(
                Consumable.is_active == True,  # noqa: E712
                Consumable.reorder_level > 0,
                Consumable.qty <= Consumable.reorder_level,
            )
        ).one()
        if aux_allowed("consumable") else 0
    )
    low_stock_attachments = (
        session.exec(
            select(func.count()).where(
                AttachmentItem.is_active == True,  # noqa: E712
                AttachmentItem.reorder_level > 0,
                AttachmentItem.qty <= AttachmentItem.reorder_level,
            )
        ).one()
        if aux_allowed("attachment") else 0
    )
    low_stock_weeders = (
        session.exec(
            select(func.count()).where(
                WeederItem.is_active == True,  # noqa: E712
                WeederItem.reorder_level > 0,
                WeederItem.qty <= WeederItem.reorder_level,
            )
        ).one()
        if aux_allowed("weeder") else 0
    )
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

    # ── Inventory by type (with value) ─────────────────────────────────────
    inv_by_type_query = select(
        InventoryItem.item_type,
        func.count().label("cnt"),
        func.coalesce(func.sum(InventoryItem.quantity_on_hand), 0).label("total_qty"),
        func.coalesce(
            func.sum(InventoryItem.quantity_on_hand * func.coalesce(InventoryItem.rate, 0)),
            0,
        ).label("total_value"),
    ).where(InventoryItem.is_active == True)  # noqa: E712
    if allowed_types is not None:
        inv_by_type_query = inv_by_type_query.where(InventoryItem.item_type.in_(allowed_types))  # type: ignore[union-attr]
    inv_by_type_rows = session.exec(
        inv_by_type_query.group_by(InventoryItem.item_type)
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
    recent_inv_query = select(InventoryHistory, InventoryItem).join(
        InventoryItem, InventoryHistory.inventory_item_id == InventoryItem.id
    )
    if allowed_types is not None:
        recent_inv_query = recent_inv_query.where(InventoryItem.item_type.in_(allowed_types))  # type: ignore[union-attr]
    recent_inv_rows = list(
        session.exec(
            recent_inv_query
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
    low_stock_query = select(InventoryItem).where(
        InventoryItem.is_active == True,  # noqa: E712
        InventoryItem.reorder_level > 0,
        InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
    )
    if allowed_types is not None:
        low_stock_query = low_stock_query.where(InventoryItem.item_type.in_(allowed_types))  # type: ignore[union-attr]
    low_stock_rows = list(
        session.exec(
            low_stock_query
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


# ── Active inventory summary (count / low stock / value per type) ─────────────


@router.get("/inventory-summary", response_model=InventorySummaryResponse)
def get_inventory_summary(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> InventorySummaryResponse:
    """Counts + low-stock + value for ACTIVE items, per inventory type.

    Single source of truth for the dashboard inventory cards. Values are only
    returned to admins (parity with the rest of the dashboard analytics).
    """
    allowed_types = _raw_inventory_types(current_user)
    admin = is_admin_or_above(current_user)

    def allowed(t: str) -> bool:
        return allowed_types is None or t in allowed_types

    types: dict[str, InventoryTypeSummary] = {}

    # ── Main inventory table (FG / RM / Semi) — one grouped query ──────────
    inv_types = [t for t in ("finished_good", "raw_material", "semi_finished") if allowed(t)]
    if inv_types:
        low_expr = case(
            (
                (InventoryItem.reorder_level > 0)
                & (InventoryItem.quantity_on_hand <= InventoryItem.reorder_level),
                1,
            ),
            else_=0,
        )
        rows = session.exec(
            select(
                InventoryItem.item_type,
                func.count(),
                func.sum(low_expr),
                func.sum(InventoryItem.quantity_on_hand * func.coalesce(InventoryItem.rate, 0)),
            )
            .where(
                InventoryItem.is_active == True,  # noqa: E712
                InventoryItem.item_type.in_(inv_types),
            )
            .group_by(InventoryItem.item_type)
        ).all()
        for r in rows:
            types[r[0]] = InventoryTypeSummary(
                count=r[1] or 0,
                low_stock=r[2] or 0,
                value=round(r[3] or 0, 2) if admin else None,
            )

    # ── Spares (items; value via active variants) ───────────────────────────
    if allowed("spare"):
        spare_low = case(
            (
                (SpareItem.reorder_level > 0)
                & (SpareItem.recorded_qty <= SpareItem.reorder_level),
                1,
            ),
            else_=0,
        )
        spare_count = session.exec(
            select(func.count()).where(
                SpareItem.is_active == True  # noqa: E712
            )
        ).one()
        spare_low_count = session.exec(
            select(func.sum(spare_low)).where(
                SpareItem.is_active == True  # noqa: E712
            )
        ).one()
        spare_value = session.exec(
            select(
                func.sum(
                    SpareItemVariant.qty
                    * func.coalesce(SpareItemVariant.rate, SpareItem.rate, 0)
                )
            )
            .select_from(SpareItemVariant)
            .join(SpareItem, SpareItemVariant.spare_item_id == SpareItem.id)
            .where(
                SpareItem.is_active == True,  # noqa: E712
                SpareItemVariant.is_active == True,  # noqa: E712
            )
        ).one()
        types["spare"] = InventoryTypeSummary(
            count=spare_count or 0,
            low_stock=spare_low_count or 0,
            value=round(spare_value or 0, 2) if admin else None,
        )

    # ── Consumables / Attachments / Weeders — qty × rate_per_unit ───────────
    def _simple_summary(model, low_expr, value_expr) -> InventoryTypeSummary:
        count = session.exec(
            select(func.count()).where(model.is_active == True)  # noqa: E712
        ).one()
        low = session.exec(
            select(func.sum(low_expr)).where(model.is_active == True)  # noqa: E712
        ).one()
        value = session.exec(
            select(func.sum(value_expr)).where(model.is_active == True)  # noqa: E712
        ).one()
        return InventoryTypeSummary(
            count=count or 0,
            low_stock=low or 0,
            value=round(value or 0, 2) if admin else None,
        )

    if allowed("consumable"):
        types["consumable"] = _simple_summary(
            Consumable,
            case(
                (
                    (Consumable.reorder_level > 0)
                    & (Consumable.qty <= Consumable.reorder_level),
                    1,
                ),
                else_=0,
            ),
            Consumable.qty * func.coalesce(Consumable.rate_per_unit, 0),
        )
    if allowed("attachment"):
        types["attachment"] = _simple_summary(
            AttachmentItem,
            case(
                (
                    (AttachmentItem.reorder_level > 0)
                    & (AttachmentItem.qty <= AttachmentItem.reorder_level),
                    1,
                ),
                else_=0,
            ),
            AttachmentItem.qty * func.coalesce(AttachmentItem.rate_per_unit, 0),
        )
    if allowed("weeder"):
        types["weeder"] = _simple_summary(
            WeederItem,
            case(
                (
                    (WeederItem.reorder_level > 0)
                    & (WeederItem.qty <= WeederItem.reorder_level),
                    1,
                ),
                else_=0,
            ),
            WeederItem.qty * func.coalesce(WeederItem.rate_per_unit, 0),
        )

    return InventorySummaryResponse(types=types)


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

    # Batch-load spare items, categories, sub-categories and units
    all_si_ids = {v.spare_item_id for v in variant_rows}
    items_by_id = {
        si.id: si
        for si in session.exec(select(SpareItem).where(SpareItem.id.in_(all_si_ids))).all()  # type: ignore[union-attr]
    } if all_si_ids else {}
    cat_ids = {si.category_id for si in items_by_id.values() if si.category_id}
    sub_ids = {si.sub_category_id for si in items_by_id.values() if si.sub_category_id}
    cats_by_id = {
        c.id: c
        for c in session.exec(select(SpareCategory).where(SpareCategory.id.in_(cat_ids))).all()  # type: ignore[union-attr]
    } if cat_ids else {}
    subs_by_id = {
        s.id: s
        for s in session.exec(select(SpareSubCategory).where(SpareSubCategory.id.in_(sub_ids))).all()  # type: ignore[union-attr]
    } if sub_ids else {}
    unit_ids = {si.unit_id for si in items_by_id.values() if si.unit_id}
    unit_map = {u.id: u.name for u in session.exec(select(Unit).where(Unit.id.in_(unit_ids))).all()} if unit_ids else {}

    spares_out = []
    for v in variant_rows:
        si = items_by_id.get(v.spare_item_id)
        if not si or not si.is_active:
            continue
        cat = cats_by_id.get(si.category_id) if si.category_id else None
        if cat and not cat.is_active:
            continue
        sub = subs_by_id.get(si.sub_category_id) if si.sub_category_id else None
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
