"""
Gate Pass router.

GET    /api/v1/gate-passes        — list gate passes
POST   /api/v1/gate-passes        — create gate pass
GET    /api/v1/gate-passes/{id}   — get single gate pass
PUT    /api/v1/gate-passes/{id}   — update gate pass
DELETE /api/v1/gate-passes/{id}   — close/delete gate pass
"""
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.gate_pass import GatePass
from app.models.gate_pass_history import GatePassHistory
from app.models.gate_pass_item import GatePassItem
from app.models.user import User

router = APIRouter(prefix="/api/v1/gate-passes", tags=["gate-passes"])


def _next_gp_number(session: Session) -> str:
    count = session.exec(select(GatePass)).all()
    return f"GP-{(len(count) + 1):04d}"


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
    items = list(session.exec(select(GatePass).order_by(GatePass.id.desc())).all())  # type: ignore[union-attr]

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

    return {"items": [_to_dict(g, items_by_gp.get(g.id, [])) for g in page_gps], "total": total, "page": page, "page_size": page_size}


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
    first_unit = None
    if raw_items:
        first = raw_items[0]
        first_item_name = (first.get("item_name") or "").strip()
        first_qty = float(first.get("quantity") or 0)
        first_unit = (first.get("unit") or "").strip() or None

    gp = GatePass(
        gate_pass_number=_next_gp_number(session),
        pass_type=body.get("pass_type") or "out",
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        material=first_item_name or (body.get("material") or "").strip(),
        quantity=first_qty or float(body.get("quantity") or 0),
        unit=first_unit or (body.get("unit") or "").strip() or None,
        purpose=(body.get("purpose") or "").strip() or None,
        vehicle_number=(body.get("vehicle_number") or "").strip() or None,
        date=(body.get("date") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status="open",
        created_by=current_user.username,
        created_at=datetime.now(timezone.utc).isoformat(),
        purchase_request_id=body.get("purchase_request_id"),
        purchase_request_number=(body.get("purchase_request_number") or "").strip() or None,
        purchase_order_id=body.get("purchase_order_id"),
        purchase_order_number=(body.get("purchase_order_number") or "").strip() or None,
    )
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
            unit=(item_data.get("unit") or "").strip() or None,
        ))

    session.commit()
    session.refresh(gp)
    session.add(GatePassHistory(
        gate_pass_id=gp.id,  # type: ignore[arg-type]
        changed_by_username=current_user.username,
        changed_at=datetime.now(timezone.utc),
        change_type="created",
        new_status=gp.status,
    ))
    session.commit()
    saved_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp.id)).all())
    return _to_dict(gp, saved_items)
def get_gate_pass(
    gp_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    gp_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp_id)).all())
    return _to_dict(gp, gp_items)


@router.put("/{gp_id}")
def update_gate_pass(
    gp_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found")

    old_status = gp.status

    for field in ("pass_type", "vendor_id", "vendor_name", "supplier_id", "supplier_name",
                  "material", "quantity", "unit", "purpose", "vehicle_number", "date", "notes", "status",
                  "purchase_request_id", "purchase_request_number",
                  "purchase_order_id", "purchase_order_number"):
        if field in body:
            val = body[field]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(gp, field, val)

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
                unit=(item_data.get("unit") or "").strip() or None,
            ))
        if raw_items:
            first_data = raw_items[0]
            gp.material = (first_data.get("item_name") or "").strip()
            gp.quantity = float(first_data.get("quantity") or 0)
            gp.unit = (first_data.get("unit") or "").strip() or None

    session.add(gp)
    session.commit()
    session.refresh(gp)
    new_status = gp.status
    if old_status != new_status:
        session.add(GatePassHistory(
            gate_pass_id=gp.id,  # type: ignore[arg-type]
            changed_by_username=current_user.username,
            changed_at=datetime.now(timezone.utc),
            change_type="status_change",
            old_status=old_status,
            new_status=new_status,
        ))
        session.commit()
    saved_items = list(session.exec(select(GatePassItem).where(GatePassItem.gate_pass_id == gp.id)).all())
    return _to_dict(gp, saved_items)


@router.delete("/{gp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gate_pass(
    gp_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_access(current_user)
    gp = session.get(GatePass, gp_id)
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    gp.status = "closed"
    session.add(gp)
    session.commit()


def _require_access(user: User) -> None:
    if user.role in ("admin", "super_admin"):
        return
    if getattr(user, "gate_pass_access", False):
        return
    raise HTTPException(status_code=403, detail="Gate pass access required")


def _to_dict(g: GatePass, items: list[GatePassItem] | None = None) -> dict[str, Any]:
    return {
        "id": g.id,
        "gate_pass_number": g.gate_pass_number,
        "pass_type": g.pass_type,
        "vendor_id": g.vendor_id,
        "vendor_name": g.vendor_name,
        "supplier_id": g.supplier_id,
        "supplier_name": g.supplier_name,
        "material": g.material,
        "quantity": g.quantity,
        "unit": g.unit,
        "purpose": g.purpose,
        "vehicle_number": g.vehicle_number,
        "date": g.date,
        "notes": g.notes,
        "status": g.status,
        "created_by": g.created_by,
        "created_at": g.created_at,
        "purchase_request_id": g.purchase_request_id,
        "purchase_request_number": g.purchase_request_number,
        "purchase_order_id": g.purchase_order_id,
        "purchase_order_number": g.purchase_order_number,
        "items": [
            {
                "id": i.id,
                "item_name": i.item_name,
                "inv_type": i.inv_type,
                "inv_item_id": i.inv_item_id,
                "quantity": i.quantity,
                "unit": i.unit,
            }
            for i in (items or [])
        ],
    }
