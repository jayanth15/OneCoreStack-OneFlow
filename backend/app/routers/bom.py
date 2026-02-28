"""BOM (Bill of Materials) router.

Maps product names → raw material requirements.
product_name must match Schedule.description (and optionally a finished_good InventoryItem.name).
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.bom_item import BomItem
from app.models.inventory import InventoryItem
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/bom",
    tags=["bom"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────


class BomItemCreate(BaseModel):
    product_name: str
    raw_material_id: int
    qty_per_unit: float = 1.0
    notes: Optional[str] = None
    is_active: bool = True

    @field_validator("qty_per_unit")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("qty_per_unit must be > 0")
        return v


class BomItemUpdate(BaseModel):
    product_name: Optional[str] = None
    raw_material_id: Optional[int] = None
    qty_per_unit: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("qty_per_unit")
    @classmethod
    def positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("qty_per_unit must be > 0")
        return v


class BomItemResponse(BaseModel):
    id: int
    product_name: str
    raw_material_id: int
    raw_material_code: Optional[str] = None
    raw_material_name: Optional[str] = None
    raw_material_unit: Optional[str] = None
    qty_per_unit: float
    notes: Optional[str]
    is_active: bool

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[BomItemResponse])
def list_bom(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    product_name: Optional[str] = None,
    include_inactive: bool = False,
) -> list[dict]:
    q = select(BomItem)
    if not include_inactive:
        q = q.where(BomItem.is_active == True)  # noqa: E712
    if product_name:
        q = q.where(BomItem.product_name == product_name)
    entries = list(session.exec(q.order_by(BomItem.product_name)).all())

    result = []
    for b in entries:
        rm = session.get(InventoryItem, b.raw_material_id)
        result.append({
            **b.__dict__,
            "raw_material_code": rm.code if rm else None,
            "raw_material_name": rm.name if rm else None,
            "raw_material_unit": rm.unit if rm else None,
        })
    return result


@router.get("/products")
def list_products(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[str]:
    """Return distinct product names defined in the BOM."""
    entries = list(session.exec(
        select(BomItem.product_name).where(BomItem.is_active == True)  # noqa: E712
    ).all())
    return sorted(set(entries))


@router.post("", response_model=BomItemResponse, status_code=status.HTTP_201_CREATED)
def create_bom_item(
    body: BomItemCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict:
    # Validate raw material exists and is of type raw_material
    rm = session.get(InventoryItem, body.raw_material_id)
    if not rm:
        raise HTTPException(status_code=404, detail="Raw material item not found")
    if rm.item_type != "raw_material":
        raise HTTPException(status_code=400, detail="Referenced item is not a raw_material")

    bom = BomItem(
        product_name=body.product_name.strip(),
        raw_material_id=body.raw_material_id,
        qty_per_unit=body.qty_per_unit,
        notes=body.notes,
        is_active=body.is_active,
    )
    session.add(bom)
    session.commit()
    session.refresh(bom)
    return {
        **bom.__dict__,
        "raw_material_code": rm.code,
        "raw_material_name": rm.name,
        "raw_material_unit": rm.unit,
    }


@router.get("/{bom_id}", response_model=BomItemResponse)
def get_bom_item(
    bom_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> dict:
    bom = session.get(BomItem, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM entry not found")
    rm = session.get(InventoryItem, bom.raw_material_id)
    return {
        **bom.__dict__,
        "raw_material_code": rm.code if rm else None,
        "raw_material_name": rm.name if rm else None,
        "raw_material_unit": rm.unit if rm else None,
    }


@router.put("/{bom_id}", response_model=BomItemResponse)
def update_bom_item(
    bom_id: int,
    body: BomItemUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict:
    bom = session.get(BomItem, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM entry not found")

    if body.product_name is not None:
        bom.product_name = body.product_name.strip()
    if body.raw_material_id is not None:
        rm_check = session.get(InventoryItem, body.raw_material_id)
        if not rm_check:
            raise HTTPException(status_code=404, detail="Raw material item not found")
        if rm_check.item_type != "raw_material":
            raise HTTPException(status_code=400, detail="Referenced item is not a raw_material")
        bom.raw_material_id = body.raw_material_id
    if body.qty_per_unit is not None:
        bom.qty_per_unit = body.qty_per_unit
    if body.notes is not None:
        bom.notes = body.notes
    if body.is_active is not None:
        bom.is_active = body.is_active

    session.add(bom)
    session.commit()
    session.refresh(bom)
    rm = session.get(InventoryItem, bom.raw_material_id)
    return {
        **bom.__dict__,
        "raw_material_code": rm.code if rm else None,
        "raw_material_name": rm.name if rm else None,
        "raw_material_unit": rm.unit if rm else None,
    }


@router.delete("/{bom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom_item(
    bom_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    bom = session.get(BomItem, bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="BOM entry not found")
    session.delete(bom)
    session.commit()
