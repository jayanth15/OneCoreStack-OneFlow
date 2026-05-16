from typing import Optional

from sqlmodel import Field, SQLModel


class Dispatch(SQLModel, table=True):
    __tablename__ = "dispatch"

    id: Optional[int] = Field(default=None, primary_key=True)
    dispatch_number: str = Field(unique=True, index=True)   # e.g. DSP-0001

    # Vendor (OEM client) receiving the dispatch
    vendor_id: Optional[int] = Field(default=None)
    vendor_name: Optional[str] = None                       # denormalized

    # Supplier (job work partner)
    supplier_id: Optional[int] = Field(default=None)
    supplier_name: Optional[str] = None                     # denormalized

    # Party type to distinguish vendor vs supplier dispatch
    party_type: str = Field(default="vendor")               # vendor | supplier

    # Optional schedule reference
    schedule_id: Optional[int] = Field(default=None)
    schedule_number: Optional[str] = None                   # denormalized

    # Product / goods
    product_name: str = ""
    quantity: float = Field(default=0.0)
    unit: Optional[str] = None                              # e.g. "pcs", "kg"

    # Logistics
    dispatch_date: Optional[str] = None                     # ISO "YYYY-MM-DD"
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None

    notes: Optional[str] = None
    status: str = Field(default="pending")                  # pending | dispatched | delivered | cancelled
    created_by: Optional[str] = None
    created_at: Optional[str] = None
