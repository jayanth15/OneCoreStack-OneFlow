from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareItemVariant(SQLModel, table=True):
    """A colour/size/serial variant under a SpareItem.

    The parent SpareItem acts as an aggregate — total_value and displayed qty
    can be computed as the sum across all its active variants.
    """
    __tablename__ = "spare_item_variant"

    id: Optional[int] = Field(default=None, primary_key=True)
    spare_item_id: int = Field(foreign_key="spare_item.id", index=True)

    serial_number: Optional[str] = None          # SN / serial no
    variant_color: Optional[str] = None          # variant name / colour
    image_base64: Optional[str] = None
    qty: float = Field(default=0.0)
    storage_location: Optional[str] = None
    storage_type: Optional[str] = None
    rate: Optional[float] = None                 # per-variant rate (overrides parent if set)

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
