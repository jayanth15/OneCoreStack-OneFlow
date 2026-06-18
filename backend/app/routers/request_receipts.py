"""Unified /api/v1/request-receipts router.

Renamed from /api/v1/receipts. Old router kept as a thin shim.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import Request
from app.models.request_receipt import RequestReceipt
from app.schemas.request_receipt import (
    RequestReceiptCreate, RequestReceiptRead, RequestReceiptAcknowledge,
)
from app.routers.requests_helpers import log_history

router = APIRouter(prefix="/api/v1/request-receipts", tags=["request-receipts"])


def _generate_rcpt_sn(session: Session) -> str:
    year = datetime.now(tz=timezone.utc).year
    sn_prefix = f"RCPT-{year}-"
    rows = session.exec(
        select(RequestReceipt.sn_no).where(RequestReceipt.sn_no.like(f"{sn_prefix}%"))
    ).all()
    max_seq = 0
    for sn in rows:
        try:
            seq = int(sn.split("-")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            continue
    return f"{sn_prefix}{max_seq + 1:04d}"


@router.get("", response_model=List[RequestReceiptRead])
def list_receipts(
    request_id: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    stmt = select(RequestReceipt)
    if only_active:
        stmt = stmt.where(RequestReceipt.is_active == True)  # noqa: E712
    if request_id is not None:
        stmt = stmt.where(RequestReceipt.request_id == request_id)
    if status:
        stmt = stmt.where(RequestReceipt.status == status)
    stmt = stmt.order_by(RequestReceipt.created_at.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()


@router.post("", response_model=RequestReceiptRead, status_code=201)
def create_receipt(
    payload: RequestReceiptCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, payload.request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("approved", "in_progress", "awaiting_signoff"):
        raise HTTPException(status_code=409, detail=f"Cannot create receipt for a request in status '{req.status}'")

    sn_no = _generate_rcpt_sn(session)
    new_receipt = RequestReceipt(
        sn_no=sn_no,
        request_id=payload.request_id,
        item_name=payload.item_name,
        item_code=payload.item_code,
        quantity_requested=payload.quantity_requested,
        quantity_received=payload.quantity_received,
        notes=payload.notes,
        department=payload.department,
        created_by_user_id=current_user.id,
        created_by_username=current_user.username,
        status="pending_ack",
    )
    session.add(new_receipt)
    session.flush()
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_created", note=f"Created receipt {sn_no} for qty={payload.quantity_received}")
    session.commit()
    session.refresh(new_receipt)
    return new_receipt


@router.get("/{receipt_id}", response_model=RequestReceiptRead)
def get_receipt(
    receipt_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return r


@router.post("/{receipt_id}/acknowledge", response_model=RequestReceiptRead)
def acknowledge_receipt(
    receipt_id: int,
    payload: RequestReceiptAcknowledge,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if current_user.role not in ("admin", "super_admin") and r.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the receipt creator or an admin can acknowledge")
    if r.status == "acknowledged":
        raise HTTPException(status_code=409, detail="Receipt is already acknowledged")
    r.status = "acknowledged"
    r.acknowledged_by_user_id = current_user.id
    r.acknowledged_by_username = current_user.username
    r.acknowledged_at = datetime.now(tz=timezone.utc)
    r.acknowledgment_note = payload.note
    r.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, r.request_id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_acknowledged", note=payload.note)
    req = session.get(Request, r.request_id)
    if req and req.status != "received":
        req.status = "received"
        req.updated_at = datetime.now(tz=timezone.utc)
    session.commit()
    session.refresh(r)
    return r


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(
    receipt_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    r = session.get(RequestReceipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if current_user.role not in ("admin", "super_admin") and r.created_by_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator or admin can delete")
    r.is_active = False
    r.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, r.request_id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="receipt_deleted", note=f"Receipt {r.sn_no} soft-deleted")
    session.commit()
    return None
