"""Shared permission helpers for inventory-type edit access.

Mirrors the frontend ``canEditInventory`` semantics:
- admin / super_admin: unrestricted.
- everyone else: must have the type listed in the user's
  ``inventory_edit`` CSV column (empty = no edit access).
"""
from fastapi import HTTPException, status

from app.models.user import User


def user_edit_types(user: User) -> set[str] | None:
    """Return the inventory types the user may edit, or None for admins."""
    if user.role in ("admin", "super_admin"):
        return None
    raw = (user.inventory_edit or "").strip()
    if not raw:
        return set()
    return {t.strip() for t in raw.split(",") if t.strip()}


def require_inventory_edit(user: User, item_type: str) -> None:
    allowed = user_edit_types(user)
    if allowed is not None and item_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have edit access to inventory type '{item_type}'",
        )
