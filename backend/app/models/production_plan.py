from typing import Optional

from sqlmodel import Field, SQLModel


class ProductionPlan(SQLModel, table=True):
    __tablename__ = "production_plan"

    id: Optional[int] = Field(default=None, primary_key=True)
    plan_number: str = Field(unique=True, index=True)  # e.g. PP-0001

    title: str

    # ── Linked schedule (customer order) ──────────────────────────────────────
    schedule_id: Optional[int] = Field(default=None, foreign_key="schedule.id")

    # ── Quantities ─────────────────────────────────────────────────────────────
    planned_qty: float = Field(default=0.0)     # units planned to produce this run

    # ── Production window ──────────────────────────────────────────────────────
    start_date: Optional[str] = None            # ISO date "YYYY-MM-DD"
    end_date: Optional[str] = None              # ISO date "YYYY-MM-DD"

    notes: Optional[str] = None
    status: str = Field(default="draft")        # draft | approved | in_progress | completed
    is_active: bool = Field(default=True)
