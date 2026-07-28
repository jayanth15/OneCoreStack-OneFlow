"""
Dispatch router.

GET    /api/v1/dispatch        — list dispatches
POST   /api/v1/dispatch        — create a dispatch
GET    /api/v1/dispatch/{id}   — get single dispatch
PUT    /api/v1/dispatch/{id}   — update dispatch
DELETE /api/v1/dispatch/{id}   — cancel/delete dispatch
"""
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.dispatch import Dispatch
from app.models.dispatch_history import DispatchHistory
from app.models.dispatch_item import DispatchItem
from app.models.receipt import Receipt
from app.models.request import Request, REQUEST_TYPE_CUSTOMER_DISPATCH
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.request_item import RequestItem
from app.models.unit import Unit
from app.models.user import User
from app.routers.notifications import create_notification
from app.routers.requests_helpers import log_history
from app.services.request_inventory import StockDeduction, deduct_request_stock

router = APIRouter(prefix="/api/v1/dispatch", tags=["dispatch"])


# ── Number generation ─────────────────────────────────────────────────────────

def _next_dispatch_number(session: Session) -> str:
    count = session.exec(select(Dispatch)).all()
    return f"DSP-{(len(count) + 1):04d}"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
def list_dispatches(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: str = "",
    status_filter: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """List dispatches. Accessible to users with dispatch_access or admin."""
    _require_dispatch_access(current_user)
    q = select(Dispatch).where(Dispatch.status != "deleted").order_by(Dispatch.id.desc())  # type: ignore[union-attr]
    dispatches = list(session.exec(q).all())

    if status_filter:
        dispatches = [d for d in dispatches if d.status == status_filter]
    if search:
        s = search.lower()
        dispatches = [d for d in dispatches
                      if s in (d.dispatch_number or "").lower()
                      or s in (d.vendor_name or "").lower()
                      or s in (d.product_name or "").lower()]

    total = len(dispatches)
    start = (page - 1) * page_size
    page_dispatches = dispatches[start: start + page_size]

    # Batch-load items for this page
    dispatch_ids = [d.id for d in page_dispatches if d.id is not None]
    all_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id.in_(dispatch_ids))).all()) if dispatch_ids else []  # type: ignore[union-attr]
    items_by_dispatch: dict[int, list[DispatchItem]] = {}
    for di in all_items:
        items_by_dispatch.setdefault(di.dispatch_id, []).append(di)

    return {"items": [_to_dict(d, items_by_dispatch.get(d.id, []), session) for d in page_dispatches], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dispatch(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    requested_status = (body.get("status") or "pending").strip()
    if requested_status != "pending":
        raise HTTPException(status_code=422, detail="Dispatches must be created as pending")
    party_type = body.get("party_type") or "vendor"
    if party_type not in ("vendor", "supplier"):
        raise HTTPException(status_code=422, detail="party_type must be vendor or supplier")
    raw_items = body.get("items") or []
    linked_request = _linked_request(session, body.get("request_id"))
    if linked_request:
        raw_items = _request_dispatch_items(session, linked_request)
    first_item_name = ""
    first_qty = 0.0
    first_unit_id = None
    if raw_items:
        first = raw_items[0]
        first_item_name = (first.get("item_name") or "").strip()
        first_qty = float(first.get("quantity") or 0)
        first_unit_id = first.get("unit_id") or None

    dispatch = Dispatch(
        dispatch_number=_next_dispatch_number(session),
        party_type=party_type,
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        schedule_id=body.get("schedule_id"),
        schedule_number=(body.get("schedule_number") or "").strip() or None,
        request_id=body.get("request_id"),
        request_sn_no=linked_request.sn_no if linked_request else None,
        receipt_id=None,
        receipt_number=None,
        product_name=first_item_name or (body.get("product_name") or "").strip(),
        quantity=first_qty or float(body.get("quantity") or 0),
        unit_id=first_unit_id or body.get("unit_id") or None,
        dispatch_date=(body.get("dispatch_date") or "").strip() or None,
        vehicle_number=(body.get("vehicle_number") or "").strip() or None,
        driver_name=(body.get("driver_name") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status="pending",
        created_by=current_user.username,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    if party_type == "supplier" and body.get("receipt_id"):
        receipt = _get_dispatch_receipt(session, body["receipt_id"])
        dispatch.receipt_id = receipt.id
        dispatch.receipt_number = receipt.receipt_number
    _sync_linked_request(session, dispatch, linked_request, current_user)
    session.add(dispatch)
    session.flush()

    di_list: list[DispatchItem] = []
    for item_data in raw_items:
        name = (item_data.get("item_name") or "").strip()
        if not name:
            continue
        di = DispatchItem(
            dispatch_id=dispatch.id,  # type: ignore[arg-type]
            item_name=name,
            inv_type=item_data.get("inv_type") or None,
            inv_item_id=item_data.get("inv_item_id"),
            quantity=float(item_data.get("quantity") or 0),
            unit_id=item_data.get("unit_id") or None,
        )
        session.add(di)
        di_list.append(di)

    session.commit()
    session.refresh(dispatch)
    saved_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
    return _to_dict(dispatch, saved_items, session)


@router.get("/available-requests")
def list_available_requests(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    exclude_dispatch_id: int | None = None,
) -> list[dict[str, Any]]:
    """Return every active, dispatchable request not reserved by another dispatch."""
    _require_dispatch_access(current_user)
    dispatch_stmt = select(Dispatch.request_id).where(
        Dispatch.request_id.is_not(None),  # type: ignore[union-attr]
    )
    if exclude_dispatch_id:
        dispatch_stmt = dispatch_stmt.where(Dispatch.id != exclude_dispatch_id)
    linked_ids = {
        request_id for request_id in session.exec(dispatch_stmt).all()
        if request_id is not None
    }
    requests = session.exec(
        select(Request).where(
            Request.is_active == True,  # noqa: E712
            Request.status.in_(["approved", "in_progress", "awaiting_signoff"]),  # type: ignore[union-attr]
        ).order_by(Request.id.desc())  # type: ignore[union-attr]
    ).all()
    return [
        {
            "id": req.id,
            "sn_no": req.sn_no,
            "request_type": req.request_type,
            "status": req.status,
            "requested_by_username": req.requested_by_username,
        }
        for req in requests
        if req.id not in linked_ids
    ]


@router.get("/{dispatch_id}")
def get_dispatch(
    dispatch_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch or dispatch.status == "deleted":
        raise HTTPException(status_code=404, detail="Dispatch not found")
    d_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch_id)).all())
    return _to_dict(dispatch, d_items, session)


@router.put("/{dispatch_id}")
def update_dispatch(
    dispatch_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    dispatch = session.exec(
        select(Dispatch).where(Dispatch.id == dispatch_id).with_for_update()
    ).one_or_none()
    if not dispatch or dispatch.status == "deleted":
        raise HTTPException(status_code=404, detail="Dispatch not found")

    old_status = dispatch.status
    old_request_id = dispatch.request_id
    target_request_id = body.get("request_id", old_request_id)
    target_party_type = body.get("party_type", dispatch.party_type)
    if target_party_type not in ("vendor", "supplier"):
        raise HTTPException(status_code=422, detail="party_type must be vendor or supplier")
    target_status = body.get("status", old_status)
    if isinstance(target_status, str):
        target_status = target_status.strip() or old_status

    linked_request = _linked_request(session, target_request_id, exclude_dispatch_id=dispatch.id)
    raw_items = _request_dispatch_items(session, linked_request) if linked_request else body.get("items")
    if raw_items is None:
        existing_items = session.exec(
            select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)
        ).all()
        raw_items = [{
            "item_name": item.item_name,
            "inv_type": item.inv_type,
            "inv_item_id": item.inv_item_id,
            "quantity": item.quantity,
            "unit_id": item.unit_id,
        } for item in existing_items]

    # Validate receipt reference for supplier dispatches before completing
    if target_party_type == "supplier" and target_status in ("dispatched", "delivered"):
        receipt_id = body.get("receipt_id") or dispatch.receipt_id
        if not receipt_id:
            raise HTTPException(status_code=409, detail="Supplier dispatch requires a receipt reference")
        receipt = _get_dispatch_receipt(session, receipt_id, require_completable=True)
        dispatch.receipt_number = receipt.receipt_number
        dispatch.receipt_id = receipt_id

    # For OEM/vendor dispatches, clear receipt reference
    if target_party_type == "vendor":
        dispatch.receipt_id = None
        dispatch.receipt_number = None

    # Validate and deduct before mutating the dispatch, so a stock error leaves it untouched.
    _deduct_oem_dispatch_stock(
        session, dispatch, raw_items, current_user,
        target_party_type=target_party_type,
        old_status=old_status, target_status=target_status,
    )
    _sync_linked_request(
        session, dispatch, linked_request, current_user, target_status=target_status
    )
    if old_request_id and old_request_id != target_request_id:
        _release_linked_request(session, old_request_id)

    for field in ("party_type", "vendor_id", "vendor_name", "supplier_id", "supplier_name",
                  "schedule_id", "schedule_number", "request_sn_no",
                  "product_name", "quantity", "unit_id", "dispatch_date",
                  "vehicle_number", "driver_name", "notes"):
        if field in body:
            val = body[field]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(dispatch, field, val)
    dispatch.request_id = target_request_id
    dispatch.request_sn_no = linked_request.sn_no if linked_request else None
    dispatch.status = target_status
    dispatch.party_type = target_party_type
    if target_party_type == "vendor":
        dispatch.supplier_id = None
        dispatch.supplier_name = None
    else:
        dispatch.vendor_id = None
        dispatch.vendor_name = None

    if raw_items is not None:
        old_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
        for old in old_items:
            session.delete(old)
        new_dis: list[DispatchItem] = []
        for item_data in raw_items:
            name = (item_data.get("item_name") or "").strip()
            if not name:
                continue
            di = DispatchItem(
                dispatch_id=dispatch.id,  # type: ignore[arg-type]
                item_name=name,
                inv_type=item_data.get("inv_type") or None,
                inv_item_id=item_data.get("inv_item_id"),
                quantity=float(item_data.get("quantity") or 0),
                unit_id=item_data.get("unit_id") or None,
            )
            session.add(di)
            new_dis.append(di)
        if new_dis:
            first_data = raw_items[0]
            dispatch.product_name = (first_data.get("item_name") or "").strip()
            dispatch.quantity = float(first_data.get("quantity") or 0)
            dispatch.unit_id = first_data.get("unit_id") or None

    session.add(dispatch)
    session.add(DispatchHistory(
        dispatch_id=dispatch.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        change_type="status_change" if old_status != target_status else "updated",
        old_status=old_status,
        new_status=target_status,
    ))
    session.commit()
    session.refresh(dispatch)
    saved_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
    return _to_dict(dispatch, saved_items, session)


@router.delete("/{dispatch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatch(
    dispatch_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete dispatches")
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch or dispatch.status == "deleted":
        raise HTTPException(status_code=404, detail="Dispatch not found")
    old_status_del = dispatch.status
    _release_linked_request(session, dispatch.request_id)
    dispatch.status = "deleted"
    session.add(dispatch)
    session.add(DispatchHistory(
        dispatch_id=dispatch.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        change_type="status_change",
        old_status=old_status_del,
        new_status="deleted",
        notes="Dispatch deleted by admin",
    ))
    session.commit()


@router.get("/{dispatch_id}/history")
def get_dispatch_history(
    dispatch_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Get history for a dispatch."""
    _require_dispatch_access(current_user)
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    history = list(session.exec(
        select(DispatchHistory)
        .where(DispatchHistory.dispatch_id == dispatch_id)
        .order_by(DispatchHistory.id.desc())  # type: ignore[union-attr]
        .offset(offset)
        .limit(limit)
    ).all())
    return [
        {
            "id": h.id,
            "dispatch_id": h.dispatch_id,
            "changed_by_username": h.changed_by_username,
            "changed_at": h.changed_at.isoformat(),
            "change_type": h.change_type,
            "old_status": h.old_status,
            "new_status": h.new_status,
            "notes": h.notes,
        }
        for h in history
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_dispatch_access(user: User) -> None:
    if user.role in ("admin", "super_admin"):
        return
    if getattr(user, "dispatch_access", False):
        return
    raise HTTPException(status_code=403, detail="Dispatch access required")


def _linked_request(
    session: Session,
    request_id: int | None,
    *,
    exclude_dispatch_id: int | None = None,
) -> Request | None:
    if not request_id:
        return None
    req = session.get(Request, request_id)
    if not req or not req.is_active:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status not in ("approved", "in_progress", "awaiting_signoff", "received"):
        raise HTTPException(
            status_code=409,
            detail=f"Request {req.sn_no} cannot be dispatched in status {req.status!r}",
        )
    dispatch_stmt = select(Dispatch).where(
        Dispatch.request_id == request_id,
    )
    if exclude_dispatch_id:
        dispatch_stmt = dispatch_stmt.where(Dispatch.id != exclude_dispatch_id)
    existing = session.exec(dispatch_stmt).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Request {req.sn_no} is already linked to dispatch {existing.dispatch_number}")
    return req


def _request_dispatch_items(session: Session, req: Request) -> list[dict[str, Any]]:
    if req.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH:
        items = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).all()
        if not items:
            raise HTTPException(status_code=409, detail=f"Request {req.sn_no} has no line items")
        return [{
            "item_name": item.item_name or item.item_code or f"Item #{item.id}",
            "inv_type": item.item_type,
            "inv_item_id": item.inventory_item_id,
            "quantity": item.quantity,
        } for item in items]
    detail = session.exec(
        select(RequestCustomerDispatch).where(RequestCustomerDispatch.request_id == req.id)
    ).one_or_none()
    if not detail or detail.item_id is None:
        raise HTTPException(status_code=409, detail=f"Request {req.sn_no} has no linked inventory item")
    return [{
        "item_name": detail.item_description or detail.item_sn_no or f"Item #{detail.item_id}",
        "inv_type": detail.inventory_type,
        "inv_item_id": detail.item_id,
        "quantity": detail.quantity,
    }]


def _sync_linked_request(
    session: Session,
    dispatch: Dispatch,
    req: Request | None,
    current_user: User,
    target_status: str | None = None,
) -> None:
    if not req or req.request_type != REQUEST_TYPE_CUSTOMER_DISPATCH:
        return
    now = datetime.now(tz=timezone.utc)
    effective_status = target_status or dispatch.status

    if effective_status in ("dispatched", "delivered") and req.status != "received":
        old_status = req.status
        req.status = "received"
        req.delivered_by_user_id = current_user.id
        req.delivered_by_username = current_user.username
        req.delivered_at = now
        req.updated_at = now
        log_history(
            session, req.id,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            change_type="dispatched",
            field_name="status",
            old_value=old_status,
            new_value="received",
            note=f"Fulfilled by dispatch {dispatch.dispatch_number}",
        )
        if req.requested_by_user_id:
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="request_delivered",
                title=f"Request {req.sn_no} dispatched",
                body=f"Your request was fulfilled by dispatch {dispatch.dispatch_number}.",
                request_id=req.id,
            )
    elif effective_status == "pending" and req.status == "approved":
        req.status = "in_progress"
        req.updated_at = now
        log_history(
            session, req.id,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            change_type="dispatch_linked",
            field_name="status",
            old_value="approved",
            new_value="in_progress",
            note=f"Linked to dispatch {dispatch.dispatch_number}",
        )
    elif effective_status == "cancelled":
        _release_linked_request(session, req.id)
    session.add(req)


def _get_dispatch_receipt(
    session: Session, receipt_id: int, *, require_completable: bool = False,
) -> Receipt:
    receipt = session.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if require_completable and receipt.status not in ("created", "signed_off"):
        raise HTTPException(status_code=409, detail="Receipt is not in a dispatchable state")
    return receipt


def _deduct_oem_dispatch_stock(
    session: Session,
    dispatch: Dispatch,
    raw_items: list[dict[str, Any]],
    current_user: User,
    *,
    target_party_type: str,
    old_status: str,
    target_status: str,
) -> None:
    completed_statuses = {"dispatched", "delivered"}
    if target_party_type != "vendor" or target_status not in completed_statuses:
        return
    if old_status in completed_statuses or dispatch.inventory_deducted_at is not None:
        return
    deductions = [
        StockDeduction(
            inventory_type=item["inv_type"],
            item_id=item["inv_item_id"],
            quantity=float(item.get("quantity") or 0),
            label=item.get("item_name") or "dispatch item",
        )
        for item in raw_items
        if item.get("inv_type") and item.get("inv_item_id") is not None
    ]
    deduct_request_stock(
        session, deductions, current_user,
        note=f"OEM dispatch {dispatch.dispatch_number}",
    )
    now = datetime.now(tz=timezone.utc)
    dispatch.inventory_deducted_at = now
    dispatch.inventory_deducted_by_user_id = current_user.id
    dispatch.inventory_deducted_by_username = current_user.username
    session.add(dispatch)


def _release_linked_request(session: Session, request_id: int | None) -> None:
    if not request_id:
        return
    req = session.get(Request, request_id)
    if (
        req
        and req.is_active
        and req.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH
        and req.status == "in_progress"
    ):
        req.status = "approved"
        req.updated_at = datetime.now(tz=timezone.utc)
        session.add(req)


def _to_dict(d: Dispatch, items: list[DispatchItem] | None = None, session: Session | None = None) -> dict[str, Any]:
    header_unit_name = None
    if d.unit_id and session:
        u = session.get(Unit, d.unit_id)
        header_unit_name = u.name if u else None
    item_list = []
    if items:
        for i in items:
            i_unit_name = None
            if i.unit_id and session:
                u = session.get(Unit, i.unit_id)
                i_unit_name = u.name if u else None
            item_list.append({
                "id": i.id,
                "item_name": i.item_name,
                "inv_type": i.inv_type,
                "inv_item_id": i.inv_item_id,
                "quantity": i.quantity,
                "unit_id": i.unit_id,
                "unit_name": i_unit_name,
            })
    return {
        "id": d.id,
        "dispatch_number": d.dispatch_number,
        "party_type": d.party_type,
        "vendor_id": d.vendor_id,
        "vendor_name": d.vendor_name,
        "supplier_id": getattr(d, "supplier_id", None),
        "supplier_name": getattr(d, "supplier_name", None),
        "schedule_id": d.schedule_id,
        "schedule_number": d.schedule_number,
        "request_id": d.request_id,
        "request_sn_no": d.request_sn_no,
        "receipt_id": d.receipt_id,
        "receipt_number": d.receipt_number,
        "product_name": d.product_name,
        "quantity": d.quantity,
        "unit_id": d.unit_id,
        "unit_name": header_unit_name,
        "dispatch_date": d.dispatch_date,
        "vehicle_number": d.vehicle_number,
        "driver_name": d.driver_name,
        "notes": d.notes,
        "status": d.status,
        "created_by": d.created_by,
        "created_at": d.created_at,
        "inventory_deducted_at": d.inventory_deducted_at,
        "inventory_deducted_by_user_id": d.inventory_deducted_by_user_id,
        "inventory_deducted_by_username": d.inventory_deducted_by_username,
        "items": item_list,
    }
