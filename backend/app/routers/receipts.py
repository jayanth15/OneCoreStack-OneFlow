"""Receipts router — /api/v1/receipts

Create: fulfiller dept or admin creates a receipt → request.status → awaiting_signoff
Signoff: requester or admin signs off → receipt.status → signed_off (or disputed)
Dispute: requester marks receipt as disputed
"""
from datetime import datetime, timezone
from typing import Annotated, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import Request, REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE
from app.models.request_item import RequestItem
from app.models.request_history import RequestHistory
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.models.unit import Unit
from app.routers.requests_helpers import get_user_departments, log_history
from app.schemas.receipt import (
    ReceiptCreate, ReceiptRead, ReceiptItemRead,
    ReceiptSignoff, ReceiptDispute,
)
from app.routers.notifications import create_notification

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])


# ── helpers ────────────────────────────────────────────────────────────────────

def _user_can_create_receipt(user: User, req: Request, session: Session) -> bool:
    """User can create a receipt if they belong to the target department or are admin."""
    if user.role in ("admin", "super_admin"):
        return True
    user_depts = get_user_departments(session, user.id)  # type: ignore[arg-type]
    user_codes = {d.code for d in user_depts}

    target_depts = set()
    if req.department:
        target_depts.add(req.department)
    items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    for it in items:
        if it.department:
            target_depts.add(it.department)
    return bool(target_depts & user_codes)


def _user_can_signoff(user: User, req: Request) -> bool:
    """Only the original requester or an admin can sign off."""
    if user.role in ("admin", "super_admin"):
        return True
    return req.requested_by_user_id == user.id


def _next_receipt_number(session: Session) -> str:
    year = datetime.now(tz=timezone.utc).year
    prefix = f"RCP-{year}-"
    rows = session.exec(select(Receipt.receipt_number).where(Receipt.receipt_number.like(f"{prefix}%"))).all()
    max_seq = 0
    for sn in rows:
        try:
            seq = int(sn.split("-")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            continue
    return f"{prefix}{max_seq + 1:04d}"


def _build_receipt_read(receipt: Receipt, session: Session) -> dict:
    items = session.exec(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)).all()
    item_list = []
    for it in items:
        unit_name = None
        if it.unit_id and session:
            u = session.get(Unit, it.unit_id)
            unit_name = u.name if u else None
        item_list.append({
            "id": it.id,
            "receipt_id": it.receipt_id,
            "request_item_id": it.request_item_id,
            "inventory_item_id": it.inventory_item_id,
            "item_name": it.item_name,
            "item_code": it.item_code,
            "item_type": it.item_type,
            "unit_id": it.unit_id,
            "unit_name": unit_name,
            "quantity_requested": it.quantity_requested,
            "quantity_delivered": it.quantity_delivered,
            "quantity_signed_off": it.quantity_signed_off,
            "discrepancy_note": it.discrepancy_note,
            "condition": it.condition,
        })
    return {
        "id": receipt.id,
        "receipt_number": receipt.receipt_number,
        "request_id": receipt.request_id,
        "created_by_user_id": receipt.created_by_user_id,
        "created_by_username": receipt.created_by_username,
        "created_at": receipt.created_at,
        "signed_off_by_user_id": receipt.signed_off_by_user_id,
        "signed_off_by_username": receipt.signed_off_by_username,
        "signed_off_at": receipt.signed_off_at,
        "disputed_at": receipt.disputed_at,
        "dispute_note": receipt.dispute_note,
        "status": receipt.status,
        "notes": receipt.notes,
        "items": item_list,
    }


# ── routes ─────────────────────────────────────────────────────────────────────


