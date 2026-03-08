from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareItem(SQLModel, table=True):
    __tablename__ = "spare_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="spare_category.id", index=True)
    name: str = Field(index=True)
    part_number: Optional[str] = None          # optional part / SKU code
    description: Optional[str] = None
    quantity_on_hand: float = Field(default=0.0)
    unit: str = Field(default="pcs")
    reorder_level: float = Field(default=0.0)
    storage_location: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
