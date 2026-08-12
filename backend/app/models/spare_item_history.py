from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional

from sqlmodel import Field, SQLModel


class SpareItemHistory(SQLModel, table=True):
    """Audit trail for every stock change on a SpareItem."""
    __tablename__ = "spare_item_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    spare_item_id: int = Field(foreign_key="spare_item.id", index=True)
    spare_item_variant_id: Optional[int] = Field(default=None, foreign_key="spare_item_variant.id", index=True)
    changed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    changed_by_username: Optional[str] = None   # denormalised for fast display
    changed_at: datetime = Field(
        default_factory=lambda: now(), index=True
    )

    # "add" | "subtract" | "set"
    change_type: str

    qty_before: float
    qty_after: float
    qty_delta: float   # positive = added, negative = removed

    note: Optional[str] = None
    variant_label: Optional[str] = None   # e.g. "Red / SN-001" for variant-level changes
