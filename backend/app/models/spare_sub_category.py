from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareSubCategory(SQLModel, table=True):
    __tablename__ = "spare_sub_category"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="spare_category.id", index=True)
    name: str = Field(index=True)          # e.g. "168cc Vehicle", "2-stroke Weeder"
    description: Optional[str] = None
    image_base64: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
