from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.bom_item import BomItem
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.job_card import JobCard
from app.models.job_card_history import JobCardHistory
from app.models.production_order import ProductionOrder
from app.models.production_plan import ProductionPlan
from app.models.production_process import ProductionProcess
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/production",
    tags=["production"],
)

PLAN_STATUSES = {"draft", "approved", "in_progress", "completed"}
ORDER_STATUSES = {"open", "in_progress", "completed", "cancelled"}
JOB_STATUSES = {"open", "in_progress", "completed", "cancelled"}

# Status precedence — higher number = further in lifecycle.
# Backward transitions are blocked except → cancelled.
_PLAN_RANK = {"draft": 0, "approved": 1, "in_progress": 2, "completed": 3}
_ORDER_RANK = {"open": 0, "in_progress": 1, "completed": 2, "cancelled": 3}
_JOB_RANK = {"open": 0, "in_progress": 1, "completed": 2, "cancelled": 3}
_SCHEDULE_RANK = {"pending": 0, "confirmed": 1, "in_production": 2, "delivered": 3, "cancelled": 4}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _next_plan_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(ProductionPlan)).one()
    return f"PP-{count + 1:04d}"


def _next_order_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(ProductionOrder)).one()
    return f"PO-{count + 1:04d}"


def _next_card_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(JobCard)).one()
    return f"JC-{count + 1:04d}"


# ── Job Card history helpers ──────────────────────────────────────────────────

_JOB_CARD_TRACKED_FIELDS = [
    "process_name", "tool_die_number", "machine_name", "worker_name",
    "hours_worked", "qty_produced", "qty_pending", "work_date", "notes",
    "status", "is_active",
]


def _record_job_card_created(
    job: JobCard, user_id: int | None, session: Session,
) -> None:
    """Write a single 'created' history row capturing the initial snapshot."""
    now = datetime.now(tz=timezone.utc)
    for field in _JOB_CARD_TRACKED_FIELDS:
        val = getattr(job, field, None)
        if val is not None:
            session.add(JobCardHistory(
                job_card_id=job.id,  # type: ignore[arg-type]
                changed_by_user_id=user_id,
                changed_at=now,
                change_type="created",
                field_name=field,
                old_value=None,
                new_value=str(val),
            ))


def _record_job_card_changes(
    old_snapshot: dict[str, str | None],
    job: JobCard,
    user_id: int | None,
    session: Session,
) -> None:
    """Compare old_snapshot dict to job's current state, write one row per changed field."""
    now = datetime.now(tz=timezone.utc)
    for field in _JOB_CARD_TRACKED_FIELDS:
        old_val = old_snapshot.get(field)
        new_val = str(getattr(job, field)) if getattr(job, field, None) is not None else None
        if old_val != new_val:
            session.add(JobCardHistory(
                job_card_id=job.id,  # type: ignore[arg-type]
                changed_by_user_id=user_id,
                changed_at=now,
                change_type="updated",
                field_name=field,
                old_value=old_val,
                new_value=new_val,
            ))


def _snapshot_job_card(job: JobCard) -> dict[str, str | None]:
    """Capture current field values as strings for later comparison."""
    return {
        field: str(getattr(job, field)) if getattr(job, field, None) is not None else None
        for field in _JOB_CARD_TRACKED_FIELDS
    }


def _check_backward_status(
    current: str, proposed: str, rank_map: dict[str, int], entity_name: str
) -> None:
    """Raise 422 if the proposed status is a backward transition (except → cancelled)."""
    if proposed == "cancelled":
        return
    cur_rank = rank_map.get(current, 0)
    new_rank = rank_map.get(proposed, 0)
    if new_rank < cur_rank:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot move {entity_name} backward from '{current}' to '{proposed}'",
        )


