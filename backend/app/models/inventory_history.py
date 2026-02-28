from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class InventoryHistory(SQLModel, table=True):
    """Audit trail for every stock change on an InventoryItem.

    Written on: create, adjust (add / subtract / set), and field updates.
    """
    __tablename__ = "inventory_history"

    id: Optional[int] = Field(default=None, primary_key=True)
    inventory_item_id: int = Field(foreign_key="inventory_item.id", index=True)
    changed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    changed_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc), index=True)

    # What kind of change
    change_type: str  # create | add | subtract | set | edit

    # Stock snapshot
    quantity_before: Optional[float] = None
    quantity_after: Optional[float] = None
    quantity_delta: Optional[float] = None     # positive = added, negative = removed

    # Optional linkage
    schedule_id: Optional[int] = Field(default=None, foreign_key="schedule.id")
    notes: Optional[str] = None
