from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional

from sqlmodel import Field, SQLModel


class WeederCategory(SQLModel, table=True):
    """Top-level category for weeder inventory (e.g. 'Weeder Power Machine')."""
    __tablename__ = "weeder_category"

    id: Optional[int] = Field(default=None, primary_key=True)

    name: str = Field(max_length=100, index=True)
    description: Optional[str] = None
    image_base64: Optional[str] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: now())
    updated_at: datetime = Field(default_factory=lambda: now())
