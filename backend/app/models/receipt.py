from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Receipt(SQLModel, table=True):
    """Goods-received record — created when an approved purchase request is fulfilled."""
    __tablename__ = "receipt"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial — RCPT-YYYY-NNNN
    sn_no: str = Field(index=True)

    # Parent request (denormalised fields for history resilience)
    request_id: int = Field(index=True)          # purchase_request.id
    item_name: Optional[str] = Field(default=None)
    item_code: Optional[str] = Field(default=None)
    quantity_requested: float = Field(default=0.0)   # snapshot of request.quantity

    # Which department created this receipt (for multi-dept requests)
    department: Optional[str] = Field(default=None)

    # Delivery detail
    quantity_received: float = Field(default=0.0)
    notes: Optional[str] = Field(default=None)       # delivery / packing notes

    # Who created this receipt
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_by_username: Optional[str] = Field(default=None)

    # Sign-off — pending_ack | acknowledged
    status: str = Field(default="pending_ack", index=True)
    acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    acknowledged_by_username: Optional[str] = Field(default=None)
    acknowledged_at: Optional[datetime] = Field(default=None)
    acknowledgment_note: Optional[str] = Field(default=None)

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
