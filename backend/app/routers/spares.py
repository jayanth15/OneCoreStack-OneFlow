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
from app.core.timezone import APP_TZ, now
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.core.inventory_permissions import require_inventory_edit
from app.dependencies.auth import get_current_user, require_admin
from app.models.spare_category import SpareCategory
from app.models.spare_sub_category import SpareSubCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_history import SpareItemHistory
from app.models.spare_item_variant import SpareItemVariant
from app.models.unit import Unit
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
    created_at: Optional[str]
    updated_at: Optional[str]

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
    created_at: Optional[str]
    updated_at: Optional[str]

# ─────────────────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    name: str
    part_number: Optional[str] = None
    part_description: Optional[str] = None
    variant_model: Optional[str] = None
    rate: Optional[float] = None
    unit_id: Optional[int] = None
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
    unit_id: Optional[int] = None
    sub_category_id: Optional[int] = None
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
    unit_id: Optional[int] = None
    unit_name: Optional[str] = None
    opening_qty: float
    recorded_qty: float
    reorder_level: float
    storage_type: Optional[str]
    storage_location: Optional[str]
    total_value: Optional[float] = None
    image_base64: Optional[str]
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]
    variant_matched: bool = False  # True when found via variant search

class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


class ItemHistoryOut(BaseModel):
    id: int
    spare_item_id: int
    spare_item_variant_id: Optional[int] = None
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    qty_before: float
    qty_after: float
    qty_delta: float
    note: Optional[str]
    variant_label: Optional[str] = None  # e.g. "Red / SN-001" for variant-level changes


class VariantCreate(BaseModel):
    serial_number: Optional[str] = None
    variant_color: Optional[str] = None
    image_base64: Optional[str] = None
    qty: float = 0.0
    storage_location: Optional[str] = None
    storage_type: Optional[str] = None
    rate: Optional[float] = None
    timeline_days: Optional[int] = None
    reorder_level: float = 0.0


class VariantUpdate(BaseModel):
    serial_number: Optional[str] = None
    variant_color: Optional[str] = None
    image_base64: Optional[str] = None
    qty: Optional[float] = None
    storage_location: Optional[str] = None
    storage_type: Optional[str] = None
    rate: Optional[float] = None
    timeline_days: Optional[int] = None
    reorder_level: Optional[float] = None
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
    timeline_days: Optional[int]
    reorder_level: float
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]


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
    unit_id: Optional[int] = None
    unit_name: Optional[str] = None
    is_low: bool


class VariantSearchOut(BaseModel):
    """Flat result for variant search — used by the Create Request combobox."""
    variant_id: int
    serial_number: Optional[str]
    variant_color: Optional[str]
    image_base64: Optional[str]
    timeline_days: Optional[int]
    qty: float
    item_id: int
    item_name: str
    part_number: Optional[str]
    category_name: str
    sub_category_name: Optional[str]
    unit_id: Optional[int] = None
    unit_name: Optional[str] = None


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

