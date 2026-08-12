from datetime import datetime, timezone
from app.core.timezone import now
from typing import Optional

from sqlalchemy import Column, LargeBinary
from sqlmodel import Field, SQLModel


class AttachmentDocument(SQLModel, table=True):
    """PDF/document attached to an Attachment inventory item."""
    __tablename__ = "attachment_document"

    id: Optional[int] = Field(default=None, primary_key=True)
    attachment_item_id: int = Field(foreign_key="attachment_item.id")
    filename: str
    content_type: str  # e.g. "application/pdf"
    size_bytes: int = Field(default=0)
    sha256: Optional[str] = Field(default=None)
    document_data: bytes = Field(sa_column=Column(LargeBinary, nullable=False))
    uploaded_by_user_id: Optional[int] = Field(default=None)
    uploaded_by_username: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=lambda: now())
    is_active: bool = Field(default=True)