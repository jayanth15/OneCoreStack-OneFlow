"""Inventory validation and deduction for fulfilled requests and dispatches."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.attachment_history import AttachmentHistory
from app.models.attachment_item import AttachmentItem
from app.models.consumable import Consumable
from app.models.consumable_history import ConsumableHistory
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.spare_item import SpareItem
from app.models.spare_item_history import SpareItemHistory
from app.models.spare_item_variant import SpareItemVariant
from app.models.user import User
from app.models.weeder_history import WeederHistory
from app.models.weeder_item import WeederItem


@dataclass(frozen=True)
class StockDeduction:
    inventory_type: str
    item_id: int
    quantity: float
    label: str = "item"


def deduct_request_stock(
    session: Session,
    deductions: list[StockDeduction],
    current_user: User,
    note: str,
) -> None:
    """Validate all lines first, then deduct them in the caller's transaction."""
    totals: dict[tuple[str, int], float] = defaultdict(float)
    labels: dict[tuple[str, int], str] = {}
    for line in deductions:
        if line.quantity < 0:
            raise HTTPException(status_code=422, detail="Fulfilled quantity cannot be negative")
        if line.quantity == 0:
            continue
        key = (line.inventory_type, line.item_id)
        totals[key] += line.quantity
        labels[key] = line.label

    resolved = {key: _resolve(session, *key) for key in totals}
    shortages = []
    for key, required in totals.items():
        available = _quantity(resolved[key])
        if available + 1e-9 < required:
            shortages.append(
                f"{labels[key]}: requested {required:g}, available {available:g}"
            )
    if shortages:
        raise HTTPException(
            status_code=409,
            detail="Insufficient inventory. " + "; ".join(shortages),
        )

    now = datetime.now(tz=timezone.utc)
    for key, required in totals.items():
        _deduct(session, key[0], resolved[key], required, current_user, note, now)


def _resolve(session: Session, inventory_type: str, item_id: int):
    if inventory_type in {"raw_material", "finished_good", "semi_finished", "scrap"}:
        item = session.get(InventoryItem, item_id)
        if not item or not item.is_active or item.item_type != inventory_type:
            raise HTTPException(status_code=404, detail=f"Inventory item {item_id} not found")
        return item
    model = {
        "spare": SpareItemVariant,
        "consumable": Consumable,
        "weeder": WeederItem,
        "attachment": AttachmentItem,
    }.get(inventory_type)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Unsupported inventory type '{inventory_type}'")
    item = session.get(model, item_id)
    if not item or not item.is_active:
        raise HTTPException(status_code=404, detail=f"{inventory_type.title()} item {item_id} not found")
    return item


def _quantity(item) -> float:
    if isinstance(item, InventoryItem):
        return item.quantity_on_hand
    return item.qty


def _deduct(
    session: Session,
    inventory_type: str,
    item,
    quantity: float,
    current_user: User,
    note: str,
    now: datetime,
) -> None:
    before = _quantity(item)
    after = before - quantity
    if isinstance(item, InventoryItem):
        item.quantity_on_hand = after
        item.updated_at = now
        history = InventoryHistory(
            inventory_item_id=item.id,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            changed_at=now,
            change_type="subtract",
            quantity_before=before,
            quantity_after=after,
            quantity_delta=-quantity,
            notes=note,
        )
    elif isinstance(item, SpareItemVariant):
        item.qty = after
        item.updated_at = now
        parent = session.get(SpareItem, item.spare_item_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Spare item parent not found")
        parent_before = parent.recorded_qty
        active_variants = session.exec(
            select(SpareItemVariant).where(
                SpareItemVariant.spare_item_id == parent.id,
                SpareItemVariant.is_active == True,  # noqa: E712
            )
        ).all()
        parent.recorded_qty = sum(after if variant.id == item.id else variant.qty for variant in active_variants)
        parent.updated_at = now
        session.add(parent)
        variant_parts = [part for part in (item.variant_color, item.serial_number) if part]
        history = SpareItemHistory(
            spare_item_id=parent.id,
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            changed_at=now,
            change_type="subtract",
            qty_before=parent_before,
            qty_after=parent.recorded_qty,
            qty_delta=parent.recorded_qty - parent_before,
            note=note,
            variant_label=" / ".join(variant_parts) or f"Variant #{item.id}",
        )
    else:
        item.qty = after
        item.updated_at = now
        history_cls, id_field = {
            "consumable": (ConsumableHistory, "consumable_id"),
            "weeder": (WeederHistory, "weeder_id"),
            "attachment": (AttachmentHistory, "attachment_id"),
        }[inventory_type]
        history = history_cls(
            **{id_field: item.id},
            changed_by_user_id=current_user.id,
            changed_by_username=current_user.username,
            changed_at=now,
            change_type="subtract",
            qty_before=before,
            qty_after=after,
            qty_delta=-quantity,
            note=note,
        )
    session.add(item)
    session.add(history)
