"""
Gate Pass router.

GET    /api/v1/gate-passes        — list gate passes
POST   /api/v1/gate-passes        — create gate pass
GET    /api/v1/gate-passes/{id}   — get single gate pass
PUT    /api/v1/gate-passes/{id}   — update gate pass
DELETE /api/v1/gate-passes/{id}   — close/delete gate pass
GET    /api/v1/gate-passes/{id}/history — gate pass history
"""
import json
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.gate_pass import GatePass
from app.models.gate_pass_history import GatePassHistory
from app.models.gate_pass_item import GatePassItem
from app.models.purchase_order import PurchaseOrder
from app.models.unit import Unit
from app.models.user import User

router = APIRouter(prefix="/api/v1/gate-passes", tags=["gate-passes"])

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _next_gp_number(session: Session) -> str:
    count = session.exec(select(GatePass)).all()
    return f"GP-{(len(count) + 1):04d}"


def _party_type(gp: GatePass) -> str:
    return "supplier" if gp.supplier_id else "vendor"


def _assign_purchase_order(session: Session, gp: GatePass, purchase_order_id: int) -> None:
    purchase_order = session.get(PurchaseOrder, purchase_order_id)
    if not purchase_order:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    gp.purchase_order_id = purchase_order.id
    gp.purchase_order_number = purchase_order.po_number


def _sanitize_purchase_refs(gp: GatePass, party_type: str) -> None:
    if party_type == "supplier":
        gp.purchase_request_id = None
        gp.purchase_request_number = None
        gp.purchase_order_id = None
        gp.purchase_order_number = None
    elif party_type == "vendor":
        gp.purchase_request_id = None
        gp.purchase_request_number = None


@router.get("")
def list_gate_passes(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    search: str = "",
    pass_type: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    _require_access(current_user)
    items = list(session.exec(
        select(GatePass).where(GatePass.status != "deleted").order_by(GatePass.id.desc())
    ).all())  # type: ignore[union-attr]

    if pass_type:
        items = [g for g in items if g.pass_type == pass_type]
    if search:
        s = search.lower()
        items = [g for g in items
                 if s in (g.gate_pass_number or "").lower()
                 or s in (g.vendor_name or "").lower()
                 or s in (g.supplier_name or "").lower()
                 or s in (g.material or "").lower()]

    total = len(items)
    start = (page - 1) * page_size
    page_gps = items[start: start + page_size]

    # Batch-load items
    gp_ids = [g.id for g in page_gps if g.id is not None]
    all_gp_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id.in_(gp_ids))).all()) if gp_ids else []  # type: ignore[union-attr]
    items_by_gp: dict[int, list[GatePassItem]] = {}
    for gi in all_gp_items:
        items_by_gp.setdefault(gi.gate_pass_id, []).append(gi)

    return {"items": [_to_dict(g, items_by_gp.get(g.id, []), session) for g in page_gps], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_gate_pass(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    raw_items = body.get("items") or []
    first_item_name = ""
    first_qty = 0.0
    first_unit_id = None
    if raw_items:
        first = raw_items[0]
        first_item_name = (first.get("item_name") or "").strip()
        first_qty = float(first.get("quantity") or 0)
        first_unit_id = first.get("unit_id") or None

    gp = GatePass(
        gate_pass_number=_next_gp_number(session),
        pass_type=body.get("pass_type") or "out",
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        material=first_item_name or (body.get("material") or "").strip(),
        quantity=first_qty or float(body.get("quantity") or 0),
        unit_id=first_unit_id or body.get("unit_id") or None,
        purpose=(body.get("purpose") or "").strip() or None,
        vehicle_number=(body.get("vehicle_number") or "").strip() or None,
        date=(body.get("date") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status="open",
        created_by=current_user.username,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    party_type = _party_type(gp)
    _sanitize_purchase_refs(gp, party_type)
    if party_type == "vendor" and body.get("purchase_order_id"):
        _assign_purchase_order(session, gp, body["purchase_order_id"])
    session.add(gp)
    session.flush()

    for item_data in raw_items:
        name = (item_data.get("item_name") or "").strip()
        if not name:
            continue
        session.add(GatePassItem(
            gate_pass_id=gp.id,  # type: ignore[arg-type]
            item_name=name,
            inv_type=item_data.get("inv_type") or None,
            inv_item_id=item_data.get("inv_item_id"),
            quantity=float(item_data.get("quantity") or 0),
            unit_id=item_data.get("unit_id") or None,
        ))

    _add_gp_history(session, gp, "created", current_user.id, current_user.username, new_status=gp.status)
    session.commit()
    session.refresh(gp)
    session.commit()
    session.refresh(gp)
    saved_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp.id)).all())
    return _to_dict(gp, saved_items, session)
def get_gate_pass(
    gp_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp or gp.status == "deleted":
        raise HTTPException(status_code=404, detail="Gate pass not found")
    gp_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp_id)).all())
    return _to_dict(gp, gp_items, session)


