"""Unified /api/v1/requests router.

Handles all three request types: internal_transfer | vendor_purchase | customer_dispatch.
Old /api/v1/purchase-requests and /api/v1/marketing-requests routers
are thin shims around this code.
"""
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.request import (
    Request,
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
    REQUEST_TYPES,
)
from app.models.request_item import RequestItem
from app.models.request_history import RequestHistory
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.schemas.request import (
    RequestCreate, RequestUpdate, RequestRead, RequestListRead,
    RequestReviewAction, RequestItemAcceptAction, RequestStatusUpdate,
    RequestItemRead, RequestCustomerDispatchRead, RequestHistoryRead,
    RequestDeliverAction, RequestAcknowledgeDeliveryAction,
)
from app.routers.requests_helpers import (
    generate_sn, log_history, get_user_departments,
    build_department_label_map, label_for_code,
    notify_department_users,
)
from app.routers.notifications import create_notification
from app.routers.receipts import create_department_receipts_for_request

router = APIRouter(prefix="/api/v1/requests", tags=["requests"])


# --- auth/visibility helpers ---

def _user_can_see_type(user: User, request_type: str, user_depts: list) -> bool:
    """Authorisation model (from spec): by request_type.

    internal_transfer → any user can see (their own dept by default)
    vendor_purchase   → admin only
    customer_dispatch → user belongs to a department flagged as handling
                        customer dispatches, or user is admin.
    """
    if request_type == REQUEST_TYPE_VENDOR_PURCHASE:
        if user.role in ("admin", "super_admin"):
            return True
        return any(d.can_create_purchase_request for d in user_depts)
    if request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        if user.role in ("admin", "super_admin"):
            return True
        return any(d.handles_customer_dispatch for d in user_depts)
    return True  # internal_transfer: all users


def _user_can_create_purchase_request(user: User, user_depts: list) -> bool:
    if user.role in ("admin", "super_admin"):
        return True
    return any(d.can_create_purchase_request for d in user_depts)


def _apply_visibility_filter(stmt, user: User, user_depts: list):
    """Restrict stmt to request types the user is allowed to see."""
    allowed = [rt for rt in REQUEST_TYPES if _user_can_see_type(user, rt, user_depts)]
    return stmt.where(Request.request_type.in_(allowed))


def _apply_department_visibility_filter(stmt, user: User, user_depts: list):
    if user.role in ("admin", "super_admin"):
        return stmt

    dept_codes = [d.code for d in user_depts]
    visibility_conditions = [Request.requested_by_user_id == user.id]
    if dept_codes:
        item_request_ids = select(RequestItem.request_id).where(RequestItem.department.in_(dept_codes))  # type: ignore[arg-type]
        visibility_conditions.extend([
            Request.from_department.in_(dept_codes),  # type: ignore[arg-type]
            Request.department.in_(dept_codes),  # type: ignore[arg-type]
            Request.id.in_(item_request_ids),  # type: ignore[arg-type]
        ])
    return stmt.where(or_(*visibility_conditions))


def _user_can_see_request(user: User, req: Request, session: Session, user_depts: list) -> bool:
    if user.role in ("admin", "super_admin") or req.requested_by_user_id == user.id:
        return True

    dept_codes = {d.code for d in user_depts}
    if not dept_codes:
        return False
    if req.from_department in dept_codes or req.department in dept_codes:
        return True

    item = session.exec(
        select(RequestItem).where(
            RequestItem.request_id == req.id,
            RequestItem.department.in_(dept_codes),  # type: ignore[arg-type]
        )
    ).first()
    return item is not None


def _target_department_codes(req: Request, session: Session) -> list[str]:
    codes: list[str] = []
    seen: set[str] = set()
    if req.department:
        codes.append(req.department)
        seen.add(req.department)
    items = session.exec(select(RequestItem.department).where(RequestItem.request_id == req.id)).all()
    for code in items:
        if code and code not in seen:
            codes.append(code)
            seen.add(code)
    return codes