def _dt_iso(val: "datetime | None") -> str | None:
    if val is None:
        return None
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
        select(func.sum(
            SpareItemVariant.qty * func.coalesce(SpareItemVariant.rate, SpareItem.rate, 0)
        )).select_from(SpareItemVariant).join(
            SpareItem, SpareItemVariant.spare_item_id == SpareItem.id
        ).where(
            SpareItem.category_id == cat.id,
            SpareItem.is_active == True,
            SpareItemVariant.is_active == True,
        )
    ).one()
    # Items with NO active variants hold stock directly on the item row
    # (manual/opening qty). Count them via recorded_qty × rate so category
    # totals match what the item rows display.
    cat_val_manual = session.exec(
        select(func.sum(SpareItem.recorded_qty * func.coalesce(SpareItem.rate, 0))).where(
            SpareItem.category_id == cat.id,
            SpareItem.is_active == True,
            ~SpareItem.id.in_(
                select(SpareItemVariant.spare_item_id).where(
                    SpareItemVariant.is_active == True,  # noqa: E712
                )
            ),
        )
    ).one()
    if cat_val is None and cat_val_manual is None:
        cat_val_total = None
    else:
        cat_val_total = round((cat_val or 0) + (cat_val_manual or 0), 2)
    return CategoryOut(
        id=cat.id,  # type: ignore
        name=cat.name,
        description=cat.description,
        is_active=cat.is_active,
        sub_category_count=sub_count or 0,
        item_count=total or 0,
        low_stock_count=low or 0,
        total_value=cat_val_total,
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
        select(func.sum(
            SpareItemVariant.qty * func.coalesce(SpareItemVariant.rate, SpareItem.rate, 0)
        )).select_from(SpareItemVariant).join(
            SpareItem, SpareItemVariant.spare_item_id == SpareItem.id
        ).where(
            SpareItem.sub_category_id == sub.id,
            SpareItem.is_active == True,
            SpareItemVariant.is_active == True,
        )
    ).one()
    # Variant-less items hold stock on the item row (recorded_qty × rate).
    sub_val_manual = session.exec(
        select(func.sum(SpareItem.recorded_qty * func.coalesce(SpareItem.rate, 0))).where(
            SpareItem.sub_category_id == sub.id,
            SpareItem.is_active == True,
            ~SpareItem.id.in_(
                select(SpareItemVariant.spare_item_id).where(
                    SpareItemVariant.is_active == True,  # noqa: E712
                )
            ),
        )
    ).one()
    if sub_val is None and sub_val_manual is None:
        sub_val_total = None
    else:
        sub_val_total = round((sub_val or 0) + (sub_val_manual or 0), 2)
    return SubCategoryOut(
        id=sub.id,  # type: ignore
        category_id=sub.category_id,
        name=sub.name,
        description=sub.description,
        image_base64=sub.image_base64,
        is_active=sub.is_active,
        item_count=total or 0,
        low_stock_count=low or 0,
        total_value=sub_val_total,
        created_at=_dt_iso(sub.created_at),
        updated_at=_dt_iso(sub.updated_at),
    )

def _has_active_variants(session: Session, item_id: int) -> bool:
    count = session.exec(
        select(func.count(SpareItemVariant.id)).where(
            SpareItemVariant.spare_item_id == item_id,
            SpareItemVariant.is_active == True,  # noqa: E712
        )
    ).one()
    return (count or 0) > 0


def _item_out(item: SpareItem, variant_matched: bool = False, has_variants: bool = True, session: Session | None = None) -> ItemOut:
    # Variant-less items hold stock directly on the row (manual/opening qty),
    # so show rate × recorded_qty. Item-with-variants value equals the variant
    # sum because _sync_item_from_variants keeps rate × recorded_qty == Σ qty×rate.
    tv = round(item.rate * item.recorded_qty, 2) if item.rate is not None else None
    unit_name = None
    if item.unit_id and session:
        u = session.get(Unit, item.unit_id)
        unit_name = u.name if u else None
    return ItemOut(
        id=item.id,  # type: ignore
        category_id=item.category_id,
        sub_category_id=item.sub_category_id,
        name=item.name,
        part_number=item.part_number,
        part_description=item.part_description,
        variant_model=item.variant_model,
        rate=item.rate,
        unit_id=item.unit_id,
        unit_name=unit_name,
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
        variant_matched=variant_matched,
    )


# ── Category endpoints ────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=500),
) -> dict:
    stmt = select(SpareCategory)
    if not include_inactive:
        stmt = stmt.where(SpareCategory.is_active == True)
    if search:
        pat = f"%{search}%"
        # Items that match via variant (serial_number or variant_color)
        variant_matching_item_ids = select(SpareItemVariant.spare_item_id).where(
            SpareItemVariant.is_active == True,  # noqa: E712
            or_(
                SpareItemVariant.serial_number.ilike(pat),
                SpareItemVariant.variant_color.ilike(pat),
            ),
        )
        stmt = stmt.where(or_(
            SpareCategory.name.ilike(pat),
            SpareCategory.id.in_(  # type: ignore[union-attr]
                select(SpareSubCategory.category_id).where(SpareSubCategory.name.ilike(pat))
            ),
            SpareCategory.id.in_(  # type: ignore[union-attr]
                select(SpareItem.category_id).where(
                    or_(
                        SpareItem.name.ilike(pat),
                        SpareItem.part_number.ilike(pat),
                        SpareItem.id.in_(variant_matching_item_ids),
                    )
                )
            ),
        ))
    stmt = stmt.order_by(SpareCategory.name)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    cats = session.exec(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [_category_out(session, c) for c in cats],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


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
    cat.updated_at = now()
    session.add(cat); session.commit(); session.refresh(cat)
    return _category_out(session, cat)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: int, session: SessionDep, _: AdminUser) -> None:
    cat = _cat_or_404(session, cat_id)
    cat.is_active = False
    cat.updated_at = now()
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
    sub.updated_at = now()
    session.add(sub); session.commit(); session.refresh(sub)
    return _sub_out(session, sub)


