"""Purchase / Production team material request router."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, and_, func, or_, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.department import Department
from app.models.inventory import InventoryItem
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_history import PurchaseRequestHistory
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.receipt import Receipt
from app.models.user import User
from app.models.user_department import UserDepartment
from app.routers.notifications import create_notification

router = APIRouter(prefix="/api/v1/purchase-requests", tags=["purchase-requests"])

# ── Schemas ───────────────────────────────────────────────────────────────────


class PurchaseRequestItemCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 1.0
    timeline_days: Optional[int] = None


class PurchaseRequestItemOut(BaseModel):
    id: int
    inventory_item_id: Optional[int]
    item_name: Optional[str]
    item_code: Optional[str]
    item_type: Optional[str]
    description: Optional[str]
    quantity: float
    timeline_days: Optional[int]


class PurchaseRequestCreate(BaseModel):
    items: list[PurchaseRequestItemCreate]
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    department: Optional[str] = None


class PurchaseRequestUpdate(BaseModel):
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    department: Optional[str] = None
    items: Optional[list[PurchaseRequestItemCreate]] = None


class ReviewRequest(BaseModel):
    note: Optional[str] = None


class RespondRequest(BaseModel):
    note: Optional[str] = None


class PurchaseRequestOut(BaseModel):
    id: int
    sn_no: str
    inventory_item_id: Optional[int]
    item_name: Optional[str]
    item_code: Optional[str]
    item_type: Optional[str]
    description: Optional[str]
    quantity: float
    from_whom: Optional[str]
    timeline_days: Optional[int]
    notes: Optional[str]
    status: str
    requested_by_user_id: Optional[int]
    requested_by_username: Optional[str]
    department: Optional[str]
    reviewed_by_username: Optional[str]
    reviewed_at: Optional[str]
    review_note: Optional[str]
    created_at: str
    updated_at: str
    # deadline helper
    deadline_date: Optional[str]
    # receipt summary
    receipt_count: int
    total_received: float
    # fulfilment response
    fulfilled_by_username: Optional[str]
    fulfillment_accepted_at: Optional[str]
    fulfillment_note: Optional[str]
    # department codes for display in the People column
    requested_by_dept_code: Optional[str] = None
    fulfilled_by_dept_code: Optional[str] = None
    # Line items (new; may be empty for legacy data before migration)
    items: list[PurchaseRequestItemOut] = []


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
    items: list[PurchaseRequestOut]
    total: int
    page: int
    page_size: int
    pages: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _next_sn(session: Session) -> str:
    year = datetime.now(tz=timezone.utc).year
    count = session.exec(
        select(func.count()).select_from(PurchaseRequest).where(
            PurchaseRequest.sn_no.like(f"PR-{year}-%")  # type: ignore[union-attr]
        )
    ).one()
    return f"PR-{year}-{count + 1:04d}"


def _out(r: PurchaseRequest, session: Session) -> PurchaseRequestOut:
    # ── Load line items ───────────────────────────────────────────────────────
    item_rows = session.exec(
        select(PurchaseRequestItem).where(PurchaseRequestItem.request_id == r.id)
    ).all()

    items_out: list[PurchaseRequestItemOut] = []
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    timeline_days_out: Optional[int] = None
    quantity: float

    if item_rows:
        items_out = [
            PurchaseRequestItemOut(
                id=i.id,  # type: ignore[arg-type]
                inventory_item_id=i.inventory_item_id,
                item_name=i.item_name,
                item_code=i.item_code,
                item_type=i.item_type,
                description=i.description,
                quantity=i.quantity,
                timeline_days=i.timeline_days,
            )
            for i in item_rows
        ]
        if len(item_rows) == 1:
            item_name = item_rows[0].item_name
            item_code = item_rows[0].item_code
            item_type = item_rows[0].item_type
            description = item_rows[0].description
            timeline_days_out = item_rows[0].timeline_days
        else:
            item_name = f"{len(item_rows)} items"
            tl_values = [i.timeline_days for i in item_rows if i.timeline_days]
            timeline_days_out = max(tl_values) if tl_values else None
        quantity = sum(i.quantity for i in item_rows)
    else:
        # Backward compat: fall back to legacy columns on the request row
        item_name = r.item_name
        item_code = r.item_code
        item_type = r.item_type
        description = r.description
        timeline_days_out = r.timeline_days
        quantity = r.quantity

    deadline = None
    if timeline_days_out and r.created_at:
        from datetime import timedelta
        deadline = (r.created_at + timedelta(days=timeline_days_out)).date().isoformat()

    receipt_rows = session.exec(
        select(Receipt).where(Receipt.request_id == r.id, Receipt.is_active == True)  # noqa: E712
    ).all()
    receipt_count = len(receipt_rows)
    total_received = sum(rec.quantity_received for rec in receipt_rows)

    def _first_dept_code(uid: Optional[int]) -> Optional[str]:
        if not uid:
            return None
        return session.exec(
            select(Department.code)
            .join(UserDepartment, UserDepartment.department_id == Department.id)
            .where(UserDepartment.user_id == uid)
            .limit(1)
        ).first()

    return PurchaseRequestOut(
        id=r.id,  # type: ignore[arg-type]
        sn_no=r.sn_no,
        inventory_item_id=item_rows[0].inventory_item_id if len(item_rows) == 1 else r.inventory_item_id,
        item_name=item_name,
        item_code=item_code,
        item_type=item_type,
        description=description,
        quantity=quantity,
        from_whom=r.from_whom,
        timeline_days=timeline_days_out,
        notes=r.notes,
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
        receipt_count=receipt_count,
        total_received=total_received,
        fulfilled_by_username=r.fulfilled_by_username,
        fulfillment_accepted_at=r.fulfillment_accepted_at.isoformat() if r.fulfillment_accepted_at else None,
        fulfillment_note=r.fulfillment_note,
        requested_by_dept_code=_first_dept_code(r.requested_by_user_id),
        fulfilled_by_dept_code=_first_dept_code(r.fulfilled_by_user_id),
        items=items_out,
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
    session.add(PurchaseRequestHistory(
        request_id=request_id,
        changed_by_user_id=actor.id,
        changed_by_username=actor.username,
        change_type=change_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        note=note,
    ))


def _get_user_dept_names(session: Session, user_id: int) -> list[str]:
    """Return department names the given user belongs to."""
    return list(session.exec(
        select(Department.name)
        .join(UserDepartment, UserDepartment.department_id == Department.id)
        .where(UserDepartment.user_id == user_id)
    ).all())


# ── Endpoints ─────────────────────────────────────────────────────────────────


class ActiveCountOut(BaseModel):
    count: int


@router.get("/active-count", response_model=ActiveCountOut)
def active_count(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ActiveCountOut:
    """
    Return the number of purchase requests that are still 'live' for the
    current user.  'Live' means not yet fully fulfilled (not received /
    not_approved / cancelled).

    Used by the sidebar to show a badge.
    """
    # Terminal (done) statuses — no action needed
    DONE = ("received", "not_approved", "cancelled")

    q = select(func.count()).select_from(PurchaseRequest).where(
        PurchaseRequest.is_active == True,  # noqa: E712
        PurchaseRequest.status.notin_(list(DONE)),  # type: ignore[union-attr]
    )

    if not is_admin_or_above(current_user):
        user_dept_names = _get_user_dept_names(session, current_user.id)  # type: ignore[arg-type]
        conditions: list = [
            PurchaseRequest.requested_by_user_id == current_user.id,
            and_(
                PurchaseRequest.fulfilled_by_user_id == current_user.id,
                PurchaseRequest.status != "pending",  # type: ignore[attr-defined]
            ),
        ]
        if user_dept_names:
            conditions.append(and_(
                PurchaseRequest.department.in_(user_dept_names),  # type: ignore[union-attr]
                PurchaseRequest.status.in_(["approved", "in_progress", "awaiting_signoff"]),  # type: ignore[union-attr]
            ))
        q = q.where(or_(*conditions))

    count = session.exec(q).one()
    return ActiveCountOut(count=count)


@router.get("", response_model=Paginated)
def list_requests(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
) -> Paginated:
    q = select(PurchaseRequest).where(PurchaseRequest.is_active == True)  # noqa: E712

    # Non-admins: own requests + assigned-to-me + requests directed to their department
    if not is_admin_or_above(current_user):
        user_dept_names = _get_user_dept_names(session, current_user.id)  # type: ignore[arg-type]
        conditions: list = [
            PurchaseRequest.requested_by_user_id == current_user.id,
            and_(
                PurchaseRequest.fulfilled_by_user_id == current_user.id,
                PurchaseRequest.status != "pending",  # type: ignore[union-attr]
            ),
        ]
        if user_dept_names:
            conditions.append(and_(
                PurchaseRequest.department.in_(user_dept_names),  # type: ignore[union-attr]
                PurchaseRequest.status.in_(["approved", "in_progress", "awaiting_signoff", "received"]),  # type: ignore[union-attr]
            ))
        q = q.where(or_(*conditions))

    if status_filter:
        q = q.where(PurchaseRequest.status == status_filter)

    if search:
        like = f"%{search}%"
        # Search in line items table (new design) and legacy columns (backward compat)
        item_search_subq = (
            select(PurchaseRequestItem.request_id)
            .where(or_(
                PurchaseRequestItem.item_name.like(like),  # type: ignore[union-attr]
                PurchaseRequestItem.item_code.like(like),  # type: ignore[union-attr]
            ))
        )
        q = q.where(or_(
            PurchaseRequest.sn_no.like(like),  # type: ignore[union-attr]
            PurchaseRequest.item_name.like(like),  # type: ignore[union-attr]
            PurchaseRequest.item_code.like(like),  # type: ignore[union-attr]
            PurchaseRequest.requested_by_username.like(like),  # type: ignore[union-attr]
            PurchaseRequest.from_whom.like(like),  # type: ignore[union-attr]
            PurchaseRequest.id.in_(item_search_subq),  # type: ignore[union-attr]
        ))

    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = session.exec(
        q.order_by(PurchaseRequest.created_at.desc())  # type: ignore[union-attr]
        .offset((page - 1) * page_size).limit(page_size)
    ).all()

    import math
    return Paginated(
        items=[_out(r, session) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("", response_model=PurchaseRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    body: PurchaseRequestCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    """Create a single purchase request with one or more line items."""
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    for it in body.items:
        if not it.inventory_item_id and not it.item_name:
            raise HTTPException(status_code=400, detail="Each item must have inventory_item_id or item_name")

    now = datetime.now(tz=timezone.utc)
    req = PurchaseRequest(
        sn_no=_next_sn(session),
        from_whom=body.from_whom,
        notes=body.notes,
        department=body.department,
        status="pending",
        requested_by_user_id=current_user.id,
        requested_by_username=current_user.username,
        created_at=now,
        updated_at=now,
    )
    session.add(req)
    session.flush()  # get req.id

    for it in body.items:
        # Auto-resolve timeline_days from linked inventory item
        timeline_days: Optional[int] = it.timeline_days
        if it.inventory_item_id and not timeline_days:
            inv_item = session.get(InventoryItem, it.inventory_item_id)
            if inv_item:
                timeline_days = getattr(inv_item, "timeline_days", None)

        session.add(PurchaseRequestItem(
            request_id=req.id,  # type: ignore[arg-type]
            inventory_item_id=it.inventory_item_id,
            item_name=it.item_name,
            item_code=it.item_code,
            item_type=it.item_type,
            description=it.description,
            quantity=it.quantity,
            timeline_days=timeline_days,
        ))

    first_item_name = body.items[0].item_name if body.items else None
    item_summary = (
        first_item_name or "item"
        if len(body.items) == 1
        else f"{len(body.items)} items"
    )
    _record_history(session, req.id, current_user, "created",  # type: ignore[arg-type]
                    note=f"Request {req.sn_no} created with {item_summary}")

    admins = session.exec(
        select(User).where(
            User.role.in_(["admin", "super_admin"]),  # type: ignore[union-attr]
            User.is_active == True,  # noqa: E712
            User.id != current_user.id,
        )
    ).all()
    for admin_user in admins:
        create_notification(
            session,
            user_id=admin_user.id,  # type: ignore[arg-type]
            notif_type="request_created",
            title="New Purchase Request",
            body=(
                f"{current_user.username} submitted request {req.sn_no} "
                f"for {item_summary}"
                + (f" — dept: {req.department}" if req.department else ".")
            ),
            request_id=req.id,
        )

    session.commit()
    session.refresh(req)
    return _out(req, session)


@router.get("/{req_id}", response_model=PurchaseRequestOut)
def get_request(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    # Non-admins: own requests, or requests they are fulfilling, or dept-matching approved+
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        if req.fulfilled_by_user_id == current_user.id:
            pass  # fulfiller can always view
        elif req.status in ("approved", "in_progress", "awaiting_signoff", "received"):
            user_dept_names = _get_user_dept_names(session, current_user.id)  # type: ignore[arg-type]
            if req.department and req.department not in user_dept_names:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            raise HTTPException(status_code=403, detail="Access denied")
    return _out(req, session)


@router.put("/{req_id}", response_model=PurchaseRequestOut)
def update_request(
    req_id: int,
    body: PurchaseRequestUpdate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited")

    EDITABLE_HDR = ["from_whom", "notes", "department"]
    changes = []
    for field in EDITABLE_HDR:
        new_val = getattr(body, field)
        if new_val is not None:
            old_val = getattr(req, field)
            if old_val != new_val:
                changes.append((field, str(old_val) if old_val is not None else None, str(new_val)))
                setattr(req, field, new_val)

    # Replace line items if provided
    if body.items is not None:
        if not body.items:
            raise HTTPException(status_code=400, detail="At least one item is required")
        # Delete existing items
        old_items = session.exec(
            select(PurchaseRequestItem).where(PurchaseRequestItem.request_id == req.id)
        ).all()
        for oi in old_items:
            session.delete(oi)
        session.flush()
        # Insert new items
        for it in body.items:
            if not it.inventory_item_id and not it.item_name:
                raise HTTPException(status_code=400, detail="Each item must have inventory_item_id or item_name")
            timeline_days: Optional[int] = it.timeline_days
            if it.inventory_item_id and not timeline_days:
                inv_item = session.get(InventoryItem, it.inventory_item_id)
                if inv_item:
                    timeline_days = getattr(inv_item, "timeline_days", None)
            session.add(PurchaseRequestItem(
                request_id=req.id,
                inventory_item_id=it.inventory_item_id,
                item_name=it.item_name,
                item_code=it.item_code,
                item_type=it.item_type,
                description=it.description,
                quantity=it.quantity,
                timeline_days=timeline_days,
            ))
        changes.append(("items", None, f"{len(body.items)} item(s)"))

    req.updated_at = datetime.now(tz=timezone.utc)
    for field, old, new in changes:
        _record_history(session, req.id, current_user, "edited",  # type: ignore[arg-type]
                        field_name=field, old_value=old, new_value=new)
    if not changes:
        _record_history(session, req.id, current_user, "edited",  # type: ignore[arg-type]
                        note="No fields changed")
    session.commit()
    session.refresh(req)
    return _out(req, session)


@router.post("/{req_id}/approve", response_model=PurchaseRequestOut)
def approve_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("pending",):
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
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_approved",
            title="Purchase Request Approved",
            body=f"Your request {req.sn_no} has been approved.",
            request_id=req.id,
        )
    session.commit()
    session.refresh(req)
    return _out(req, session)


@router.post("/{req_id}/reject", response_model=PurchaseRequestOut)
def reject_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("pending",):
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
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_rejected",
            title="Purchase Request Not Approved",
            body=f"Your request {req.sn_no} was not approved.{(' Note: ' + body.note) if body.note else ''}",
            request_id=req.id,
        )
    session.commit()
    session.refresh(req)
    return _out(req, session)


@router.post("/{req_id}/cancel", response_model=PurchaseRequestOut)
def cancel_request(
    req_id: int,
    body: ReviewRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    req = session.get(PurchaseRequest, req_id)
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
    return _out(req, session)


@router.delete("/{req_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Soft-delete a purchase request (admin only). Also soft-deletes linked receipts."""
    if not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    now = datetime.now(tz=timezone.utc)
    # Soft-delete all linked receipts
    receipts = session.exec(
        select(Receipt).where(Receipt.request_id == req_id, Receipt.is_active == True)  # noqa: E712
    ).all()
    for receipt in receipts:
        receipt.is_active = False
        receipt.updated_at = now
    req.is_active = False
    req.updated_at = now
    _record_history(session, req.id, current_user, "deleted",  # type: ignore[arg-type]
                    note=f"Request {req.sn_no} deleted by admin {current_user.username}")
    session.commit()