def _user_can_accept(user: User, req: Request, session: Session, user_depts: list) -> bool:
    """Fulfiller authorisation (from spec §Auth Model, lines 318-321).

    `internal_transfer`  → user belongs to a department whose code matches
                           req.department OR any line item's department, or
                           user is admin
    `vendor_purchase`    → user is admin or super_admin only
    `customer_dispatch`  → user belongs to a department flagged as handling
                           customer dispatches, or user is admin/super_admin
    """
    if user.role in ("admin", "super_admin"):
        return True

    if req.request_type == REQUEST_TYPE_VENDOR_PURCHASE:
        return False  # admin-only, and we already returned above for admins

    if req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        return any(d.handles_customer_dispatch for d in user_depts)

    # internal_transfer — match header or any per-item department code against
    # the codes of the departments the user belongs to.
    user_dept_codes = {d.code for d in user_depts}
    if not user_dept_codes:
        return False
    target_depts = set()
    if req.department:
        target_depts.add(req.department)
    items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    for it in items:
        if it.department:
            target_depts.add(it.department)
    return bool(target_depts & user_dept_codes)


# --- list ---

@router.get("", response_model=List[RequestListRead])
def list_requests(
    request_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    department: Optional[str] = Query(default=None),
    only_active: bool = Query(default=True),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Request)
    if only_active:
        stmt = stmt.where(Request.is_active == True)  # noqa: E712
    if request_type:
        if request_type not in REQUEST_TYPES:
            raise HTTPException(status_code=400, detail=f"request_type must be one of {REQUEST_TYPES}")
        stmt = stmt.where(Request.request_type == request_type)
    if status:
        stmt = stmt.where(Request.status == status)
    if department:
        stmt = stmt.where(Request.department == department)
    user_depts = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    stmt = _apply_visibility_filter(stmt, current_user, user_depts)
    stmt = _apply_department_visibility_filter(stmt, current_user, user_depts)
    stmt = stmt.order_by(Request.created_at.desc()).offset(offset).limit(limit)
    rows = session.exec(stmt).all()
    label_map = build_department_label_map(session)
    return [
        RequestListRead(
            id=r.id, sn_no=r.sn_no, request_type=r.request_type,
            from_department=r.from_department,
            from_department_label=label_for_code(r.from_department, label_map),
            department=r.department,
            department_label=label_for_code(r.department, label_map),
            target_departments=_target_department_codes(r, session),
            target_department_labels=[
                label_for_code(code, label_map) or code
                for code in _target_department_codes(r, session)
            ],
            from_whom=r.from_whom, quantity=r.quantity, status=r.status,
            requested_by_username=r.requested_by_username, created_at=r.created_at,
            is_active=r.is_active,
            delivered_by_username=r.delivered_by_username,
            delivered_at=r.delivered_at,
            acknowledged_by_username=r.acknowledged_by_username,
            acknowledged_at=r.acknowledged_at,
        )
        for r in rows
    ]


# --- inbox (dept-targeted "needs my action") ---

