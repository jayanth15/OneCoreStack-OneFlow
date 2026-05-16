from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Supplier(SQLModel, table=True):
    """
    Suppliers: companies that provide parts/materials AND may perform job work.
    """

    __tablename__ = "suppliers"  # type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    contact_person: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)
    address: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: Optional[str] = Field(default=None)
