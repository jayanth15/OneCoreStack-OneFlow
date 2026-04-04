from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class WeederItem(SQLModel, table=True):
    """Weeder inventory sub-item (belongs to a WeederCategory)."""
    __tablename__ = "weeder_item"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Category FK (nullable for legacy rows created before categories)
    category_id: Optional[int] = Field(default=None, foreign_key="weeder_category.id", index=True)

    name: Optional[str] = Field(default=None, index=True)            # item name / label
    sn_no: Optional[str] = Field(default=None, index=True)          # serial / part number
    description: Optional[str] = None                                # item description
    qty: float = Field(default=0.0)                                   # total quantity on hand
    reorder_level: float = Field(default=0.0)                        # low-stock alert threshold
    rate_per_unit: Optional[float] = None                            # price per unit
    storage_location: Optional[str] = None                           # where it's stored

    image_base64: Optional[str] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
