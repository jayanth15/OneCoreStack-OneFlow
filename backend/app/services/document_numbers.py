"""Concurrency-safe business document numbering."""
from datetime import datetime, timezone
from app.core.timezone import now

from sqlmodel import Session, select

from app.models.document_counter import DocumentCounter


def allocate_document_number(
    session: Session,
    *,
    key: str,
    prefix: str,
    existing_model,
    number_field: str,
    include_year: bool = False,
    width: int = 4,
) -> str:
    """Allocate the next number inside the caller's database transaction."""
    effective_prefix = (
        f"{prefix}-{now().year}"
        if include_year
        else prefix
    )
    counter_key = f"{key}:{effective_prefix}"
    counter = session.exec(
        select(DocumentCounter)
        .where(DocumentCounter.key == counter_key)
        .with_for_update()
    ).one_or_none()

    if counter is None:
        values = session.exec(select(getattr(existing_model, number_field))).all()
        maximum = 0
        expected = f"{effective_prefix}-"
        for value in values:
            if not value or not str(value).startswith(expected):
                continue
            try:
                maximum = max(maximum, int(str(value).rsplit("-", 1)[1]))
            except (ValueError, IndexError):
                continue
        value = maximum + 1
        counter = DocumentCounter(key=counter_key, next_value=value + 1)
    else:
        value = counter.next_value
        counter.next_value += 1

    session.add(counter)
    session.flush()
    return f"{effective_prefix}-{value:0{width}d}"
