from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Receipt(SQLModel, table=True):
    """Goods Receipt — records delivery of items for an internal transfer request.

    Created by the fulfilling department. Signed off by the requester.
    """
    __tablename__ = "receipt"

    id: Optional[int] = Field(default=None, primary_key=True)
    receipt_number: str = Field(index=True, unique=True)
    request_id: int = Field(index=True)
    department: Optional[str] = Field(default=None, index=True)

    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_by_username: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    signed_off_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    signed_off_by_username: Optional[str] = None
    signed_off_at: Optional[datetime] = None

    disputed_at: Optional[datetime] = None
    dispute_note: Optional[str] = None

    status: str = Field(default="created")  # created | signed_off | disputed
    notes: Optional[str] = None
