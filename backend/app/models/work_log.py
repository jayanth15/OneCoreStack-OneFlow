from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class WorkLog(SQLModel, table=True):
    """Per-job-card time entry linking a worker (user) to hours and work type.

    Each job card entry may create one WorkLog.  This enables per-worker
    time reports broken down by work type and date.
    """
    __tablename__ = "work_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_card_id: int = Field(foreign_key="job_card.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)       # the worker
    work_type_id: Optional[int] = Field(default=None, foreign_key="work_type.id")

    hours_worked: float = Field(default=0.0)
    work_date: Optional[str] = None  # ISO YYYY-MM-DD
    notes: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
