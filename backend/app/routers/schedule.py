from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.bom_item import BomItem
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/schedules",
    tags=["schedules"],
)

VALID_STATUSES = {"pending", "confirmed", "in_production", "delivered", "cancelled"}
_SCHEDULE_RANK = {"pending": 0, "confirmed": 1, "in_production": 2, "delivered": 3, "cancelled": 4}


def _next_schedule_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(Schedule)).one()
    return f"SCH-{count + 1:04d}"


# ── Schemas ───────────────────────────────────────────────────────────────────


class ScheduleCreate(BaseModel):
    customer_name: str
    description: str
    scheduled_date: str
    scheduled_qty: float = 0.0
    backlog_qty: float = 0.0
    notes: Optional[str] = None
    status: str = "pending"
    is_active: bool = True

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
        return v

    @field_validator("scheduled_qty", "backlog_qty")
    @classmethod
    def non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("quantity cannot be negative")
        return v


class ScheduleUpdate(BaseModel):
    customer_name: Optional[str] = None
    description: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_qty: Optional[float] = None
    backlog_qty: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
        return v


class ScheduleResponse(BaseModel):
    id: int
    schedule_number: str
    customer_name: str
    description: str
    scheduled_date: str
    scheduled_qty: float
    backlog_qty: float
    total_qty: float              # scheduled_qty + backlog_qty
    notes: Optional[str]
    status: str
    is_active: bool
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_total(cls, s: "Schedule") -> "ScheduleResponse":
        return cls(
            id=s.id,
            schedule_number=s.schedule_number,
            customer_name=s.customer_name,
            description=s.description,
            scheduled_date=s.scheduled_date,
            scheduled_qty=s.scheduled_qty,
            backlog_qty=s.backlog_qty,
            total_qty=s.scheduled_qty + s.backlog_qty,
            notes=s.notes,
            status=s.status,
            is_active=s.is_active,
            created_at=s.created_at,
        )


class PaginatedSchedules(BaseModel):
    items: list[ScheduleResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedSchedules)
def list_schedules(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    status_filter: Optional[str] = None,
    customer: Optional[str] = None,
    search: Optional[str] = None,
    include_inactive: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedSchedules:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    q = select(Schedule)
    if not include_inactive:
        q = q.where(Schedule.is_active == True)  # noqa: E712
    if status_filter:
        q = q.where(Schedule.status == status_filter)
    if customer:
        q = q.where(Schedule.customer_name.ilike(f"%{customer}%"))  # type: ignore[union-attr]
    if search:
        term = f"%{search}%"
        q = q.where(
            Schedule.customer_name.ilike(term) | Schedule.description.ilike(term)  # type: ignore[union-attr]
        )

    # Total count for pagination meta
    count_q = select(func.count()).select_from(q.subquery())
    total: int = session.exec(count_q).one()
    pages = max(1, -(-total // page_size))  # ceiling division

    rows = list(
        session.exec(
            q.order_by(Schedule.id.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )

    return PaginatedSchedules(
        items=[ScheduleResponse.from_orm_with_total(s) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    body: ScheduleCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> Schedule:
    # Auto-resolve customer_id from customer_name
    customer = session.exec(
        select(Customer).where(Customer.name == body.customer_name)
    ).first()
    schedule = Schedule(
        schedule_number=_next_schedule_number(session),
        customer_id=customer.id if customer else None,
        created_at=datetime.now(timezone.utc),
        **body.model_dump(),
    )
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return ScheduleResponse.from_orm_with_total(schedule)


@router.get("/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(
    schedule_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> ScheduleResponse:
    s = session.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return ScheduleResponse.from_orm_with_total(s)


@router.put("/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> ScheduleResponse:
    s = session.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    data = body.model_dump(exclude_unset=True)
    # Backward status guard
    if "status" in data and data["status"] is not None:
        proposed = data["status"]
        if proposed != "cancelled":
            cur_rank = _SCHEDULE_RANK.get(s.status, 0)
            new_rank = _SCHEDULE_RANK.get(proposed, 0)
            if new_rank < cur_rank:
                raise HTTPException(
                    status_code=422,
                    detail=f"Cannot move schedule backward from '{s.status}' to '{proposed}'",
                )
    for k, v in data.items():
        setattr(s, k, v)
    session.add(s)
    session.commit()
    session.refresh(s)
    return ScheduleResponse.from_orm_with_total(s)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    s = session.get(Schedule, schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s.is_active = False
    session.add(s)
    session.commit()


# ── Availability check ────────────────────────────────────────────────────────


@router.get("/availability")
def check_availability(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    product_name: str = "",
    qty: float = 0.0,
) -> dict:
    """Given a product name and required qty, return:
    - FG currently in stock vs required qty
    - RM requirements from BOM vs current stock
    """
    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required")

    # Check FG stock
    fg_item = session.exec(
        select(InventoryItem).where(
            InventoryItem.name == product_name,
            InventoryItem.item_type == "finished_good",
            InventoryItem.is_active == True,  # noqa: E712
        )
    ).first()

    fg_available = fg_item.quantity_on_hand if fg_item else 0.0
    fg_shortfall = max(0.0, qty - fg_available)

    # Check RM requirements via BOM
    bom_entries = list(session.exec(
        select(BomItem).where(
            BomItem.product_name == product_name,
            BomItem.is_active == True,  # noqa: E712
        )
    ).all())

    rm_requirements = []
    for bom in bom_entries:
        rm = session.get(InventoryItem, bom.raw_material_id)
        if not rm:
            continue
        needed = qty * bom.qty_per_unit
        available = rm.quantity_on_hand
        rm_requirements.append({
            "item_id": rm.id,
            "code": rm.code,
            "name": rm.name,
            "unit": rm.unit,
            "qty_per_unit": bom.qty_per_unit,
            "required": needed,
            "available": available,
            "shortfall": max(0.0, needed - available),
        })

    return {
        "product_name": product_name,
        "requested_qty": qty,
        "fg_available": fg_available,
        "fg_shortfall": fg_shortfall,
        "rm_requirements": rm_requirements,
        "has_fg_shortfall": fg_shortfall > 0,
        "has_rm_shortfall": any(r["shortfall"] > 0 for r in rm_requirements),
    }
