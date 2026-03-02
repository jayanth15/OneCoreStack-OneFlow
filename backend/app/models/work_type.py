from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class WorkType(SQLModel, table=True):
    """Configurable work-type categories for time tracking.

    Managed by admins; referenced by WorkLog entries.
    Examples: Blanking, Welding, Assembly, QC Inspection, Packaging.
    """
    __tablename__ = "work_type"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