@router.delete("/sub-categories/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sub_category(sub_id: int, session: SessionDep, _: AdminUser) -> None:
    sub = _sub_or_404(session, sub_id)
    sub.is_active = False
    sub.updated_at = now()
    session.add(sub); session.commit()


# ── Item endpoints (within a sub-category) ───────────────────────────────────

@router.get("/sub-categories/{sub_id}/items")
def list_items(
    sub_id: int,
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(False),
    search: Optional[str] = Query(None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict:
    _sub_or_404(session, sub_id)
    stmt = select(SpareItem).where(SpareItem.sub_category_id == sub_id)
    if not include_inactive:
        stmt = stmt.where(SpareItem.is_active == True)  # noqa: E712

    # Collect IDs of items that have variants matching the search term
    variant_matched_ids: set[int] = set()
    if search:
        pat = f"%{search}%"
        v_ids = session.exec(
            select(SpareItemVariant.spare_item_id).where(
                SpareItemVariant.spare_item_id.in_(  # restrict to this sub-category
                    select(SpareItem.id).where(SpareItem.sub_category_id == sub_id)
                ),
                SpareItemVariant.is_active == True,  # noqa: E712
                or_(
                    SpareItemVariant.serial_number.ilike(pat),
                    SpareItemVariant.variant_color.ilike(pat),
                ),
            )
        ).all()
        variant_matched_ids = set(v_ids)
        stmt = stmt.where(
            or_(
                SpareItem.name.ilike(pat),
                SpareItem.part_number.ilike(pat),
                SpareItem.id.in_(variant_matched_ids) if variant_matched_ids else SpareItem.id == -1,
            )
        )
    stmt = stmt.order_by(SpareItem.name)
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    items = session.exec(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    # Determine variant_matched flag — True when NOT directly matched by name/part_number
    search_lower = (search or "").lower()
    def _is_variant_match(item: SpareItem) -> bool:
        if not search_lower or item.id not in variant_matched_ids:
            return False
        direct = search_lower in item.name.lower() or (
            item.part_number is not None and search_lower in item.part_number.lower()
        )
        return not direct

    # Batch-check which items have at least one active variant (single query)
    if items:
        item_ids_with_variants = set(session.exec(
            select(SpareItemVariant.spare_item_id).where(
                SpareItemVariant.spare_item_id.in_([i.id for i in items]),
                SpareItemVariant.is_active == True,  # noqa: E712
            )
        ).all())
    else:
        item_ids_with_variants = set()

    return {
        "items": [_item_out(i, variant_matched=_is_variant_match(i), has_variants=i.id in item_ids_with_variants, session=session) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


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
        unit_id=body.unit_id,
        opening_qty=body.opening_qty,
        recorded_qty=body.recorded_qty if body.recorded_qty else body.opening_qty,
        reorder_level=body.reorder_level,
        storage_type=body.storage_type,
        storage_location=body.storage_location,
        image_base64=body.image_base64,
    )
    session.add(item); session.commit(); session.refresh(item)
    return _item_out(item, has_variants=False, session=session)


# ── Individual item endpoints ─────────────────────────────────────────────────

@router.get("/items/{item_id}")
def get_item(item_id: int, session: SessionDep, _: CurrentUser) -> ItemOut:
    item = _item_or_404(session, item_id)
    return _item_out(item, has_variants=_has_active_variants(session, item.id), session=session)


@router.put("/items/{item_id}")
def update_item(item_id: int, body: ItemUpdate, session: SessionDep, _: AdminUser) -> ItemOut:
    item = _item_or_404(session, item_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    # Moving an item: re-anchor category + sub-category together so the tree
    # stays consistent regardless of which sub-category the client targets.
    if body.sub_category_id is not None:
        target = session.get(SpareSubCategory, body.sub_category_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target sub-category not found")
        item.sub_category_id = target.id
        item.category_id = target.category_id
    item.updated_at = now()
    session.add(item); session.commit(); session.refresh(item)
    return _item_out(item, has_variants=_has_active_variants(session, item.id), session=session)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, session: SessionDep, current_user: AdminUser) -> None:
    item = _item_or_404(session, item_id)
    qty_before = item.recorded_qty
    item.is_active = False
    item.recorded_qty = 0.0
    item.updated_at = now()
    session.add(item)
    # Deactivating must also clear the item's active variants; otherwise the
    # variant stock survives and resurfaces when the item is restored.
    for variant in session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == item.id,
            SpareItemVariant.is_active == True,  # noqa: E712
        )
    ).all():
        variant_qty = variant.qty
        variant.is_active = False
        variant.qty = 0.0
        session.add(variant)
        session.add(SpareItemHistory(
            spare_item_id=item.id,
            spare_item_variant_id=variant.id,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            changed_at=item.updated_at,
            change_type="remove_variant",
            qty_before=variant_qty,
            qty_after=0.0,
            qty_delta=-variant_qty,
            note="Variant cleared with item deactivation",
        ))
    session.add(SpareItemHistory(
        spare_item_id=item.id,
        changed_by_user_id=current_user.id,
        changed_by_username=current_user.username,
        changed_at=item.updated_at,
        change_type="set",
        qty_before=qty_before,
        qty_after=0.0,
        qty_delta=-qty_before,
        note="Spare item deactivated; residual stock cleared",
    ))
    session.commit()


@router.post("/items/{item_id}/adjust")
def adjust_item_stock(
    item_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> ItemOut:
    item = _item_or_404(session, item_id)
    require_inventory_edit(current_user, "spare")
    if body.quantity < 0:
        raise HTTPException(status_code=422, detail="Adjustment quantity cannot be negative")
    if body.adjustment_type in ("add", "subtract") and body.quantity == 0:
        raise HTTPException(status_code=422, detail="Adjustment quantity must be greater than zero")
    active_variants = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == item_id,
            SpareItemVariant.is_active == True,  # noqa: E712
        )
    ).all()
    # Active variants are the source of truth. Start from their current sum so
    # a previously stale parent aggregate cannot swallow a stock reduction.
    qty_before = sum(variant.qty for variant in active_variants) if active_variants else item.recorded_qty
    item.recorded_qty = qty_before
    if body.adjustment_type == "add":
        item.recorded_qty += body.quantity
    elif body.adjustment_type == "subtract":
        new_qty = item.recorded_qty - body.quantity
        if new_qty < 0:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot subtract {body.quantity}: only {item.recorded_qty} on hand",
            )
        item.recorded_qty = new_qty
    elif body.adjustment_type == "set":
        item.recorded_qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    qty_after = item.recorded_qty
    item.updated_at = now()
    session.add(item)
    # Keep the parent aggregate and its own leaf variants consistent. A parent-level
    # adjustment is scoped to this item only; sibling items and sub-categories are
    # never touched. Variant-specific workflows should use the variant endpoint.
    if active_variants:
        if body.adjustment_type == "subtract":
            remaining = qty_before - qty_after
            for variant in active_variants:
                taken = min(variant.qty, remaining)
                variant.qty -= taken
                remaining -= taken
                variant.updated_at = item.updated_at
                session.add(variant)
                if remaining <= 0:
                    break
        elif body.adjustment_type == "add":
            active_variants[0].qty += body.quantity
            active_variants[0].updated_at = item.updated_at
            session.add(active_variants[0])
        else:  # set
            active_variants[0].qty = qty_after
            active_variants[0].updated_at = item.updated_at
            session.add(active_variants[0])
            for variant in active_variants[1:]:
                variant.qty = 0
                variant.updated_at = item.updated_at
                session.add(variant)
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
    session.commit()
    if active_variants:
        _sync_item_from_variants(session, item)
    else:
        session.refresh(item)
    return _item_out(item, has_variants=len(active_variants) > 0, session=session)


@router.get("/items/{item_id}/history")
def get_item_history(
    item_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=50, ge=1, le=200),
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
        if d.tzinfo is None: d = d.replace(tzinfo=APP_TZ)
        return d.isoformat()
    return [
        ItemHistoryOut(
            id=r.id,  # type: ignore[arg-type]
            spare_item_id=r.spare_item_id,
            spare_item_variant_id=getattr(r, "spare_item_variant_id", None),
            changed_by_username=r.changed_by_username,
            changed_at=_dt(r.changed_at),
            change_type=r.change_type,
            qty_before=r.qty_before,
            qty_after=r.qty_after,
            qty_delta=r.qty_delta,
            note=r.note,
            variant_label=getattr(r, "variant_label", None),
        )
        for r in rows
    ]


# ── Variant endpoints ─────────────────────────────────────────────────────────

def _sync_item_from_variants(session: Session, item: SpareItem, commit: bool = True) -> None:
    """Recompute item.recorded_qty and item.rate from its active variants.

    This keeps the aggregation columns (used by _category_out / _sub_out) accurate
    whenever variants are added, updated, or removed.

    Items with NO variants at all are manual-stock rows (opening_qty) and must
    keep their recorded_qty — only zero it when variants actually existed and
    were all removed/deactivated.
    """
    all_rows = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == item.id,
        )
    ).all()
    if not all_rows:
        # Never had variants — this is manual stock; leave recorded_qty alone.
        return
    rows = [v for v in all_rows if v.is_active]
    if not rows:
        item.recorded_qty = 0
        item.updated_at = now()
        session.add(item)
        if commit:
            session.commit()
            session.refresh(item)
        return
    total_qty = sum(v.qty for v in rows)
    # total value = sum of (qty × rate) for variants that have a rate
    total_val = sum(v.qty * v.rate for v in rows if v.rate is not None)
    # Store effective rate so that rate × recorded_qty == total_val (exact)
    eff_rate = round(total_val / total_qty, 4) if total_qty > 0 and total_val > 0 else None
    item.recorded_qty = total_qty
    item.rate = eff_rate
    item.updated_at = now()
    session.add(item)
    if commit:
        session.commit()
        session.refresh(item)


