from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class InventoryItem(SQLModel, table=True):
    __tablename__ = "inventory_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(unique=True, index=True)
    name: str = Field(index=True)
    item_type: str = Field(default="raw_material", index=True)  # raw_material | finished_good | semi_finished
    unit: str  # "kg", "pcs", "ltr", "mtr", etc.
    quantity_on_hand: float = Field(default=0.0)
    reorder_level: float = Field(default=0.0)  # 0 = no alert
    storage_type: Optional[str] = None          # bin | tray | barrel | rack | etc.
    storage_location: Optional[str] = None      # e.g. "Shelf A-3"
    rate: Optional[float] = None                # cost per unit — admin-visible only
    timeline_days: Optional[int] = None         # expected fulfillment / lead time in days
    image_base64: Optional[str] = None          # base64-encoded image — omitted from list responses
    vendor_name: Optional[str] = None           # primary vendor (for finished goods / semi-finished)
    design_drawing_pdf: Optional[str] = None    # base64-encoded design drawing PDF
    weight_value: Optional[float] = Field(default=None)               # weight of one unit
    weight_unit: Optional[str] = Field(default=None)                  # "kg", "g", "mg", "lb"
    is_active: bool = Field(default=True)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
