from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional

from sqlmodel import Field, SQLModel


class RequestHistory(SQLModel, table=True):
    """Change log entry for a Request."""
    __tablename__ = "request_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(index=True)

    changed_by_user_id: Optional[int] = None
    changed_by_username: Optional[str] = None
    change_type: str  # created | edited | approved | rejected | cancelled | responded
                      # | deleted | status_change | delivered | delivery_acknowledged
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    changed_at: datetime = Field(default_factory=lambda: now())
