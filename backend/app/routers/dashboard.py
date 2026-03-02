"""Dashboard analytics endpoint — aggregates key metrics across all modules."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.job_card import JobCard
from app.models.production_order import ProductionOrder
from app.models.production_plan import ProductionPlan
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

# ── Response schemas ───────────────────────────────────────────────────────────


class OverviewCounts(BaseModel):
    total_inventory_items: int
    raw_materials: int
    finished_goods: int
    semi_finished: int
    low_stock_alerts: int  # qty_on_hand <= reorder_level (where reorder_level > 0)
    total_customers: int
    total_schedules: int
    total_plans: int
    total_orders: int
    total_job_cards: int


class ScheduleStatusBreakdown(BaseModel):
    pending: int
    confirmed: int
    in_production: int
    delivered: int


class PlanStatusBreakdown(BaseModel):
    draft: int
    approved: int
    in_progress: int
    completed: int


class OrderStatusBreakdown(BaseModel):
    open: int
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


class TopProduct(BaseModel):
    product_name: str
    total_planned_qty: float
    plan_count: int


class ProductionOutputPoint(BaseModel):
    """One data point for a daily production output chart."""
    date: str  # YYYY-MM-DD
    qty_produced: float


class LowStockItem(BaseModel):
    id: int
    code: str
    name: str
    item_type: str
    quantity_on_hand: float
    reorder_level: float
    unit: str


class DashboardResponse(BaseModel):
    overview: OverviewCounts
    schedule_status: ScheduleStatusBreakdown
    plan_status: PlanStatusBreakdown
    order_status: OrderStatusBreakdown
    job_card_status: JobCardStatusBreakdown
    inventory_by_type: list[InventoryByType]
    recent_inventory: list[RecentInventoryActivity]
    recent_production: list[RecentProductionActivity]
    top_products: list[TopProduct]
    daily_production_output: list[ProductionOutputPoint]
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
    low_stock = session.exec(
        select(func.count()).where(
            InventoryItem.is_active == True,  # noqa: E712
            InventoryItem.reorder_level > 0,
            InventoryItem.quantity_on_hand <= InventoryItem.reorder_level,
        )
    ).one()
    total_customers = session.exec(select(func.count()).select_from(Customer)).one()
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
        total_customers=total_customers,
        total_schedules=total_schedules,
        total_plans=total_plans,
        total_orders=total_orders,
        total_job_cards=total_jc,
    )

    # ── Status breakdowns ──────────────────────────────────────────────────
    sched_st = _count_status(session, Schedule, ["pending", "confirmed", "in_production", "delivered"])
    plan_st = _count_status(session, ProductionPlan, ["draft", "approved", "in_progress", "completed"])
    order_st = _count_status(session, ProductionOrder, ["open", "in_progress", "completed"])
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

    # ── Top products by planned qty ────────────────────────────────────────
    top_prod_rows = list(
        session.exec(
            select(
                Schedule.description,
                func.sum(ProductionPlan.planned_qty).label("total_qty"),
                func.count().label("plan_count"),
            )
            .join(Schedule, ProductionPlan.schedule_id == Schedule.id)
            .where(ProductionPlan.is_active == True)  # noqa: E712
            .group_by(Schedule.description)
            .order_by(func.sum(ProductionPlan.planned_qty).desc())
            .limit(5)
        ).all()
    )
    top_products = [
        TopProduct(product_name=r[0], total_planned_qty=float(r[1]), plan_count=r[2])
        for r in top_prod_rows
    ]

    # ── Daily production output (last 30 days from job cards) ──────────────
    thirty_days_ago = (datetime.now(tz=timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    daily_rows = list(
        session.exec(
            select(
                JobCard.work_date,
                func.sum(JobCard.qty_produced).label("total"),
            )
            .where(
                JobCard.is_active == True,  # noqa: E712
                JobCard.work_date.is_not(None),  # type: ignore[union-attr]
                JobCard.work_date >= thirty_days_ago,  # type: ignore[operator]
            )
            .group_by(JobCard.work_date)
            .order_by(JobCard.work_date)  # type: ignore[arg-type]
        ).all()
    )
    daily_production_output = [
        ProductionOutputPoint(date=r[0], qty_produced=float(r[1]))  # type: ignore[arg-type]
        for r in daily_rows
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
    low_stock_items = [
        LowStockItem(
            id=i.id, code=i.code, name=i.name, item_type=i.item_type,  # type: ignore[arg-type]
            quantity_on_hand=i.quantity_on_hand, reorder_level=i.reorder_level, unit=i.unit,
        )
        for i in low_stock_rows
    ]

    return DashboardResponse(
        overview=overview,
        schedule_status=ScheduleStatusBreakdown(**sched_st),
        plan_status=PlanStatusBreakdown(**plan_st),
        order_status=OrderStatusBreakdown(**order_st),
        job_card_status=JobCardStatusBreakdown(**jc_st),
        inventory_by_type=inventory_by_type,
        recent_inventory=recent_inventory,
        recent_production=recent_production,
        top_products=top_products,
        daily_production_output=daily_production_output,
        low_stock_items=low_stock_items,
    )
