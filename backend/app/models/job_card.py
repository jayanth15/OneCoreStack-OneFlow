from typing import Optional

from sqlmodel import Field, SQLModel


class JobCard(SQLModel, table=True):
    __tablename__ = "job_card"

    id: Optional[int] = Field(default=None, primary_key=True)
    card_number: str = Field(unique=True, index=True)  # e.g. JC-0001

    title: str
    production_plan_id: Optional[int] = Field(
        default=None, foreign_key="production_plan.id"
    )

    start_date: Optional[str] = None   # ISO date "YYYY-MM-DD"
    end_date: Optional[str] = None

    assigned_to: Optional[str] = None  # worker / team name
    notes: Optional[str] = None
    status: str = Field(default="open")  # open | in_progress | completed | cancelled
    is_active: bool = Field(default=True)
