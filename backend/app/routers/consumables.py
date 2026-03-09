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
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.consumable import Consumable
from app.models.user import User

router = APIRouter(prefix="/api/v1/consumables", tags=["consumables"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser   = Annotated[User, Depends(require_admin)]


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConsumableCreate(BaseModel):
    name: str
    code: Optional[str] = None
    storage_location: Optional[str] = None
    supplier_name: Optional[str] = None
    rate_per_unit: Optional[float] = None
    image_base64: Optional[str] = None


class ConsumableUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    storage_location: Optional[str] = None
    supplier_name: Optional[str] = None
    rate_per_unit: Optional[float] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None


class ConsumableOut(BaseModel):
    id: int
    name: str
    code: Optional[str]
    storage_location: Optional[str]
    supplier_name: Optional[str]
    rate_per_unit: Optional[float]
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
        storage_location=c.storage_location,
        supplier_name=c.supplier_name,
        rate_per_unit=c.rate_per_unit,
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
        q = q.where(
            (Consumable.name.ilike(pat)) |  # type: ignore[union-attr]
            (Consumable.code.ilike(pat)) |  # type: ignore[union-attr]
            (Consumable.supplier_name.ilike(pat))  # type: ignore[union-attr]
        )
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
        storage_location=body.storage_location or None,
        supplier_name=body.supplier_name or None,
        rate_per_unit=body.rate_per_unit,
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
    if body.storage_location is not None:
        c.storage_location = body.storage_location or None
    if body.supplier_name is not None:
        c.supplier_name = body.supplier_name or None
    if body.rate_per_unit is not None:
        c.rate_per_unit = body.rate_per_unit
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
