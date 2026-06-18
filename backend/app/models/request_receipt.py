from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestReceipt(SQLModel, table=True):
    """Goods-received record — created when an approved Request is delivered.

    Renamed from Receipt and re-pointed to Request. See migration script.
    """
    __tablename__ = "request_receipt"

    id: Optional[int] = Field(default=None, primary_key=True)
    sn_no: str = Field(index=True)  # RCPT-YYYY-NNNN

    request_id: int = Field(index=True)  # FK to request.id
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float = Field(default=0.0)
    quantity_received: float = Field(default=0.0)
    notes: Optional[str] = None
    department: Optional[str] = None

    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_by_username: Optional[str] = None
    status: str = Field(default="pending_ack", index=True)  # pending_ack | acknowledged
    acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