@router.get("/inbox", response_model=List[RequestListRead])
def list_inbox(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    user_depts = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    stmt = select(Request).where(
        Request.is_active == True,  # noqa: E712
        Request.status.in_(["approved", "in_progress", "awaiting_signoff"]),
        Request.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH,
    )
    if current_user.role not in ("admin", "super_admin"):
        dept_codes = [d.code for d in user_depts]
        if not dept_codes:
            return []
        item_request_ids = select(RequestItem.request_id).where(RequestItem.department.in_(dept_codes))  # type: ignore[arg-type]
        stmt = stmt.where(or_(
            Request.department.in_(dept_codes),  # type: ignore[arg-type]
            Request.id.in_(item_request_ids),  # type: ignore[arg-type]
        ))
    rows = session.exec(stmt.order_by(Request.created_at.desc()).offset(offset).limit(limit)).all()
    label_map = build_department_label_map(session)
    out = []
    for r in rows:
        if current_user.role in ("admin", "super_admin"):
            pass
        else:
            if not _user_can_accept(current_user, r, session, user_depts):
                continue
        out.append(RequestListRead(
            id=r.id, sn_no=r.sn_no, request_type=r.request_type,
            from_department=r.from_department,
            from_department_label=label_for_code(r.from_department, label_map),
            department=r.department,
            department_label=label_for_code(r.department, label_map),
            target_departments=_target_department_codes(r, session),
            target_department_labels=[
                label_for_code(code, label_map) or code
                for code in _target_department_codes(r, session)
            ],
            from_whom=r.from_whom, quantity=r.quantity, status=r.status,
            requested_by_username=r.requested_by_username, created_at=r.created_at,
            is_active=r.is_active,
            delivered_by_username=r.delivered_by_username,
            delivered_at=r.delivered_at,
            acknowledged_by_username=r.acknowledged_by_username,
            acknowledged_at=r.acknowledged_at,
        ))
    return out


# --- create ---

@router.post("", response_model=RequestRead, status_code=201)
def create_request(
    payload: RequestCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if not _user_can_see_type(current_user, payload.request_type, get_user_departments(session, current_user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail=f"Not allowed to create {payload.request_type} requests")
    user_departments = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    if payload.request_type == REQUEST_TYPE_VENDOR_PURCHASE and not _user_can_create_purchase_request(current_user, user_departments):
        raise HTTPException(status_code=403, detail="Your department is not configured for purchase requests")

    sn_no = generate_sn(session, payload.request_type)
    # Auto-stamp requester's home department (not for customer_dispatch)
    from_department: Optional[str] = None
    if payload.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH:
        if user_departments:
            from_department = user_departments[0].code

    # Validate: internal_transfer cannot send to own department
    if payload.request_type == REQUEST_TYPE_INTERNAL_TRANSFER:
        if from_department and payload.department == from_department:
            raise HTTPException(status_code=400, detail="Cannot create an internal transfer to the same department")

    new_req = Request(
        sn_no=sn_no,
        request_type=payload.request_type,
        from_department=from_department,
        department=payload.department,
        from_whom=payload.from_whom,
        quantity=sum(i.quantity for i in payload.items) if payload.items else (payload.dispatch.quantity if payload.dispatch else 0.0),
        notes=payload.notes,
        status="pending",
        requested_by_user_id=current_user.id,
        requested_by_username=current_user.username,
    )
    session.add(new_req)
    session.flush()  # need id

    if payload.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        for item_in in payload.items:
            session.add(RequestItem(
                request_id=new_req.id,
                inventory_item_id=item_in.inventory_item_id,
                item_name=item_in.item_name,
                item_code=item_in.item_code,
                item_type=item_in.item_type,
                description=item_in.description,
                quantity=item_in.quantity,
                timeline_days=item_in.timeline_days,
                department=item_in.department,
            ))
    elif payload.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH and payload.dispatch:
        session.add(RequestCustomerDispatch(
            request_id=new_req.id,
            customer_name=payload.dispatch.customer_name,
            customer_phone=payload.dispatch.customer_phone,
            customer_address=payload.dispatch.customer_address,
            customer_bought_by=payload.dispatch.customer_bought_by,
            delivery_type=payload.dispatch.delivery_type,
            inventory_type=payload.dispatch.inventory_type,
            item_id=payload.dispatch.item_id,
            item_sn_no=payload.dispatch.item_sn_no,
            item_description=payload.dispatch.item_description,
            quantity=payload.dispatch.quantity,
        ))

    log_history(session, new_req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="created", note=f"Created {payload.request_type} request {sn_no}")
    session.commit()
    session.refresh(new_req)
    return _build_read(new_req, session)


# --- read one ---

@router.get("/{request_id}", response_model=RequestRead)
def get_request(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    user_depts = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    if not _user_can_see_type(current_user, req.request_type, user_depts):
        raise HTTPException(status_code=403, detail="Not allowed to view this request")
    if not _user_can_see_request(current_user, req, session, user_depts):
        raise HTTPException(status_code=403, detail="Not allowed to view this request")
    return _build_read(req, session)


# --- update ---

@router.put("/{request_id}", response_model=RequestRead)
def update_request(
    request_id: int,
    payload: RequestUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.requested_by_user_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the requester or an admin can edit")

    if req.status not in ("pending",):
        raise HTTPException(status_code=409, detail=f"Cannot edit a request in status '{req.status}'")

    changes = []
    for field in ("department", "from_whom", "notes"):
        new_val = getattr(payload, field)
        old_val = getattr(req, field)
        if new_val is not None and new_val != old_val:
            setattr(req, field, new_val)
            changes.append((field, old_val, new_val))

    if payload.items is not None and req.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
        for old in session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all():
            session.delete(old)
        session.flush()
        for item_in in payload.items:
            session.add(RequestItem(
                request_id=req.id, inventory_item_id=item_in.inventory_item_id,
                item_name=item_in.item_name, item_code=item_in.item_code,
                item_type=item_in.item_type, description=item_in.description,
                quantity=item_in.quantity, timeline_days=item_in.timeline_days,
                department=item_in.department,
            ))
        req.quantity = sum(i.quantity for i in payload.items)
        changes.append(("items", "replaced", f"{len(payload.items)} items"))

    if payload.dispatch is not None and req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        dispatch = session.exec(select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)).one_or_none()
        if not dispatch:
            dispatch = RequestCustomerDispatch(request_id=req.id)
            session.add(dispatch)
        for field in ("customer_name", "customer_phone", "customer_address", "customer_bought_by",
                      "delivery_type", "inventory_type", "item_id", "item_sn_no", "item_description", "quantity"):
            new_val = getattr(payload.dispatch, field)
            if new_val is not None:
                setattr(dispatch, field, new_val)
        req.quantity = payload.dispatch.quantity or req.quantity

    req.updated_at = datetime.now(tz=timezone.utc)
    for f, o, n in changes:
        log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                    change_type="edited", field_name=f, old_value=str(o) if o else None, new_value=str(n) if n else None)

    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- delete (soft) ---

@router.delete("/{request_id}", status_code=204)
def delete_request(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can cancel requests")
    req.is_active = False
    req.status = "cancelled"
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="cancelled", note="Soft-deleted")
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_cancelled",
            title=f"Request {req.sn_no} cancelled",
            body=f"Request {req.sn_no} was cancelled by {current_user.username}.",
            request_id=req.id,
        )
    if req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_cancelled",
            title=f"Request {req.sn_no} cancelled",
            body=f"Request {req.sn_no} targeting your department was cancelled by {current_user.username}.",
            request_id=req.id,
        )
    session.commit()
    return None


# --- review (admin approve/reject) ---

@router.post("/{request_id}/review", response_model=RequestRead)
def review_request(
    request_id: int,
    payload: RequestReviewAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can review requests")
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot review a request in status '{req.status}'")

    if payload.decision == "approve":
        request_items = session.exec(
            select(RequestItem).where(RequestItem.request_id == req.id)
        ).all()
        items_by_id = {item.id: item for item in request_items}
        supplied_ids = [entry.item_id for entry in payload.item_quantities]
        if len(supplied_ids) != len(set(supplied_ids)):
            raise HTTPException(status_code=422, detail="Each request item quantity may only be supplied once")
        for entry in payload.item_quantities:
            item = items_by_id.get(entry.item_id)
            if not item:
                raise HTTPException(status_code=422, detail=f"Request item {entry.item_id} does not belong to this request")
            old_quantity = item.quantity
            item.quantity = entry.quantity
            session.add(item)
            if old_quantity != entry.quantity:
                log_history(
                    session, req.id,
                    changed_by_user_id=current_user.id,
                    changed_by_username=current_user.username,
                    change_type="edited",
                    field_name=f"item_quantity:{item.item_name or item.id}",
                    old_value=str(old_quantity),
                    new_value=str(entry.quantity),
                    note="Quantity adjusted during approval",
                )
        if request_items:
            req.quantity = sum(item.quantity for item in request_items)

        if payload.dispatch_quantity is not None:
            dispatch = session.exec(
                select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)
            ).one_or_none()
            if not dispatch:
                raise HTTPException(status_code=422, detail="Dispatch quantity is only valid for customer dispatch requests")
            old_dispatch_quantity = dispatch.quantity
            dispatch.quantity = payload.dispatch_quantity
            req.quantity = payload.dispatch_quantity
            session.add(dispatch)
            if old_dispatch_quantity != payload.dispatch_quantity:
                log_history(
                    session, req.id,
                    changed_by_user_id=current_user.id,
                    changed_by_username=current_user.username,
                    change_type="edited",
                    field_name="dispatch_quantity",
                    old_value=str(old_dispatch_quantity),
                    new_value=str(payload.dispatch_quantity),
                    note="Quantity adjusted during approval",
                )

    old_status = req.status
    req.status = "approved" if payload.decision == "approve" else "not_approved"
    req.reviewed_by_user_id = current_user.id
    req.reviewed_by_username = current_user.username
    req.reviewed_at = datetime.now(tz=timezone.utc)
    req.review_note = payload.note

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="approved" if payload.decision == "approve" else "rejected",
                field_name="status", old_value=old_status, new_value=req.status, note=payload.note)
    if req.requested_by_user_id:
        if payload.decision == "approve":
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="request_approved",
                title=f"Request {req.sn_no} approved",
                body=f"Your request {req.sn_no} was approved by {current_user.username}.",
                request_id=req.id,
            )
        else:
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="request_rejected",
                title=f"Request {req.sn_no} not approved",
                body=f"Your request {req.sn_no} was not approved by {current_user.username}.{f' Note: {payload.note}' if payload.note else ''}",
                request_id=req.id,
            )
    if payload.decision == "approve" and req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_approved",
            title=f"New request {req.sn_no} for your department",
            body=f"Request {req.sn_no} was approved and is awaiting acceptance by your department.",
            request_id=req.id,
        )
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- fulfilment (target dept accepts) ---

