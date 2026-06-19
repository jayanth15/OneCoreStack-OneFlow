from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


# Valid request_type values
REQUEST_TYPE_INTERNAL_TRANSFER = "internal_transfer"
REQUEST_TYPE_VENDOR_PURCHASE = "vendor_purchase"
REQUEST_TYPE_CUSTOMER_DISPATCH = "customer_dispatch"
REQUEST_TYPES = (
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
)


class Request(SQLModel, table=True):
    """Unified request: internal transfer | vendor purchase | customer dispatch.

    Replaces PurchaseRequest (internal transfer + vendor purchase) and
    MarketingRequest (customer dispatch). Migration: see scripts/migrate_unified_request.py.
    """
    __tablename__ = "request"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Auto-generated serial — REQ-YYYY-NNNN
    sn_no: str = Field(index=True)

    # Type discriminator
    request_type: str = Field(default=REQUEST_TYPE_INTERNAL_TRANSFER, index=True)

    # Routing — header-level department (fallback if no per-item depts)
    department: Optional[str] = None

    # Vendor purchase fields (set when request_type=vendor_purchase)
    from_whom: Optional[str] = None

    # Common
    quantity: float = Field(default=0.0)  # denormalised total of line-item quantities
    notes: Optional[str] = None

    # Status — pending | approved | in_progress | awaiting_signoff | received
    #        | not_approved | cancelled
    status: str = Field(default="pending", index=True)

    # Authoring
    requested_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    requested_by_username: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    # Review (admin approve/reject)
    reviewed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    reviewed_by_username: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None

    # Fulfilment (dept accepts the request)
    fulfilled_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    fulfilled_by_username: Optional[str] = None
    fulfillment_accepted_at: Optional[datetime] = None
    fulfillment_note: Optional[str] = None

    is_active: bool = Field(default=True)

    # Delivery (set when fulfilling dept marks delivered → status awaiting_signoff)
    delivered_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivery_note: Optional[str] = None

    # Acknowledgment (set when requester confirms receipt → status received)
    acknowledged_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
