"""Weeders inventory router.

Categories (admin-only CRUD):
  GET    /api/v1/weeders/categories               — list categories
  POST   /api/v1/weeders/categories               — create category
  GET    /api/v1/weeders/categories/{id}          — get category
  PUT    /api/v1/weeders/categories/{id}          — update category
  DELETE /api/v1/weeders/categories/{id}          — soft-delete category

Items (scoped to category):
  GET    /api/v1/weeders/categories/{id}/items    — list items in category
  POST   /api/v1/weeders/categories/{id}/items    — create item in category

Flat item endpoints (backwards-compatible):
  GET    /api/v1/weeders                          — paginated list
  POST   /api/v1/weeders                          — create item
  GET    /api/v1/weeders/{item_id}                — single item
  PUT    /api/v1/weeders/{item_id}                — update item
  DELETE /api/v1/weeders/{item_id}                — soft-delete item
  POST   /api/v1/weeders/{item_id}/adjust         — stock adjustment
  GET    /api/v1/weeders/{item_id}/history        — change history
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.weeder_category import WeederCategory
from app.models.weeder_item import WeederItem
from app.models.weeder_history import WeederHistory
from app.models.user import User

router = APIRouter(prefix="/api/v1/weeders", tags=["weeders"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser   = Annotated[User, Depends(require_admin)]


# ── Schemas ───────────────────────────────────────────────────────────────────

class WeederCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    image_base64: Optional[str] = None


class WeederCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None


class WeederCategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    image_base64: Optional[str]
    is_active: bool
    item_count: int
    created_at: str
    updated_at: str


class WeederCreate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    sn_no: Optional[str] = None
    description: Optional[str] = None
    qty: float = 0.0
    reorder_level: float = 0.0
    rate_per_unit: Optional[float] = None
    storage_location: Optional[str] = None
    timeline_days: Optional[int] = None
    image_base64: Optional[str] = None


class WeederUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    sn_no: Optional[str] = None
    description: Optional[str] = None
    qty: Optional[float] = None
    reorder_level: Optional[float] = None
    rate_per_unit: Optional[float] = None
    storage_location: Optional[str] = None
    timeline_days: Optional[int] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None


class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


class HistoryOut(BaseModel):
    id: int
    weeder_id: int
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    qty_before: float
    qty_after: float
    qty_delta: float
    note: Optional[str]


class WeederOut(BaseModel):
    id: int
    category_id: Optional[int]
    name: Optional[str]
    sn_no: Optional[str]
    description: Optional[str]
    qty: float
    reorder_level: float
    rate_per_unit: Optional[float]
    total_rate: Optional[float]
    storage_location: Optional[str]
    timeline_days: Optional[int]
    image_base64: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


def _dt(d: "datetime | None") -> str:
    if d is None:
        return datetime.now(tz=timezone.utc).isoformat()
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


def _out(w: WeederItem) -> WeederOut:
    return WeederOut(
        id=w.id,  # type: ignore[arg-type]
        category_id=w.category_id,
        name=getattr(w, 'name', None),
        sn_no=w.sn_no,
        description=w.description,
        qty=w.qty,
        reorder_level=w.reorder_level,
        rate_per_unit=w.rate_per_unit,
        total_rate=round(w.qty * w.rate_per_unit, 2) if w.rate_per_unit is not None else None,
        storage_location=w.storage_location,
        timeline_days=getattr(w, 'timeline_days', None),
        image_base64=w.image_base64,
        is_active=w.is_active,
        created_at=_dt(w.created_at),
        updated_at=_dt(w.updated_at),
    )


def _cat_out(cat: WeederCategory, item_count: int = 0) -> WeederCategoryOut:
    return WeederCategoryOut(
        id=cat.id,  # type: ignore[arg-type]
        name=cat.name,
        description=cat.description,
        image_base64=cat.image_base64,
        is_active=cat.is_active,
        item_count=item_count,
        created_at=_dt(cat.created_at),
        updated_at=_dt(cat.updated_at),
    )


# ── Category endpoints ────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(
    session: SessionDep,
    _: CurrentUser,
    include_inactive: bool = Query(default=False),
) -> list[WeederCategoryOut]:
    q = select(WeederCategory)
    if not include_inactive:
        q = q.where(WeederCategory.is_active == True)  # noqa: E712
    cats = session.exec(q.order_by(WeederCategory.name)).all()
    result = []
    for cat in cats:
        count = session.exec(
            select(func.count()).select_from(WeederItem).where(
                WeederItem.category_id == cat.id,
                WeederItem.is_active == True,  # noqa: E712
            )
        ).one()
        result.append(_cat_out(cat, count))
    return result


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(body: WeederCategoryCreate, session: SessionDep, _: AdminUser) -> WeederCategoryOut:
    now = datetime.now(tz=timezone.utc)
    cat = WeederCategory(
        name=body.name.strip(),
        description=body.description or None,
        image_base64=body.image_base64,
        created_at=now,
        updated_at=now,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return _cat_out(cat, 0)


@router.get("/categories/{cat_id}")
def get_category(cat_id: int, session: SessionDep, _: CurrentUser) -> WeederCategoryOut:
    cat = session.get(WeederCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    count = session.exec(
        select(func.count()).select_from(WeederItem).where(
            WeederItem.category_id == cat_id,
            WeederItem.is_active == True,  # noqa: E712
        )
    ).one()
    return _cat_out(cat, count)


@router.put("/categories/{cat_id}")
def update_category(cat_id: int, body: WeederCategoryUpdate, session: SessionDep, _: AdminUser) -> WeederCategoryOut:
    cat = session.get(WeederCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name.strip()
    if body.description is not None:
        cat.description = body.description or None
    if body.image_base64 is not None:
        cat.image_base64 = body.image_base64 or None
    if body.is_active is not None:
        cat.is_active = body.is_active
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    count = session.exec(
        select(func.count()).select_from(WeederItem).where(
            WeederItem.category_id == cat_id,
            WeederItem.is_active == True,  # noqa: E712
        )
    ).one()
    return _cat_out(cat, count)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: int, session: SessionDep, _: AdminUser) -> None:
    cat = session.get(WeederCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.is_active = False
    cat.updated_at = datetime.now(tz=timezone.utc)
    session.add(cat)
    session.commit()


@router.get("/categories/{cat_id}/items")
def list_category_items(
    cat_id: int,
    session: SessionDep,
    _: CurrentUser,
    search: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
) -> dict:
    cat = session.get(WeederCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    q = select(WeederItem).where(WeederItem.category_id == cat_id)
    if not include_inactive:
        q = q.where(WeederItem.is_active == True)  # noqa: E712
    if search:
        pat = f"%{search}%"
        q = q.where(or_(
            WeederItem.name.ilike(pat),               # type: ignore[union-attr]
            WeederItem.sn_no.ilike(pat),             # type: ignore[union-attr]
            WeederItem.description.ilike(pat),       # type: ignore[union-attr]
            WeederItem.storage_location.ilike(pat),  # type: ignore[union-attr]
        ))
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    items = session.exec(q.order_by(WeederItem.name, WeederItem.description).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [_out(w) for w in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("/categories/{cat_id}/items", status_code=status.HTTP_201_CREATED)
def create_category_item(cat_id: int, body: WeederCreate, session: SessionDep, _: AdminUser) -> WeederOut:
    cat = session.get(WeederCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    now = datetime.now(tz=timezone.utc)
    w = WeederItem(
        category_id=cat_id,
        name=body.name or None,
        sn_no=body.sn_no or None,
        description=body.description or None,
        qty=body.qty,
        reorder_level=body.reorder_level,
        rate_per_unit=body.rate_per_unit,
        storage_location=body.storage_location or None,
        timeline_days=body.timeline_days,
        image_base64=body.image_base64,
        created_at=now,
        updated_at=now,
    )
    session.add(w)
    session.commit()
    session.refresh(w)
    return _out(w)


# ── Flat item endpoints ───────────────────────────────────────────────────────

@router.get("")
def list_weeders(
    session: SessionDep,
    _: CurrentUser,
    category_id: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
) -> dict:
    q = select(WeederItem)
    if not include_inactive:
        q = q.where(WeederItem.is_active == True)  # noqa: E712
    if category_id is not None:
        q = q.where(WeederItem.category_id == category_id)
    if search:
        pat = f"%{search}%"
        q = q.where(or_(
            WeederItem.name.ilike(pat),              # type: ignore[union-attr]
            WeederItem.sn_no.ilike(pat),            # type: ignore[union-attr]
            WeederItem.description.ilike(pat),      # type: ignore[union-attr]
            WeederItem.storage_location.ilike(pat), # type: ignore[union-attr]
        ))
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    items = session.exec(q.order_by(WeederItem.sn_no).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [_out(w) for w in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_weeder(body: WeederCreate, session: SessionDep, _: AdminUser) -> WeederOut:
    now = datetime.now(tz=timezone.utc)
    w = WeederItem(
        category_id=body.category_id,
        name=body.name or None,
        sn_no=body.sn_no or None,
        description=body.description or None,
        qty=body.qty,
        reorder_level=body.reorder_level,
        rate_per_unit=body.rate_per_unit,
        storage_location=body.storage_location or None,
        timeline_days=body.timeline_days,
        image_base64=body.image_base64,
        created_at=now,
        updated_at=now,
    )
    session.add(w)
    session.commit()
    session.refresh(w)
    return _out(w)


@router.get("/{item_id}")
def get_weeder(item_id: int, session: SessionDep, _: CurrentUser) -> WeederOut:
    w = session.get(WeederItem, item_id)
    if not w:
        raise HTTPException(status_code=404, detail="Weeder not found")
    return _out(w)


@router.put("/{item_id}")
def update_weeder(item_id: int, body: WeederUpdate, session: SessionDep, _: AdminUser) -> WeederOut:
    w = session.get(WeederItem, item_id)
    if not w:
        raise HTTPException(status_code=404, detail="Weeder not found")
    if body.category_id is not None:
        w.category_id = body.category_id
    if body.name is not None:
        w.name = body.name or None
    if body.sn_no is not None:
        w.sn_no = body.sn_no or None
    if body.description is not None:
        w.description = body.description or None
    if body.qty is not None:
        w.qty = body.qty
    if body.reorder_level is not None:
        w.reorder_level = body.reorder_level
    if body.rate_per_unit is not None:
        w.rate_per_unit = body.rate_per_unit
    if body.storage_location is not None:
        w.storage_location = body.storage_location or None
    if body.timeline_days is not None:
        w.timeline_days = body.timeline_days
    if body.image_base64 is not None:
        w.image_base64 = body.image_base64 or None
    if body.is_active is not None:
        w.is_active = body.is_active
    w.updated_at = datetime.now(tz=timezone.utc)
    session.add(w)
    session.commit()
    session.refresh(w)
    return _out(w)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weeder(item_id: int, session: SessionDep, _: AdminUser) -> None:
    w = session.get(WeederItem, item_id)
    if not w:
        raise HTTPException(status_code=404, detail="Weeder not found")
    w.is_active = False
    w.updated_at = datetime.now(tz=timezone.utc)
    session.add(w)
    session.commit()


@router.post("/{item_id}/adjust")
def adjust_weeder_stock(
    item_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> WeederOut:
    w = session.get(WeederItem, item_id)
    if not w:
        raise HTTPException(status_code=404, detail="Weeder not found")
    qty_before = w.qty
    if body.adjustment_type == "add":
        w.qty += body.quantity
    elif body.adjustment_type == "subtract":
        w.qty = max(0.0, w.qty - body.quantity)
    elif body.adjustment_type == "set":
        w.qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    qty_after = w.qty
    w.updated_at = datetime.now(tz=timezone.utc)
    session.add(w)
    hist = WeederHistory(
        weeder_id=item_id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=w.updated_at,
        change_type=body.adjustment_type,
        qty_before=qty_before,
        qty_after=qty_after,
        qty_delta=qty_after - qty_before,
        note=body.note or None,
    )
    session.add(hist)
    session.commit()
    session.refresh(w)
    return _out(w)


@router.get("/{item_id}/history")
def get_weeder_history(
    item_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[HistoryOut]:
    w = session.get(WeederItem, item_id)
    if not w:
        raise HTTPException(status_code=404, detail="Weeder not found")
    rows = session.exec(
        select(WeederHistory)
        .where(WeederHistory.weeder_id == item_id)
        .order_by(WeederHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all()
    return [
        HistoryOut(
            id=r.id,  # type: ignore[arg-type]
            weeder_id=r.weeder_id,
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
