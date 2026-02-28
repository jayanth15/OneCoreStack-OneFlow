"""Inventory router — fully reworked with:
- item_type: raw_material | finished_good | semi_finished
- computed fields: required_qty (RM), customer_names, linked_schedule_count
- role-gated fields: rate, image_base64 (admin / super_admin only)
- history written on every stock change
- GET /{id}/history  (admin+ only)
"""
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.bom_item import BomItem
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["inventory"],
)

VALID_TYPES = {"raw_material", "finished_good", "semi_finished"}
ACTIVE_SCHEDULE_STATUSES = {"pending", "confirmed", "in_production"}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _write_history(
    session: Session,
    item: InventoryItem,
    change_type: str,
    user_id: Optional[int],
    qty_before: Optional[float] = None,
    qty_after: Optional[float] = None,
    schedule_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> None:
    delta: Optional[float] = None
    if qty_before is not None and qty_after is not None:
        delta = qty_after - qty_before
    h = InventoryHistory(
        inventory_item_id=item.id,  # type: ignore[arg-type]
        changed_by_user_id=user_id,
        change_type=change_type,
        quantity_before=qty_before,
        quantity_after=qty_after,
        quantity_delta=delta,
        schedule_id=schedule_id,
        notes=notes,
    )
    session.add(h)


def _compute_extra(
    session: Session,
    item: InventoryItem,
) -> dict[str, Any]:
    """Return computed display fields for an inventory item."""
    extra: dict[str, Any] = {
        "linked_schedule_count": 0,
        "customer_names": None,
        "required_qty": None,
    }

    if item.item_type == "raw_material":
        bom_entries = list(session.exec(
            select(BomItem).where(
                BomItem.raw_material_id == item.id,
                BomItem.is_active == True,  # noqa: E712
            )
        ).all())

        total_required = 0.0
        schedule_ids: set[int] = set()
        for bom in bom_entries:
            schedules = list(session.exec(
                select(Schedule).where(
                    Schedule.description == bom.product_name,
                    Schedule.status.in_(list(ACTIVE_SCHEDULE_STATUSES)),  # type: ignore[union-attr]
                    Schedule.is_active == True,  # noqa: E712
                )
            ).all())
            for s in schedules:
                total_required += s.scheduled_qty * bom.qty_per_unit
                schedule_ids.add(s.id)  # type: ignore[arg-type]

        extra["required_qty"] = total_required
        extra["linked_schedule_count"] = len(schedule_ids)

    elif item.item_type in ("finished_good", "semi_finished"):
        schedules = list(session.exec(
            select(Schedule).where(
                Schedule.description == item.name,
                Schedule.status.in_(list(ACTIVE_SCHEDULE_STATUSES)),  # type: ignore[union-attr]
                Schedule.is_active == True,  # noqa: E712
            )
        ).all())
        extra["linked_schedule_count"] = len(schedules)
        if schedules:
            customers = sorted({s.customer_name for s in schedules})
            extra["customer_names"] = ", ".join(customers)

    return extra


# ── Schemas ───────────────────────────────────────────────────────────────────


class InventoryItemCreate(BaseModel):
    code: str
    name: str
    item_type: str = "raw_material"
    unit: str
    quantity_on_hand: float = 0.0
    reorder_level: float = 0.0
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    rate: Optional[float] = None
    image_base64: Optional[str] = None
    is_active: bool = True

    @field_validator("item_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in VALID_TYPES:
            raise ValueError(f"item_type must be one of {sorted(VALID_TYPES)}")
        return v


class InventoryItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    item_type: Optional[str] = None
    unit: Optional[str] = None
    quantity_on_hand: Optional[float] = None
    reorder_level: Optional[float] = None
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    rate: Optional[float] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("item_type")
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_TYPES:
            raise ValueError(f"item_type must be one of {sorted(VALID_TYPES)}")
        return v


class InventoryItemResponse(BaseModel):
    id: int
    code: str
    name: str
    item_type: str
    unit: str
    quantity_on_hand: float
    reorder_level: float
    storage_type: Optional[str]
    storage_location: Optional[str]
    is_active: bool
    updated_at: datetime
    linked_schedule_count: int = 0
    customer_names: Optional[str] = None
    required_qty: Optional[float] = None
    rate: Optional[float] = None

    model_config = {"from_attributes": True}


class PaginatedInventoryResponse(BaseModel):
    items: list[InventoryItemResponse]
    total: int
    page: int
    page_size: int
    pages: int


class InventoryItemDetailResponse(InventoryItemResponse):
    image_base64: Optional[str] = None


class AdjustStockBody(BaseModel):
    adjustment_type: Literal["add", "subtract", "set"]
    quantity: float
    schedule_id: Optional[int] = None
    note: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def quantity_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("quantity must be >= 0")
        return v


class HistoryEntryResponse(BaseModel):
    id: int
    inventory_item_id: int
    changed_by_user_id: Optional[int]
    changed_by_username: Optional[str] = None
    changed_at: datetime
    change_type: str
    quantity_before: Optional[float]
    quantity_after: Optional[float]
    quantity_delta: Optional[float]
    schedule_id: Optional[int]
    schedule_number: Optional[str] = None
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedInventoryResponse)
def list_items(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    item_type: Optional[str] = None,
    include_inactive: bool = False,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))

    query = select(InventoryItem)
    if not include_inactive:
        query = query.where(InventoryItem.is_active == True)  # noqa: E712
    if item_type:
        query = query.where(InventoryItem.item_type == item_type)
    if search:
        term = f"%{search}%"
        query = query.where(
            InventoryItem.name.ilike(term) | InventoryItem.code.ilike(term)  # type: ignore[union-attr]
        )

    count_q = select(func.count()).select_from(query.subquery())
    total: int = session.exec(count_q).one()
    pages = max(1, -(-total // page_size))

    items = list(
        session.exec(
            query.order_by(InventoryItem.updated_at.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )

    admin = is_admin_or_above(current_user)
    result = []
    for item in items:
        extra = _compute_extra(session, item)
        d = {
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "item_type": item.item_type,
            "unit": item.unit,
            "quantity_on_hand": item.quantity_on_hand,
            "reorder_level": item.reorder_level,
            "storage_type": item.storage_type,
            "storage_location": item.storage_location,
            "is_active": item.is_active,
            "updated_at": item.updated_at,
            "rate": item.rate if admin else None,
            **extra,
        }
        result.append(d)
    return {"items": result, "total": total, "page": page, "page_size": page_size, "pages": pages}


@router.post("", response_model=InventoryItemDetailResponse, status_code=status.HTTP_201_CREATED)
def create_item(
    body: InventoryItemCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    existing = session.exec(
        select(InventoryItem).where(InventoryItem.code == body.code.upper())
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Item code '{body.code}' already exists")

    admin = is_admin_or_above(current_user)
    item = InventoryItem(
        code=body.code.upper().strip(),
        name=body.name.strip(),
        item_type=body.item_type,
        unit=body.unit.strip(),
        quantity_on_hand=body.quantity_on_hand,
        reorder_level=body.reorder_level,
        storage_type=body.storage_type,
        storage_location=body.storage_location,
        rate=body.rate if admin else None,
        image_base64=body.image_base64,
        is_active=body.is_active,
        updated_at=datetime.now(tz=timezone.utc),
    )
    session.add(item)
    session.flush()

    _write_history(
        session, item, "create", current_user.id,
        qty_before=None, qty_after=item.quantity_on_hand,
        notes=f"Item created with qty={item.quantity_on_hand}",
    )
    session.commit()
    session.refresh(item)

    extra = _compute_extra(session, item)
    return {**item.__dict__, "rate": item.rate if admin else None, "image_base64": item.image_base64, **extra}


@router.get("/{item_id}", response_model=InventoryItemDetailResponse)
def get_item(
    item_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    admin = is_admin_or_above(current_user)
    extra = _compute_extra(session, item)
    return {**item.__dict__, "rate": item.rate if admin else None, "image_base64": item.image_base64, **extra}


@router.put("/{item_id}", response_model=InventoryItemDetailResponse)
def update_item(
    item_id: int,
    body: InventoryItemUpdate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    admin = is_admin_or_above(current_user)
    qty_before = item.quantity_on_hand

    if body.code is not None:
        code_up = body.code.upper().strip()
        conflict = session.exec(
            select(InventoryItem).where(
                InventoryItem.code == code_up, InventoryItem.id != item_id
            )
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Item code '{code_up}' already taken")
        item.code = code_up

    if body.name is not None:
        item.name = body.name.strip()
    if body.item_type is not None:
        item.item_type = body.item_type
    if body.unit is not None:
        item.unit = body.unit.strip()
    if body.quantity_on_hand is not None:
        item.quantity_on_hand = body.quantity_on_hand
    if body.reorder_level is not None:
        item.reorder_level = body.reorder_level
    if body.storage_type is not None:
        item.storage_type = body.storage_type
    if body.storage_location is not None:
        item.storage_location = body.storage_location
    if body.is_active is not None:
        item.is_active = body.is_active
    if body.image_base64 is not None:
        item.image_base64 = body.image_base64
    if body.rate is not None and admin:
        item.rate = body.rate

    item.updated_at = datetime.now(tz=timezone.utc)

    _write_history(
        session, item, "edit", current_user.id,
        qty_before=qty_before, qty_after=item.quantity_on_hand,
        notes="Item details updated",
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    extra = _compute_extra(session, item)
    return {**item.__dict__, "rate": item.rate if admin else None, "image_base64": item.image_base64, **extra}


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_item(
    item_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_active = False
    item.updated_at = datetime.now(tz=timezone.utc)
    _write_history(session, item, "edit", current_user.id, notes="Item deactivated")
    session.add(item)
    session.commit()


@router.post("/{item_id}/adjust", response_model=InventoryItemDetailResponse)
def adjust_stock(
    item_id: int,
    body: AdjustStockBody,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    admin = is_admin_or_above(current_user)
    qty_before = item.quantity_on_hand

    if body.adjustment_type == "add":
        item.quantity_on_hand += body.quantity
        change_type = "add"
    elif body.adjustment_type == "subtract":
        item.quantity_on_hand = max(0.0, item.quantity_on_hand - body.quantity)
        change_type = "subtract"
    else:
        item.quantity_on_hand = body.quantity
        change_type = "set"

    item.updated_at = datetime.now(tz=timezone.utc)
    _write_history(
        session, item, change_type, current_user.id,
        qty_before=qty_before, qty_after=item.quantity_on_hand,
        schedule_id=body.schedule_id,
        notes=body.note,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    extra = _compute_extra(session, item)
    return {**item.__dict__, "rate": item.rate if admin else None, "image_base64": item.image_base64, **extra}


@router.get("/{item_id}/history", response_model=list[HistoryEntryResponse])
def get_history(
    item_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required to view history")

    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    entries = list(session.exec(
        select(InventoryHistory)
        .where(InventoryHistory.inventory_item_id == item_id)
        .order_by(InventoryHistory.changed_at.desc())  # type: ignore[union-attr]
    ).all())

    from app.models.user import User as UserModel  # local import
    result = []
    for e in entries:
        username = None
        if e.changed_by_user_id:
            u = session.get(UserModel, e.changed_by_user_id)
            username = u.username if u else None
        sch_number = None
        if e.schedule_id:
            s = session.get(Schedule, e.schedule_id)
            sch_number = s.schedule_number if s else None
        result.append({
            **e.__dict__,
            "changed_by_username": username,
            "schedule_number": sch_number,
        })
    return result


@router.get("/{item_id}/stats")
def get_item_stats(
    item_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    total_in = session.exec(
        select(func.sum(InventoryHistory.quantity_delta)).where(
            InventoryHistory.inventory_item_id == item_id,
            InventoryHistory.quantity_delta > 0,
        )
    ).one() or 0.0
    total_out = session.exec(
        select(func.sum(InventoryHistory.quantity_delta)).where(
            InventoryHistory.inventory_item_id == item_id,
            InventoryHistory.quantity_delta < 0,
        )
    ).one() or 0.0
    return {
        "item_id": item_id,
        "current_qty": item.quantity_on_hand,
        "total_received": round(float(total_in), 4),
        "total_consumed": round(abs(float(total_out)), 4),
    }


# ── Rich detail endpoint ──────────────────────────────────────────────────────

ALL_SCHEDULE_STATUSES = {"pending", "confirmed", "in_production", "delivered", "cancelled"}


@router.get("/{item_id}/detail")
def get_item_detail(
    item_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """
    Rich detail for a single inventory item — varies by item_type.

    Raw Material:
      bom_usage[]  — every FG product that uses this RM, with demand + producibility

    Finished Good:
      schedules[]   — ALL schedules for this product (all statuses)
      bom_requirements[] — per-RM breakdown for the product
      production_capacity — units producible with current RM stock

    Semi-Finished:
      schedules[] if any match by name
    """
    item = session.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    admin = is_admin_or_above(current_user)

    base: dict[str, Any] = {
        "id": item.id,
        "code": item.code,
        "name": item.name,
        "item_type": item.item_type,
        "unit": item.unit,
        "quantity_on_hand": item.quantity_on_hand,
        "reorder_level": item.reorder_level,
        "storage_type": item.storage_type,
        "storage_location": item.storage_location,
        "is_active": item.is_active,
        "updated_at": item.updated_at,
        "rate": item.rate if admin else None,
        "image_base64": item.image_base64,
    }

    # ── Raw Material ──────────────────────────────────────────────────────────
    if item.item_type == "raw_material":
        bom_entries = list(session.exec(
            select(BomItem).where(BomItem.raw_material_id == item.id)
        ).all())

        bom_usage = []
        for bom in bom_entries:
            # Find matching FG inventory item
            fg_item = session.exec(
                select(InventoryItem).where(
                    InventoryItem.name == bom.product_name,
                    InventoryItem.item_type == "finished_good",
                )
            ).first()

            # Active schedule demand for this product
            active_schedules = list(session.exec(
                select(Schedule).where(
                    Schedule.description == bom.product_name,
                    Schedule.status.in_(list(ACTIVE_SCHEDULE_STATUSES)),  # type: ignore[union-attr]
                    Schedule.is_active == True,  # noqa: E712
                )
            ).all())
            total_demand = sum(s.scheduled_qty for s in active_schedules)
            rm_needed_for_demand = total_demand * bom.qty_per_unit
            can_produce = (item.quantity_on_hand / bom.qty_per_unit) if bom.qty_per_unit > 0 else 0.0

            bom_usage.append({
                "bom_id": bom.id,
                "is_active": bom.is_active,
                "product_name": bom.product_name,
                "qty_per_unit": bom.qty_per_unit,
                "unit": item.unit,
                "notes": bom.notes,
                "fg_item_id": fg_item.id if fg_item else None,
                "fg_available_qty": fg_item.quantity_on_hand if fg_item else None,
                "fg_unit": fg_item.unit if fg_item else None,
                "active_schedule_count": len(active_schedules),
                "total_active_demand": total_demand,
                "rm_needed_for_demand": round(rm_needed_for_demand, 4),
                "rm_shortfall": round(max(0.0, rm_needed_for_demand - item.quantity_on_hand), 4),
                "can_produce": round(can_produce, 4),
            })

        return {**base, "bom_usage": bom_usage}

    # ── Finished Good / Semi-Finished ─────────────────────────────────────────
    all_schedules = list(session.exec(
        select(Schedule).where(
            Schedule.description == item.name,
            Schedule.is_active == True,  # noqa: E712
        ).order_by(Schedule.scheduled_date)  # type: ignore[union-attr]
    ).all())

    schedule_list = [
        {
            "id": s.id,
            "schedule_number": s.schedule_number,
            "customer_name": s.customer_name,
            "scheduled_qty": s.scheduled_qty,
            "backlog_qty": s.backlog_qty,
            "scheduled_date": s.scheduled_date,
            "status": s.status,
            "notes": s.notes,
        }
        for s in all_schedules
    ]

    active_scheds = [s for s in all_schedules if s.status in ACTIVE_SCHEDULE_STATUSES]
    total_ordered = sum(s.scheduled_qty for s in active_scheds)
    total_backlog = sum(s.backlog_qty for s in active_scheds)

    # BOM requirements for this product
    bom_entries = list(session.exec(
        select(BomItem).where(
            BomItem.product_name == item.name,
            BomItem.is_active == True,  # noqa: E712
        )
    ).all())

    production_capacity: Optional[float] = None
    bom_requirements = []

    for bom in bom_entries:
        rm = session.get(InventoryItem, bom.raw_material_id)
        if not rm:
            continue
        required_for_demand = total_ordered * bom.qty_per_unit
        shortfall = max(0.0, required_for_demand - rm.quantity_on_hand)
        can_produce_from_rm = (rm.quantity_on_hand / bom.qty_per_unit) if bom.qty_per_unit > 0 else 0.0

        # production_capacity = min across all RM entries
        if production_capacity is None:
            production_capacity = can_produce_from_rm
        else:
            production_capacity = min(production_capacity, can_produce_from_rm)

        bom_requirements.append({
            "bom_id": bom.id,
            "raw_material_id": rm.id,
            "raw_material_code": rm.code,
            "raw_material_name": rm.name,
            "unit": rm.unit,
            "qty_per_unit": bom.qty_per_unit,
            "available_qty": rm.quantity_on_hand,
            "reorder_level": rm.reorder_level,
            "required_for_demand": round(required_for_demand, 4),
            "shortfall": round(shortfall, 4),
            "can_produce": round(can_produce_from_rm, 4),
            "notes": bom.notes,
        })

    return {
        **base,
        "schedules": schedule_list,
        "total_ordered": total_ordered,
        "total_backlog": total_backlog,
        "fg_shortfall": round(max(0.0, total_ordered - item.quantity_on_hand), 4),
        "bom_requirements": bom_requirements,
        "production_capacity": round(production_capacity, 4) if production_capacity is not None else None,
    }
