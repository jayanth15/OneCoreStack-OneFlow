from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class JobCardHistory(SQLModel, table=True):
    """Audit trail for every change on a JobCard.

    One row per changed field per edit.  A single update that changes 3 fields
    produces 3 history records (all sharing the same changed_at timestamp).
    """
    __tablename__ = "job_card_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_card_id: int = Field(foreign_key="job_card.id", index=True)
    changed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    changed_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc),
        index=True,
    )

    # What kind of change
    change_type: str  # created | updated | deleted

    # Which field changed (null for "created" / "deleted" summary rows)
    field_name: Optional[str] = None  # e.g. "qty_produced", "worker_name", "status"

    old_value: Optional[str] = None
    new_value: Optional[str] = None

    notes: Optional[str] = None
