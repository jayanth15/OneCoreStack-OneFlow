from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class PurchaseRequestItem(SQLModel, table=True):
    """Line item for a purchase request."""
    __tablename__ = "purchase_request_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)   # FK to purchase_request.id
    inventory_item_id: Optional[int] = Field(default=None)
    item_name: Optional[str] = Field(default=None)
    item_code: Optional[str] = Field(default=None)
    item_type: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)
    quantity: float = Field(default=1.0)
    timeline_days: Optional[int] = Field(default=None)
    department: Optional[str] = Field(default=None)

    # Per-item acceptance tracking — each target department accepts independently
    # item_status: None/null = pending, "in_progress" = accepted, "delivered" = delivered
    item_status: Optional[str] = Field(default=None, index=True)
    accepted_by_username: Optional[str] = Field(default=None)
    accepted_at: Optional[datetime] = Field(default=None)
    acceptance_note: Optional[str] = Field(default=None)