def _propagate_statuses(order_id: int, session: Session) -> None:
    """After a job card change, cascade status up: Order → Plan → Schedule.

    Rules:
    - Order: ANY active card in_progress → order in_progress.
             ALL active cards completed → order completed.
    - Plan:  ANY active order in_progress → plan in_progress.
             ALL active orders completed → plan completed.
    - Schedule: plan goes in_progress → schedule in_production.
                plan goes completed → schedule delivered.
    """
    order = session.get(ProductionOrder, order_id)
    if not order:
        return

    # ── Order status from its job cards ──
    cards = list(session.exec(
        select(JobCard)
        .where(JobCard.production_order_id == order_id, JobCard.is_active == True)  # noqa: E712
    ).all())

    if cards:
        all_completed = all(c.status == "completed" for c in cards)
        any_in_progress = any(c.status == "in_progress" for c in cards)
        any_completed = any(c.status == "completed" for c in cards)

        if all_completed and order.status != "completed":
            order.status = "completed"
            session.add(order)
        elif (any_in_progress or any_completed) and order.status == "open":
            order.status = "in_progress"
            session.add(order)

    # ── Plan status from its orders ──
    plan = session.get(ProductionPlan, order.production_plan_id)
    if not plan:
        return

    orders = list(session.exec(
        select(ProductionOrder)
        .where(
            ProductionOrder.production_plan_id == plan.id,
            ProductionOrder.is_active == True,  # noqa: E712
        )
    ).all())

    if orders:
        all_orders_completed = all(o.status == "completed" for o in orders)
        any_order_active = any(o.status in ("in_progress", "completed") for o in orders)

        if all_orders_completed and plan.status != "completed":
            plan.status = "completed"
            session.add(plan)
        elif any_order_active and plan.status in ("draft", "approved"):
            plan.status = "in_progress"
            session.add(plan)

    # ── Schedule status from plan ──
    if plan.schedule_id is None:
        return
    sched = session.get(Schedule, plan.schedule_id)
    if not sched:
        return

    if plan.status == "completed" and sched.status != "delivered":
        sched.status = "delivered"
        session.add(sched)
    elif plan.status == "in_progress" and sched.status in ("pending", "confirmed"):
        sched.status = "in_production"
        session.add(sched)


def _consume_bom_materials(
    product_name: str,
    qty_delta: float,
    schedule_id: Optional[int],
    session: Session,
) -> None:
    """Deduct raw materials from inventory based on BOM when production reports output.

    qty_delta = increase in qty_produced on a job card.
    Deducts (qty_delta × qty_per_unit) of each RM in the BOM.
    """
    if qty_delta <= 0:
        return

    bom_entries = list(session.exec(
        select(BomItem)
        .where(BomItem.product_name == product_name, BomItem.is_active == True)  # noqa: E712
    ).all())

    for b in bom_entries:
        item = session.get(InventoryItem, b.raw_material_id)
        if not item or not item.is_active:
            continue
        deduction = round(b.qty_per_unit * qty_delta, 4)
        qty_before = item.quantity_on_hand
        item.quantity_on_hand = max(0.0, round(qty_before - deduction, 4))
        item.updated_at = datetime.now(tz=timezone.utc)
        session.add(item)

        # Audit trail
        session.add(InventoryHistory(
            inventory_item_id=item.id,
            change_type="subtract",
            quantity_before=qty_before,
            quantity_after=item.quantity_on_hand,
            quantity_delta=item.quantity_on_hand - qty_before,
            schedule_id=schedule_id,
            notes=f"BOM consumption: {qty_delta} units of {product_name} produced",
        ))


def _recalc_fg_for_order(order: ProductionOrder, session: Session) -> None:
    """Incrementally update FG inventory based on process-aware production.

    A finished good is only complete when it has passed through ALL process
    steps.  Therefore:

        effective_qty = MIN(qty_produced) across all active job cards in the order

    If the order has no job cards yet, effective_qty stays at 0.
    We track how much FG has already been credited (order.fg_credited) and
    only add/subtract the delta so inventory stays accurate as production
    progresses.
    """
    cards = list(session.exec(
        select(JobCard)
        .where(
            JobCard.production_order_id == order.id,
            JobCard.is_active == True,  # noqa: E712
        )
    ).all())

    if not cards:
        return

    new_effective = min(c.qty_produced for c in cards)
    new_effective = round(max(0.0, new_effective), 4)

    old_effective = order.effective_qty
    delta = round(new_effective - order.fg_credited, 4)

    # Persist effective_qty on the order regardless of FG item existing
    order.effective_qty = new_effective
    session.add(order)

    if delta == 0:
        return

    # Resolve FG inventory item via Order → Plan → Schedule
    plan = session.get(ProductionPlan, order.production_plan_id)
    if not plan or plan.schedule_id is None:
        return
    sched = session.get(Schedule, plan.schedule_id)
    if not sched:
        return

    fg_item = session.exec(
        select(InventoryItem).where(
            InventoryItem.name == sched.description,
            InventoryItem.item_type == "finished_good",
            InventoryItem.is_active == True,  # noqa: E712
        )
    ).first()

    if not fg_item:
        return

    qty_before = fg_item.quantity_on_hand
    fg_item.quantity_on_hand = round(max(0.0, qty_before + delta), 4)
    fg_item.updated_at = datetime.now(tz=timezone.utc)
    session.add(fg_item)

    order.fg_credited = new_effective
    session.add(order)

    change_type = "add" if delta > 0 else "subtract"
    session.add(InventoryHistory(
        inventory_item_id=fg_item.id,
        change_type=change_type,
        quantity_before=qty_before,
        quantity_after=fg_item.quantity_on_hand,
        quantity_delta=delta,
        schedule_id=plan.schedule_id,
        production_order_id=order.id,
        notes=f"FG {'increment' if delta > 0 else 'adjustment'}: Order {order.order_number} effective_qty={new_effective}",
    ))


