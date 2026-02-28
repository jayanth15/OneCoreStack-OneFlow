from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Department(SQLModel, table=True):
    __tablename__ = "departments"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True, max_length=32)
    name: str = Field(max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