def _variant_out(v: SpareItemVariant) -> VariantOut:
    def _dt(d: "datetime | str | None") -> str | None:
        if d is None: return None
        if isinstance(d, str): return d
        if d.tzinfo is None: d = d.replace(tzinfo=APP_TZ)
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
        timeline_days=getattr(v, 'timeline_days', None),
        reorder_level=getattr(v, 'reorder_level', 0.0) or 0.0,
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


@router.get("/variants/{variant_id}/history")
def get_variant_history(
    variant_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[ItemHistoryOut]:
    variant = session.get(SpareItemVariant, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    rows = session.exec(
        select(SpareItemHistory)
        .where(SpareItemHistory.spare_item_variant_id == variant_id)
        .order_by(SpareItemHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all()
    return [
        ItemHistoryOut(
            id=row.id,  # type: ignore[arg-type]
            spare_item_id=row.spare_item_id,
            spare_item_variant_id=row.spare_item_variant_id,
            changed_by_username=row.changed_by_username,
            changed_at=row.changed_at.isoformat() if not isinstance(row.changed_at, str) else row.changed_at,
            change_type=row.change_type,
            qty_before=row.qty_before,
            qty_after=row.qty_after,
            qty_delta=row.qty_delta,
            note=row.note,
            variant_label=row.variant_label,
        )
        for row in rows
    ]


@router.post("/items/{item_id}/variants", status_code=status.HTTP_201_CREATED)
def create_variant(
    item_id: int, body: VariantCreate, session: SessionDep, current_user: AdminUser,
) -> VariantOut:
    item = _item_or_404(session, item_id)
    qty_before = item.recorded_qty
    now_ts = now()
    v = SpareItemVariant(
        spare_item_id=item_id,
        serial_number=body.serial_number,
        variant_color=body.variant_color,
        image_base64=body.image_base64,
        qty=body.qty,
        storage_location=body.storage_location,
        storage_type=body.storage_type,
        rate=body.rate,
        timeline_days=body.timeline_days,
        reorder_level=body.reorder_level,
        created_at=now_ts, updated_at=now_ts,
    )
    session.add(v); session.flush()
    _sync_item_from_variants(session, item, commit=False)
    qty_after = item.recorded_qty
    # Build a human-readable label for the new variant
    v_parts = [p for p in [body.variant_color, body.serial_number] if p]
    v_label = " / ".join(v_parts) if v_parts else f"Variant #{v.id}"
    hist = SpareItemHistory(
        spare_item_id=item_id,
        spare_item_variant_id=v.id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=now_ts,
        change_type="add_variant",
        qty_before=0,
        qty_after=v.qty,
        qty_delta=v.qty,
        note=None,
        variant_label=v_label,
    )
    session.add(hist); session.commit()
    session.refresh(v)
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
    variant_qty_before = v.qty
    # Build variant label BEFORE updating (use existing values)
    v_parts = [p for p in [v.variant_color, v.serial_number] if p]
    v_label = " / ".join(v_parts) if v_parts else f"Variant #{v.id}"
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(v, field, value)
    v.updated_at = now()
    session.add(v); session.flush()
    _sync_item_from_variants(session, parent, commit=False)
    qty_after = parent.recorded_qty
    if v.qty != variant_qty_before:
        hist = SpareItemHistory(
            spare_item_id=parent_item_id,
            spare_item_variant_id=v.id,
            changed_by_user_id=current_user.id,  # type: ignore[arg-type]
            changed_by_username=current_user.username,
            changed_at=now(),
            change_type="edit",
            qty_before=variant_qty_before,
            qty_after=v.qty,
            qty_delta=v.qty - variant_qty_before,
            note=None,
            variant_label=v_label,
        )
        session.add(hist)
    session.commit()
    session.refresh(v)
    return _variant_out(v)


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant(variant_id: int, session: SessionDep, current_user: AdminUser) -> None:
    v = session.get(SpareItemVariant, variant_id)
    if not v:
        raise HTTPException(status_code=404, detail="Variant not found")
    parent_item_id = v.spare_item_id
    parent = _item_or_404(session, parent_item_id)
    qty_before = parent.recorded_qty
    variant_qty_before = v.qty
    v_parts = [p for p in [v.variant_color, v.serial_number] if p]
    v_label = " / ".join(v_parts) if v_parts else f"Variant #{v.id}"
    v.is_active = False
    v.qty = 0.0
    v.updated_at = now()
    session.add(v); session.flush()
    _sync_item_from_variants(session, parent, commit=False)
    qty_after = parent.recorded_qty
    hist = SpareItemHistory(
        spare_item_id=parent_item_id,
        spare_item_variant_id=v.id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=now(),
        change_type="remove_variant",
        qty_before=variant_qty_before,
        qty_after=0,
        qty_delta=-variant_qty_before,
        note=None,
        variant_label=v_label,
    )
    session.add(hist); session.commit()


@router.post("/variants/{variant_id}/adjust")
def adjust_variant_stock(
    variant_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> VariantOut:
    """Adjust the qty of an individual variant. Accessible to any authenticated user
    who has been granted edit access on this inventory type."""
    v = session.get(SpareItemVariant, variant_id)
    if not v or not v.is_active:
        raise HTTPException(status_code=404, detail="Variant not found")
    parent = _item_or_404(session, v.spare_item_id)
    require_inventory_edit(current_user, "spare")
    if body.quantity < 0:
        raise HTTPException(status_code=422, detail="Adjustment quantity cannot be negative")
    if body.adjustment_type in ("add", "subtract") and body.quantity == 0:
        raise HTTPException(status_code=422, detail="Adjustment quantity must be greater than zero")
    parent_qty_before = parent.recorded_qty
    variant_qty_before = v.qty
    if body.adjustment_type == "add":
        v.qty = v.qty + body.quantity
    elif body.adjustment_type == "subtract":
        new_qty = v.qty - body.quantity
        if new_qty < 0:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot subtract {body.quantity}: only {v.qty} on hand for this variant",
            )
        v.qty = new_qty
    elif body.adjustment_type == "set":
        v.qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    v.updated_at = now()
    session.add(v)
    session.commit()
    session.refresh(v)
    _sync_item_from_variants(session, parent)
    parent_qty_after = parent.recorded_qty
    v_parts = [p for p in [v.variant_color, v.serial_number] if p]
    v_label = " / ".join(v_parts) if v_parts else f"Variant #{v.id}"
    hist = SpareItemHistory(
        spare_item_id=v.spare_item_id,
        spare_item_variant_id=v.id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=v.updated_at,
        change_type=body.adjustment_type,
        qty_before=variant_qty_before,
        qty_after=v.qty,
        qty_delta=v.qty - variant_qty_before,
        note=body.note or None,
        variant_label=v_label,
    )
    session.add(hist)
    session.commit()
    return _variant_out(v)


# ── Global search endpoint ────────────────────────────────────────────────────

@router.get("/variants/search")
def search_variants(
    session: SessionDep,
    _: CurrentUser,
    q: str = Query(default=""),
    limit: int = Query(default=12, ge=1, le=50),
) -> list[VariantSearchOut]:
    """Search active variants with category/sub-category context — for the Create Request combobox."""
    stmt = (
        select(SpareItemVariant)
        .join(SpareItem, SpareItemVariant.spare_item_id == SpareItem.id)
        .where(
            SpareItemVariant.is_active == True,  # noqa: E712
            SpareItem.is_active == True,  # noqa: E712
        )
    )
    if q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            SpareItemVariant.serial_number.ilike(pat),  # type: ignore[union-attr]
            SpareItemVariant.variant_color.ilike(pat),  # type: ignore[union-attr]
            SpareItem.name.ilike(pat),  # type: ignore[union-attr]
            SpareItem.part_number.ilike(pat),  # type: ignore[union-attr]
        ))
    stmt = stmt.order_by(SpareItemVariant.id.desc())  # type: ignore[union-attr]

    results: list[VariantSearchOut] = []
    offset = 0
    seen: set[int] = set()
    while len(results) < limit:
        batch = list(session.exec(stmt.offset(offset).limit(limit)).all())
        if not batch:
            break
        offset += len(batch)
        item_ids = {v.spare_item_id for v in batch}
        sub_ids = set()
        cat_ids = set()
        items = {
            it.id: it
            for it in session.exec(select(SpareItem).where(SpareItem.id.in_(item_ids))).all()  # type: ignore[union-attr]
        }
        for it in items.values():
            if it.sub_category_id:
                sub_ids.add(it.sub_category_id)
            if it.category_id:
                cat_ids.add(it.category_id)
        subs = {
            s.id: s
            for s in session.exec(select(SpareSubCategory).where(SpareSubCategory.id.in_(sub_ids))).all()  # type: ignore[union-attr]
        } if sub_ids else {}
        cats = {
            c.id: c
            for c in session.exec(select(SpareCategory).where(SpareCategory.id.in_(cat_ids))).all()  # type: ignore[union-attr]
        } if cat_ids else {}
        unit_ids = {it.unit_id for it in items.values() if it.unit_id}
        units = {
            u.id: u
            for u in session.exec(select(Unit).where(Unit.id.in_(unit_ids))).all()  # type: ignore[union-attr]
        } if unit_ids else {}

        for v in batch:
            if v.id in seen:
                continue
            seen.add(v.id)
            item = items.get(v.spare_item_id)
            if not item or not item.is_active:
                continue
            sub = subs.get(item.sub_category_id) if item.sub_category_id else None
            if sub and not sub.is_active:
                continue
            cat = cats.get(item.category_id) if item.category_id else None
            if cat and not cat.is_active:
                continue
            unit = units.get(item.unit_id) if item.unit_id else None
            results.append(VariantSearchOut(
                variant_id=v.id,  # type: ignore[arg-type]
                serial_number=v.serial_number,
                variant_color=v.variant_color,
                image_base64=v.image_base64,
                timeline_days=getattr(v, "timeline_days", None),
                qty=v.qty,
                item_id=item.id,  # type: ignore[arg-type]
                item_name=item.name,
                part_number=item.part_number,
                category_name=cat.name if cat else "—",
                sub_category_name=sub.name if sub else None,
                unit_id=item.unit_id,
                unit_name=unit.name if unit else None,
            ))
            if len(results) >= limit:
                break
    return results


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
        unit_obj = session.get(Unit, item.unit_id) if item.unit_id else None
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
            unit_id=item.unit_id,
            unit_name=unit_obj.name if unit_obj else None,
            is_low=item.reorder_level > 0 and item.recorded_qty <= item.reorder_level,
        ))
    return results
