from datetime import datetime, timezone
from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, text
from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.unit import Unit
from app.models.user import User

router = APIRouter(prefix="/api/v1/units", tags=["units"])

REFERENCING_COLUMNS = [
    ("inventory_item", "unit_id"),
    ("inventory_item", "weight_unit_id"),
    ("bom_item", "material_unit_id"),
    ("grn_item", "unit_id"),
    ("dispatch_item", "unit_id"),
    ("dispatch", "unit_id"),
    ("gate_pass", "unit_id"),
    ("gate_pass_item", "unit_id"),
    ("purchase_order_item", "unit_id"),
    ("receipt_item", "unit_id"),
    ("supplier_materials", "unit_id"),
    ("supplier_jobs", "unit_id"),
    ("spare_item", "unit_id"),
    ("production_process", "material_unit_id"),
]

class UnitCreate(BaseModel):
    name: str

class UnitRename(BaseModel):
    name: str

class UnitResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UsageCountResponse(BaseModel):
    total: int
    by_table: dict[str, int]


@router.get("", response_model=list[UnitResponse])
def list_units(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    include_inactive: bool = False,
):
    q = select(Unit)
    if not include_inactive and current_user.role not in ("admin", "super_admin"):
        q = q.where(Unit.is_active == True)
    return session.exec(q.order_by(Unit.name)).all()


@router.post("", response_model=UnitResponse, status_code=201)
def create_unit(
    body: UnitCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="Unit name is required")
    existing = session.exec(select(Unit).where(Unit.name == name)).first()
    if existing:
        raise HTTPException(409, detail="Unit already exists")
    unit = Unit(name=name)
    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit


@router.put("/{unit_id}", response_model=UnitResponse)
def rename_unit(
    unit_id: int,
    body: UnitRename,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, detail="Unit name is required")
    existing = session.exec(select(Unit).where(Unit.name == name, Unit.id != unit_id)).first()
    if existing:
        raise HTTPException(409, detail="Unit name already taken")
    unit.name = name
    session.add(unit)
    session.commit()
    session.refresh(unit)
    return unit


@router.get("/{unit_id}/usage-count", response_model=UsageCountResponse)
def get_unit_usage_count(
    unit_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    by_table: dict[str, int] = {}
    total = 0
    for table, column in REFERENCING_COLUMNS:
        count = session.scalar(text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :uid"), {"uid": unit_id}) or 0
        if count > 0:
            by_table[f"{table}.{column}"] = count
            total += count
    return UsageCountResponse(total=total, by_table=by_table)


@router.delete("/{unit_id}", status_code=204)
def delete_unit(
    unit_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
):
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(404, detail="Unit not found")
    total = 0
    for table, column in REFERENCING_COLUMNS:
        count = session.scalar(text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :uid"), {"uid": unit_id}) or 0
        if count > 0:
            total += count
    if total > 0:
        raise HTTPException(409, detail={"message": "Unit is in use and cannot be deleted", "total": total})
    session.delete(unit)
    session.commit()
