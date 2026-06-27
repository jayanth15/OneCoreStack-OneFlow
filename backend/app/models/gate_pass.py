from typing import Optional

from sqlmodel import Field, SQLModel


class GatePass(SQLModel, table=True):
    __tablename__ = "gate_pass"

    id: Optional[int] = Field(default=None, primary_key=True)
    gate_pass_number: str = Field(unique=True, index=True)  # e.g. GP-0001

    pass_type: str = Field(default="out")                   # in | out

    # Party (vendor or supplier)
    vendor_id: Optional[int] = Field(default=None)
    vendor_name: Optional[str] = None
    supplier_id: Optional[int] = Field(default=None)
    supplier_name: Optional[str] = None

    # Material
    material: str = ""
    quantity: float = Field(default=0.0)
    unit: Optional[str] = None

    purpose: Optional[str] = None
    vehicle_number: Optional[str] = None
    date: Optional[str] = None                              # ISO "YYYY-MM-DD"

    notes: Optional[str] = None
    status: str = Field(default="open")                     # open | closed
    created_by: Optional[str] = None
    created_at: Optional[str] = None

    # Linked purchase request (optional)
    purchase_request_id: Optional[int] = Field(default=None)
    purchase_request_number: Optional[str] = None           # denormalized

    # Linked purchase order (optional)
    purchase_order_id: Optional[int] = Field(default=None)
    purchase_order_number: Optional[str] = None             # denormalized
