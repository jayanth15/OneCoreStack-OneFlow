from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class MarketingRequestHistory(SQLModel, table=True):
    """Audit trail for marketing request changes."""
    __tablename__ = "marketing_request_history"

    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: int = Field(foreign_key="marketing_request.id", index=True)
    changed_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    changed_by_username: Optional[str] = Field(default=None)
    changed_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc), index=True
    )
    change_type: str          # created | edited | approved | rejected | cancelled
    field_name: Optional[str] = Field(default=None)
    old_value: Optional[str] = Field(default=None)
    new_value: Optional[str] = Field(default=None)
    note: Optional[str] = Field(default=None)
