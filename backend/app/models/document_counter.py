from sqlmodel import Field, SQLModel


class DocumentCounter(SQLModel, table=True):
    """Transactionally allocated sequence per document prefix."""

    __tablename__ = "document_counter"

    key: str = Field(primary_key=True, max_length=40)
    next_value: int = Field(default=1)
