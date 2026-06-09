from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class DispatchHistory(SQLModel, table=True):
    __tablename__ = "dispatch_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    dispatch_id: int = Field(index=True)

    changed_by_username: Optional[str] = Field(default=None)
    changed_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    # What changed
    change_type: str = Field(default="status_change")   # created | status_change | updated
    old_status: Optional[str] = Field(default=None)
    new_status: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
