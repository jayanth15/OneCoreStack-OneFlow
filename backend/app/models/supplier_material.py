from typing import Optional

from sqlmodel import Field, SQLModel


class SupplierMaterial(SQLModel, table=True):
    """
    Material / raw material a supplier provides to us.
    """

    __tablename__ = "supplier_materials"  # type: ignore

    id: Optional[int] = Field(default=None, primary_key=True)
    supplier_id: int = Field(index=True)
    material_name: str
    category: Optional[str] = Field(default=None)
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
    rate: Optional[float] = Field(default=None)    # price per unit
    notes: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: Optional[str] = Field(default=None)
