from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class ScheduleHistory(SQLModel, table=True):
    """Audit trail for schedule status changes."""
    __tablename__ = "schedule_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    schedule_id: int = Field(foreign_key="schedule.id", index=True)
    changed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    changed_by_username: Optional[str] = None
    changed_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc),
        index=True,
    )
    old_status: Optional[str] = None
    new_status: str
    note: Optional[str] = None