@router.put("/{gp_id}")
def update_gate_pass(
    gp_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp or gp.status == "deleted":
        raise HTTPException(status_code=404, detail="Gate pass not found")

    old_status = gp.status

    # Purchase reference labels are always resolved server-side.
    body.pop("purchase_request_id", None)
    body.pop("purchase_request_number", None)
    body.pop("purchase_order_number", None)

    tracked_fields = ("pass_type", "vendor_id", "vendor_name", "supplier_id", "supplier_name",
                      "material", "quantity", "unit_id", "purpose", "vehicle_number", "date", "notes",
                      "status", "purchase_request_id", "purchase_request_number",
                      "purchase_order_id", "purchase_order_number")

    # Capture old values for audit before setting new ones
    old_values: dict[str, Any] = {field: getattr(gp, field, None) for field in tracked_fields}

    for field in tracked_fields:
        if field in body:
            val = body[field]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(gp, field, val)

    party_type = _party_type(gp)
    _sanitize_purchase_refs(gp, party_type)
    if party_type == "vendor" and body.get("purchase_order_id"):
        _assign_purchase_order(session, gp, body["purchase_order_id"])

    # Replace items if provided
    if "items" in body:
        old_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp.id)).all())
        for old in old_items:
            session.delete(old)
        raw_items = body["items"] or []
        for item_data in raw_items:
            name = (item_data.get("item_name") or "").strip()
            if not name:
                continue
            session.add(GatePassItem(
                gate_pass_id=gp.id,  # type: ignore[arg-type]
                item_name=name,
                inv_type=item_data.get("inv_type") or None,
                inv_item_id=item_data.get("inv_item_id"),
                quantity=float(item_data.get("quantity") or 0),
                unit_id=item_data.get("unit_id") or None,
            ))
        if raw_items:
            first_data = raw_items[0]
            gp.material = (first_data.get("item_name") or "").strip()
            gp.quantity = float(first_data.get("quantity") or 0)
            gp.unit_id = first_data.get("unit_id") or None

    session.add(gp)
    session.flush()
    new_status = gp.status
    reference_fields = ("pass_type", "vendor_id", "vendor_name", "supplier_id", "supplier_name",
                        "purchase_request_id", "purchase_request_number",
                        "purchase_order_id", "purchase_order_number", "status")
    changed_fields = [f for f in tracked_fields if old_values.get(f) != getattr(gp, f, None)]
    field_changes = {
        field: {"old": old_values.get(field), "new": getattr(gp, field, None)}
        for field in changed_fields
    }
    if old_status != new_status:
        _add_gp_history(session, gp, "status_change", current_user.id, current_user.username,
                        old_status=old_status, new_status=new_status,
                        details_json=json.dumps({"changes": field_changes}, default=str))
    else:
        has_items = "items" in body
        has_refs = any(f in changed_fields for f in reference_fields)
        if has_items:
            _add_gp_history(session, gp, "items_changed", current_user.id, current_user.username,
                            details_json=json.dumps({"items_changed": True, "changes": field_changes}, default=str))
        if has_refs and not has_items:
            details = {"changes": field_changes}
            _add_gp_history(session, gp, "reference_changed", current_user.id, current_user.username,
                            details_json=json.dumps(details, default=str))
        if not has_items and not has_refs:
            details = {"changes": field_changes}
            _add_gp_history(session, gp, "updated", current_user.id, current_user.username,
                            details_json=json.dumps(details, default=str))
    session.commit()
    session.refresh(gp)
    saved_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp.id)).all())
    return _to_dict(gp, saved_items, session)


