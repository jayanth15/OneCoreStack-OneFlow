"""
Purchase Orders router.

GET    /api/v1/purchase-orders             — list POs
POST   /api/v1/purchase-orders             — create PO (with items)
GET    /api/v1/purchase-orders/{id}        — get single PO with items
PUT    /api/v1/purchase-orders/{id}        — update PO header + items
DELETE /api/v1/purchase-orders/{id}        — cancel PO
"""
from datetime import datetime, timezone
from app.core.timezone import now
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, or_, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_purchase_access
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.unit import Unit
from app.models.user import User
from app.routers.requests_helpers import log_history
from app.routers.notifications import create_notification
from app.services.document_numbers import allocate_document_number
from app.services.workflow import PURCHASE_ORDER_TRANSITIONS, ensure_inventory_identity, ensure_transition
from app.services.units import resolve_unit_id

router = APIRouter(prefix="/api/v1/purchase-orders", tags=["purchase-orders"])


def _next_po_number(session: Session) -> str:
    return allocate_document_number(session, key="purchase_order", prefix="PO", existing_model=PurchaseOrder, number_field="po_number")


def _require_access(user: User) -> None:
    require_purchase_access(user)


def _sync_linked_purchase_request(session: Session, po: PurchaseOrder, current_user: User, old_status: str | None = None) -> None:
    if po.status != "received" or old_status == "received" or not po.purchase_request_id:
        return
    req = session.get(Request, po.purchase_request_id)
    if not req:
        return
    old_req_status = req.status
    req.status = "received"
    req.acknowledged_by_user_id = current_user.id
    req.acknowledged_by_username = current_user.username
    req.acknowledged_at = now()
    req.acknowledgment_note = f"Linked purchase order {po.po_number} received"
    req.updated_at = now()
    session.add(req)
    log_history(
        session,
        req.id,
        changed_by_user_id=current_user.id,
        changed_by_username=current_user.username,
        change_type="purchase_order_received",
        field_name="status",
        old_value=old_req_status,
        new_value="received",
        note=f"Linked purchase order {po.po_number} marked received",
    )


@router.get("")
def list_pos(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: str = "",
    status_filter: str = "",
    vendor: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    _require_access(current_user)
    q = select(PurchaseOrder).where(PurchaseOrder.status != "deleted")  # type: ignore[union-attr]
    if status_filter:
        q = q.where(PurchaseOrder.status == status_filter)  # type: ignore[union-attr]
    if vendor:
        q = q.where(PurchaseOrder.vendor_name == vendor)  # type: ignore[union-attr]
    if search:
        s = search.lower()
        q = q.where(
            or_(
                PurchaseOrder.po_number.ilike(f"%{s}%"),  # type: ignore[union-attr]
                PurchaseOrder.supplier_name.ilike(f"%{s}%"),  # type: ignore[union-attr]
            )
        )
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    pos = list(session.exec(q.order_by(PurchaseOrder.id.desc()).offset((page - 1) * page_size).limit(page_size)).all())  # type: ignore[union-attr]

    po_ids = [p.id for p in pos if p.id]
    items_by_po: dict[int, list[PurchaseOrderItem]] = {}
    if po_ids:
        for item in session.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id.in_(po_ids))).all():  # type: ignore[union-attr]
            items_by_po.setdefault(item.purchase_order_id, []).append(item)
    unit_ids = {i.unit_id for items in items_by_po.values() for i in items if i.unit_id}
    units_by_id = {
        u.id: u
        for u in session.exec(select(Unit).where(Unit.id.in_(unit_ids))).all()  # type: ignore[union-attr]
    } if unit_ids else {}

    result = []
    for po in pos:
        result.append(_to_dict(po, items_by_po.get(po.id or 0, []), units_by_id=units_by_id))
    return {"items": result, "total": total, "page": page, "page_size": page_size}


