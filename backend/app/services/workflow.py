"""Shared workflow status and stock-identity rules."""
from collections.abc import Mapping

from fastapi import HTTPException

INVENTORY_TYPES = {
    "raw_material",
    "finished_good",
    "semi_finished",
    "scrap",
    "spare",
    "consumable",
    "attachment",
    "weeder",
}

REQUEST_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"approved", "not_approved", "cancelled"},
    "approved": {"in_progress", "awaiting_signoff", "received", "cancelled"},
    "in_progress": {"awaiting_signoff", "received", "cancelled"},
    "awaiting_signoff": {"received", "cancelled"},
    "received": set(),
    "not_approved": set(),
    "cancelled": set(),
}
PURCHASE_ORDER_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"approved", "cancelled"},
    "approved": {"cancelled"},
    "partially_received": {"received", "cancelled"},
    "received": {"closed"},
    "closed": set(),
    "cancelled": set(),
}
DISPATCH_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"ready", "dispatched", "delivered", "cancelled"},
    "ready": {"dispatched", "cancelled"},
    "dispatched": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}
GATE_PASS_TRANSITIONS: dict[str, set[str]] = {
    "open": {"exited", "entered", "closed", "cancelled"},
    "exited": {"closed"},
    "entered": {"closed"},
    "closed": set(),
    "cancelled": set(),
}


def ensure_transition(
    entity: str,
    current: str,
    target: str,
    transitions: Mapping[str, set[str]],
) -> None:
    if target == current:
        return
    if target not in transitions.get(current, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot change {entity} status from '{current}' to '{target}'",
        )


def ensure_inventory_identity(
    inventory_type: str | None,
    inventory_item_id: int | None,
    *,
    label: str,
    allow_free_text: bool = True,
) -> None:
    if inventory_type and inventory_type not in INVENTORY_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"{label} has unsupported inventory type '{inventory_type}'",
        )
    if inventory_item_id is not None and not inventory_type:
        raise HTTPException(
            status_code=422,
            detail=f"{label} requires inventory_type when inventory_item_id is set",
        )
    if not allow_free_text and inventory_item_id is None:
        raise HTTPException(
            status_code=422,
            detail=f"{label} must be linked to an inventory item",
        )
