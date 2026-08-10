"""Unit reference normalization for legacy and current clients."""
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.unit import Unit


def resolve_unit_id(session: Session, unit_id: int | None, unit_name: str | None) -> int | None:
    if unit_id is not None:
        return unit_id
    name = (unit_name or "").strip()
    if not name:
        return None
    unit = session.exec(select(Unit).where(Unit.name == name)).one_or_none()
    if not unit:
        raise HTTPException(status_code=422, detail=f"Unknown unit '{name}'; select a configured unit")
    return unit.id