@router.get("")
def list_receipts(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> List[dict]:
    """List receipts visible to the current user."""
    stmt = select(Receipt).order_by(Receipt.created_at.desc())

    if current_user.role not in ("admin", "super_admin"):
        user_depts = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
        user_codes = {d.code for d in user_depts}
        # Get request IDs where user is requester OR target dept
        req_ids: set[int] = set()
        all_reqs = session.exec(select(Request)).all()
        for req in all_reqs:
            if req.requested_by_user_id == current_user.id:
                req_ids.add(req.id)  # type: ignore[arg-type]
                continue
            target = req.department
            if target and target in user_codes:
                req_ids.add(req.id)  # type: ignore[arg-type]
                continue
            # Also check item-level departments
            items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
            for it in items:
                if it.department and it.department in user_codes:
                    req_ids.add(req.id)  # type: ignore[arg-type]
                    break
        if req_ids:
            stmt = stmt.where(Receipt.request_id.in_(req_ids))  # type: ignore[arg-type]
        else:
            stmt = stmt.where(Receipt.id == -1)  # no results

    receipts = session.exec(stmt).all()
    return [_build_receipt_read(r, session) for r in receipts]


@router.get("/{receipt_id}")
def get_receipt(
    receipt_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return _build_receipt_read(receipt, session)


@router.post("", status_code=http_status.HTTP_201_CREATED)
def create_receipt(
    body: ReceiptCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    req = session.get(Request, body.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.request_type == "customer_dispatch":
        raise HTTPException(status_code=400, detail="Receipts are not applicable to customer_dispatch requests")
    if req.status not in ("in_progress", "awaiting_signoff"):
        raise HTTPException(status_code=409, detail=f"Cannot create a receipt for a request in status '{req.status}'")
    if not _user_can_create_receipt(current_user, req, session):
        raise HTTPException(status_code=403, detail="Not authorized to create a receipt for this request")

    # Create receipt
    receipt = Receipt(
        receipt_number=_next_receipt_number(session),
        request_id=body.request_id,
        created_by_user_id=current_user.id,
        created_by_username=current_user.username,
        status="created",
        notes=body.notes,
    )
    session.add(receipt)
    session.flush()  # need receipt.id

    # Create receipt items
    req_items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    req_item_map = {ri.id: ri for ri in req_items}

    for item_in in body.items:
        ri = req_item_map.get(item_in.request_item_id)
        if not ri:
            raise HTTPException(status_code=400, detail=f"Request item {item_in.request_item_id} not found for this request")
        session.add(ReceiptItem(
            receipt_id=receipt.id,  # type: ignore[arg-type]
            request_item_id=ri.id,  # type: ignore[arg-type]
            inventory_item_id=ri.inventory_item_id,
            item_name=ri.item_name,
            item_code=ri.item_code,
            item_type=ri.item_type,
            unit_id=getattr(ri, 'unit_id', None),
            quantity_requested=ri.quantity,
            quantity_delivered=item_in.quantity_delivered,
            condition=item_in.condition,
        ))

    # Transition request status
    req.status = "awaiting_signoff"
    session.add(req)

    # Log history
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_created", note=f"Receipt {receipt.receipt_number} created")

    # Notify requester
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="receipt_created",
            title=f"Receipt {receipt.receipt_number} ready for signoff",
            body=f"Items for {req.sn_no} have been prepared. Please review and sign off on receipt {receipt.receipt_number}.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(receipt)
    return _build_receipt_read(receipt, session)


@router.post("/{receipt_id}/signoff")
def signoff_receipt(
    receipt_id: int,
    body: ReceiptSignoff,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status != "created":
        raise HTTPException(status_code=409, detail=f"Cannot sign off a receipt in status '{receipt.status}'")

    req = session.get(Request, receipt.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _user_can_signoff(current_user, req):
        raise HTTPException(status_code=403, detail="Only the requester or an admin can sign off")

    receipt.status = "signed_off"
    receipt.signed_off_by_user_id = current_user.id
    receipt.signed_off_by_username = current_user.username
    receipt.signed_off_at = datetime.now(tz=timezone.utc)
    session.add(receipt)

    # Copy delivered quantities to signed_off on receipt items
    items = session.exec(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt_id)).all()
    for it in items:
        if it.quantity_signed_off is None:
            it.quantity_signed_off = it.quantity_delivered
        session.add(it)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="delivery_acknowledged",
                note=body.notes or f"Receipt {receipt.receipt_number} signed off")

    # Check if all active receipts for this request are signed off
    all_receipts = session.exec(
        select(Receipt).where(Receipt.request_id == req.id)
    ).all()
    all_signed_off = all(
        r.status == "signed_off" or r.id == receipt.id
        for r in all_receipts
    )
    if all_signed_off:
        old_status = req.status
        req.status = "received"
        req.acknowledged_by_user_id = current_user.id
        req.acknowledged_by_username = current_user.username
        req.acknowledged_at = datetime.now(tz=timezone.utc)
        req.acknowledgment_note = body.notes
        session.add(req)
        log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                    change_type="delivery_acknowledged", field_name="status", old_value=old_status,
                    new_value="received", note="All receipts signed off")

    session.commit()
    session.refresh(receipt)
    return _build_receipt_read(receipt, session)


@router.post("/{receipt_id}/dispute")
def dispute_receipt(
    receipt_id: int,
    body: ReceiptDispute,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status not in ("created", "signed_off"):
        raise HTTPException(status_code=409, detail=f"Cannot dispute a receipt in status '{receipt.status}'")

    req = session.get(Request, receipt.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _user_can_signoff(current_user, req):
        raise HTTPException(status_code=403, detail="Only the requester or an admin can dispute a receipt")

    receipt.status = "disputed"
    receipt.disputed_at = datetime.now(tz=timezone.utc)
    receipt.dispute_note = body.note
    session.add(receipt)

    # Revert request to awaiting_signoff so fulfiller can edit
    if req.status == "received":
        req.status = "awaiting_signoff"
        session.add(req)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_disputed", note=body.note or f"Receipt {receipt.receipt_number} disputed")

    session.commit()
    session.refresh(receipt)
    return _build_receipt_read(receipt, session)


@router.get("/by-request/{request_id}")
def list_receipts_by_request(
    request_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> List[dict]:
    """List all receipts for a given request."""
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    receipts = session.exec(
        select(Receipt).where(Receipt.request_id == request_id).order_by(Receipt.created_at.desc())
    ).all()
    return [_build_receipt_read(r, session) for r in receipts]