def _get_product_name_for_order(order: ProductionOrder, session: Session) -> tuple[Optional[str], Optional[int]]:
    """Return (product_name, schedule_id) for an order by traversing Order → Plan → Schedule."""
    plan = session.get(ProductionPlan, order.production_plan_id)
    if not plan or not plan.schedule_id:
        return None, None
    sched = session.get(Schedule, plan.schedule_id)
    if not sched:
        return None, None
    return sched.description, sched.id


# ═══════════════════════════════════════════════════════════════════════════════
#  PRODUCTION PLANS
# ═══════════════════════════════════════════════════════════════════════════════


# ── Process schemas ───────────────────────────────────────────────────────────


class ProcessCreate(BaseModel):
    name: str
    sequence: int = 0
    notes: Optional[str] = None


class ProcessUpdate(BaseModel):
    name: Optional[str] = None
    sequence: Optional[int] = None
    notes: Optional[str] = None


class ProcessResponse(BaseModel):
    id: int
    plan_id: int
    name: str
    sequence: int
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ── Plan schemas ──────────────────────────────────────────────────────────────


class PlanCreate(BaseModel):
    title: str
    schedule_id: Optional[int] = None
    planned_qty: float = 0.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: str = "draft"
    is_active: bool = True

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in PLAN_STATUSES:
            raise ValueError(f"status must be one of {sorted(PLAN_STATUSES)}")
        return v


class PlanUpdate(BaseModel):
    title: Optional[str] = None
    schedule_id: Optional[int] = None
    planned_qty: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PLAN_STATUSES:
            raise ValueError(f"status must be one of {sorted(PLAN_STATUSES)}")
        return v


class PlanResponse(BaseModel):
    id: int
    plan_number: str
    title: str
    # Own fields
    schedule_id: Optional[int]
    planned_qty: float
    start_date: Optional[str]
    end_date: Optional[str]
    notes: Optional[str]
    status: str
    is_active: bool
    # Processes (ordered by sequence)
    processes: list[ProcessResponse] = []
    # Denormalized from linked Schedule
    schedule_number: Optional[str] = None
    customer_name: Optional[str] = None
    product_description: Optional[str] = None
    scheduled_qty: Optional[float] = None
    backlog_qty: Optional[float] = None
    scheduled_date: Optional[str] = None
    schedule_status: Optional[str] = None

    model_config = {"from_attributes": True}


class PaginatedPlans(BaseModel):
    items: list[PlanResponse]
    total: int
    page: int
    page_size: int
    pages: int


def _to_plan_response(plan: ProductionPlan, session: Session) -> PlanResponse:
    """Build a PlanResponse, enriching with linked Schedule data and processes."""
    sched: Optional[Schedule] = None
    if plan.schedule_id is not None:
        sched = session.get(Schedule, plan.schedule_id)

    processes = list(session.exec(
        select(ProductionProcess)
        .where(ProductionProcess.plan_id == plan.id)
        .order_by(ProductionProcess.sequence, ProductionProcess.id)  # type: ignore[union-attr]
    ).all())

    return PlanResponse(
        id=plan.id,  # type: ignore[arg-type]
        plan_number=plan.plan_number,
        title=plan.title,
        schedule_id=plan.schedule_id,
        planned_qty=plan.planned_qty,
        start_date=plan.start_date,
        end_date=plan.end_date,
        notes=plan.notes,
        status=plan.status,
        is_active=plan.is_active,
        processes=[ProcessResponse.model_validate(p) for p in processes],
        # Schedule enrichment
        schedule_number=sched.schedule_number if sched else None,
        customer_name=sched.customer_name if sched else None,
        product_description=sched.description if sched else None,
        scheduled_qty=sched.scheduled_qty if sched else None,
        backlog_qty=sched.backlog_qty if sched else None,
        scheduled_date=sched.scheduled_date if sched else None,
        schedule_status=sched.status if sched else None,
    )


