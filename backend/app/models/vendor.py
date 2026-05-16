from typing import Optional

from sqlmodel import Field, SQLModel


class Vendor(SQLModel, table=True):
    """
    Registered vendors / OEM clients.
    Schedules reference vendors by name; this table is the canonical
    source of truth so new schedules must pick from existing vendors.
    """

    __tablename__ = "vendors"  # type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    contact_person: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
