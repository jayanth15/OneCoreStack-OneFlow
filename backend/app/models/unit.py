from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional
from sqlmodel import Field, SQLModel


class Unit(SQLModel, table=True):
    __tablename__ = "unit"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, max_length=50, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: now())
