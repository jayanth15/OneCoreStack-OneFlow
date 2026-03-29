from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class MarketingRequest(SQLModel, table=True):
    """Marketing team item dispatch request (weeder / attachment)."""
    __tablename__ = "marketing_request"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial — MR-YYYY-NNNN
    sn_no: str = Field(index=True)

    # Inventory source
    inventory_type: str = Field(default="weeder")            # weeder | attachment
    item_id: Optional[int] = Field(default=None)             # weeder_item.id / attachment_item.id
    item_sn_no: Optional[str] = Field(default=None)          # denormalised
    item_description: Optional[str] = Field(default=None)    # denormalised

    quantity: float = Field(default=1.0)
    timeline_days: Optional[int] = Field(default=None)

    # Customer details
    customer_name: Optional[str] = Field(default=None)
    customer_phone: Optional[str] = Field(default=None)
    customer_address: Optional[str] = Field(default=None)

    # Post-fulfilment
    bought_by: Optional[str] = Field(default=None)           # filled after sale

    # Delivery
    delivery_type: Optional[str] = Field(default=None)       # direct | transport

    remarks: Optional[str] = Field(default=None)

    # Status  — pending | approved | not_approved | cancelled
    status: str = Field(default="pending", index=True)

    # Requester
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    requested_by_username: Optional[str] = Field(default=None)
    department: Optional[str] = Field(default=None)

    # Review
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_by_username: Optional[str] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    review_note: Optional[str] = Field(default=None)

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
