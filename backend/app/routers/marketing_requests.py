"""Marketing team item dispatch request router (weeder / attachment)."""
import math
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.marketing_request import MarketingRequest
from app.models.marketing_request_history import MarketingRequestHistory
from app.models.user import User

router = APIRouter(prefix="/api/v1/marketing-requests", tags=["marketing-requests"])

# ── Schemas ───────────────────────────────────────────────────────────────────


class MarketingRequestCreate(BaseModel):
    inventory_type: str = "weeder"          # weeder | attachment
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = 1.0
    timeline_days: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    bought_by: Optional[str] = None
    delivery_type: Optional[str] = None     # direct | transport
    remarks: Optional[str] = None
    department: Optional[str] = None


class MarketingRequestUpdate(BaseModel):
    inventory_type: Optional[str] = None
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: Optional[float] = None
    timeline_days: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    bought_by: Optional[str] = None
    delivery_type: Optional[str] = None
    remarks: Optional[str] = None
    department: Optional[str] = None


class ReviewRequest(BaseModel):
    note: Optional[str] = None


class MarketingRequestOut(BaseModel):
    id: int
    sn_no: str
    inventory_type: str
    item_id: Optional[int]
    item_sn_no: Optional[str]
    item_description: Optional[str]
    quantity: float
    timeline_days: Optional[int]
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_address: Optional[str]
    bought_by: Optional[str]
    delivery_type: Optional[str]
    remarks: Optional[str]
    status: str
    requested_by_user_id: Optional[int]
    requested_by_username: Optional[str]
    department: Optional[str]
    reviewed_by_username: Optional[str]
    reviewed_at: Optional[str]
    review_note: Optional[str]
    created_at: str
    updated_at: str
    deadline_date: Optional[str]


class HistoryOut(BaseModel):
    id: int
    request_id: int
    changed_by_username: Optional[str]
    changed_at: str
    change_type: str
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    note: Optional[str]


class Paginated(BaseModel):
    items: list[MarketingRequestOut]
    total: int
    page: int
    page_size: int
    pages: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _next_sn(session: Session) -> str:
    year = datetime.now(tz=timezone.utc).year
    count = session.exec(
        select(func.count()).select_from(MarketingRequest).where(
            MarketingRequest.sn_no.like(f"MR-{year}-%")  # type: ignore[union-attr]
        )
    ).one()
    return f"MR-{year}-{count + 1:04d}"


def _out(r: MarketingRequest) -> MarketingRequestOut:
    deadline = None
    if r.timeline_days and r.created_at:
        deadline = (r.created_at + timedelta(days=r.timeline_days)).date().isoformat()
    return MarketingRequestOut(
        id=r.id,  # type: ignore[arg-type]
        sn_no=r.sn_no,
        inventory_type=r.inventory_type,
        item_id=r.item_id,
        item_sn_no=r.item_sn_no,
        item_description=r.item_description,
        quantity=r.quantity,
        timeline_days=r.timeline_days,
        customer_name=r.customer_name,
        customer_phone=r.customer_phone,
        customer_address=r.customer_address,
        bought_by=r.bought_by,
        delivery_type=r.delivery_type,
        remarks=r.remarks,
        status=r.status,
        requested_by_user_id=r.requested_by_user_id,
        requested_by_username=r.requested_by_username,
        department=r.department,
        reviewed_by_username=r.reviewed_by_username,
        reviewed_at=r.reviewed_at.isoformat() if r.reviewed_at else None,
        review_note=r.review_note,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
        deadline_date=deadline,
    )