@router.post("/{request_id}/accept", response_model=RequestRead)
def accept_fulfilment(
    request_id: int,
    department: Optional[str] = None,
    note: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("approved", "in_progress"):
        raise HTTPException(status_code=409, detail=f"Cannot accept a request in status '{req.status}'")

    user_departments = get_user_departments(session, current_user.id)  # type: ignore[arg-type]
    if not _user_can_accept(current_user, req, session, user_departments):
        raise HTTPException(status_code=403, detail="Not allowed to accept this request")

    target_departments = _target_department_codes(req, session)
    allowed_departments = set(target_departments)
    if current_user.role not in ("admin", "super_admin"):
        allowed_departments &= {dept.code for dept in user_departments}

    request_items = session.exec(
        select(RequestItem).where(RequestItem.request_id == req.id)
    ).all()

    def items_for_department(code: str) -> list[RequestItem]:
        return [item for item in request_items if (item.department or req.department) == code]

    pending_departments = [
        code for code in target_departments
        if code in allowed_departments
        and any(item.item_status != "in_progress" for item in items_for_department(code))
    ]
    # Requests without line items (for example customer dispatch) still use the
    # request-level fulfilment fields and have one target department.
    if not request_items and req.status == "approved":
        pending_departments = [code for code in target_departments if code in allowed_departments]

    if department is None:
        if len(pending_departments) != 1:
            if not pending_departments:
                raise HTTPException(status_code=409, detail="Your department has already accepted this request")
            raise HTTPException(status_code=400, detail="department is required when more than one department can accept")
        department = pending_departments[0]
    elif department not in target_departments:
        raise HTTPException(status_code=400, detail="Department is not a target of this request")
    elif department not in allowed_departments:
        raise HTTPException(status_code=403, detail="Not allowed to accept for this department")

    department_items = items_for_department(department)
    if request_items and not department_items:
        raise HTTPException(status_code=400, detail="No request items belong to this department")
    if department_items and all(item.item_status == "in_progress" for item in department_items):
        raise HTTPException(status_code=409, detail="This department has already accepted the request")

    accepted_at = datetime.now(tz=timezone.utc)
    for item in department_items:
        item.item_status = "in_progress"
        item.accepted_by_username = current_user.username
        item.accepted_at = accepted_at
        item.acceptance_note = note
        session.add(item)

    all_departments_accepted = not request_items or all(
        item.item_status == "in_progress" for item in request_items
    )
    if all_departments_accepted:
        req.status = "in_progress"
        req.fulfilled_by_user_id = current_user.id
        req.fulfilled_by_username = current_user.username
        req.fulfillment_accepted_at = accepted_at
        req.fulfillment_note = note
    req.updated_at = accepted_at

    log_history(
        session, req.id,
        changed_by_user_id=current_user.id,
        changed_by_username=current_user.username,
        change_type="responded",
        field_name=f"department:{department}",
        old_value="pending",
        new_value="accepted",
        note=note,
    )
    if req.requested_by_user_id:
        create_notification(
            session,
            user_id=req.requested_by_user_id,
            notif_type="request_accepted",
            title=f"Request {req.sn_no} accepted by {department}",
            body=(
                f"Department {department} accepted your request {req.sn_no}."
                + (" All target departments have now accepted it."
                   if all_departments_accepted else " Other departments are still pending.")
            ),
            request_id=req.id,
        )
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- deliver (fulfilling dept marks delivered → awaiting_signoff) ---

@router.post("/{request_id}/deliver", response_model=RequestRead)
def deliver_request(
    request_id: int,
    payload: RequestDeliverAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="deliver is not applicable to customer_dispatch requests")
    if req.status != "in_progress":
        raise HTTPException(status_code=409, detail=f"Cannot deliver a request in status '{req.status}'")
    if not _user_can_accept(current_user, req, session, get_user_departments(session, current_user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail="Not allowed to deliver this request")

    req_items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    req_item_map = {item.id: item for item in req_items}
    for delivered in payload.items:
        item = req_item_map.get(delivered.request_item_id)
        if not item:
            raise HTTPException(status_code=400, detail=f"Request item {delivered.request_item_id} not found for this request")
        if delivered.quantity_delivered > item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Delivered quantity for {item.item_name or delivered.request_item_id} cannot exceed requested quantity",
            )

    old_status = req.status
    req.status = "awaiting_signoff"
    req.delivered_by_user_id = current_user.id
    req.delivered_by_username = current_user.username
    req.delivered_at = datetime.now(tz=timezone.utc)
    req.delivery_note = payload.delivery_note
    req.updated_at = datetime.now(tz=timezone.utc)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="delivered", field_name="status", old_value=old_status, new_value="awaiting_signoff",
                note=payload.delivery_note)

    create_department_receipts_for_request(
        session=session,
        req=req,
        current_user=current_user,
        notes=payload.delivery_note,
        delivered_items=payload.items,
    )

    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- acknowledge delivery (requester confirms receipt → received) ---

