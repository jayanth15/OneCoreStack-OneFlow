"""Helpers for 'linkable' Purchase Requests — used by GRN creation."""
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.inventory import InventoryItem
from app.routers.grn import LinkablePROut  # reuses the response schema


def get_linkable_pr_or_404(session: Session, pr_id: int) -> PurchaseRequest:
    """Load a PR, raising 404 if it doesn't exist, is soft-deleted, or isn't linkable."""
    pr = session.get(PurchaseRequest, pr_id)
    if not pr or not pr.is_active:  # type: ignore[union-attr]
        raise HTTPException(status_code=404, detail="Purchase request not found")
    if pr.status not in ("approved", "in_progress"):
        raise HTTPException(status_code=404, detail="Purchase request not linkable")
    return pr


def get_linkable_pr_items(session: Session, pr_id: int) -> list[LinkablePROut]:
    """Return line items for a linkable PR, shaped like `LinkablePROut`.

    The PR item model has no `sn_no` or per-item `status` field, so we
    synthesize them from the parent PR (e.g. `PR-0001-1`, `PR-0001-2`) and
    fall back to `item_status` for status — keeps the response shape stable
    for the frontend.
    """
    pr = get_linkable_pr_or_404(session, pr_id)
    items = list(
        session.exec(
            select(PurchaseRequestItem)
            .where(PurchaseRequestItem.request_id == pr.id)  # type: ignore[arg-type]
            .order_by(PurchaseRequestItem.id)  # type: ignore[union-attr]
        ).all()
    )
    result: list[LinkablePROut] = []
    for i, it in enumerate(items, start=1):
        unit: Optional[str] = None
        if it.inventory_item_id:
            inv = session.get(InventoryItem, it.inventory_item_id)
            if inv:
                unit = inv.unit
        result.append(
            LinkablePROut(
                id=it.id,  # type: ignore[arg-type]
                sn_no=f"{pr.sn_no}-{i}",
                item_name=it.item_name,
                item_code=it.item_code,
                item_type=it.item_type,
                unit=unit,
                inventory_item_id=it.inventory_item_id,
                quantity=it.quantity,
                status=it.item_status or "pending",
            )
        )
    return result
