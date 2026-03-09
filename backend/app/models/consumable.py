from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Consumable(SQLModel, table=True):
    __tablename__ = "consumable"

    id: Optional[int] = Field(default=None, primary_key=True)

    name: str = Field(index=True)
    code: Optional[str] = Field(default=None, index=True)  # optional SKU / code
    storage_location: Optional[str] = None                  # where it's stored
    supplier_name: Optional[str] = None                     # supplier / vendor
    rate_per_unit: Optional[float] = None                   # price per unit

    image_base64: Optional[str] = None

    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