@router.post("/{request_id}/acknowledge-delivery", response_model=RequestRead)
def acknowledge_delivery(
    request_id: int,
    payload: RequestAcknowledgeDeliveryAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        raise HTTPException(status_code=400, detail="acknowledge-delivery is not applicable to customer_dispatch requests")
    if req.status != "awaiting_signoff":
        raise HTTPException(status_code=409, detail=f"Cannot acknowledge a request in status '{req.status}'")
    if req.requested_by_user_id != current_user.id and current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only the requester or an admin can confirm receipt")

    old_status = req.status
    req.status = "received"
    req.acknowledged_by_user_id = current_user.id
    req.acknowledged_by_username = current_user.username
    req.acknowledged_at = datetime.now(tz=timezone.utc)
    req.acknowledgment_note = payload.acknowledgment_note
    req.updated_at = datetime.now(tz=timezone.utc)

    receipts = session.exec(select(Receipt).where(Receipt.request_id == req.id)).all()
    for receipt in receipts:
        if receipt.status != "created":
            continue
        receipt.status = "signed_off"
        receipt.signed_off_by_user_id = current_user.id
        receipt.signed_off_by_username = current_user.username
        receipt.signed_off_at = req.acknowledged_at
        session.add(receipt)

        receipt_items = session.exec(select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)).all()
        for item in receipt_items:
            if item.quantity_signed_off is None:
                item.quantity_signed_off = item.quantity_delivered
            session.add(item)

    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="delivery_acknowledged", field_name="status", old_value=old_status, new_value="received",
                note=payload.acknowledgment_note)

    if req.department:
        notify_department_users(
            session,
            department_code=req.department,
            notif_type="request_received",
            title=f"Request {req.sn_no} confirmed",
            body=f"Requester {current_user.username} confirmed receipt of {req.sn_no}.",
            request_id=req.id,
        )

    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- per-item acceptance (dept marks item received) ---

