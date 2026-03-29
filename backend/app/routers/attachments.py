"""Attachments inventory router.

Endpoints:
  GET    /api/v1/attachments          — paginated list
  POST   /api/v1/attachments          — create
  GET    /api/v1/attachments/{id}     — single item
  PUT    /api/v1/attachments/{id}     — update
  DELETE /api/v1/attachments/{id}     — soft-delete (set is_active=False)
  POST   /api/v1/attachments/{id}/adjust — stock adjustment
  GET    /api/v1/attachments/{id}/history — change history
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.attachment_item import AttachmentItem
from app.models.attachment_history import AttachmentHistory
from app.models.user import User

router = APIRouter(prefix="/api/v1/attachments", tags=["attachments"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser   = Annotated[User, Depends(require_admin)]


# ── Schemas ───────────────────────────────────────────────────────────────────

class AttachmentCreate(BaseModel):
    sn_no: Optional[str] = None
    description: Optional[str] = None
    qty: float = 0.0
    reorder_level: float = 0.0
    rate_per_unit: Optional[float] = None
    storage_location: Optional[str] = None
    image_base64: Optional[str] = None


class AttachmentUpdate(BaseModel):
    sn_no: Optional[str] = None
    description: Optional[str] = None
    qty: Optional[float] = None
    reorder_level: Optional[float] = None
    rate_per_unit: Optional[float] = None
    storage_location: Optional[str] = None
    image_base64: Optional[str] = None
    is_active: Optional[bool] = None


class AdjustRequest(BaseModel):
    adjustment_type: str   # "add" | "subtract" | "set"
    quantity: float
    note: Optional[str] = None


class HistoryOut(BaseModel):
    id: int
    attachment_id: int
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    qty_before: float
    qty_after: float
    qty_delta: float
    note: Optional[str]


class AttachmentOut(BaseModel):
    id: int
    sn_no: Optional[str]
    description: Optional[str]
    qty: float
    reorder_level: float
    rate_per_unit: Optional[float]
    total_rate: Optional[float]     # computed: qty * rate_per_unit
    storage_location: Optional[str]
    image_base64: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


def _dt(d: datetime | None) -> str:
    if d is None:
        return datetime.now(tz=timezone.utc).isoformat()
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


def _out(a: AttachmentItem) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,  # type: ignore[arg-type]
        sn_no=a.sn_no,
        description=a.description,
        qty=a.qty,
        reorder_level=a.reorder_level,
        rate_per_unit=a.rate_per_unit,
        total_rate=round(a.qty * a.rate_per_unit, 2) if a.rate_per_unit is not None else None,
        storage_location=a.storage_location,
        image_base64=a.image_base64,
        is_active=a.is_active,
        created_at=_dt(a.created_at),
        updated_at=_dt(a.updated_at),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def list_attachments(
    session: SessionDep,
    _: CurrentUser,
    search: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=1000),
) -> dict:
    q = select(AttachmentItem)
    if not include_inactive:
        q = q.where(AttachmentItem.is_active == True)  # noqa: E712
    if search:
        pat = f"%{search}%"
        q = q.where(or_(
            AttachmentItem.sn_no.ilike(pat),         # type: ignore[union-attr]
            AttachmentItem.description.ilike(pat),   # type: ignore[union-attr]
            AttachmentItem.storage_location.ilike(pat),  # type: ignore[union-attr]
        ))
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    items = session.exec(q.order_by(AttachmentItem.sn_no).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [_out(a) for a in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_attachment(body: AttachmentCreate, session: SessionDep, _: AdminUser) -> AttachmentOut:
    now = datetime.now(tz=timezone.utc)
    a = AttachmentItem(
        sn_no=body.sn_no or None,
        description=body.description or None,
        qty=body.qty,
        reorder_level=body.reorder_level,
        rate_per_unit=body.rate_per_unit,
        storage_location=body.storage_location or None,
        image_base64=body.image_base64,
        created_at=now,
        updated_at=now,
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _out(a)


@router.get("/{item_id}")
def get_attachment(item_id: int, session: SessionDep, _: CurrentUser) -> AttachmentOut:
    a = session.get(AttachmentItem, item_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return _out(a)


@router.put("/{item_id}")
def update_attachment(item_id: int, body: AttachmentUpdate, session: SessionDep, _: AdminUser) -> AttachmentOut:
    a = session.get(AttachmentItem, item_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if body.sn_no is not None:
        a.sn_no = body.sn_no or None
    if body.description is not None:
        a.description = body.description or None
    if body.qty is not None:
        a.qty = body.qty
    if body.reorder_level is not None:
        a.reorder_level = body.reorder_level
    if body.rate_per_unit is not None:
        a.rate_per_unit = body.rate_per_unit
    if body.storage_location is not None:
        a.storage_location = body.storage_location or None
    if body.image_base64 is not None:
        a.image_base64 = body.image_base64 or None
    if body.is_active is not None:
        a.is_active = body.is_active
    a.updated_at = datetime.now(tz=timezone.utc)
    session.add(a)
    session.commit()
    session.refresh(a)
    return _out(a)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(item_id: int, session: SessionDep, _: AdminUser) -> None:
    a = session.get(AttachmentItem, item_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found")
    a.is_active = False
    a.updated_at = datetime.now(tz=timezone.utc)
    session.add(a)
    session.commit()


@router.post("/{item_id}/adjust")
def adjust_attachment_stock(
    item_id: int, body: AdjustRequest, session: SessionDep, current_user: CurrentUser,
) -> AttachmentOut:
    a = session.get(AttachmentItem, item_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found")
    qty_before = a.qty
    if body.adjustment_type == "add":
        a.qty += body.quantity
    elif body.adjustment_type == "subtract":
        a.qty = max(0.0, a.qty - body.quantity)
    elif body.adjustment_type == "set":
        a.qty = body.quantity
    else:
        raise HTTPException(status_code=400, detail="adjustment_type must be add|subtract|set")
    qty_after = a.qty
    a.updated_at = datetime.now(tz=timezone.utc)
    session.add(a)
    hist = AttachmentHistory(
        attachment_id=item_id,
        changed_by_user_id=current_user.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=a.updated_at,
        change_type=body.adjustment_type,
        qty_before=qty_before,
        qty_after=qty_after,
        qty_delta=qty_after - qty_before,
        note=body.note or None,
    )
    session.add(hist)
    session.commit()
    session.refresh(a)
    return _out(a)


@router.get("/{item_id}/history")
def get_attachment_history(
    item_id: int, session: SessionDep, _: AdminUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[HistoryOut]:
    a = session.get(AttachmentItem, item_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attachment not found")
    rows = session.exec(
        select(AttachmentHistory)
        .where(AttachmentHistory.attachment_id == item_id)
        .order_by(AttachmentHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all()
    return [
        HistoryOut(
            id=r.id,  # type: ignore[arg-type]
            attachment_id=r.attachment_id,
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
