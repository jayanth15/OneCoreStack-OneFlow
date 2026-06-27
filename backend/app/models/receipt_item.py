from typing import Optional

from sqlmodel import Field, SQLModel


class ReceiptItem(SQLModel, table=True):
    """Line item for a Receipt — links to a RequestItem and records delivered/signed-off quantities."""
    __tablename__ = "receipt_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    receipt_id: int = Field(index=True)
    request_item_id: int = Field(index=True)
    inventory_item_id: Optional[int] = None

    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")

    quantity_requested: float = 0.0
    quantity_delivered: float = 0.0
    quantity_signed_off: Optional[float] = None
    discrepancy_note: Optional[str] = None
    condition: Optional[str] = None  # good | damaged | partial