@router.post("/{request_id}/items/accept", response_model=RequestRead)
def accept_item(
    request_id: int,
    payload: RequestItemAcceptAction,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("approved", "in_progress", "awaiting_signoff"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot accept items on a request in status '{req.status}'"
        )
    if not _user_can_accept(current_user, req, session, get_user_departments(session, current_user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail="Not allowed to accept this request")
    item = session.get(RequestItem, payload.item_id)
    if not item or item.request_id != req.id:
        raise HTTPException(status_code=404, detail="Item not found")
    old_item_status = item.item_status
    item.item_status = "in_progress" if payload.decision == "accept" else "rejected"
    item.accepted_by_username = current_user.username
    item.accepted_at = datetime.now(tz=timezone.utc)
    item.acceptance_note = payload.note
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="responded", field_name=f"item:{item.item_name}",
                old_value=old_item_status, new_value=item.item_status, note=payload.note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- manual status update (admin) ---

@router.post("/{request_id}/status", response_model=RequestRead)
def set_status(
    request_id: int,
    payload: RequestStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can change status manually")
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    old_status = req.status
    req.status = payload.new_status
    req.updated_at = datetime.now(tz=timezone.utc)
    log_history(session, req.id, changed_by_user_id=current_user.id, changed_by_username=current_user.username,
                change_type="status_change", field_name="status", old_value=old_status, new_value=payload.new_status, note=payload.note)
    session.commit()
    session.refresh(req)
    return _build_read(req, session)


# --- history ---

@router.get("/{request_id}/history", response_model=List[RequestHistoryRead])
def get_history(
    request_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    req = session.get(Request, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if not _user_can_see_type(current_user, req.request_type, get_user_departments(session, current_user.id)):  # type: ignore[arg-type]
        raise HTTPException(status_code=403, detail="Not allowed to view this request's history")
    return session.exec(
        select(RequestHistory).where(RequestHistory.request_id == request_id).order_by(RequestHistory.changed_at.asc())
    ).all()


# --- build read ---

def _build_read(req: Request, session: Session) -> RequestRead:
    items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
    dispatch = session.exec(select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)).one_or_none()
    history = session.exec(
        select(RequestHistory).where(RequestHistory.request_id == req.id).order_by(RequestHistory.changed_at.asc())
    ).all()
    label_map = build_department_label_map(session)
    return RequestRead(
        id=req.id, sn_no=req.sn_no, request_type=req.request_type,
        from_department=req.from_department,
        department=req.department,
        department_label=label_for_code(req.department, label_map),
        from_whom=req.from_whom, quantity=req.quantity, notes=req.notes, status=req.status,
        requested_by_user_id=req.requested_by_user_id, requested_by_username=req.requested_by_username,
        created_at=req.created_at, updated_at=req.updated_at,
        reviewed_by_user_id=req.reviewed_by_user_id, reviewed_by_username=req.reviewed_by_username,
        reviewed_at=req.reviewed_at, review_note=req.review_note,
        fulfilled_by_user_id=req.fulfilled_by_user_id, fulfilled_by_username=req.fulfilled_by_username,
        fulfillment_accepted_at=req.fulfillment_accepted_at, fulfillment_note=req.fulfillment_note,
        delivered_by_user_id=req.delivered_by_user_id,
        delivered_by_username=req.delivered_by_username,
        delivered_at=req.delivered_at,
        delivery_note=req.delivery_note,
        acknowledged_by_user_id=req.acknowledged_by_user_id,
        acknowledged_by_username=req.acknowledged_by_username,
        acknowledged_at=req.acknowledged_at,
        acknowledgment_note=req.acknowledgment_note,
        is_active=req.is_active,
        items=[RequestItemRead(
            id=i.id, inventory_item_id=i.inventory_item_id, item_name=i.item_name, item_code=i.item_code,
            item_type=i.item_type, description=i.description, quantity=i.quantity, timeline_days=i.timeline_days,
            department=i.department, department_label=label_for_code(i.department, label_map),
            item_status=i.item_status, accepted_by_username=i.accepted_by_username, accepted_at=i.accepted_at,
            acceptance_note=i.acceptance_note,
        ) for i in items],
        dispatch=RequestCustomerDispatchRead.model_validate(dispatch) if dispatch else None,
        history=[RequestHistoryRead.model_validate(h) for h in history],
    )
