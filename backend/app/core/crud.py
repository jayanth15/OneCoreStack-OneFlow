"""Shared CRUD utilities for soft-delete and history writing."""
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session


def soft_delete(
    session: Session,
    obj: Any,
) -> None:
    """Soft-delete an entity by setting is_active=False and committing.

    Args:
        session: SQLModel session
        obj: entity with an is_active boolean field
    """
    obj.is_active = False
    session.add(obj)
    session.commit()
    session.refresh(obj)


def utcnow() -> datetime:
    """Return current UTC time (replaces deprecated datetime.utcnow())."""
    return datetime.now(tz=timezone.utc)