@router.get("/{req_id}/history", response_model=list[HistoryOut])
def get_history(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[HistoryOut]:
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    rows = session.exec(
        select(PurchaseRequestHistory)
        .where(PurchaseRequestHistory.request_id == req_id)
        .order_by(PurchaseRequestHistory.changed_at.desc())  # type: ignore[union-attr]
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


@router.get("/{req_id}/receipts")
def list_request_receipts(
    req_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[dict]:
    """Return all active receipts for a specific purchase request."""
    from app.routers.receipts import _out as receipt_out  # local import to avoid circular
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if not is_admin_or_above(current_user) and req.requested_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    receipts = session.exec(
        select(Receipt)
        .where(Receipt.request_id == req_id, Receipt.is_active == True)  # noqa: E712
        .order_by(Receipt.created_at.asc())  # type: ignore[union-attr]
    ).all()
    return [receipt_out(r).model_dump() for r in receipts]


@router.post("/{req_id}/respond", response_model=PurchaseRequestOut)
def respond_to_request(
    req_id: int,
    body: RespondRequest,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PurchaseRequestOut:
    """Fulfilling department accepts an approved request and marks it In Progress."""
    req = session.get(PurchaseRequest, req_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "approved":
        raise HTTPException(
            status_code=400,
            detail=f"Only approved requests can be responded to (current status: {req.status})",
        )
    # Prevent the original requester from responding to their own request
    if req.requested_by_user_id == current_user.id and not is_admin_or_above(current_user):
        raise HTTPException(status_code=403, detail="You cannot respond to your own request")
    # Only members of the target department may respond (non-admins)
    if not is_admin_or_above(current_user):
        user_dept_names = _get_user_dept_names(session, current_user.id)  # type: ignore[arg-type]
        if req.department and req.department not in user_dept_names:
            raise HTTPException(
                status_code=403,
                detail="Only members of the target department can respond to this request",
            )
    now = datetime.now(tz=timezone.utc)
    req.status = "in_progress"
    req.fulfilled_by_user_id = current_user.id
    req.fulfilled_by_username = current_user.username
    req.fulfillment_accepted_at = now
    req.fulfillment_note = body.note
    req.updated_at = now
    _record_history(
        session, req.id, current_user, "responded",  # type: ignore[arg-type]
        field_name="status",
        old_value="approved",
        new_value="in_progress",
        note=body.note,
    )
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_responded",
            title="Request Being Fulfilled",
            body=f"{current_user.username} has accepted your request {req.sn_no} and will deliver the items.",
            request_id=req.id,
        )
    session.commit()
    session.refresh(req)
    return _out(req, session)
