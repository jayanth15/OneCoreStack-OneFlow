from typing import Optional

from sqlmodel import Field, SQLModel


class Customer(SQLModel, table=True):
    """
    Registered customers / OEM clients.
    Schedules reference customers by name; this table is the canonical
    source of truth so new schedules must pick from existing customers.
    """

    __tablename__ = "customers"  # type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    contact_person: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
