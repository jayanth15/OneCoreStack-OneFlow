"""
Purchase Orders router.

GET    /api/v1/purchase-orders             — list POs
POST   /api/v1/purchase-orders             — create PO (with items)
GET    /api/v1/purchase-orders/{id}        — get single PO with items
PUT    /api/v1/purchase-orders/{id}        — update PO header + items
DELETE /api/v1/purchase-orders/{id}        — cancel PO
"""
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.request import Request
from app.models.unit import Unit
from app.models.user import User
from app.routers.requests_helpers import log_history

router = APIRouter(prefix="/api/v1/purchase-orders", tags=["purchase-orders"])


def _next_po_number(session: Session) -> str:
    count = session.exec(select(PurchaseOrder)).all()
    return f"PO-{(len(count) + 1):04d}"


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
    req.acknowledged_at = datetime.now(tz=timezone.utc)
    req.acknowledgment_note = f"Linked purchase order {po.po_number} received"
    req.updated_at = datetime.now(tz=timezone.utc)
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
    pos = list(session.exec(
        select(PurchaseOrder).where(PurchaseOrder.status != "deleted").order_by(PurchaseOrder.id.desc())
    ).all())  # type: ignore[union-attr]

    if status_filter:
        pos = [p for p in pos if p.status == status_filter]
    if vendor:
        pos = [p for p in pos if p.vendor_name == vendor]
    if search:
        s = search.lower()
        pos = [p for p in pos
               if s in (p.po_number or "").lower()
               or s in (p.supplier_name or "").lower()]

    total = len(pos)
    start = (page - 1) * page_size
    items_page = pos[start: start + page_size]

    # Get item counts
    result = []
    for po in items_page:
        po_items = session.exec(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
        ).all()
        result.append(_to_dict(po, list(po_items), session))
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
    po = PurchaseOrder(
        po_number=po_number,
        party_type=body.get("party_type") or "supplier",
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        po_date=(body.get("po_date") or "").strip() or None,
        expected_delivery=(body.get("expected_delivery") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status=body.get("status") or "draft",
        created_by=current_user.username,
        created_at=datetime.now(timezone.utc).isoformat(),
        purchase_request_id=body.get("purchase_request_id"),
        purchase_request_number=(body.get("purchase_request_number") or "").strip() or None,
    )
    session.add(po)
    session.flush()

    items = body.get("items") or []
    for item in items:
        if not (item.get("item_name") or "").strip():
            continue
        session.add(PurchaseOrderItem(
            purchase_order_id=po.id,  # type: ignore[arg-type]
            item_name=(item.get("item_name") or "").strip(),
            quantity=float(item.get("quantity") or 0),
            unit_id=item.get("unit_id") or None,
            rate=float(item["rate"]) if item.get("rate") is not None else None,
            notes=(item.get("notes") or "").strip() or None,
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
        session.exec(  # type: ignore[arg-type]
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id)
        )
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
            session.add(PurchaseOrderItem(
                purchase_order_id=po_id,
                item_name=(item.get("item_name") or "").strip(),
                quantity=float(item.get("quantity") or 0),
                unit_id=item.get("unit_id") or None,
                rate=float(item["rate"]) if item.get("rate") is not None else None,
                notes=(item.get("notes") or "").strip() or None,
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
    po.status = "deleted"
    session.add(po)
    session.commit()


def _require_access(user: User) -> None:
    if user.role in ("admin", "super_admin"):
        return
    if getattr(user, "purchase_access", False):
        return
    raise HTTPException(status_code=403, detail="Purchase order access required")


def _to_dict(po: PurchaseOrder, items: list[PurchaseOrderItem], session: Session | None = None) -> dict[str, Any]:
    total_value = sum(
        (i.quantity or 0) * (i.rate or 0) for i in items if i.rate is not None
    )
    item_list = []
    for i in items:
        i_unit_name = None
        if i.unit_id and session:
            u = session.get(Unit, i.unit_id)
            i_unit_name = u.name if u else None
        item_list.append({
            "id": i.id,
            "item_name": i.item_name,
            "quantity": i.quantity,
            "unit_id": i.unit_id,
            "unit_name": i_unit_name,
            "rate": i.rate,
            "notes": i.notes,
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
