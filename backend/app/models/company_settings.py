from typing import Optional

from sqlmodel import Field, SQLModel


class CompanySettings(SQLModel, table=True):
    """Key-value store for company-wide settings."""
    __tablename__ = "company_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True, max_length=128)
    value: str = Field(default="")
