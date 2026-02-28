from typing import Optional

from sqlmodel import Field, SQLModel


class BomItem(SQLModel, table=True):
    """Bill of Materials — maps a product name to required raw materials.

    product_name matches Schedule.description and the InventoryItem.name of the
    corresponding finished_good.  qty_per_unit is the amount of the raw material
    needed to produce one unit of the finished good.
    """
    __tablename__ = "bom_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    product_name: str = Field(index=True)          # matches Schedule.description / FG item name
    raw_material_id: int = Field(foreign_key="inventory_item.id")
    qty_per_unit: float = Field(default=1.0)       # RM qty needed per 1 finished unit
    notes: Optional[str] = None
    is_active: bool = Field(default=True)
