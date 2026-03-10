from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareItem(SQLModel, table=True):
    __tablename__ = "spare_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="spare_category.id", index=True)
    sub_category_id: Optional[int] = Field(default=None, foreign_key="spare_sub_category.id", index=True)

    # Core identification
    name: str = Field(index=True)              # short item name
    part_number: Optional[str] = None          # part / SKU code
    part_description: Optional[str] = None     # detailed description
    variant_model: Optional[str] = None        # variant or model (e.g. "168cc", "2-stroke")

    # Pricing
    rate: Optional[float] = None               # rate per unit

    # Quantities
    unit: str = Field(default="pcs")           # unit of measure
    opening_qty: float = Field(default=0.0)    # initial / opening quantity
    recorded_qty: float = Field(default=0.0)   # current recorded / physical qty
    reorder_level: float = Field(default=0.0)

    # Storage
    storage_type: Optional[str] = None         # storage type (Rack/Bin/etc)
    storage_location: Optional[str] = None     # exact location (e.g. "Rack B-3, Shelf 2")

    # Categorisation
    tags: Optional[str] = None                 # comma-separated tags (kept for DB compat)

    # Media
    image_base64: Optional[str] = None         # base-64 encoded image

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
