from typing import Optional

from sqlmodel import Field, SQLModel


class ProductionProcess(SQLModel, table=True):
    """A single process step within a Production Plan.

    Examples: "Blanking", "Numbering", "Bending", "Welding", "Painting", etc.
    Steps are ordered by `sequence` (lowest first).
    """
    __tablename__ = "production_process"

    id: Optional[int] = Field(default=None, primary_key=True)
    plan_id: int = Field(foreign_key="production_plan.id", index=True)
    name: str                                    # e.g. "Blanking"
    sequence: int = Field(default=0)            # ordering; 0-based or 1-based
    notes: Optional[str] = None

    # ── Time estimate ──────────────────────────────────────────────────────────
    estimated_time_minutes: Optional[float] = None  # time per unit in minutes (fractional OK)

    # ── Material usage / waste ─────────────────────────────────────────────────
    material_qty: Optional[float] = None    # material consumed per unit in this step
    waste_qty: Optional[float] = None       # waste generated per unit in this step
    material_unit: Optional[str] = None     # unit label, e.g. "kg", "pcs", "m"
