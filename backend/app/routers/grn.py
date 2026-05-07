from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.grn import GRNRecord
from app.models.grn_item import GRNItem
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.purchase_request import PurchaseRequest
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/grn",
    tags=["grn"],
)

SessionDep = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _require_grn_access(user: User) -> None:
    if not (user.grn_access or user.role in ("admin", "super_admin")):
        raise HTTPException(status_code=403, detail="GRN access required")


def _next_grn_number(session: Session) -> str:
    count = session.exec(select(func.count()).select_from(GRNRecord)).one()
    return f"GRN-{count + 1:04d}"


def _recompute_status(items: list[GRNItem]) -> str:
    """Derive GRN status from per-item fill/return totals."""
    if not items:
        return "draft"
    total_received = sum(i.quantity_received for i in items)
    total_accounted = sum(i.quantity_filled + i.quantity_returned for i in items)
    if total_accounted <= 0:
        return "draft"
    if total_accounted >= total_received - 1e-9:
        return "stock_filled"
    return "partially_filled"


# ── Schemas ───────────────────────────────────────────────────────────────────


class GRNItemCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    unit: Optional[str] = None
    quantity_received: float = 0.0
    quantity_pr_requested: Optional[float] = None


class GRNCreate(BaseModel):
    transport_type: str = "own"  # own | company
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    inspected_by_user_id: Optional[int] = None
    inspected_by_username: Optional[str] = None
    purchase_request_id: Optional[int] = None
    po_number: Optional[str] = None
    dc_number: Optional[str] = None
    items: list[GRNItemCreate]


class GRNUpdate(BaseModel):
    """Full replace of mutable header fields. items=None → keep existing; list → replace all (draft only)."""
    transport_type: str = "own"
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    inspected_by_user_id: Optional[int] = None
    inspected_by_username: Optional[str] = None
    purchase_request_id: Optional[int] = None
    po_number: Optional[str] = None
    dc_number: Optional[str] = None
    items: Optional[list[GRNItemCreate]] = None  # None=no change; list=replace all (draft only)


class FillItemEntry(BaseModel):
    grn_item_id: int
    quantity_to_fill: float


class FillItemsBody(BaseModel):
    items: list[FillItemEntry]


class ReturnItemEntry(BaseModel):
    grn_item_id: int
    quantity_to_return: float


class ReturnItemsBody(BaseModel):
    items: list[ReturnItemEntry]


class GRNItemOut(BaseModel):
    id: int
    grn_id: int
    inventory_item_id: Optional[int]
    item_name: Optional[str]
    item_code: Optional[str]
    item_type: Optional[str]
    unit: Optional[str]
    quantity_received: float
    quantity_pr_requested: Optional[float] = None
    quantity_filled: float
    quantity_returned: float

    model_config = {"from_attributes": True}


class GRNOut(BaseModel):
    id: int
    grn_number: str
    transport_type: str
    vehicle_number: Optional[str]
    received_by_user_id: Optional[int]
    received_by_username: Optional[str]
    inspected_by_user_id: Optional[int]
    inspected_by_username: Optional[str]
    purchase_request_id: Optional[int]
    purchase_request_sn_no: Optional[str] = None
    po_number: Optional[str]
    dc_number: Optional[str]
    notes: Optional[str]
    status: str
    stock_filled_by_username: Optional[str]
    stock_filled_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    items: list[GRNItemOut] = []

    model_config = {"from_attributes": True}


class PaginatedGRN(BaseModel):
    items: list[GRNOut]
    total: int
    page: int
    page_size: int
    pages: int


class LinkablePROut(BaseModel):
    id: int
    sn_no: str
    item_name: Optional[str]
    item_code: Optional[str]
    item_type: Optional[str]
    unit: Optional[str]
    inventory_item_id: Optional[int]
    quantity: float
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_grn_out(session: Session, grn: GRNRecord) -> GRNOut:
    items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn.id)).all())
    out = GRNOut.model_validate(grn)
    out.items = [GRNItemOut.model_validate(i) for i in items]
    if grn.purchase_request_id:
        pr = session.get(PurchaseRequest, grn.purchase_request_id)
        out.purchase_request_sn_no = pr.sn_no if pr else None
    return out