def _record_history(
    session: Session,
    request_id: int,
    actor: User,
    change_type: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    session.add(MarketingRequestHistory(
        request_id=request_id,
        changed_by_user_id=actor.id,
        changed_by_username=actor.username,
        change_type=change_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        note=note,
    ))


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=Paginated)
def list_requests(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
) -> Paginated:
    q = select(MarketingRequest).where(MarketingRequest.is_active == True)  # noqa: E712

    if not is_admin_or_above(current_user):
        q = q.where(MarketingRequest.requested_by_user_id == current_user.id)

    if status_filter:
        q = q.where(MarketingRequest.status == status_filter)

    if search:
        like = f"%{search}%"
        q = q.where(or_(
            MarketingRequest.sn_no.like(like),  # type: ignore[union-attr]
            MarketingRequest.item_sn_no.like(like),  # type: ignore[union-attr]
            MarketingRequest.item_description.like(like),  # type: ignore[union-attr]
            MarketingRequest.customer_name.like(like),  # type: ignore[union-attr]
            MarketingRequest.requested_by_username.like(like),  # type: ignore[union-attr]
        ))

    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(
        q.order_by(MarketingRequest.created_at.desc())  # type: ignore[union-attr]
        .offset((page - 1) * page_size).limit(page_size)
    ).all()

    return Paginated(
        items=[_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("", response_model=MarketingRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    body: MarketingRequestCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    if body.inventory_type not in ("weeder", "attachment"):
        raise HTTPException(status_code=400, detail="inventory_type must be 'weeder' or 'attachment'")
    if not body.item_id and not body.item_sn_no and not body.item_description:
        raise HTTPException(status_code=400, detail="An item must be specified")

    now = datetime.now(tz=timezone.utc)
    req = MarketingRequest(
        sn_no=_next_sn(session),
        inventory_type=body.inventory_type,
        item_id=body.item_id,
        item_sn_no=body.item_sn_no,
        item_description=body.item_description,
        quantity=body.quantity,
        timeline_days=body.timeline_days,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_address=body.customer_address,
        bought_by=body.bought_by,
        delivery_type=body.delivery_type,
        remarks=body.remarks,
        department=body.department,
        status="pending",
        requested_by_user_id=current_user.id,
        requested_by_username=current_user.username,
        created_at=now,
        updated_at=now,
    )
    session.add(req)
    session.flush()
    _record_history(session, req.id, current_user, "created",  # type: ignore[arg-type]
                    note=f"Request {req.sn_no} created")
    session.commit()
    session.refresh(req)
    return _out(req)


@router.get("/{req_id}", response_model=MarketingRequestOut)
def get_request(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return _out(req)


@router.put("/{req_id}", response_model=MarketingRequestOut)
def update_request(
    req_id: int,
    body: MarketingRequestUpdate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited")

    EDITABLE = [
        "inventory_type", "item_id", "item_sn_no", "item_description",
        "quantity", "timeline_days", "customer_name", "customer_phone",
        "customer_address", "bought_by", "delivery_type", "remarks", "department",
    ]
    changes = []
    for field in EDITABLE:
        new_val = getattr(body, field)
        if new_val is not None:
            old_val = getattr(req, field)
            if old_val != new_val:
                changes.append((field, str(old_val) if old_val is not None else None, str(new_val)))
                setattr(req, field, new_val)

    req.updated_at = datetime.now(tz=timezone.utc)
    for field, old, new in changes:
        _record_history(session, req.id, current_user, "edited",  # type: ignore[arg-type]
                        field_name=field, old_value=old, new_value=new)
    if not changes:
        _record_history(session, req.id, current_user, "edited",  # type: ignore[arg-type]
                        note="No fields changed")
    session.commit()
    session.refresh(req)
    return _out(req)


@router.post("/{req_id}/approve", response_model=MarketingRequestOut)
def approve_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot approve a request with status '{req.status}'")
    now = datetime.now(tz=timezone.utc)
    req.status = "approved"
    req.reviewed_by_user_id = current_user.id
    req.reviewed_by_username = current_user.username
    req.reviewed_at = now
    req.review_note = body.note
    req.updated_at = now
    _record_history(session, req.id, current_user, "approved",  # type: ignore[arg-type]
                    note=body.note)
    session.commit()
    session.refresh(req)
    return _out(req)


@router.post("/{req_id}/reject", response_model=MarketingRequestOut)
def reject_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Cannot reject a request with status '{req.status}'")
    now = datetime.now(tz=timezone.utc)
    req.status = "not_approved"
    req.reviewed_by_user_id = current_user.id
    req.reviewed_by_username = current_user.username
    req.reviewed_at = now
    req.review_note = body.note
    req.updated_at = now
    _record_history(session, req.id, current_user, "rejected",  # type: ignore[arg-type]
                    note=body.note)
    session.commit()
    session.refresh(req)
    return _out(req)


@router.post("/{req_id}/cancel", response_model=MarketingRequestOut)
def cancel_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MarketingRequestOut:
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if req.status == "cancelled":
        raise HTTPException(status_code=400, detail="Already cancelled")
    now = datetime.now(tz=timezone.utc)
    req.status = "cancelled"
    req.updated_at = now
    _record_history(session, req.id, current_user, "cancelled",  # type: ignore[arg-type]
                    note=body.note)
    session.commit()
    session.refresh(req)
    return _out(req)


@router.get("/{req_id}/history", response_model=list[HistoryOut])
def get_history(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[HistoryOut]:
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    rows = session.exec(
        select(MarketingRequestHistory)
        .where(MarketingRequestHistory.request_id == req_id)
        .order_by(MarketingRequestHistory.changed_at.desc())  # type: ignore[union-attr]
        .offset(offset).limit(limit)
    ).all()
    return [
        HistoryOut(
            id=h.id,  # type: ignore[arg-type]
            request_id=h.request_id,
            changed_by_username=h.changed_by_username,
            changed_at=h.changed_at.isoformat(),
            change_type=h.change_type,
            field_name=h.field_name,
            old_value=h.old_value,
            new_value=h.new_value,
            note=h.note,
        )
        for h in rows
    ]


@router.delete("/{req_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Soft-delete a marketing request (admin only)."""
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(MarketingRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    now = datetime.now(tz=timezone.utc)
    req.is_active = False
    req.updated_at = now
    _record_history(session, req.id, current_user, "deleted",  # type: ignore[arg-type]
                    note=f"Request {req.sn_no} deleted by admin {current_user.username}")
    session.commit()
