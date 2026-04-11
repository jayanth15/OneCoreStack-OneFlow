"""Receipts (goods-received) router."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, is_admin_or_above
from app.models.department import Department
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_history import PurchaseRequestHistory
from app.models.receipt import Receipt
from app.models.user import User
from app.models.user_department import UserDepartment
from app.routers.notifications import create_notification

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])

# ── Schemas ───────────────────────────────────────────────────────────────────


class ReceiptCreate(BaseModel):
    request_id: int
    quantity_received: float
    notes: Optional[str] = None


class AcknowledgeRequest(BaseModel):
    note: Optional[str] = None


class ReceiptOut(BaseModel):
    id: int
    sn_no: str
    request_id: int
    item_name: Optional[str]
    item_code: Optional[str]
    quantity_requested: float
    quantity_received: float
    notes: Optional[str]
    created_by_user_id: Optional[int]
    created_by_username: Optional[str]
    status: str
    acknowledged_by_user_id: Optional[int]
    acknowledged_by_username: Optional[str]
    acknowledged_at: Optional[str]
    acknowledgment_note: Optional[str]
    created_at: str
    updated_at: str
    # Enriched from the parent purchase request
    requesting_department: Optional[str] = None
    requested_by_user_id: Optional[int] = None
    requested_by_username: Optional[str] = None
    fulfilled_by_username: Optional[str] = None


class PaginatedReceipts(BaseModel):
    items: list[ReceiptOut]
    total: int
    page: int
    page_size: int
    pages: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _next_sn(session: Session) -> str:
    year = datetime.now(tz=timezone.utc).year
    count = session.exec(
        select(func.count()).select_from(Receipt).where(
            Receipt.sn_no.like(f"RCPT-{year}-%")  # type: ignore[union-attr]
        )
    ).one()
    return f"RCPT-{year}-{count + 1:04d}"


def _out(
    r: Receipt,
    req: Optional[PurchaseRequest] = None,
) -> ReceiptOut:
    return ReceiptOut(
        id=r.id,  # type: ignore[arg-type]
        sn_no=r.sn_no,
        request_id=r.request_id,
        item_name=r.item_name,
        item_code=r.item_code,
        quantity_requested=r.quantity_requested,
        quantity_received=r.quantity_received,
        notes=r.notes,
        created_by_user_id=r.created_by_user_id,
        created_by_username=r.created_by_username,
        status=r.status,
        acknowledged_by_user_id=r.acknowledged_by_user_id,
        acknowledged_by_username=r.acknowledged_by_username,
        acknowledged_at=r.acknowledged_at.isoformat() if r.acknowledged_at else None,
        acknowledgment_note=r.acknowledgment_note,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
        requesting_department=req.department if req else None,
        requested_by_user_id=req.requested_by_user_id if req else None,
        requested_by_username=req.requested_by_username if req else None,
        fulfilled_by_username=req.fulfilled_by_username if req else None,
    )


def _record_history(
    session: Session,
    request_id: int,
    actor: str,
    change_type: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    note: Optional[str] = None,
) -> None:
    session.add(
        PurchaseRequestHistory(
            request_id=request_id,
            changed_by_username=actor,
            change_type=change_type,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            note=note,
        )
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
def create_receipt(
    payload: ReceiptCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ReceiptOut:
    """Create a goods-received entry for an approved purchase request."""
    req = session.get(PurchaseRequest, payload.request_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Purchase request not found")

    # Any authenticated user may record a receipt for an approved request
    # (the admin's approval is the authorisation signal)

    if req.status not in ("approved", "in_progress", "awaiting_signoff"):
        raise HTTPException(
            status_code=400,
            detail=f"Receipts can only be created for approved/in-progress requests (current status: {req.status})",
        )

    # Requester cannot create their own receipt — they use Acknowledge instead
    if req.requested_by_user_id == current_user.id and not is_admin_or_above(current_user):
        raise HTTPException(
            status_code=403,
            detail="Requesters cannot create receipts — use the Acknowledge action to sign off on a delivery",
        )
    # Non-admins must belong to the fulfilling (target) department to record a delivery
    if not is_admin_or_above(current_user) and req.department:
        user_dept_names = list(session.exec(
            select(Department.name)
            .join(UserDepartment, UserDepartment.department_id == Department.id)
            .where(UserDepartment.user_id == current_user.id)
        ).all())
        if req.department not in user_dept_names:
            raise HTTPException(
                status_code=403,
                detail="Only members of the fulfilling department can create receipts for this request",
            )

    # Block new delivery while a previous one is pending acknowledgment
    pending_count = session.exec(
        select(func.count()).select_from(Receipt).where(
            Receipt.request_id == req.id,  # type: ignore[union-attr]
            Receipt.status == "pending_ack",
            Receipt.is_active == True,  # noqa: E712
        )
    ).one()
    if pending_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Please acknowledge the existing delivery receipt before recording another",
        )

    if payload.quantity_received <= 0:
        raise HTTPException(status_code=400, detail="quantity_received must be greater than zero")

    receipt = Receipt(
        sn_no=_next_sn(session),
        request_id=req.id,  # type: ignore[arg-type]
        item_name=req.item_name,
        item_code=req.item_code,
        quantity_requested=req.quantity,
        quantity_received=payload.quantity_received,
        notes=payload.notes,
        created_by_user_id=current_user.id,
        created_by_username=current_user.username,
    )
    session.add(receipt)

    # Move request to awaiting_signoff so the requester knows to sign off on the delivery
    if req.status in ("approved", "in_progress"):
        old_status = req.status
        req.status = "awaiting_signoff"
        req.updated_at = datetime.now(tz=timezone.utc)
        _record_history(
            session,
            req.id,  # type: ignore[arg-type]
            current_user.username,
            "status_change",
            field_name="status",
            old_value=old_status,
            new_value="awaiting_signoff",
            note=f"Receipt {receipt.sn_no} created — awaiting sign-off from requester",
        )

    _record_history(
        session,
        req.id,  # type: ignore[arg-type]
        current_user.username,
        "receipt_created",
        note=f"Received {payload.quantity_received} of {req.quantity} — {payload.notes or ''}",
    )

    # Notify the original requester that a delivery is ready to acknowledge
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="receipt_created",
            title="Delivery Ready — Please Acknowledge",
            body=f"{current_user.username} has recorded a delivery for your request {req.sn_no}. Please sign off.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(receipt)
    req = session.get(PurchaseRequest, receipt.request_id)
    return _out(receipt, req)


class PendingCountOut(BaseModel):
    count: int


@router.get("/pending-count", response_model=PendingCountOut)
def pending_count(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> PendingCountOut:
    """
    Return the number of receipts that are still pending acknowledgment and
    visible to the current user.  Used by the sidebar badge.
    """
    stmt = select(func.count()).select_from(Receipt).where(
        Receipt.is_active == True,  # noqa: E712
        Receipt.status == "pending_ack",
    )

    if not is_admin_or_above(current_user):
        visible_req_ids = session.exec(
            select(PurchaseRequest.id).where(  # type: ignore[attr-defined]
                or_(
                    PurchaseRequest.requested_by_user_id == current_user.id,
                    PurchaseRequest.fulfilled_by_user_id == current_user.id,
                    PurchaseRequest.status.in_(["approved", "in_progress", "awaiting_signoff", "received"]),  # type: ignore[union-attr]
                )
            )
        ).all()
        stmt = stmt.where(Receipt.request_id.in_(visible_req_ids))  # type: ignore[union-attr]

    count = session.exec(stmt).one()
    return PendingCountOut(count=count)


@router.get("", response_model=PaginatedReceipts)
def list_receipts(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    request_id: Optional[int] = Query(None),
    receipt_status: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedReceipts:
    """List receipts. Non-admins only see receipts for requests in their department."""
    stmt = select(Receipt).where(Receipt.is_active == True)  # noqa: E712

    if request_id is not None:
        stmt = stmt.where(Receipt.request_id == request_id)

    if receipt_status:
        stmt = stmt.where(Receipt.status == receipt_status)

    # Non-admin: show receipts they created + receipts for requests they're involved with
    if not is_admin_or_above(current_user):
        visible_req_ids = session.exec(
            select(PurchaseRequest.id).where(  # type: ignore[attr-defined]
                or_(
                    PurchaseRequest.requested_by_user_id == current_user.id,
                    PurchaseRequest.fulfilled_by_user_id == current_user.id,
                    PurchaseRequest.status.in_(["approved", "in_progress", "awaiting_signoff", "received"]),  # type: ignore[union-attr]
                )
            )
        ).all()
        stmt = stmt.where(Receipt.request_id.in_(visible_req_ids))  # type: ignore[union-attr]

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    receipts = session.exec(
        stmt.order_by(Receipt.created_at.desc())  # type: ignore[union-attr]
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    # Batch-load parent requests so we can enrich each receipt with dept/user info
    req_ids = {r.request_id for r in receipts}
    req_map: dict[int, PurchaseRequest] = {}
    if req_ids:
        reqs = session.exec(
            select(PurchaseRequest).where(PurchaseRequest.id.in_(list(req_ids)))  # type: ignore[attr-defined]
        ).all()
        req_map = {r.id: r for r in reqs}  # type: ignore[union-attr]

    pages = max(1, -(-total // page_size))  # ceil division
    return PaginatedReceipts(
        items=[_out(r, req_map.get(r.request_id)) for r in receipts],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(
    receipt_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ReceiptOut:
    receipt = session.get(Receipt, receipt_id)
    if not receipt or not receipt.is_active:
        raise HTTPException(status_code=404, detail="Receipt not found")

    req = session.get(PurchaseRequest, receipt.request_id)
    if not is_admin_or_above(current_user):
        if req and req.department and current_user.department and req.department != current_user.department:
            raise HTTPException(status_code=403, detail="Not authorised to view this receipt")

    return _out(receipt, req)


@router.post("/{receipt_id}/acknowledge", response_model=ReceiptOut)
def acknowledge_receipt(
    receipt_id: int,
    payload: AcknowledgeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ReceiptOut:
    """Sign off on a delivery (requester or admin)."""
    receipt = session.get(Receipt, receipt_id)
    if not receipt or not receipt.is_active:
        raise HTTPException(status_code=404, detail="Receipt not found")

    if receipt.status == "acknowledged":
        raise HTTPException(status_code=400, detail="Receipt already acknowledged")

    req = session.get(PurchaseRequest, receipt.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Parent purchase request not found")

    # Only the requester (or their department colleagues) or admin can acknowledge
    if not is_admin_or_above(current_user):
        if req.requested_by_user_id != current_user.id:
            # Allow other members of the same department as the requester
            if req.requested_by_user_id:
                requester_dept_ids = set(session.exec(
                    select(UserDepartment.department_id)
                    .where(UserDepartment.user_id == req.requested_by_user_id)
                ).all())
                current_user_dept_ids = set(session.exec(
                    select(UserDepartment.department_id)
                    .where(UserDepartment.user_id == current_user.id)
                ).all())
                if not (requester_dept_ids & current_user_dept_ids):
                    raise HTTPException(
                        status_code=403,
                        detail="Only the requester or their department members can acknowledge this receipt",
                    )
            else:
                raise HTTPException(status_code=403, detail="Not authorised to acknowledge this receipt")

    now = datetime.now(tz=timezone.utc)
    receipt.status = "acknowledged"
    receipt.acknowledged_by_user_id = current_user.id
    receipt.acknowledged_by_username = current_user.username
    receipt.acknowledged_at = now
    receipt.acknowledgment_note = payload.note
    receipt.updated_at = now

    # Move request to received now that the delivery is acknowledged
    req.status = "received"
    req.updated_at = now

    _record_history(
        session,
        req.id,  # type: ignore[arg-type]
        current_user.username,
        "status_change",
        field_name="status",
        old_value="awaiting_signoff",
        new_value="received",
        note=f"Receipt {receipt.sn_no} acknowledged",
    )

    _record_history(
        session,
        req.id,  # type: ignore[arg-type]
        current_user.username,
        "receipt_acknowledged",
        note=f"Receipt {receipt.sn_no} acknowledged — {payload.note or ''}",
    )

    # Notify the delivery creator that their receipt was acknowledged
    if receipt.created_by_user_id:
        create_notification(
            session,
            user_id=receipt.created_by_user_id,
            notif_type="receipt_acknowledged",
            title="Delivery Receipt Acknowledged",
            body=f"{current_user.username} has signed off on receipt {receipt.sn_no} for {req.sn_no}.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(receipt)
    return _out(receipt, req)