@router.get("/linkable")
def list_linkable_pos(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: str = "",
) -> list[dict[str, Any]]:
    _require_access(current_user)
    q = select(PurchaseOrder).where(PurchaseOrder.status.in_(["approved", "draft"]))
    pos = list(session.exec(q.order_by(PurchaseOrder.po_number)).all())
    if search:
        s = search.lower()
        pos = [p for p in pos
               if s in (p.po_number or "").lower()
               or s in (p.supplier_name or "").lower()
               or s in (p.vendor_name or "").lower()]
    return [
        {"id": p.id, "po_number": p.po_number, "supplier_name": p.supplier_name,
         "vendor_name": p.vendor_name, "party_type": p.party_type}
        for p in pos
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_po(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    po_number = (body.get("po_number") or "").strip() or _next_po_number(session)
    existing = session.exec(select(PurchaseOrder).where(PurchaseOrder.po_number == po_number)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"PO number '{po_number}' already exists")
    items = body.get("items") or []
    if not items:
        raise HTTPException(status_code=422, detail="At least one item is required")
    party_type = body.get("party_type") or "supplier"
    if party_type not in ("supplier", "vendor"):
        raise HTTPException(status_code=422, detail="party_type must be supplier or vendor")
    if (party_type == "supplier" and not (body.get("supplier_id") or body.get("supplier_name"))) or (party_type == "vendor" and not (body.get("vendor_id") or body.get("vendor_name"))):
        raise HTTPException(status_code=422, detail=f"A {party_type} must be selected")
    linked_request = session.get(Request, body.get("purchase_request_id")) if body.get("purchase_request_id") else None
    if body.get("purchase_request_id") and not linked_request:
        raise HTTPException(status_code=404, detail="Linked request not found")
    if linked_request and (linked_request.request_type != "vendor_purchase" or linked_request.status not in ("approved", "in_progress")):
        raise HTTPException(status_code=409, detail="Only approved vendor-purchase requests can be linked to a purchase order")
    status_value = (body.get("status") or "draft")
    if status_value not in ("draft", "approved"):
        raise HTTPException(status_code=422, detail="New purchase orders can only be created as 'draft' or 'approved'; receipt status is derived from GRNs")
    if linked_request:
        request_items = list(session.exec(select(RequestItem).where(RequestItem.request_id == linked_request.id)).all())
        submitted = {item.get("request_item_id"): item for item in items if item.get("request_item_id")}
        items = [{
            "item_name": req_item.item_name or req_item.item_code or f"Request item {req_item.id}",
            "quantity": req_item.quantity,
            "inventory_type": req_item.item_type,
            "inventory_item_id": req_item.inventory_item_id,
            "request_item_id": req_item.id,
            "unit_id": submitted.get(req_item.id, {}).get("unit_id"),
            "unit": submitted.get(req_item.id, {}).get("unit"),
            "rate": submitted.get(req_item.id, {}).get("rate"),
            "notes": submitted.get(req_item.id, {}).get("notes"),
        } for req_item in request_items]
        if not items:
            raise HTTPException(status_code=409, detail="Linked request has no items")
    po = PurchaseOrder(
        po_number=po_number,
        party_type=party_type,
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        po_date=(body.get("po_date") or "").strip() or None,
        expected_delivery=(body.get("expected_delivery") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status=status_value,
        created_by=current_user.username,
        created_at=now().isoformat(),
        purchase_request_id=body.get("purchase_request_id"),
        purchase_request_number=(body.get("purchase_request_number") or "").strip() or None,
    )
    session.add(po)
    session.flush()

    for item in items:
        if not (item.get("item_name") or "").strip():
            continue
        if float(item.get("quantity") or 0) <= 0:
            raise HTTPException(status_code=422, detail="Purchase order item quantity must be greater than zero")
        ensure_inventory_identity(item.get("inventory_type"), item.get("inventory_item_id"), label="Purchase order item")
        session.add(PurchaseOrderItem(
            purchase_order_id=po.id,  # type: ignore[arg-type]
            item_name=(item.get("item_name") or "").strip(),
            quantity=float(item.get("quantity") or 0),
            unit_id=resolve_unit_id(session, item.get("unit_id"), item.get("unit")),
            rate=float(item["rate"]) if item.get("rate") is not None else None,
            notes=(item.get("notes") or "").strip() or None,
            inventory_type=item.get("inventory_type") or None,
            inventory_item_id=item.get("inventory_item_id"),
            request_item_id=item.get("request_item_id"),
        ))

    _sync_linked_purchase_request(session, po, current_user)
    session.commit()
    session.refresh(po)
    po_items = list(session.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
    ).all())
    return _to_dict(po, po_items, session)


@router.get("/{po_id}")
def get_po(
    po_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    po = session.get(PurchaseOrder, po_id)
    if not po or po.status == "deleted":
        raise HTTPException(status_code=404, detail="Purchase order not found")
    po_items = list(session.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
    ).all())
    return _to_dict(po, po_items, session)


@router.put("/{po_id}")
def update_po(
    po_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    po = session.get(PurchaseOrder, po_id)
    if not po or po.status == "deleted":
        raise HTTPException(status_code=404, detail="Purchase order not found")
    old_status = po.status
    target_status = body.get("status", old_status)
    if target_status in ("partially_received", "received"):
        raise HTTPException(status_code=409, detail="Purchase order receipt status is derived from linked GRNs")
    ensure_transition("purchase order", old_status, target_status, PURCHASE_ORDER_TRANSITIONS)

    for field in ("party_type", "supplier_id", "supplier_name", "vendor_id", "vendor_name",
                  "po_number", "po_date", "expected_delivery", "notes", "status",
                  "purchase_request_id", "purchase_request_number"):
        if field in body:
            val = body[field]
            if isinstance(val, str):
                val = val.strip() or None
            if field == "po_number" and val:
                conflict = session.exec(
                    select(PurchaseOrder).where(PurchaseOrder.po_number == val, PurchaseOrder.id != po_id)
                ).first()
                if conflict:
                    raise HTTPException(status_code=400, detail=f"PO number '{val}' already exists")
            if field == "po_number" and not val:
                continue
            setattr(po, field, val)

    # Replace items if provided
    if "items" in body:
        # Delete existing items
        existing = list(session.exec(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
        ).all())
        for item in existing:
            session.delete(item)
        session.flush()
        for item in (body["items"] or []):
            if not (item.get("item_name") or "").strip():
                continue
            if float(item.get("quantity") or 0) <= 0:
                raise HTTPException(status_code=422, detail="Purchase order item quantity must be greater than zero")
            ensure_inventory_identity(item.get("inventory_type"), item.get("inventory_item_id"), label="Purchase order item")
            session.add(PurchaseOrderItem(
                purchase_order_id=po_id,
                item_name=(item.get("item_name") or "").strip(),
                quantity=float(item.get("quantity") or 0),
                unit_id=resolve_unit_id(session, item.get("unit_id"), item.get("unit")),
                rate=float(item["rate"]) if item.get("rate") is not None else None,
                notes=(item.get("notes") or "").strip() or None,
                inventory_type=item.get("inventory_type") or None,
                inventory_item_id=item.get("inventory_item_id"),
                request_item_id=item.get("request_item_id"),
            ))

    _sync_linked_purchase_request(session, po, current_user, old_status=old_status)
    session.add(po)
    session.commit()
    session.refresh(po)
    po_items = list(session.exec(
        select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
    ).all())
    return _to_dict(po, po_items, session)


@router.delete("/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_po(
    po_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete purchase orders")
    po = session.get(PurchaseOrder, po_id)
    if not po or po.status == "deleted":
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=409, detail="Approved or received purchase orders cannot be deleted; cancel them through the workflow")
    po.status = "deleted"
    session.add(po)
    if po.purchase_request_id:
        req = session.get(Request, po.purchase_request_id)
        if req and req.requested_by_user_id:
            create_notification(
                session,
                user_id=req.requested_by_user_id,
                notif_type="purchase_order_deleted",
                title=f"Purchase order {po.po_number} cancelled",
                body=f"Purchase order {po.po_number} linked to your request {req.sn_no} was cancelled.",
                request_id=req.id,
            )
    session.commit()


def _to_dict(po: PurchaseOrder, items: list[PurchaseOrderItem], session: Session | None = None, units_by_id: dict[int, Unit] | None = None) -> dict[str, Any]:
    total_value = sum(
        (i.quantity or 0) * (i.rate or 0) for i in items if i.rate is not None
    )
    item_list = []
    for i in items:
        i_unit_name = None
        if i.unit_id:
            if units_by_id is not None:
                u = units_by_id.get(i.unit_id)
                i_unit_name = u.name if u else None
            elif session:
                u = session.get(Unit, i.unit_id)
                i_unit_name = u.name if u else None
        item_list.append({
            "id": i.id,
            "item_name": i.item_name,
            "quantity": i.quantity,
            "unit_id": i.unit_id,
            "unit_name": i_unit_name,
            "unit": i_unit_name,
            "rate": i.rate,
            "notes": i.notes,
            "inventory_type": i.inventory_type,
            "inventory_item_id": i.inventory_item_id,
            "request_item_id": i.request_item_id,
        })
    return {
        "id": po.id,
        "po_number": po.po_number,
        "party_type": getattr(po, "party_type", "supplier"),
        "supplier_id": po.supplier_id,
        "supplier_name": po.supplier_name,
        "vendor_id": getattr(po, "vendor_id", None),
        "vendor_name": getattr(po, "vendor_name", None),
        "po_date": po.po_date,
        "expected_delivery": po.expected_delivery,
        "notes": po.notes,
        "status": po.status,
        "created_by": po.created_by,
        "created_at": po.created_at,
        "total_value": total_value if total_value > 0 else None,
        "purchase_request_id": po.purchase_request_id,
        "purchase_request_number": po.purchase_request_number,
        "items": item_list,
    }
