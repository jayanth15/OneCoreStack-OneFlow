from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class GRNRecord(SQLModel, table=True):
    """Goods Received Note — records a delivery of goods into the company."""

    __tablename__ = "grn_record"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial number — GRN-0001
    grn_number: str = Field(index=True)

    # Transport
    transport_type: str = Field(default="own")  # own | company
    vehicle_number: Optional[str] = Field(default=None)  # only when transport_type == "company"

    # Who received it
    received_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    received_by_username: Optional[str] = Field(default=None)

    notes: Optional[str] = Field(default=None)

    # Workflow status: draft → stock_filled
    # Workflow status: draft → partially_filled → stock_filled
    status: str = Field(default="draft", index=True)  # draft | partially_filled | stock_filled
    stock_filled_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    stock_filled_by_username: Optional[str] = Field(default=None)
    stock_filled_at: Optional[datetime] = Field(default=None)

    # Inspection
    inspected_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    inspected_by_username: Optional[str] = Field(default=None)

    # Linked purchase request (soft reference — no CASCADE)
    purchase_request_id: Optional[int] = Field(default=None)

    # Documents
    po_number: Optional[str] = Field(default=None)
    dc_number: Optional[str] = Field(default=None)

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