@router.get("/plans", response_model=PaginatedPlans)
def list_plans(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    status_filter: Optional[str] = None,
    include_inactive: bool = False,
    available_for_orders: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedPlans:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    q = select(ProductionPlan)
    if not include_inactive:
        q = q.where(ProductionPlan.is_active == True)  # noqa: E712
    if status_filter:
        q = q.where(ProductionPlan.status == status_filter)
    if available_for_orders:
        # Only approved plans that don't already have an active production order
        q = q.where(ProductionPlan.status == "approved")
        busy_ids = select(ProductionOrder.production_plan_id).where(
            ProductionOrder.is_active == True,  # noqa: E712
        )
        q = q.where(ProductionPlan.id.not_in(busy_ids))  # type: ignore[union-attr]
    if search:
        term = f"%{search}%"
        q = q.where(
            ProductionPlan.title.ilike(term) | ProductionPlan.plan_number.ilike(term)  # type: ignore[union-attr]
        )

    total: int = session.exec(select(func.count()).select_from(q.subquery())).one()
    pages = max(1, -(-total // page_size))
    rows = list(
        session.exec(
            q.order_by(ProductionPlan.id.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    items = [_to_plan_response(p, session) for p in rows]
    return PaginatedPlans(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/plans", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(
    body: PlanCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> PlanResponse:
    if body.schedule_id is None:
        raise HTTPException(status_code=422, detail="schedule_id is required")
    sched = session.get(Schedule, body.schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if sched.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail=f"Schedule must be in 'confirmed' status (current: {sched.status})",
        )
    # Prevent duplicate: only one active plan per schedule
    existing = session.exec(
        select(ProductionPlan).where(
            ProductionPlan.schedule_id == body.schedule_id,
            ProductionPlan.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Schedule already has an active plan ({existing.plan_number}). "
                   f"Deactivate it before creating a new one.",
        )
    plan = ProductionPlan(
        plan_number=_next_plan_number(session),
        **body.model_dump(),
    )
    session.add(plan)
    session.flush()

    # Auto-advance schedule: confirmed → in_production
    sched.status = "in_production"
    session.add(sched)

    session.commit()
    session.refresh(plan)
    return _to_plan_response(plan, session)


@router.get("/plans/{plan_id}", response_model=PlanResponse)
def get_plan(
    plan_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> PlanResponse:
    plan = session.get(ProductionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    return _to_plan_response(plan, session)


@router.put("/plans/{plan_id}", response_model=PlanResponse)
def update_plan(
    plan_id: int,
    body: PlanUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> PlanResponse:
    plan = session.get(ProductionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    data = body.model_dump(exclude_unset=True)
    if "schedule_id" in data and data["schedule_id"] is not None:
        if not session.get(Schedule, data["schedule_id"]):
            raise HTTPException(status_code=404, detail="Schedule not found")
    # Backward status guard
    if "status" in data and data["status"] is not None:
        _check_backward_status(plan.status, data["status"], _PLAN_RANK, "plan")
    for k, v in data.items():
        setattr(plan, k, v)
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _to_plan_response(plan, session)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    plan = session.get(ProductionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    plan.is_active = False
    session.add(plan)
    session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  PLAN PROCESSES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/plans/{plan_id}/processes", response_model=list[ProcessResponse])
def list_processes(
    plan_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[ProductionProcess]:
    plan = session.get(ProductionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    return list(session.exec(
        select(ProductionProcess)
        .where(ProductionProcess.plan_id == plan_id)
        .order_by(ProductionProcess.sequence, ProductionProcess.id)  # type: ignore[union-attr]
    ).all())


@router.post("/plans/{plan_id}/processes", response_model=ProcessResponse, status_code=status.HTTP_201_CREATED)
def add_process(
    plan_id: int,
    body: ProcessCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> ProductionProcess:
    plan = session.get(ProductionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    proc = ProductionProcess(plan_id=plan_id, **body.model_dump())
    session.add(proc)
    session.commit()
    session.refresh(proc)
    return proc


@router.put("/plans/{plan_id}/processes/{process_id}", response_model=ProcessResponse)
def update_process(
    plan_id: int,
    process_id: int,
    body: ProcessUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> ProductionProcess:
    proc = session.get(ProductionProcess, process_id)
    if not proc or proc.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Process not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(proc, k, v)
    session.add(proc)
    session.commit()
    session.refresh(proc)
    return proc


@router.delete("/plans/{plan_id}/processes/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_process(
    plan_id: int,
    process_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    proc = session.get(ProductionProcess, process_id)
    if not proc or proc.plan_id != plan_id:
        raise HTTPException(status_code=404, detail="Process not found")
    session.delete(proc)
    session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  BOM / MATERIALS PREVIEW
# ═══════════════════════════════════════════════════════════════════════════════


class MaterialRequirement(BaseModel):
    item_id: int
    code: str
    name: str
    unit: str
    item_type: str                  # raw_material | semi_finished
    qty_per_unit: float             # from BOM
    required_qty: float             # qty_per_unit × planned_qty
    available_qty: float             # current quantity_on_hand
    to_purchase: float              # max(0, required - available)


@router.get("/bom-preview", response_model=list[MaterialRequirement])
def bom_preview(
    product_name: str,
    planned_qty: float,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[MaterialRequirement]:
    """Return materials needed for a given product and planned quantity.

    Looks up the BOM by product_name (= Schedule.description),
    joins each component's InventoryItem for current stock,
    and computes required_qty and to_purchase.
    """
    bom_entries = list(session.exec(
        select(BomItem)
        .where(BomItem.product_name == product_name)
        .where(BomItem.is_active == True)  # noqa: E712
        .order_by(BomItem.id)  # type: ignore[union-attr]
    ).all())

    result: list[MaterialRequirement] = []
    for b in bom_entries:
        item = session.get(InventoryItem, b.raw_material_id)
        if not item or not item.is_active:
            continue
        required = round(b.qty_per_unit * planned_qty, 4)
        available = item.quantity_on_hand
        result.append(MaterialRequirement(
            item_id=item.id,  # type: ignore[arg-type]
            code=item.code,
            name=item.name,
            unit=item.unit,
            item_type=item.item_type,
            qty_per_unit=b.qty_per_unit,
            required_qty=required,
            available_qty=available,
            to_purchase=max(0.0, round(required - available, 4)),
        ))
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  PRODUCTION ORDERS
# ═══════════════════════════════════════════════════════════════════════════════


class OrderCreate(BaseModel):
    production_plan_id: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: str = "open"
    is_active: bool = True

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ORDER_STATUSES:
            raise ValueError(f"status must be one of {sorted(ORDER_STATUSES)}")
        return v


class OrderUpdate(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ORDER_STATUSES:
            raise ValueError(f"status must be one of {sorted(ORDER_STATUSES)}")
        return v


class JobCardResponse(BaseModel):
    id: int
    card_number: str
    production_order_id: int
    process_name: str
    tool_die_number: Optional[str]
    machine_name: Optional[str]
    worker_name: Optional[str]
    hours_worked: float
    qty_produced: float
    qty_pending: float
    work_date: Optional[str]
    notes: Optional[str]
    status: str
    is_active: bool

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: int
    order_number: str
    production_plan_id: int
    start_date: Optional[str]
    end_date: Optional[str]
    notes: Optional[str]
    status: str
    is_active: bool
    # Denormalized from linked plan / schedule
    plan_number: Optional[str] = None
    plan_title: Optional[str] = None
    plan_status: Optional[str] = None
    schedule_number: Optional[str] = None
    customer_name: Optional[str] = None
    product_description: Optional[str] = None
    planned_qty: Optional[float] = None
    # Process-aware FG tracking
    effective_qty: float = 0.0       # MIN(qty_produced) across all job cards
    fg_credited: float = 0.0         # how much FG added to inventory so far
    # Processes from linked plan
    processes: list[ProcessResponse] = []
    # Job cards inside this order
    job_cards: list[JobCardResponse] = []

    model_config = {"from_attributes": True}


class PaginatedOrders(BaseModel):
    items: list[OrderResponse]
    total: int
    page: int
    page_size: int
    pages: int


def _to_order_response(order: ProductionOrder, session: Session) -> OrderResponse:
    """Build an OrderResponse with plan/schedule denormalization + job cards."""
    plan = session.get(ProductionPlan, order.production_plan_id)
    sched: Optional[Schedule] = None
    if plan and plan.schedule_id is not None:
        sched = session.get(Schedule, plan.schedule_id)

    processes = list(session.exec(
        select(ProductionProcess)
        .where(ProductionProcess.plan_id == order.production_plan_id)
        .order_by(ProductionProcess.sequence, ProductionProcess.id)  # type: ignore[union-attr]
    ).all()) if plan else []

    cards = list(session.exec(
        select(JobCard)
        .where(JobCard.production_order_id == order.id)  # type: ignore[arg-type]
        .where(JobCard.is_active == True)  # noqa: E712
        .order_by(JobCard.id)  # type: ignore[union-attr]
    ).all())

    return OrderResponse(
        id=order.id,  # type: ignore[arg-type]
        order_number=order.order_number,
        production_plan_id=order.production_plan_id,
        start_date=order.start_date,
        end_date=order.end_date,
        notes=order.notes,
        status=order.status,
        is_active=order.is_active,
        plan_number=plan.plan_number if plan else None,
        plan_title=plan.title if plan else None,
        plan_status=plan.status if plan else None,
        schedule_number=sched.schedule_number if sched else None,
        customer_name=sched.customer_name if sched else None,
        product_description=sched.description if sched else None,
        planned_qty=plan.planned_qty if plan else None,
        effective_qty=order.effective_qty,
        fg_credited=order.fg_credited,
        processes=[ProcessResponse.model_validate(p) for p in processes],
        job_cards=[JobCardResponse.model_validate(c) for c in cards],
    )


@router.get("/orders", response_model=PaginatedOrders)
def list_orders(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    status_filter: Optional[str] = None,
    include_inactive: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedOrders:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    q = select(ProductionOrder)
    if not include_inactive:
        q = q.where(ProductionOrder.is_active == True)  # noqa: E712
    if status_filter:
        q = q.where(ProductionOrder.status == status_filter)
    if search:
        term = f"%{search}%"
        q = q.where(
            ProductionOrder.order_number.ilike(term)  # type: ignore[union-attr]
        )

    total: int = session.exec(select(func.count()).select_from(q.subquery())).one()
    pages = max(1, -(-total // page_size))
    rows = list(
        session.exec(
            q.order_by(ProductionOrder.id.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    items = [_to_order_response(o, session) for o in rows]
    return PaginatedOrders(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    body: OrderCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> OrderResponse:
    plan = session.get(ProductionPlan, body.production_plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Production plan not found")
    # Must be approved to create an order
    if plan.status != "approved":
        raise HTTPException(
            status_code=409,
            detail=f"Plan must be in 'approved' status to start production (current: {plan.status})",
        )
    # Prevent duplicate: only one active order per plan
    existing = session.exec(
        select(ProductionOrder).where(
            ProductionOrder.production_plan_id == body.production_plan_id,
            ProductionOrder.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Plan already has an active production order ({existing.order_number}). "
                   f"Deactivate it before creating a new one.",
        )
    order = ProductionOrder(
        order_number=_next_order_number(session),
        **body.model_dump(),
    )
    session.add(order)
    session.flush()

    # Auto-advance: plan → in_progress
    if plan.status == "approved":
        plan.status = "in_progress"
        session.add(plan)

    # Auto-advance: schedule → in_production
    if plan.schedule_id is not None:
        sched = session.get(Schedule, plan.schedule_id)
        if sched and sched.status in ("pending", "confirmed"):
            sched.status = "in_production"
            session.add(sched)

    session.commit()
    session.refresh(order)
    return _to_order_response(order, session)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> OrderResponse:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    return _to_order_response(order, session)


@router.put("/orders/{order_id}", response_model=OrderResponse)
def update_order(
    order_id: int,
    body: OrderUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> OrderResponse:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    data = body.model_dump(exclude_unset=True)
    # Backward status guard
    if "status" in data and data["status"] is not None:
        _check_backward_status(order.status, data["status"], _ORDER_RANK, "order")
    old_status = order.status
    for k, v in data.items():
        setattr(order, k, v)
    session.add(order)
    session.flush()

    # If status changed, propagate up to plan/schedule
    if order.status != old_status:
        _propagate_statuses(order_id, session)

    session.commit()
    session.refresh(order)
    return _to_order_response(order, session)


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    order_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    order.is_active = False
    session.add(order)
    session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  JOB CARDS (inside a Production Order)
# ═══════════════════════════════════════════════════════════════════════════════


class JobCardCreate(BaseModel):
    process_name: str
    tool_die_number: Optional[str] = None
    machine_name: Optional[str] = None
    worker_name: Optional[str] = None
    hours_worked: float = 0.0
    qty_produced: float = 0.0
    work_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class JobCardUpdate(BaseModel):
    process_name: Optional[str] = None
    tool_die_number: Optional[str] = None
    machine_name: Optional[str] = None
    worker_name: Optional[str] = None
    hours_worked: Optional[float] = None
    qty_produced: Optional[float] = None
    work_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PaginatedJobs(BaseModel):
    items: list[JobCardResponse]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("/orders/{order_id}/jobs", response_model=list[JobCardResponse])
def list_order_jobs(
    order_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[JobCard]:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    q = (
        select(JobCard)
        .where(JobCard.production_order_id == order_id)
        .order_by(JobCard.id)  # type: ignore[union-attr]
    )
    # Workers see only their own job cards
    if current_user.role == "worker":
        q = q.where(
            (JobCard.worker_id == current_user.id)
            | (JobCard.worker_name == current_user.username)
        )
    return list(session.exec(q).all())


@router.post("/orders/{order_id}/jobs", response_model=JobCardResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    order_id: int,
    body: JobCardCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")

    # If worker role, force worker_name to their own username
    if current_user.role == "worker":
        body.worker_name = current_user.username

    # Get plan's planned_qty to auto-compute qty_pending and status
    plan = session.get(ProductionPlan, order.production_plan_id)
    planned_qty = plan.planned_qty if plan else 0.0
    qty_pending = max(0.0, round(planned_qty - body.qty_produced, 4))

    # Auto-compute status from qty_produced
    if body.qty_produced <= 0:
        auto_status = "open"
    elif planned_qty > 0 and body.qty_produced >= planned_qty:
        auto_status = "completed"
    else:
        auto_status = "in_progress"

    job = JobCard(
        card_number=_next_card_number(session),
        production_order_id=order_id,
        qty_pending=qty_pending,
        status=auto_status,
        **body.model_dump(),
    )
    # Resolve worker_name → worker_id
    if job.worker_name:
        matched_user = session.exec(
            select(User).where(User.username == job.worker_name)
        ).first()
        if matched_user:
            job.worker_id = matched_user.id  # type: ignore[assignment]
    session.add(job)
    session.flush()

    # If job has production, consume BOM materials
    if body.qty_produced > 0:
        product_name, schedule_id = _get_product_name_for_order(order, session)
        if product_name:
            _consume_bom_materials(product_name, body.qty_produced, schedule_id, session)

    # Propagate status changes up
    _propagate_statuses(order_id, session)

    # Recalculate process-aware FG: effective_qty = MIN(qty_produced) across all job cards
    _recalc_fg_for_order(order, session)

    # Record creation in job card history
    _record_job_card_created(job, current_user.id, session)

    session.commit()
    session.refresh(job)
    return job


@router.get("/jobs/{job_id}", response_model=JobCardResponse)
def get_job(
    job_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")
    return job


@router.put("/jobs/{job_id}", response_model=JobCardResponse)
def update_job(
    job_id: int,
    body: JobCardUpdate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")
    data = body.model_dump(exclude_unset=True)

    # If worker role, force worker_name to their own username
    if current_user.role == "worker":
        data["worker_name"] = current_user.username

    # Snapshot before changes for history
    old_snapshot = _snapshot_job_card(job)

    # Track old qty_produced for BOM delta
    old_qty_produced = job.qty_produced
    old_status = job.status

    for k, v in data.items():
        setattr(job, k, v)

    # Resolve worker_name → worker_id FK
    if "worker_name" in data and job.worker_name:
        matched_user = session.exec(
            select(User).where(User.username == job.worker_name)
        ).first()
        if matched_user:
            job.worker_id = matched_user.id

    # Auto-compute qty_pending and status from plan's planned_qty
    order = session.get(ProductionOrder, job.production_order_id)
    if order:
        plan = session.get(ProductionPlan, order.production_plan_id)
        if plan:
            job.qty_pending = max(0.0, round(plan.planned_qty - job.qty_produced, 4))
            # Auto-compute status from qty_produced
            if job.qty_produced <= 0:
                job.status = "open"
            elif plan.planned_qty > 0 and job.qty_produced >= plan.planned_qty:
                job.status = "completed"
            else:
                job.status = "in_progress"

    session.add(job)
    session.flush()

    # BOM consumption on production increase
    qty_delta = job.qty_produced - old_qty_produced
    if qty_delta > 0 and order:
        product_name, schedule_id = _get_product_name_for_order(order, session)
        if product_name:
            _consume_bom_materials(product_name, qty_delta, schedule_id, session)

    # Propagate status changes up (order → plan → schedule)
    if order and (job.status != old_status or qty_delta != 0):
        _propagate_statuses(order.id, session)  # type: ignore[arg-type]

    # Recalculate process-aware FG: effective_qty = MIN(qty_produced) across all job cards
    if order:
        _recalc_fg_for_order(order, session)

    # Record changes in job card history
    _record_job_card_changes(old_snapshot, job, current_user.id, session)

    session.commit()
    session.refresh(job)
    return job


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")

    # Record deletion in history
    session.add(JobCardHistory(
        job_card_id=job.id,  # type: ignore[arg-type]
        changed_by_user_id=current_user.id,
        changed_at=datetime.now(tz=timezone.utc),
        change_type="deleted",
        field_name="is_active",
        old_value="True",
        new_value="False",
    ))

    job.is_active = False
    session.add(job)
    session.commit()


# ═══════════════════════════════════════════════════════════════════════════════
#  JOB CARD HISTORY
# ═══════════════════════════════════════════════════════════════════════════════


class JobCardHistoryResponse(BaseModel):
    id: int
    job_card_id: int
    changed_by_user_id: int | None
    changed_by_username: str | None = None
    changed_at: str  # ISO
    change_type: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    notes: str | None


@router.get("/jobs/{job_id}/history", response_model=list[JobCardHistoryResponse])
def get_job_history(
    job_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[JobCardHistoryResponse]:
    """Return full audit trail for a job card, newest first."""
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")

    rows = list(session.exec(
        select(JobCardHistory, User)
        .outerjoin(User, JobCardHistory.changed_by_user_id == User.id)
        .where(JobCardHistory.job_card_id == job_id)
        .order_by(JobCardHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all())

    return [
        JobCardHistoryResponse(
            id=h.id,  # type: ignore[arg-type]
            job_card_id=h.job_card_id,
            changed_by_user_id=h.changed_by_user_id,
            changed_by_username=u.username if u else None,
            changed_at=h.changed_at.isoformat() if h.changed_at else "",
            change_type=h.change_type,
            field_name=h.field_name,
            old_value=h.old_value,
            new_value=h.new_value,
            notes=h.notes,
        )
        for h, u in rows
    ]


# ═══════════════════════════════════════════════════════════════════════════════
#  WORKERS (for dropdowns)
# ═══════════════════════════════════════════════════════════════════════════════


class WorkerOption(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


@router.get("/workers", response_model=list[WorkerOption])
def list_workers(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[WorkerOption]:
    """Return active users for worker assignment dropdowns."""
    users = list(session.exec(
        select(User)
        .where(User.is_active == True)  # noqa: E712
        .order_by(User.username)
    ).all())
    return [WorkerOption(id=u.id, username=u.username) for u in users]  # type: ignore[arg-type]


# ═══════════════════════════════════════════════════════════════════════════════
#  WORKER TIME REPORTS  (aggregated from job card hours_worked)
# ═══════════════════════════════════════════════════════════════════════════════


class WorkerTimeSummaryItem(BaseModel):
    user_id: Optional[int]
    username: str
    total_hours: float
    job_card_count: int


@router.get("/time-report", response_model=list[WorkerTimeSummaryItem])
def worker_time_summary(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[int] = None,
) -> list[WorkerTimeSummaryItem]:
    """
    Aggregate job-card hours per worker.
    Workers/managers see only their own job cards; admin/super_admin see all.
    """
    q = select(JobCard).where(JobCard.hours_worked > 0)
    if date_from:
        q = q.where(JobCard.work_date >= date_from)  # type: ignore[operator]
    if date_to:
        q = q.where(JobCard.work_date <= date_to)  # type: ignore[operator]

    if current_user.role in ("worker", "manager"):
        q = q.where(
            (JobCard.worker_id == current_user.id)
            | (JobCard.worker_name == current_user.username)
        )
    elif user_id is not None:
        target = session.get(User, user_id)
        if target:
            q = q.where(
                (JobCard.worker_id == user_id)
                | (JobCard.worker_name == target.username)
            )

    jobs = list(session.exec(q).all())

    from collections import defaultdict
    by_worker: dict[str, list[JobCard]] = defaultdict(list)
    for job in jobs:
        key = job.worker_name or "Unassigned"
        by_worker[key].append(job)

    result = []
    for worker_name, cards in by_worker.items():
        user = session.exec(select(User).where(User.username == worker_name)).first()
        result.append(WorkerTimeSummaryItem(
            user_id=user.id if user else None,  # type: ignore[arg-type]
            username=worker_name,
            total_hours=round(sum(c.hours_worked for c in cards), 2),
            job_card_count=len(cards),
        ))

    return sorted(result, key=lambda x: x.total_hours, reverse=True)

