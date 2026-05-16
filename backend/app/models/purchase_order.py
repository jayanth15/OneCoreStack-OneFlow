from typing import Optional

from sqlmodel import Field, SQLModel


class PurchaseOrder(SQLModel, table=True):
    __tablename__ = "purchase_order"

    id: Optional[int] = Field(default=None, primary_key=True)
    po_number: str = Field(unique=True, index=True)         # e.g. PO-0001

    # Supplier
    supplier_id: Optional[int] = Field(default=None)
    supplier_name: Optional[str] = None                     # denormalized

    # Vendor (OEM client) — alternative to supplier
    vendor_id: Optional[int] = Field(default=None)
    vendor_name: Optional[str] = None                       # denormalized

    # Party type to distinguish vendor vs supplier
    party_type: str = Field(default="supplier")             # supplier | vendor

    po_date: Optional[str] = None                           # ISO "YYYY-MM-DD"
    expected_delivery: Optional[str] = None                 # ISO "YYYY-MM-DD"

    notes: Optional[str] = None
    status: str = Field(default="draft")                    # draft | approved | received | cancelled
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class PurchaseOrderItem(SQLModel, table=True):
    __tablename__ = "purchase_order_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    purchase_order_id: int = Field(foreign_key="purchase_order.id", index=True)
    item_name: str = ""
    quantity: float = Field(default=0.0)
    unit: Optional[str] = None
    rate: Optional[float] = None                            # per unit price
    notes: Optional[str] = None
