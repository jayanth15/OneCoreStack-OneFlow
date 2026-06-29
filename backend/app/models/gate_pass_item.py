from typing import Optional

from sqlmodel import Field, SQLModel


class GatePassItem(SQLModel, table=True):
    __tablename__ = "gate_pass_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    gate_pass_id: int = Field(index=True)

    item_name: str = Field(default="")
    inv_type: Optional[str] = Field(default=None)   # finished_good | weeder | attachment | spare | consumable
    inv_item_id: Optional[int] = Field(default=None)

    quantity: float = Field(default=0.0)
    unit_id: Optional[int] = Field(default=None, foreign_key="unit.id")
