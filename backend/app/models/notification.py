from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Notification(SQLModel, table=True):
    __tablename__ = "notification"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    type: str  # request_approved | request_rejected | request_responded | receipt_created | receipt_acknowledged
    title: str
    body: Optional[str] = Field(default=None)
    request_id: Optional[int] = Field(default=None)
    is_read: bool = Field(default=False)
    read_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
