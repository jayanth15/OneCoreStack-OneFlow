from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional

from sqlmodel import Field, SQLModel


class PurchaseRequest(SQLModel, table=True):
    """Purchase / Production team material request."""
    __tablename__ = "purchase_request"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial — PR-YYYY-NNNN
    sn_no: str = Field(index=True)

    # Selected inventory item (denormalised for history resilience)
    inventory_item_id: Optional[int] = Field(default=None)   # inventory_item.id
    item_name: Optional[str] = Field(default=None)
    item_code: Optional[str] = Field(default=None)
    item_type: Optional[str] = Field(default=None)           # raw_material / finished_good / …
    description: Optional[str] = Field(default=None)         # item description / custom note

    quantity: float = Field(default=1.0)

    # Request meta
    from_whom: Optional[str] = Field(default=None)           # supplier / vendor
    timeline_days: Optional[int] = Field(default=None)       # expected fulfilment in days
    notes: Optional[str] = Field(default=None)               # any extra notes

    # Status  — pending | approved | not_approved | cancelled
    status: str = Field(default="pending", index=True)

    # Requester
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    requested_by_username: Optional[str] = Field(default=None)
    department: Optional[str] = Field(default=None)

    # Review (filled by admin on approve/reject)
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_by_username: Optional[str] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    review_note: Optional[str] = Field(default=None)

    # Fulfilment response — filled by the dept that accepts the approved request
    # status: pending | approved | not_approved | cancelled | in_progress | received
    fulfilled_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    fulfilled_by_username: Optional[str] = Field(default=None)
    fulfillment_accepted_at: Optional[datetime] = Field(default=None)
    fulfillment_note: Optional[str] = Field(default=None)

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: now())
    updated_at: datetime = Field(default_factory=lambda: now())
