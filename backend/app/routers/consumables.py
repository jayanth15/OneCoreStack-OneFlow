"""Consumables router.

Endpoints:
  GET    /api/v1/consumables          — paginated list
  POST   /api/v1/consumables          — create
  GET    /api/v1/consumables/{id}     — single item
  PUT    /api/v1/consumables/{id}     — update
  DELETE /api/v1/consumables/{id}     — soft-delete (set is_active=False)
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.consumable import Consumable
from app.models.consumable_history import ConsumableHistory
from app.models.user import User

router = APIRouter(prefix="/api/v1/consumables", tags=["consumables"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser   = Annotated[User, Depends(require_admin)]


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConsumableCreate(BaseModel):
    name: str
    code: Optional[str] = None
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    supplier_name: Optional[str] = None
    rate_per_unit: Optional[float] = None
    qty: float = 0.0
    image_base64: Optional[str] = None


class ConsumableUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    supplier_name: Optional[str] = None
    rate_per_unit: Optional[float] = None
    qty: Optional[float] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None


class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


class HistoryOut(BaseModel):
    id: int
    consumable_id: int
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    qty_before: float
    qty_after: float
    qty_delta: float
    note: Optional[str]


class ConsumableOut(BaseModel):
    id: int
    name: str
    code: Optional[str]
    storage_type: Optional[str]
    storage_location: Optional[str]
    supplier_name: Optional[str]
    rate_per_unit: Optional[float]
    qty: float
    total_price: Optional[float]  # computed: qty * rate_per_unit
    image_base64: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


def _out(c: Consumable) -> ConsumableOut:
    def _dt(d: datetime | None) -> str:
        if d is None:
            return datetime.now(tz=timezone.utc).isoformat()
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()

    return ConsumableOut(
        id=c.id,  # type: ignore[arg-type]
        name=c.name,
        code=c.code,
        storage_type=c.storage_type,
        storage_location=c.storage_location,
        supplier_name=c.supplier_name,
        rate_per_unit=c.rate_per_unit,
        qty=c.qty,
        total_price=round(c.qty * c.rate_per_unit, 2) if c.rate_per_unit is not None else None,
        image_base64=c.image_base64,
        is_active=c.is_active,
        created_at=_dt(c.created_at),
        updated_at=_dt(c.updated_at),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_consumables(
    session: SessionDep,
    _: CurrentUser,
    search: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict:
    q = select(Consumable)
    if not include_inactive:
        q = q.where(Consumable.is_active == True)  # noqa: E712
    if search:
        pat = f"%{search}%"
        q = q.where(or_(
            Consumable.name.ilike(pat),  # type: ignore[union-attr]
            Consumable.code.ilike(pat),  # type: ignore[union-attr]
            Consumable.supplier_name.ilike(pat),  # type: ignore[union-attr]
            Consumable.storage_location.ilike(pat),  # type: ignore[union-attr]
        ))
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    items = session.exec(q.order_by(Consumable.name).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [_out(c) for c in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_consumable(body: ConsumableCreate, session: SessionDep, _: AdminUser) -> ConsumableOut:
    now = datetime.now(tz=timezone.utc)
    c = Consumable(
        name=body.name.strip(),
        code=body.code or None,
        storage_type=body.storage_type or None,
        storage_location=body.storage_location or None,
        supplier_name=body.supplier_name or None,
        rate_per_unit=body.rate_per_unit,
        qty=body.qty,
        image_base64=body.image_base64,
        created_at=now,
        updated_at=now,
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return _out(c)


@router.get("/{item_id}")
def get_consumable(item_id: int, session: SessionDep, _: CurrentUser) -> ConsumableOut:
    c = session.get(Consumable, item_id)
    if not c:
        raise HTTPException(status_code=404, detail="Consumable not found")
    return _out(c)


@router.put("/{item_id}")
def update_consumable(item_id: int, body: ConsumableUpdate, session: SessionDep, _: AdminUser) -> ConsumableOut:
    c = session.get(Consumable, item_id)
    if not c:
        raise HTTPException(status_code=404, detail="Consumable not found")
    if body.name is not None:
        c.name = body.name.strip()
    if body.code is not None:
        c.code = body.code or None
    if body.storage_type is not None:
        c.storage_type = body.storage_type or None
    if body.storage_location is not None:
        c.storage_location = body.storage_location or None
    if body.supplier_name is not None:
        c.supplier_name = body.supplier_name or None
    if body.rate_per_unit is not None:
        c.rate_per_unit = body.rate_per_unit
    if body.qty is not None:
        c.qty = body.qty
    if body.image_base64 is not None:
        c.image_base64 = body.image_base64 or None
    if body.is_active is not None:
        c.is_active = body.is_active
    c.updated_at = datetime.now(tz=timezone.utc)
    session.add(c)
    session.commit()
    session.refresh(c)
    return _out(c)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_consumable(item_id: int, session: SessionDep, _: AdminUser) -> None:
    c = session.get(Consumable, item_id)
    if not c:
        raise HTTPException(status_code=404, detail="Consumable not found")
    c.is_active = False
    c.updated_at = datetime.now(tz=timezone.utc)
    session.add(c)
    session.commit()


@router.post("/{item_id}/adjust")
def adjust_consumable_stock(
    item_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> ConsumableOut:
    c = session.get(Consumable, item_id)
    if not c:
        raise HTTPException(status_code=404, detail="Consumable not found")
    qty_before = c.qty
    if body.adjustment_type == "add":
        c.qty += body.quantity
    elif body.adjustment_type == "subtract":
        c.qty = max(0.0, c.qty - body.quantity)
    elif body.adjustment_type == "set":
        c.qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    qty_after = c.qty
    c.updated_at = datetime.now(tz=timezone.utc)
    session.add(c)
    hist = ConsumableHistory(
        consumable_id=item_id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=c.updated_at,
        change_type=body.adjustment_type,
        qty_before=qty_before,
        qty_after=qty_after,
        qty_delta=qty_after - qty_before,
        note=body.note or None,
    )
    session.add(hist)
    session.commit()
    session.refresh(c)
    return _out(c)


@router.get("/{item_id}/history")
def get_consumable_history(
    item_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[HistoryOut]:
    c = session.get(Consumable, item_id)
    if not c:
        raise HTTPException(status_code=404, detail="Consumable not found")
    rows = session.exec(
        select(ConsumableHistory)
        .where(ConsumableHistory.consumable_id == item_id)
        .order_by(ConsumableHistory.changed_at.desc())  # type: ignore[union-attr]
        .limit(limit)
    ).all()
    def _dt(d: datetime) -> str:
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    return [
        HistoryOut(
            id=r.id,  # type: ignore[arg-type]
            consumable_id=r.consumable_id,
            changed_by_username=r.changed_by_username,
            changed_at=_dt(r.changed_at),
            change_type=r.change_type,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
            note=r.note,
        )
        for r in rows
    ]
