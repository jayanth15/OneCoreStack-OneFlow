from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestItem(SQLModel, table=True):
    """Line item for a Request.

    Used for internal_transfer and vendor_purchase types. Customer-dispatch
    has no line items; use RequestCustomerDispatch instead.
    """
    __tablename__ = "request_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)  # FK to request.id

    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
    description: Optional[str] = None
    quantity: float = Field(default=1.0)
    timeline_days: Optional[int] = None
    department: Optional[str] = None  # per-item target department

    # Per-item acceptance
    item_status: Optional[str] = None  # None=pending, "in_progress", "delivered"
    accepted_by_username: Optional[str] = None
    accepted_at: Optional[datetime] = None
    acceptance_note: Optional[str] = None