def _create_grn_items(session: Session, grn_id: int, items_body: list[GRNItemCreate]) -> None:
    """Create GRNItem rows for a given GRN (used by create + update)."""
    for ib in items_body:
        item_name = ib.item_name
        item_code = ib.item_code
        item_type = ib.item_type
        unit = ib.unit
        if ib.inventory_item_id:
            inv = session.get(InventoryItem, ib.inventory_item_id)
            if inv:
                item_name = item_name or inv.name
                item_code = item_code or inv.code
                item_type = item_type or inv.item_type
                unit = unit or inv.unit
        session.add(GRNItem(
            grn_id=grn_id,
            inventory_item_id=ib.inventory_item_id,
            item_name=item_name,
            item_code=item_code,
            item_type=item_type,
            unit=unit,
            quantity_received=ib.quantity_received,
            quantity_pr_requested=ib.quantity_pr_requested,
            quantity_filled=0.0,
            quantity_returned=0.0,
        ))


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/linkable-prs", response_model=list[LinkablePROut])
def linkable_prs(
    session: SessionDep,
    _: CurrentUser,
    search: Optional[str] = Query(default=None),
) -> list[LinkablePROut]:
    """Return approved + in_progress purchase requests for GRN linking."""
    q = select(PurchaseRequest).where(
        PurchaseRequest.is_active == True,  # noqa: E712
        or_(
            PurchaseRequest.status == "approved",
            PurchaseRequest.status == "in_progress",
        ),
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.where(
            or_(
                PurchaseRequest.sn_no.ilike(term),  # type: ignore[union-attr]
                PurchaseRequest.item_name.ilike(term),  # type: ignore[union-attr]
            )
        )
    rows = session.exec(q.order_by(PurchaseRequest.id.desc()).limit(30)).all()  # type: ignore[union-attr]
    result = []
    for r in rows:
        # Look up unit from inventory item if available
        unit: Optional[str] = None
        if r.inventory_item_id:
            inv = session.get(InventoryItem, r.inventory_item_id)
            if inv:
                unit = inv.unit
        result.append(LinkablePROut(
            id=r.id,  # type: ignore[arg-type]
            sn_no=r.sn_no,
            item_name=r.item_name,
            item_code=r.item_code,
            item_type=r.item_type,
            unit=unit,
            inventory_item_id=r.inventory_item_id,
            quantity=r.quantity,
            status=r.status,
        ))
    return result


@router.get("", response_model=PaginatedGRN)
def list_grns(
    session: SessionDep,
    _: CurrentUser,
    status_filter: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PaginatedGRN:
    q = select(GRNRecord).where(GRNRecord.is_active == True)  # noqa: E712
    if status_filter:
        q = q.where(GRNRecord.status == status_filter)
    total = session.exec(select(func.count()).select_from(q.subquery())).one()
    rows = list(
        session.exec(
            q.order_by(GRNRecord.id.desc())  # type: ignore[union-attr]
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return PaginatedGRN(
        items=[_build_grn_out(session, grn) for grn in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=GRNOut, status_code=status.HTTP_201_CREATED)
def create_grn(
    body: GRNCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    _require_grn_access(current_user)
    if not body.items:
        raise HTTPException(status_code=422, detail="At least one item is required")

    now = datetime.now(tz=timezone.utc)

    # Resolve inspected_by_username from user_id if not supplied
    inspected_username = body.inspected_by_username
    if body.inspected_by_user_id and not inspected_username:
        u = session.get(User, body.inspected_by_user_id)
        if u:
            inspected_username = u.username

    grn = GRNRecord(
        grn_number=_next_grn_number(session),
        transport_type=body.transport_type,
        vehicle_number=body.vehicle_number if body.transport_type == "company" else None,
        notes=body.notes,
        received_by_user_id=current_user.id,  # type: ignore[arg-type]
        received_by_username=current_user.username,
        inspected_by_user_id=body.inspected_by_user_id,
        inspected_by_username=inspected_username,
        purchase_request_id=body.purchase_request_id,
        po_number=body.po_number or None,
        dc_number=body.dc_number or None,
        status="draft",
        created_at=now,
        updated_at=now,
    )
    session.add(grn)
    session.flush()

    _create_grn_items(session, grn.id, body.items)  # type: ignore[arg-type]

    session.commit()
    session.refresh(grn)
    return _build_grn_out(session, grn)


@router.get("/{grn_id}", response_model=GRNOut)
def get_grn(
    grn_id: int,
    session: SessionDep,
    _: CurrentUser,
) -> GRNOut:
    grn = session.get(GRNRecord, grn_id)
    if not grn or not grn.is_active:
        raise HTTPException(status_code=404, detail="GRN not found")
    return _build_grn_out(session, grn)


@router.put("/{grn_id}", response_model=GRNOut)
def update_grn(
    grn_id: int,
    body: GRNUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    """Update GRN header fields. Items can only be replaced when status is 'draft'."""
    _require_grn_access(current_user)
    grn = session.get(GRNRecord, grn_id)
    if not grn or not grn.is_active:
        raise HTTPException(status_code=404, detail="GRN not found")

    now = datetime.now(tz=timezone.utc)

    # Resolve inspected_by_username
    inspected_username = body.inspected_by_username
    if body.inspected_by_user_id and not inspected_username:
        u = session.get(User, body.inspected_by_user_id)
        if u:
            inspected_username = u.username

    # Update header fields
    grn.transport_type = body.transport_type
    grn.vehicle_number = body.vehicle_number if body.transport_type == "company" else None
    grn.notes = body.notes or None
    grn.purchase_request_id = body.purchase_request_id
    grn.po_number = body.po_number or None
    grn.dc_number = body.dc_number or None
    grn.inspected_by_user_id = body.inspected_by_user_id
    grn.inspected_by_username = inspected_username or None
    grn.updated_at = now

    # Replace items only when draft AND items were provided
    if body.items is not None:
        if grn.status != "draft":
            raise HTTPException(
                status_code=422,
                detail="Items can only be modified while the GRN has not been filled yet",
            )
        if not body.items:
            raise HTTPException(status_code=422, detail="At least one item is required")
        # Delete all existing items and recreate
        for old_item in session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all():
            session.delete(old_item)
        session.flush()
        _create_grn_items(session, grn_id, body.items)

    session.add(grn)
    session.commit()
    session.refresh(grn)
    return _build_grn_out(session, grn)


@router.post("/{grn_id}/fill-items", response_model=GRNOut)
def fill_items(
    grn_id: int,
    body: FillItemsBody,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    """Partially or fully move received items into inventory stock."""
    _require_grn_access(current_user)
    grn = session.get(GRNRecord, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status == "stock_filled":
        raise HTTPException(status_code=422, detail="GRN is already fully stock filled")

    now = datetime.now(tz=timezone.utc)

    for entry in body.items:
        if entry.quantity_to_fill <= 0:
            continue
        gi = session.get(GRNItem, entry.grn_item_id)
        if not gi or gi.grn_id != grn_id:
            raise HTTPException(status_code=404, detail=f"GRN item {entry.grn_item_id} not found")
        remaining = gi.quantity_received - gi.quantity_filled - gi.quantity_returned
        if entry.quantity_to_fill > remaining + 1e-9:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot fill {entry.quantity_to_fill} for '{gi.item_name}': only {round(remaining, 4)} remaining",
            )
        actual = min(entry.quantity_to_fill, remaining)
        gi.quantity_filled = round(gi.quantity_filled + actual, 4)
        session.add(gi)

        if gi.inventory_item_id:
            inv = session.get(InventoryItem, gi.inventory_item_id)
            if inv:
                qty_before = inv.quantity_on_hand
                inv.quantity_on_hand = round(qty_before + actual, 4)
                inv.updated_at = now
                session.add(inv)
                session.add(InventoryHistory(
                    inventory_item_id=inv.id,  # type: ignore[arg-type]
                    changed_by_user_id=current_user.id,  # type: ignore[arg-type]
                    changed_by_username=current_user.username,
                    changed_at=now,
                    change_type="add",
                    quantity_before=qty_before,
                    quantity_after=inv.quantity_on_hand,
                    quantity_delta=actual,
                    notes=f"Filled via {grn.grn_number} by {current_user.username}",
                ))

    all_items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())
    new_status = _recompute_status(all_items)
    grn.status = new_status
    if new_status == "stock_filled":
        grn.stock_filled_by_user_id = current_user.id  # type: ignore[assignment]
        grn.stock_filled_by_username = current_user.username
        grn.stock_filled_at = now
    grn.updated_at = now
    session.add(grn)
    session.commit()
    session.refresh(grn)
    return _build_grn_out(session, grn)


@router.post("/{grn_id}/return-items", response_model=GRNOut)
def return_items(
    grn_id: int,
    body: ReturnItemsBody,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    """Return previously filled quantities back from inventory."""
    _require_grn_access(current_user)
    grn = session.get(GRNRecord, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status == "draft":
        raise HTTPException(status_code=422, detail="Nothing has been filled yet")

    now = datetime.now(tz=timezone.utc)

    for entry in body.items:
        if entry.quantity_to_return <= 0:
            continue
        gi = session.get(GRNItem, entry.grn_item_id)
        if not gi or gi.grn_id != grn_id:
            raise HTTPException(status_code=404, detail=f"GRN item {entry.grn_item_id} not found")
        if entry.quantity_to_return > gi.quantity_filled + 1e-9:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot return {entry.quantity_to_return} for '{gi.item_name}': only {gi.quantity_filled} filled",
            )
        actual = min(entry.quantity_to_return, gi.quantity_filled)
        gi.quantity_filled = round(gi.quantity_filled - actual, 4)
        gi.quantity_returned = round(gi.quantity_returned + actual, 4)
        session.add(gi)

        if gi.inventory_item_id:
            inv = session.get(InventoryItem, gi.inventory_item_id)
            if inv:
                qty_before = inv.quantity_on_hand
                inv.quantity_on_hand = max(0.0, round(qty_before - actual, 4))
                inv.updated_at = now
                session.add(inv)
                session.add(InventoryHistory(
                    inventory_item_id=inv.id,  # type: ignore[arg-type]
                    changed_by_user_id=current_user.id,  # type: ignore[arg-type]
                    changed_by_username=current_user.username,
                    changed_at=now,
                    change_type="remove",
                    quantity_before=qty_before,
                    quantity_after=inv.quantity_on_hand,
                    quantity_delta=-actual,
                    notes=f"Returned via {grn.grn_number} by {current_user.username}",
                ))

    all_items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())
    grn.status = _recompute_status(all_items)
    grn.updated_at = now
    session.add(grn)
    session.commit()
    session.refresh(grn)
    return _build_grn_out(session, grn)


@router.post("/{grn_id}/mark-stock-filled", response_model=GRNOut)
def mark_stock_filled(
    grn_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    """Backward-compat: fill all remaining quantities in one shot."""
    _require_grn_access(current_user)
    grn = session.get(GRNRecord, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status == "stock_filled":
        raise HTTPException(status_code=422, detail="GRN is already stock filled")

    items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())
    fill_entries = [
        FillItemEntry(
            grn_item_id=gi.id,  # type: ignore[arg-type]
            quantity_to_fill=gi.quantity_received - gi.quantity_filled - gi.quantity_returned,
        )
        for gi in items
        if gi.quantity_received - gi.quantity_filled - gi.quantity_returned > 0
    ]
    return fill_items(grn_id, FillItemsBody(items=fill_entries), session, current_user)
