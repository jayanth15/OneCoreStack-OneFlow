"""Shim router for /api/v1/receipts.

Delegates to the unified /api/v1/request-receipts router.
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session
from typing import Optional, List

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.request_receipt import RequestReceiptCreate, RequestReceiptRead, RequestReceiptAcknowledge
from app.routers.request_receipts import (
    list_receipts as _list_receipts,
    create_receipt as _create_receipt,
    get_receipt as _get_receipt,
    acknowledge_receipt as _acknowledge_receipt,
    delete_receipt as _delete_receipt,
)

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])


@router.get("", response_model=List[RequestReceiptRead])
def list_receipts(
    request_id: Optional[int] = None,
    status: Optional[str] = None,
    only_active: bool = True,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return _list_receipts(
        request_id=request_id, status=status, only_active=only_active,
        limit=limit, offset=offset, session=session, current_user=current_user,
    )


@router.post("", response_model=RequestReceiptRead, status_code=201)
def create_receipt(payload: RequestReceiptCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _create_receipt(payload=payload, session=session, current_user=current_user)


@router.get("/{receipt_id}", response_model=RequestReceiptRead)
def get_receipt(receipt_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_receipt(receipt_id=receipt_id, session=session, current_user=current_user)


@router.post("/{receipt_id}/acknowledge", response_model=RequestReceiptRead)
def acknowledge_receipt(receipt_id: int, payload: RequestReceiptAcknowledge, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _acknowledge_receipt(receipt_id=receipt_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(receipt_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_receipt(receipt_id=receipt_id, session=session, current_user=current_user)
