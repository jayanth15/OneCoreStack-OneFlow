from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.grn import GRNRecord
from app.models.grn_item import GRNItem
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
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


# ── Schemas ───────────────────────────────────────────────────────────────────


class GRNItemCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    unit: Optional[str] = None
    quantity_received: float = 0.0


class GRNCreate(BaseModel):
    transport_type: str = "own"  # own | company
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    items: list[GRNItemCreate]


class GRNItemOut(BaseModel):
    id: int
    grn_id: int
    inventory_item_id: Optional[int]
    item_name: Optional[str]
    item_code: Optional[str]
    item_type: Optional[str]
    unit: Optional[str]
    quantity_received: float

    model_config = {"from_attributes": True}


class GRNOut(BaseModel):
    id: int
    grn_number: str
    transport_type: str
    vehicle_number: Optional[str]
    received_by_user_id: Optional[int]
    received_by_username: Optional[str]
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


# ── Routes ────────────────────────────────────────────────────────────────────


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

    result: list[GRNOut] = []
    for grn in rows:
        items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn.id)).all())
        out = GRNOut.model_validate(grn)
        out.items = [GRNItemOut.model_validate(i) for i in items]
        result.append(out)

    return PaginatedGRN(
        items=result,
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
    grn = GRNRecord(
        grn_number=_next_grn_number(session),
        transport_type=body.transport_type,
        vehicle_number=body.vehicle_number if body.transport_type == "company" else None,
        notes=body.notes,
        received_by_user_id=current_user.id,  # type: ignore[arg-type]
        received_by_username=current_user.username,
        status="draft",
        created_at=now,
        updated_at=now,
    )
    session.add(grn)
    session.flush()  # populate grn.id

    grn_items: list[GRNItem] = []
    for item_body in body.items:
        item_name = item_body.item_name
        item_code = item_body.item_code
        item_type = item_body.item_type
        unit = item_body.unit
        if item_body.inventory_item_id:
            inv = session.get(InventoryItem, item_body.inventory_item_id)
            if inv:
                item_name = item_name or inv.name
                item_code = item_code or inv.code
                item_type = item_type or inv.item_type
                unit = unit or inv.unit
        gi = GRNItem(
            grn_id=grn.id,  # type: ignore[arg-type]
            inventory_item_id=item_body.inventory_item_id,
            item_name=item_name,
            item_code=item_code,
            item_type=item_type,
            unit=unit,
            quantity_received=item_body.quantity_received,
        )
        session.add(gi)
        grn_items.append(gi)

    session.commit()
    session.refresh(grn)

    out = GRNOut.model_validate(grn)
    out.items = [GRNItemOut.model_validate(i) for i in grn_items]
    return out


@router.get("/{grn_id}", response_model=GRNOut)
def get_grn(
    grn_id: int,
    session: SessionDep,
    _: CurrentUser,
) -> GRNOut:
    grn = session.get(GRNRecord, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())
    out = GRNOut.model_validate(grn)
    out.items = [GRNItemOut.model_validate(i) for i in items]
    return out


@router.post("/{grn_id}/mark-stock-filled", response_model=GRNOut)
def mark_stock_filled(
    grn_id: int,
    session: SessionDep,
    current_user: CurrentUser,
) -> GRNOut:
    _require_grn_access(current_user)
    grn = session.get(GRNRecord, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status != "draft":
        raise HTTPException(status_code=422, detail="GRN is already stock filled")

    now = datetime.now(tz=timezone.utc)
    items = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())

    for gi in items:
        if gi.inventory_item_id is None:
            continue  # free-text items without inventory link — skip qty update
        inv = session.get(InventoryItem, gi.inventory_item_id)
        if not inv:
            continue
        qty_before = inv.quantity_on_hand
        inv.quantity_on_hand = round(qty_before + gi.quantity_received, 4)
        inv.updated_at = now
        session.add(inv)

        history = InventoryHistory(
            inventory_item_id=inv.id,  # type: ignore[arg-type]
            changed_by_user_id=current_user.id,  # type: ignore[arg-type]
            changed_at=now,
            change_type="add",
            quantity_before=qty_before,
            quantity_after=inv.quantity_on_hand,
            quantity_delta=gi.quantity_received,
            notes=f"Received via {grn.grn_number} by {current_user.username}",
        )
        session.add(history)

    grn.status = "stock_filled"
    grn.stock_filled_by_user_id = current_user.id  # type: ignore[assignment]
    grn.stock_filled_by_username = current_user.username
    grn.stock_filled_at = now
    grn.updated_at = now
    session.add(grn)
    session.commit()
    session.refresh(grn)

    items_refreshed = list(session.exec(select(GRNItem).where(GRNItem.grn_id == grn_id)).all())
    out = GRNOut.model_validate(grn)
    out.items = [GRNItemOut.model_validate(i) for i in items_refreshed]
    return out
