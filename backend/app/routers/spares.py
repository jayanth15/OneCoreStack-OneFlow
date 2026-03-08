"""Spares router — hierarchical spare parts management.

Structure:
  SpareCategory  (e.g. "Engines", "Filters", "Belts")
    └── SpareItem  (e.g. "68cc baby - 2 stroke weeder", "168 Engine")

Endpoints:
  Categories:
    GET    /api/v1/spares/categories
    POST   /api/v1/spares/categories
    GET    /api/v1/spares/categories/{cat_id}
    PUT    /api/v1/spares/categories/{cat_id}
    DELETE /api/v1/spares/categories/{cat_id}

  Items within a category:
    GET    /api/v1/spares/categories/{cat_id}/items
    POST   /api/v1/spares/categories/{cat_id}/items

  Individual items:
    GET    /api/v1/spares/items/{item_id}
    PUT    /api/v1/spares/items/{item_id}
    DELETE /api/v1/spares/items/{item_id}
    POST   /api/v1/spares/items/{item_id}/adjust
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.user import User

router = APIRouter(prefix="/api/v1/spares", tags=["spares"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(is_admin_or_above)]


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class CategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    item_count: int = 0
    low_stock_count: int = 0
    created_at: str
    updated_at: str


class ItemCreate(BaseModel):
    name: str
    part_number: Optional[str] = None
    description: Optional[str] = None
    quantity_on_hand: float = 0.0
    unit: str = "pcs"
    reorder_level: float = 0.0
    storage_location: Optional[str] = None
    notes: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    part_number: Optional[str] = None
    description: Optional[str] = None
    quantity_on_hand: Optional[float] = None
    unit: Optional[str] = None
    reorder_level: Optional[float] = None
    storage_location: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class ItemOut(BaseModel):
    id: int
    category_id: int
    name: str
    part_number: Optional[str]
    description: Optional[str]
    quantity_on_hand: float
    unit: str
    reorder_level: float
    storage_location: Optional[str]
    notes: Optional[str]
    is_active: bool
    updated_at: str

class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cat_or_404(session: Session, cat_id: int) -> SpareCategory:
    cat = session.get(SpareCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat

def _item_or_404(session: Session, item_id: int) -> SpareItem:
    item = session.get(SpareItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Spare item not found")
    return item

def _category_out(session: Session, cat: SpareCategory) -> CategoryOut:
    total = session.exec(
        select(func.count(SpareItem.id)).where(SpareItem.category_id == cat.id, SpareItem.is_active == True)
    ).one()
    low = session.exec(
        select(func.count(SpareItem.id)).where(
            SpareItem.category_id == cat.id,
            SpareItem.is_active == True,
            SpareItem.reorder_level > 0,
            SpareItem.quantity_on_hand <= SpareItem.reorder_level,
        )
    ).one()
    return CategoryOut(
        id=cat.id,  # type: ignore
        name=cat.name,
        description=cat.description,
        is_active=cat.is_active,
        item_count=total or 0,
        low_stock_count=low or 0,
        created_at=cat.created_at.isoformat(),
        updated_at=cat.updated_at.isoformat(),
    )

def _item_out(item: SpareItem) -> ItemOut:
    return ItemOut(
        id=item.id,  # type: ignore
        category_id=item.category_id,
        name=item.name,
        part_number=item.part_number,
        description=item.description,
        quantity_on_hand=item.quantity_on_hand,
        unit=item.unit,
        reorder_level=item.reorder_level,
        storage_location=item.storage_location,
        notes=item.notes,
        is_active=item.is_active,
        updated_at=item.updated_at.isoformat(),
    )


# ── Category endpoints ────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
) -> list[CategoryOut]:
    stmt = select(SpareCategory)
    if not include_inactive:
        stmt = stmt.where(SpareCategory.is_active == True)
    if search:
        stmt = stmt.where(SpareCategory.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(SpareCategory.name)
    cats = session.exec(stmt).all()
    return [_category_out(session, c) for c in cats]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(
    body: CategoryCreate,
    session: SessionDep,
    _: AdminUser,
) -> CategoryOut:
    cat = SpareCategory(
        name=body.name.strip(),
        description=body.description,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return _category_out(session, cat)


@router.get("/categories/{cat_id}")
def get_category(cat_id: int, session: SessionDep, _: CurrentUser) -> CategoryOut:
    cat = _cat_or_404(session, cat_id)
    return _category_out(session, cat)


@router.put("/categories/{cat_id}")
def update_category(
    cat_id: int,
    body: CategoryUpdate,
    session: SessionDep,
    _: AdminUser,
) -> CategoryOut:
    cat = _cat_or_404(session, cat_id)
    if body.name is not None:
        cat.name = body.name.strip()
    if body.description is not None:
        cat.description = body.description
    if body.is_active is not None:
        cat.is_active = body.is_active
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return _category_out(session, cat)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: int, session: SessionDep, _: AdminUser) -> None:
    cat = _cat_or_404(session, cat_id)
    cat.is_active = False
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat)
    session.commit()


# ── Item endpoints (within category) ─────────────────────────────────────────

@router.get("/categories/{cat_id}/items")
def list_items(
    cat_id: int,
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
) -> list[ItemOut]:
    _cat_or_404(session, cat_id)
    stmt = select(SpareItem).where(SpareItem.category_id == cat_id)
    if not include_inactive:
        stmt = stmt.where(SpareItem.is_active == True)
    if search:
        stmt = stmt.where(
            SpareItem.name.ilike(f"%{search}%") | SpareItem.part_number.ilike(f"%{search}%")
        )
    stmt = stmt.order_by(SpareItem.name)
    return [_item_out(i) for i in session.exec(stmt).all()]


@router.post("/categories/{cat_id}/items", status_code=status.HTTP_201_CREATED)
def create_item(
    cat_id: int,
    body: ItemCreate,
    session: SessionDep,
    _: AdminUser,
) -> ItemOut:
    _cat_or_404(session, cat_id)
    item = SpareItem(
        category_id=cat_id,
        name=body.name.strip(),
        part_number=body.part_number,
        description=body.description,
        quantity_on_hand=body.quantity_on_hand,
        unit=body.unit,
        reorder_level=body.reorder_level,
        storage_location=body.storage_location,
        notes=body.notes,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_out(item)


# ── Individual item endpoints ─────────────────────────────────────────────────

@router.get("/items/{item_id}")
def get_item(item_id: int, session: SessionDep, _: CurrentUser) -> ItemOut:
    return _item_out(_item_or_404(session, item_id))


@router.put("/items/{item_id}")
def update_item(
    item_id: int,
    body: ItemUpdate,
    session: SessionDep,
    _: AdminUser,
) -> ItemOut:
    item = _item_or_404(session, item_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_out(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, session: SessionDep, _: AdminUser) -> None:
    item = _item_or_404(session, item_id)
    item.is_active = False
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item)
    session.commit()


@router.post("/items/{item_id}/adjust")
def adjust_item_stock(
    item_id: int,
    body: AdjustRequest,
    session: SessionDep,
    _: CurrentUser,
) -> ItemOut:
    item = _item_or_404(session, item_id)
    if body.adjustment_type == "add":
        item.quantity_on_hand += body.quantity
    elif body.adjustment_type == "subtract":
        item.quantity_on_hand = max(0.0, item.quantity_on_hand - body.quantity)
    elif body.adjustment_type == "set":
        item.quantity_on_hand = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add | subtract | set")
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_out(item)
