from typing import Optional

from sqlmodel import Field, SQLModel


class GRNItem(SQLModel, table=True):
    """Line item within a GRN — one row per inventory item received."""

    __tablename__ = "grn_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    grn_id: int = Field(foreign_key="grn_record.id", index=True)

    # Inventory item reference (nullable — allows free-text entry)
    inventory_item_id: Optional[int] = Field(default=None, foreign_key="inventory_item.id")

    # Denormalised fields for history resilience
    item_name: Optional[str] = Field(default=None)
    item_code: Optional[str] = Field(default=None)
    item_type: Optional[str] = Field(default=None)
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
    quantity_received: float = Field(default=0.0)
    # How many were requested in the linked purchase request (for comparison)
    quantity_pr_requested: Optional[float] = Field(default=None)
    # How much has been moved to inventory stock so far
    quantity_filled: float = Field(default=0.0)
    # How much has been returned from stock
    quantity_returned: float = Field(default=0.0)
    request_item_id: Optional[int] = Field(default=None, index=True)
    purchase_order_item_id: Optional[int] = Field(default=None, index=True)
