from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.bom_item import BomItem
from app.models.inventory import InventoryItem
from app.models.job_card import JobCard
from app.models.production_plan import ProductionPlan
from app.models.production_process import ProductionProcess
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/production",
    tags=["production"],
)

PLAN_STATUSES = {"draft", "approved", "in_progress", "completed"}
JOB_STATUSES = {"open", "in_progress", "completed", "cancelled"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _next_plan_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(ProductionPlan)).one()
    return f"PP-{count + 1:04d}"


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
#  JOB CARDS
# ═══════════════════════════════════════════════════════════════════════════════


class JobCardCreate(BaseModel):
    title: str
    production_plan_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    assigned_to: Optional[str] = None
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
    title: Optional[str] = None
    production_plan_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in JOB_STATUSES:
            raise ValueError(f"status must be one of {sorted(JOB_STATUSES)}")
        return v


class JobCardResponse(BaseModel):
    id: int
    card_number: str
    title: str
    production_plan_id: Optional[int]
    start_date: Optional[str]
    end_date: Optional[str]
    assigned_to: Optional[str]
    notes: Optional[str]
    status: str
    is_active: bool

    model_config = {"from_attributes": True}


class PaginatedJobs(BaseModel):
    items: list[JobCardResponse]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("/jobs", response_model=PaginatedJobs)
def list_jobs(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    status_filter: Optional[str] = None,
    plan_id: Optional[int] = None,
    include_inactive: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedJobs:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    q = select(JobCard)
    if not include_inactive:
        q = q.where(JobCard.is_active == True)  # noqa: E712
    if status_filter:
        q = q.where(JobCard.status == status_filter)
    if plan_id is not None:
        q = q.where(JobCard.production_plan_id == plan_id)
    if search:
        term = f"%{search}%"
        q = q.where(
            JobCard.title.ilike(term) | JobCard.card_number.ilike(term)  # type: ignore[union-attr]
        )

    total: int = session.exec(select(func.count()).select_from(q.subquery())).one()
    pages = max(1, -(-total // page_size))
    rows = list(
        session.exec(
            q.order_by(JobCard.id.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return PaginatedJobs(items=rows, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/jobs", response_model=JobCardResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    body: JobCardCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> JobCard:
    if body.production_plan_id is not None:
        if not session.get(ProductionPlan, body.production_plan_id):
            raise HTTPException(status_code=404, detail="Production plan not found")
    job = JobCard(
        card_number=_next_card_number(session),
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
    if body.production_plan_id is not None:
        if not session.get(ProductionPlan, body.production_plan_id):
            raise HTTPException(status_code=404, detail="Production plan not found")
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
