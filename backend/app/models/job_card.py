from typing import Optional

from sqlmodel import Field, SQLModel


class JobCard(SQLModel, table=True):
    __tablename__ = "job_card"

    id: Optional[int] = Field(default=None, primary_key=True)
    card_number: str = Field(unique=True, index=True)  # e.g. JC-0001

    # ── Parent production order ────────────────────────────────────────────────
    production_order_id: int = Field(foreign_key="production_order.id", index=True)

    # ── Process info (from the production plan's process steps) ────────────────
    process_name: str = ""                     # e.g. "Blanking", "Welding"

    # ── Shop-floor tracking fields ─────────────────────────────────────────────
    tool_die_number: Optional[str] = None      # tool & die reference
    machine_name: Optional[str] = None         # machine used
    worker_name: Optional[str] = None          # operator / worker name
    hours_worked: float = Field(default=0.0)   # total hours worked
    qty_produced: float = Field(default=0.0)   # quantity produced in this job card
    qty_pending: float = Field(default=0.0)    # remaining quantity

    work_date: Optional[str] = None             # ISO date "YYYY-MM-DD" – the date hours were logged

    notes: Optional[str] = None
    status: str = Field(default="open")        # open | in_progress | completed | cancelled
    is_active: bool = Field(default=True)
