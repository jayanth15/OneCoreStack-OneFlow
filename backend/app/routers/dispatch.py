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
from app.models.dispatch_item import DispatchItem
from app.models.user import User

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
    q = select(Dispatch).order_by(Dispatch.id.desc())  # type: ignore[union-attr]
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

    return {"items": [_to_dict(d, items_by_dispatch.get(d.id, [])) for d in page_dispatches], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dispatch(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    raw_items = body.get("items") or []
    first_item_name = ""
    first_qty = 0.0
    first_unit = None
    if raw_items:
        first = raw_items[0]
        first_item_name = (first.get("item_name") or "").strip()
        first_qty = float(first.get("quantity") or 0)
        first_unit = (first.get("unit") or "").strip() or None

    dispatch = Dispatch(
        dispatch_number=_next_dispatch_number(session),
        party_type=body.get("party_type") or "vendor",
        vendor_id=body.get("vendor_id"),
        vendor_name=(body.get("vendor_name") or "").strip() or None,
        supplier_id=body.get("supplier_id"),
        supplier_name=(body.get("supplier_name") or "").strip() or None,
        schedule_id=body.get("schedule_id"),
        schedule_number=(body.get("schedule_number") or "").strip() or None,
        product_name=first_item_name or (body.get("product_name") or "").strip(),
        quantity=first_qty or float(body.get("quantity") or 0),
        unit=first_unit or (body.get("unit") or "").strip() or None,
        dispatch_date=(body.get("dispatch_date") or "").strip() or None,
        vehicle_number=(body.get("vehicle_number") or "").strip() or None,
        driver_name=(body.get("driver_name") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        status=body.get("status") or "pending",
        created_by=current_user.username,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
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
            unit=(item_data.get("unit") or "").strip() or None,
        )
        session.add(di)
        di_list.append(di)

    session.commit()
    session.refresh(dispatch)
    saved_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
    return _to_dict(dispatch, saved_items)


@router.get("/{dispatch_id}")
def get_dispatch(
    dispatch_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    d_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch_id)).all())
    return _to_dict(dispatch, d_items)


@router.put("/{dispatch_id}")
def update_dispatch(
    dispatch_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_dispatch_access(current_user)
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")

    for field in ("party_type", "vendor_id", "vendor_name", "supplier_id", "supplier_name",
                  "schedule_id", "schedule_number",
                  "product_name", "quantity", "unit", "dispatch_date",
                  "vehicle_number", "driver_name", "notes", "status"):
        if field in body:
            val = body[field]
            if isinstance(val, str):
                val = val.strip() or None
            setattr(dispatch, field, val)

    # Replace items if provided
    if "items" in body:
        old_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
        for old in old_items:
            session.delete(old)
        raw_items = body["items"] or []
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
                unit=(item_data.get("unit") or "").strip() or None,
            )
            session.add(di)
            new_dis.append(di)
        # Update summary fields from first item
        if new_dis:
            first_data = raw_items[0]
            dispatch.product_name = (first_data.get("item_name") or "").strip()
            dispatch.quantity = float(first_data.get("quantity") or 0)
            dispatch.unit = (first_data.get("unit") or "").strip() or None

    session.add(dispatch)
    session.commit()
    session.refresh(dispatch)
    saved_items = list(session.exec(select(DispatchItem).where(DispatchItem.dispatch_id == dispatch.id)).all())
    return _to_dict(dispatch, saved_items)


@router.delete("/{dispatch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatch(
    dispatch_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    _require_dispatch_access(current_user)
    dispatch = session.get(Dispatch, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    dispatch.status = "cancelled"
    session.add(dispatch)
    session.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_dispatch_access(user: User) -> None:
    if user.role in ("admin", "super_admin"):
        return
    if getattr(user, "dispatch_access", False):
        return
    raise HTTPException(status_code=403, detail="Dispatch access required")


def _to_dict(d: Dispatch, items: list[DispatchItem] | None = None) -> dict[str, Any]:
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
        "product_name": d.product_name,
        "quantity": d.quantity,
        "unit": d.unit,
        "dispatch_date": d.dispatch_date,
        "vehicle_number": d.vehicle_number,
        "driver_name": d.driver_name,
        "notes": d.notes,
        "status": d.status,
        "created_by": d.created_by,
        "created_at": d.created_at,
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
