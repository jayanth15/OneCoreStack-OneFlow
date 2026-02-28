from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import decode_token
from app.models.user import User

_bearer = HTTPBearer()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    token = credentials.credentials
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        raise exc

    if payload.get("type") != "access":
        raise exc

    user_id: int | None = int(payload["sub"]) if payload.get("sub") else None
    if user_id is None:
        raise exc

    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise exc

    return user


def get_current_active_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


def require_admin(
    user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require admin or super_admin role."""
    if user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_super_admin(
    user: Annotated[User, Depends(get_current_active_user)],
) -> User:
    """Require super_admin role only."""
    if user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required")
    return user


def is_admin_or_above(user: User) -> bool:
    return user.role in ("admin", "super_admin")
