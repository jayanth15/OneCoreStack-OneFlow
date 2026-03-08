from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareCategory(SQLModel, table=True):
    __tablename__ = "spare_category"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
