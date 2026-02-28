from typing import Optional
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


class Schedule(SQLModel, table=True):
    __tablename__ = "schedule"

    id: Optional[int] = Field(default=None, primary_key=True)
    schedule_number: str = Field(unique=True, index=True)  # e.g. SCH-0001

    customer_name: str
    description: str                           # product / work description
    scheduled_date: str                        # delivery date — ISO "YYYY-MM-DD"
    scheduled_qty: float = Field(default=0.0)  # quantity ordered by customer
    backlog_qty: float = Field(default=0.0)    # carry-over from previous month
    notes: Optional[str] = None

    status: str = Field(default="pending")     # pending | confirmed | in_production | delivered | cancelled
    is_active: bool = Field(default=True)
    created_at: Optional[datetime] = Field(default=None)
