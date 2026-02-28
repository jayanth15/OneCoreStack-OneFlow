from typing import Optional

from sqlmodel import Field, SQLModel


class ProductionOrder(SQLModel, table=True):
    """A production run linked to a Production Plan.

    Production Orders group Job Cards so each process step
    from the plan can be tracked in parallel by different workers.
    """

    __tablename__ = "production_order"

    id: Optional[int] = Field(default=None, primary_key=True)
    order_number: str = Field(unique=True, index=True)  # e.g. PO-0001

    production_plan_id: int = Field(foreign_key="production_plan.id", index=True)

    start_date: Optional[str] = None   # ISO date "YYYY-MM-DD"
    end_date: Optional[str] = None

    notes: Optional[str] = None
    status: str = Field(default="open")  # open | in_progress | completed | cancelled
    is_active: bool = Field(default=True)

    # Process-aware FG tracking:
    # effective_qty = MIN(qty_produced) across all active job cards (FG through ALL processes)
    # fg_credited   = how much FG has been added to inventory so far for this order
    effective_qty: float = Field(default=0.0)
    fg_credited: float = Field(default=0.0)
