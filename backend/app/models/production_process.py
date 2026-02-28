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
