from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.bom_item import BomItem
from app.models.inventory import InventoryItem
from app.models.job_card import JobCard
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
    if body.schedule_id is not None and not session.get(Schedule, body.schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    plan = ProductionPlan(
        plan_number=_next_plan_number(session),
        **body.model_dump(),
    )
    session.add(plan)
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
    start_date: Optional[str]
    end_date: Optional[str]
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
    order = ProductionOrder(
        order_number=_next_order_number(session),
        **body.model_dump(),
    )
    session.add(order)
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
    for k, v in data.items():
        setattr(order, k, v)
    session.add(order)
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
    qty_pending: float = 0.0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: str = "open"
    is_active: bool = True

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in JOB_STATUSES:
            raise ValueError(f"status must be one of {sorted(JOB_STATUSES)}")
        return v


class JobCardUpdate(BaseModel):
    process_name: Optional[str] = None
    tool_die_number: Optional[str] = None
    machine_name: Optional[str] = None
    worker_name: Optional[str] = None
    hours_worked: Optional[float] = None
    qty_produced: Optional[float] = None
    qty_pending: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in JOB_STATUSES:
            raise ValueError(f"status must be one of {sorted(JOB_STATUSES)}")
        return v


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
    _: Annotated[User, Depends(get_current_user)],
) -> list[JobCard]:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    return list(session.exec(
        select(JobCard)
        .where(JobCard.production_order_id == order_id)
        .order_by(JobCard.id)  # type: ignore[union-attr]
    ).all())


@router.post("/orders/{order_id}/jobs", response_model=JobCardResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    order_id: int,
    body: JobCardCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    order = session.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    job = JobCard(
        card_number=_next_card_number(session),
        production_order_id=order_id,
        **body.model_dump(),
    )
    session.add(job)
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
    _: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(job, k, v)
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    job = session.get(JobCard, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job card not found")
    job.is_active = False
    session.add(job)
    session.commit()

