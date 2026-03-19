"""Spares router — 3-level hierarchy.

  SpareCategory      (e.g. "2-Wheeler Spares")
    └── SpareSubCategory  (e.g. "168cc Vehicle", "68cc Weeder")
          └── SpareItem   (e.g. "Brake Wire", "Chain", "Air Filter")

Category endpoints:
  GET    /api/v1/spares/categories
  POST   /api/v1/spares/categories
  GET    /api/v1/spares/categories/{cat_id}
  PUT    /api/v1/spares/categories/{cat_id}
  DELETE /api/v1/spares/categories/{cat_id}

Sub-category endpoints:
  GET    /api/v1/spares/categories/{cat_id}/sub-categories
  POST   /api/v1/spares/categories/{cat_id}/sub-categories
  GET    /api/v1/spares/sub-categories/{sub_id}
  PUT    /api/v1/spares/sub-categories/{sub_id}
  DELETE /api/v1/spares/sub-categories/{sub_id}

Item endpoints (within a sub-category):
  GET    /api/v1/spares/sub-categories/{sub_id}/items
  POST   /api/v1/spares/sub-categories/{sub_id}/items
  GET    /api/v1/spares/items/{item_id}
  PUT    /api/v1/spares/items/{item_id}
  DELETE /api/v1/spares/items/{item_id}
  POST   /api/v1/spares/items/{item_id}/adjust
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.spare_category import SpareCategory
from app.models.spare_sub_category import SpareSubCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_history import SpareItemHistory
from app.models.spare_item_variant import SpareItemVariant
from app.models.user import User

router = APIRouter(prefix="/api/v1/spares", tags=["spares"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser   = Annotated[User, Depends(require_admin)]


# ── Schemas ───────────────────────────────────────────────────────────────────

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
    sub_category_count: int = 0
    item_count: int = 0
    low_stock_count: int = 0
    total_value: Optional[float] = None
    created_at: str
    updated_at: str

# ─────────────────────────────────────────────────────────────────────────────

class SubCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image_base64: Optional[str] = None

class SubCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None

class SubCategoryOut(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str]
    image_base64: Optional[str]
    is_active: bool
    item_count: int = 0
    low_stock_count: int = 0
    total_value: Optional[float] = None
    created_at: str
    updated_at: str

# ─────────────────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name: str
    part_number: Optional[str] = None
    part_description: Optional[str] = None
    variant_model: Optional[str] = None
    rate: Optional[float] = None
    unit: str = "pcs"
    opening_qty: float = 0.0
    recorded_qty: float = 0.0
    reorder_level: float = 0.0
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    image_base64: Optional[str] = None

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    part_number: Optional[str] = None
    part_description: Optional[str] = None
    variant_model: Optional[str] = None
    rate: Optional[float] = None
    unit: Optional[str] = None
    opening_qty: Optional[float] = None
    recorded_qty: Optional[float] = None
    reorder_level: Optional[float] = None
    storage_type: Optional[str] = None
    storage_location: Optional[str] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None

class ItemOut(BaseModel):
    id: int
    category_id: int
    sub_category_id: Optional[int]
    name: str
    part_number: Optional[str]
    part_description: Optional[str]
    variant_model: Optional[str]
    rate: Optional[float]
    unit: str
    opening_qty: float
    recorded_qty: float
    reorder_level: float
    storage_type: Optional[str]
    storage_location: Optional[str]
    total_value: Optional[float] = None
    image_base64: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str

class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


class ItemHistoryOut(BaseModel):
    id: int
    spare_item_id: int
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    qty_before: float
    qty_after: float
    qty_delta: float
    note: Optional[str]


class VariantCreate(BaseModel):
    serial_number: Optional[str] = None
    variant_color: Optional[str] = None
    image_base64: Optional[str] = None
    qty: float = 0.0
    storage_location: Optional[str] = None
    storage_type: Optional[str] = None
    rate: Optional[float] = None


class VariantUpdate(BaseModel):
    serial_number: Optional[str] = None
    variant_color: Optional[str] = None
    image_base64: Optional[str] = None
    qty: Optional[float] = None
    storage_location: Optional[str] = None
    storage_type: Optional[str] = None
    rate: Optional[float] = None
    is_active: Optional[bool] = None


class VariantOut(BaseModel):
    id: int
    spare_item_id: int
    serial_number: Optional[str]
    variant_color: Optional[str]
    image_base64: Optional[str]
    qty: float
    storage_location: Optional[str]
    storage_type: Optional[str]
    rate: Optional[float]
    is_active: bool
    created_at: str
    updated_at: str


class SearchItemOut(BaseModel):
    """Flat result for global search across all spares."""
    item_id: int
    item_name: str
    part_number: Optional[str]
    category_id: int
    category_name: str
    sub_category_id: Optional[int]
    sub_category_name: Optional[str]
    recorded_qty: float
    reorder_level: float
    unit: str
    is_low: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cat_or_404(session: Session, cat_id: int) -> SpareCategory:
    obj = session.get(SpareCategory, cat_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Category not found")
    return obj

def _sub_or_404(session: Session, sub_id: int) -> SpareSubCategory:
    obj = session.get(SpareSubCategory, sub_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Sub-category not found")
    return obj

def _item_or_404(session: Session, item_id: int) -> SpareItem:
    obj = session.get(SpareItem, item_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Spare item not found")
    return obj

def _dt_iso(val: "datetime | None") -> str:
    if val is None:
        return datetime.now(tz=timezone.utc).isoformat()
    if isinstance(val, str):
        return val
    return val.isoformat()

def _category_out(session: Session, cat: SpareCategory) -> CategoryOut:
    sub_count = session.exec(
        select(func.count(SpareSubCategory.id)).where(
            SpareSubCategory.category_id == cat.id,
            SpareSubCategory.is_active == True,
        )
    ).one()
    total = session.exec(
        select(func.count(SpareItem.id)).where(
            SpareItem.category_id == cat.id, SpareItem.is_active == True,
        )
    ).one()
    low = session.exec(
        select(func.count(SpareItem.id)).where(
            SpareItem.category_id == cat.id,
            SpareItem.is_active == True,
            SpareItem.reorder_level > 0,
            SpareItem.recorded_qty <= SpareItem.reorder_level,
        )
    ).one()
    cat_val = session.exec(
        select(func.sum(SpareItem.rate * SpareItem.recorded_qty)).where(
            SpareItem.category_id == cat.id, SpareItem.is_active == True,
        )
    ).one()
    return CategoryOut(
        id=cat.id,  # type: ignore
        name=cat.name,
        description=cat.description,
        is_active=cat.is_active,
        sub_category_count=sub_count or 0,
        item_count=total or 0,
        low_stock_count=low or 0,
        total_value=round(cat_val, 2) if cat_val is not None else None,
        created_at=_dt_iso(cat.created_at),
        updated_at=_dt_iso(cat.updated_at),
    )

def _sub_out(session: Session, sub: SpareSubCategory) -> SubCategoryOut:
    total = session.exec(
        select(func.count(SpareItem.id)).where(
            SpareItem.sub_category_id == sub.id, SpareItem.is_active == True,
        )
    ).one()
    low = session.exec(
        select(func.count(SpareItem.id)).where(
            SpareItem.sub_category_id == sub.id,
            SpareItem.is_active == True,
            SpareItem.reorder_level > 0,
            SpareItem.recorded_qty <= SpareItem.reorder_level,
        )
    ).one()
    sub_val = session.exec(
        select(func.sum(SpareItem.rate * SpareItem.recorded_qty)).where(
            SpareItem.sub_category_id == sub.id, SpareItem.is_active == True,
        )
    ).one()
    return SubCategoryOut(
        id=sub.id,  # type: ignore
        category_id=sub.category_id,
        name=sub.name,
        description=sub.description,
        image_base64=sub.image_base64,
        is_active=sub.is_active,
        item_count=total or 0,
        low_stock_count=low or 0,
        total_value=round(sub_val, 2) if sub_val is not None else None,
        created_at=_dt_iso(sub.created_at),
        updated_at=_dt_iso(sub.updated_at),
    )

def _item_out(item: SpareItem) -> ItemOut:
    tv = round(item.rate * item.recorded_qty, 2) if item.rate is not None else None
    return ItemOut(
        id=item.id,  # type: ignore
        category_id=item.category_id,
        sub_category_id=item.sub_category_id,
        name=item.name,
        part_number=item.part_number,
        part_description=item.part_description,
        variant_model=item.variant_model,
        rate=item.rate,
        unit=item.unit,
        opening_qty=item.opening_qty,
        recorded_qty=item.recorded_qty,
        reorder_level=item.reorder_level,
        storage_type=item.storage_type,
        storage_location=item.storage_location,
        total_value=tv,
        image_base64=item.image_base64,
        is_active=item.is_active,
        created_at=_dt_iso(item.created_at),
        updated_at=_dt_iso(item.updated_at),
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
        pat = f"%{search}%"
        stmt = stmt.where(or_(
            SpareCategory.name.ilike(pat),
            SpareCategory.id.in_(  # type: ignore[union-attr]
                select(SpareSubCategory.category_id).where(SpareSubCategory.name.ilike(pat))
            ),
            SpareCategory.id.in_(  # type: ignore[union-attr]
                select(SpareItem.category_id).where(SpareItem.name.ilike(pat))
            ),
        ))
    stmt = stmt.order_by(SpareCategory.name)
    return [_category_out(session, c) for c in session.exec(stmt).all()]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, session: SessionDep, _: AdminUser) -> CategoryOut:
    cat = SpareCategory(name=body.name.strip(), description=body.description)
    session.add(cat); session.commit(); session.refresh(cat)
    return _category_out(session, cat)


@router.get("/categories/{cat_id}")
def get_category(cat_id: int, session: SessionDep, _: CurrentUser) -> CategoryOut:
    return _category_out(session, _cat_or_404(session, cat_id))


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: CategoryUpdate, session: SessionDep, _: AdminUser) -> CategoryOut:
    cat = _cat_or_404(session, cat_id)
    if body.name is not None: cat.name = body.name.strip()
    if body.description is not None: cat.description = body.description
    if body.is_active is not None: cat.is_active = body.is_active
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat); session.commit(); session.refresh(cat)
    return _category_out(session, cat)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: int, session: SessionDep, _: AdminUser) -> None:
    cat = _cat_or_404(session, cat_id)
    cat.is_active = False
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat); session.commit()


# ── Sub-category endpoints ────────────────────────────────────────────────────

@router.get("/categories/{cat_id}/sub-categories")
def list_sub_categories(
    cat_id: int,
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
) -> list[SubCategoryOut]:
    _cat_or_404(session, cat_id)
    stmt = select(SpareSubCategory).where(SpareSubCategory.category_id == cat_id)
    if not include_inactive:
        stmt = stmt.where(SpareSubCategory.is_active == True)
    if search:
        stmt = stmt.where(SpareSubCategory.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(SpareSubCategory.name)
    return [_sub_out(session, s) for s in session.exec(stmt).all()]


@router.post("/categories/{cat_id}/sub-categories", status_code=status.HTTP_201_CREATED)
def create_sub_category(
    cat_id: int, body: SubCategoryCreate, session: SessionDep, _: AdminUser,
) -> SubCategoryOut:
    _cat_or_404(session, cat_id)
    sub = SpareSubCategory(
        category_id=cat_id,
        name=body.name.strip(),
        description=body.description,
        image_base64=body.image_base64,
    )
    session.add(sub); session.commit(); session.refresh(sub)
    return _sub_out(session, sub)


@router.get("/sub-categories/{sub_id}")
def get_sub_category(sub_id: int, session: SessionDep, _: CurrentUser) -> SubCategoryOut:
    return _sub_out(session, _sub_or_404(session, sub_id))


@router.put("/sub-categories/{sub_id}")
def update_sub_category(
    sub_id: int, body: SubCategoryUpdate, session: SessionDep, _: AdminUser,
) -> SubCategoryOut:
    sub = _sub_or_404(session, sub_id)
    if body.name is not None: sub.name = body.name.strip()
    if body.description is not None: sub.description = body.description
    if body.image_base64 is not None: sub.image_base64 = body.image_base64
    if body.is_active is not None: sub.is_active = body.is_active
    sub.updated_at = datetime.now(tz=timezone.utc)
    session.add(sub); session.commit(); session.refresh(sub)
    return _sub_out(session, sub)


@router.delete("/sub-categories/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sub_category(sub_id: int, session: SessionDep, _: AdminUser) -> None:
    sub = _sub_or_404(session, sub_id)
    sub.is_active = False
    sub.updated_at = datetime.now(tz=timezone.utc)
    session.add(sub); session.commit()


# ── Item endpoints (within a sub-category) ───────────────────────────────────

@router.get("/sub-categories/{sub_id}/items")
def list_items(
    sub_id: int,
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
) -> list[ItemOut]:
    sub = _sub_or_404(session, sub_id)
    stmt = select(SpareItem).where(SpareItem.sub_category_id == sub_id)
    if not include_inactive:
        stmt = stmt.where(SpareItem.is_active == True)
    if search:
        stmt = stmt.where(
            SpareItem.name.ilike(f"%{search}%") | SpareItem.part_number.ilike(f"%{search}%")
        )
    stmt = stmt.order_by(SpareItem.name)
    return [_item_out(i) for i in session.exec(stmt).all()]


@router.post("/sub-categories/{sub_id}/items", status_code=status.HTTP_201_CREATED)
def create_item(
    sub_id: int, body: ItemCreate, session: SessionDep, _: AdminUser,
) -> ItemOut:
    sub = _sub_or_404(session, sub_id)
    item = SpareItem(
        category_id=sub.category_id,
        sub_category_id=sub_id,
        name=body.name.strip(),
        part_number=body.part_number,
        part_description=body.part_description,
        variant_model=body.variant_model,
        rate=body.rate,
        unit=body.unit,
        opening_qty=body.opening_qty,
        recorded_qty=body.recorded_qty if body.recorded_qty else body.opening_qty,
        reorder_level=body.reorder_level,
        storage_type=body.storage_type,
        storage_location=body.storage_location,
        image_base64=body.image_base64,
    )
    session.add(item); session.commit(); session.refresh(item)
    return _item_out(item)


# ── Individual item endpoints ─────────────────────────────────────────────────

@router.get("/items/{item_id}")
def get_item(item_id: int, session: SessionDep, _: CurrentUser) -> ItemOut:
    return _item_out(_item_or_404(session, item_id))


@router.put("/items/{item_id}")
def update_item(item_id: int, body: ItemUpdate, session: SessionDep, _: AdminUser) -> ItemOut:
    item = _item_or_404(session, item_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item); session.commit(); session.refresh(item)
    return _item_out(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, session: SessionDep, _: AdminUser) -> None:
    item = _item_or_404(session, item_id)
    item.is_active = False
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item); session.commit()


@router.post("/items/{item_id}/adjust")
def adjust_item_stock(
    item_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> ItemOut:
    item = _item_or_404(session, item_id)
    qty_before = item.recorded_qty
    if body.adjustment_type == "add":
        item.recorded_qty += body.quantity
    elif body.adjustment_type == "subtract":
        item.recorded_qty = max(0.0, item.recorded_qty - body.quantity)
    elif body.adjustment_type == "set":
        item.recorded_qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    qty_after = item.recorded_qty
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item)
    hist = SpareItemHistory(
        spare_item_id=item_id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=item.updated_at,
        change_type=body.adjustment_type,
        qty_before=qty_before,
        qty_after=qty_after,
        qty_delta=qty_after - qty_before,
        note=body.note or None,
    )
    session.add(hist)
    session.commit(); session.refresh(item)
    return _item_out(item)


@router.get("/items/{item_id}/history")
def get_item_history(
    item_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ItemHistoryOut]:
    _item_or_404(session, item_id)
    rows = session.exec(
        select(SpareItemHistory)
        .where(SpareItemHistory.spare_item_id == item_id)
        .order_by(SpareItemHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all()
    def _dt(d: datetime) -> str:
        if isinstance(d, str): return d
        if d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    return [
        ItemHistoryOut(
            id=r.id,  # type: ignore[arg-type]
            spare_item_id=r.spare_item_id,
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


# ── Variant endpoints ─────────────────────────────────────────────────────────

def _sync_item_from_variants(session: Session, item: SpareItem) -> None:
    """Recompute item.recorded_qty and item.rate from its active variants.

    This keeps the aggregation columns (used by _category_out / _sub_out) accurate
    whenever variants are added, updated, or removed.
    """
    rows = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == item.id,
            SpareItemVariant.is_active == True,  # noqa: E712
        )
    ).all()
    if not rows:
        return  # no active variants — leave item fields as-is
    total_qty = sum(v.qty for v in rows)
    # total value = sum of (qty × rate) for variants that have a rate
    total_val = sum(v.qty * v.rate for v in rows if v.rate is not None)
    # Store effective rate so that rate × recorded_qty == total_val (exact)
    eff_rate = round(total_val / total_qty, 4) if total_qty > 0 and total_val > 0 else None
    item.recorded_qty = total_qty
    item.rate = eff_rate
    item.updated_at = datetime.now(tz=timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)


def _variant_out(v: SpareItemVariant) -> VariantOut:
    def _dt(d: "datetime | str | None") -> str:
        if d is None: return datetime.now(tz=timezone.utc).isoformat()
        if isinstance(d, str): return d
        if d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
        return d.isoformat()
    return VariantOut(
        id=v.id,  # type: ignore[arg-type]
        spare_item_id=v.spare_item_id,
        serial_number=v.serial_number,
        variant_color=v.variant_color,
        image_base64=v.image_base64,
        qty=v.qty,
        storage_location=v.storage_location,
        storage_type=v.storage_type,
        rate=v.rate,
        is_active=v.is_active,
        created_at=_dt(v.created_at),
        updated_at=_dt(v.updated_at),
    )


@router.get("/items/{item_id}/variants")
def list_variants(
    item_id: int, session: SessionDep, _: CurrentUser,
    include_inactive: bool = Query(False),
) -> list[VariantOut]:
    _item_or_404(session, item_id)
    stmt = select(SpareItemVariant).where(SpareItemVariant.spare_item_id == item_id)
    if not include_inactive:
        stmt = stmt.where(SpareItemVariant.is_active == True)  # noqa: E712
    return [_variant_out(v) for v in session.exec(stmt).all()]


@router.post("/items/{item_id}/variants", status_code=status.HTTP_201_CREATED)
def create_variant(
    item_id: int, body: VariantCreate, session: SessionDep, _: AdminUser,
) -> VariantOut:
    item = _item_or_404(session, item_id)
    now = datetime.now(tz=timezone.utc)
    v = SpareItemVariant(
        spare_item_id=item_id,
        serial_number=body.serial_number,
        variant_color=body.variant_color,
        image_base64=body.image_base64,
        qty=body.qty,
        storage_location=body.storage_location,
        storage_type=body.storage_type,
        rate=body.rate,
        created_at=now, updated_at=now,
    )
    session.add(v); session.commit(); session.refresh(v)
    _sync_item_from_variants(session, item)
    return _variant_out(v)


@router.put("/variants/{variant_id}")
def update_variant(
    variant_id: int, body: VariantUpdate, session: SessionDep, current_user: AdminUser,
) -> VariantOut:
    v = session.get(SpareItemVariant, variant_id)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found")
    parent_item_id = v.spare_item_id
    parent = _item_or_404(session, parent_item_id)
    qty_before = parent.recorded_qty
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(v, field, value)
    v.updated_at = datetime.now(tz=timezone.utc)
    session.add(v); session.commit(); session.refresh(v)
    _sync_item_from_variants(session, parent)
    qty_after = parent.recorded_qty
    if qty_after != qty_before:
        hist = SpareItemHistory(
            spare_item_id=parent_item_id,
            changed_by_user_id=current_user.id,  # type: ignore[arg-type]
            changed_by_username=current_user.username,
            changed_at=datetime.now(tz=timezone.utc),
            change_type="edit",
            qty_before=qty_before,
            qty_after=qty_after,
            qty_delta=qty_after - qty_before,
            note=None,
        )
        session.add(hist)
        session.commit()
    return _variant_out(v)


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant(variant_id: int, session: SessionDep, _: AdminUser) -> None:
    v = session.get(SpareItemVariant, variant_id)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found")
    parent_item_id = v.spare_item_id
    v.is_active = False
    session.add(v); session.commit()
    parent = _item_or_404(session, parent_item_id)
    _sync_item_from_variants(session, parent)


# ── Global search endpoint ────────────────────────────────────────────────────

@router.get("/search")
def search_all_items(
    session: SessionDep,
    _: CurrentUser,
    q: str = Query(""),
) -> list[SearchItemOut]:
    """Return spare items matching q across all categories/sub-categories."""
    if not q or not q.strip():
        return []
    pat = f"%{q.strip()}%"
    stmt = (
        select(SpareItem)
        .where(
            SpareItem.is_active == True,  # noqa: E712
            or_(
                SpareItem.name.ilike(pat),
                SpareItem.part_number.ilike(pat),
                SpareItem.part_description.ilike(pat),
            ),
        )
        .limit(50)
    )
    items = session.exec(stmt).all()
    results = []
    cat_cache: dict[int, SpareCategory] = {}
    sub_cache: dict[int, SpareSubCategory] = {}
    for item in items:
        if item.category_id not in cat_cache:
            cat = session.get(SpareCategory, item.category_id)
            if cat:
                cat_cache[item.category_id] = cat
        cat = cat_cache.get(item.category_id)
        sub = None
        if item.sub_category_id:
            if item.sub_category_id not in sub_cache:
                s = session.get(SpareSubCategory, item.sub_category_id)
                if s:
                    sub_cache[item.sub_category_id] = s
            sub = sub_cache.get(item.sub_category_id)
        results.append(SearchItemOut(
            item_id=item.id,  # type: ignore[arg-type]
            item_name=item.name,
            part_number=item.part_number,
            category_id=item.category_id,
            category_name=cat.name if cat else "Unknown",
            sub_category_id=item.sub_category_id,
            sub_category_name=sub.name if sub else None,
            recorded_qty=item.recorded_qty,
            reorder_level=item.reorder_level,
            unit=item.unit,
            is_low=item.reorder_level > 0 and item.recorded_qty <= item.reorder_level,
        ))
    return results
