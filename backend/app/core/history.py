"""Shared history writer for audit trail entries.

Usage:
    from app.core.history import write_history
    write_history(session, InventoryHistory, entity_id=item.id, user_id=user.id,
                  username=user.username, change_type="adjust", ...)
"""
from typing import Any

from sqlmodel import Session


def write_history(
    session: Session,
    model_cls: type,
    *,
    entity_id: int | None = None,
    user_id: int | None = None,
    username: str | None = None,
    change_type: str | None = None,
    **fields: Any,
) -> Any:
    """Create and add a history row.

    Args:
        session: SQLModel session
        model_cls: the *History model class (e.g. InventoryHistory)
        entity_id: FK to the parent entity
        user_id: ID of the user making the change
        username: username of the user (for denormalized history rows)
        change_type: type of change (e.g. "create", "update", "adjust", "delete")
        **fields: additional column values for the history row

    Returns:
        The created history instance (not yet committed — caller commits)
    """
    data: dict[str, Any] = {}
    if entity_id is not None:
        data["entity_id"] = entity_id
    if user_id is not None:
        data["user_id"] = user_id
    if username is not None:
        data["username"] = username
    if change_type is not None:
        data["change_type"] = change_type
    data.update(fields)

    entry = model_cls(**data)
    session.add(entry)
    return entry