@router.delete("/{gp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gate_pass(
    gp_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can delete gate passes")
    gp = session.get(GatePass, gp_id)
    if not gp or gp.status == "deleted":
        raise HTTPException(status_code=404, detail="Gate pass not found")
    gp.status = "deleted"
    session.add(gp)
    _add_gp_history(session, gp, "deleted", current_user.id, current_user.username)
    session.commit()


@router.get("/{gp_id}/history")
def get_gate_pass_history(
    gp_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict[str, Any]]:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    rows = session.exec(
        select(GatePassHistory)
        .where(GatePassHistory.gate_pass_id == gp_id)
        .order_by(GatePassHistory.changed_at.desc())
        .offset(offset).limit(limit)
    ).all()
    result = []
    for r in rows:
        entry: dict[str, Any] = {
            "id": r.id,
            "change_type": r.change_type,
            "changed_by_username": r.changed_by_username,
            "changed_at": r.changed_at,
            "old_status": r.old_status,
            "new_status": r.new_status,
        }
        if r.details_json:
            try:
                entry["details"] = json.loads(r.details_json)
            except Exception:
                entry["details"] = r.details_json
        result.append(entry)
    return result


def _require_access(user: User) -> None:
    if user.role in ("admin", "super_admin"):
        return
    if getattr(user, "gate_pass_access", False):
        return
    raise HTTPException(status_code=403, detail="Gate pass access required")


def _add_gp_history(
    session: Session,
    gp: GatePass,
    change_type: str,
    changed_by_user_id: int | None,
    changed_by_username: str,
    *,
    old_status: str | None = None,
    new_status: str | None = None,
    details_json: str | None = None,
) -> None:
    session.add(GatePassHistory(
        gate_pass_id=gp.id,  # type: ignore[arg-type]
        changed_by_user_id=changed_by_user_id,
        changed_by_username=changed_by_username,
        changed_at=datetime.now(timezone.utc),
        change_type=change_type,
        old_status=old_status,
        new_status=new_status,
        details_json=details_json,
    ))


def _to_dict(g: GatePass, items: list[GatePassItem] | None = None, session: Session | None = None) -> dict[str, Any]:
    header_unit_name = None
    if g.unit_id and session:
        u = session.get(Unit, g.unit_id)
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
    party_type = _party_type(g)
    return {
        "id": g.id,
        "gate_pass_number": g.gate_pass_number,
        "pass_type": g.pass_type,
        "vendor_id": g.vendor_id,
        "vendor_name": g.vendor_name,
        "supplier_id": g.supplier_id,
        "supplier_name": g.supplier_name,
        "party_type": party_type,
        "material": g.material,
        "quantity": g.quantity,
        "unit_id": g.unit_id,
        "unit_name": header_unit_name,
        "purpose": g.purpose,
        "vehicle_number": g.vehicle_number,
        "date": g.date,
        "notes": g.notes,
        "status": g.status,
        "created_by": g.created_by,
        "created_at": g.created_at,
        "purchase_request_id": None,
        "purchase_request_number": None,
        "purchase_order_id": g.purchase_order_id if party_type == "vendor" else None,
        "purchase_order_number": g.purchase_order_number if party_type == "vendor" else None,
        "items": item_list,
    }
