"""Shim router for /api/v1/purchase-requests.

Delegates to the unified /api/v1/requests router. Kept for back-compat
with old frontend clients and external integrations. The implementation
lives in app/routers/requests.py.
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session
from typing import Optional, List

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE
from app.schemas.request import RequestCreate, RequestUpdate, RequestRead, RequestListRead, RequestReviewAction, RequestStatusUpdate
from app.routers.requests import (
    list_requests as _list_requests,
    create_request as _create_request,
    get_request as _get_request,
    update_request as _update_request,
    delete_request as _delete_request,
    review_request as _review_request,
    set_status as _set_status,
)

router = APIRouter(prefix="/api/v1/purchase-requests", tags=["purchase-requests"])


@router.get("", response_model=List[RequestListRead])
def list_purchase_requests(
    status: Optional[str] = None,
    department: Optional[str] = None,
    only_active: bool = True,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List internal_transfer + vendor_purchase requests."""
    items = _list_requests(
        request_type=None,
        status=status, department=department, only_active=only_active,
        limit=limit, offset=offset, session=session, current_user=current_user,
    )
    return [r for r in items if r.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE)]


@router.post("", response_model=RequestRead, status_code=201)
def create_purchase_request(payload: RequestCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if payload.request_type not in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="This endpoint accepts internal_transfer or vendor_purchase only")
    return _create_request(payload=payload, session=session, current_user=current_user)


@router.get("/{request_id}", response_model=RequestRead)
def get_purchase_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_request(request_id=request_id, session=session, current_user=current_user)


@router.put("/{request_id}", response_model=RequestRead)
def update_purchase_request(request_id: int, payload: RequestUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _update_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{request_id}", status_code=204)
def delete_purchase_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_request(request_id=request_id, session=session, current_user=current_user)


@router.post("/{request_id}/review", response_model=RequestRead)
def review_purchase_request(request_id: int, payload: RequestReviewAction, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _review_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.post("/{request_id}/status", response_model=RequestRead)
def set_purchase_status(request_id: int, payload: RequestStatusUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _set_status(request_id=request_id, payload=payload, session=session, current_user=current_user)
