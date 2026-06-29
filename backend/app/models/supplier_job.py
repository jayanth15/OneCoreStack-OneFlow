from typing import Optional

from sqlmodel import Field, SQLModel


class SupplierJob(SQLModel, table=True):
    """
    Job / process a supplier performs for us (e.g. laser cutting, powder coating).
    """

    __tablename__ = "supplier_jobs"  # type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    supplier_id: int = Field(index=True)
    job_name: str
    description: Optional[str] = Field(default=None)
    rate: Optional[float] = Field(default=None)
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
    notes: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: Optional[str] = Field(default=None)
