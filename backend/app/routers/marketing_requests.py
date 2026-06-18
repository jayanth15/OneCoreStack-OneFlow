"""Shim router for /api/v1/marketing-requests.

Delegates to the unified /api/v1/requests router.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import Optional, List

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import REQUEST_TYPE_CUSTOMER_DISPATCH
from app.schemas.request import RequestCreate, RequestUpdate, RequestRead, RequestListRead, RequestStatusUpdate
from app.routers.requests import (
    list_requests as _list_requests,
    create_request as _create_request,
    get_request as _get_request,
    update_request as _update_request,
    delete_request as _delete_request,
    set_status as _set_status,
)

router = APIRouter(prefix="/api/v1/marketing-requests", tags=["marketing-requests"])


@router.get("", response_model=List[RequestListRead])
def list_marketing_requests(
    status: Optional[str] = None,
    department: Optional[str] = None,
    only_active: bool = True,
    limit: int = 100,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List customer_dispatch requests.

    Fetches the single allowed type. (Same pattern as purchase shim's
    per-type fetch, kept for symmetry.)"""
    items = _list_requests(
        request_type=REQUEST_TYPE_CUSTOMER_DISPATCH, status=status,
        department=department, only_active=only_active, limit=limit + offset,
        offset=0, session=session, current_user=current_user,
    )
    items.sort(key=lambda r: r.created_at, reverse=True)
    return items[offset:offset + limit]


@router.post("", response_model=RequestRead, status_code=201)
def create_marketing_request(payload: RequestCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if payload.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="This endpoint accepts customer_dispatch only")
    return _create_request(payload=payload, session=session, current_user=current_user)


@router.get("/{request_id}", response_model=RequestRead)
def get_marketing_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _get_request(request_id=request_id, session=session, current_user=current_user)


@router.put("/{request_id}", response_model=RequestRead)
def update_marketing_request(request_id: int, payload: RequestUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _update_request(request_id=request_id, payload=payload, session=session, current_user=current_user)


@router.delete("/{request_id}", status_code=204)
def delete_marketing_request(request_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _delete_request(request_id=request_id, session=session, current_user=current_user)


@router.post("/{request_id}/status", response_model=RequestRead)
def set_marketing_status(request_id: int, payload: RequestStatusUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return _set_status(request_id=request_id, payload=payload, session=session, current_user=current_user)
