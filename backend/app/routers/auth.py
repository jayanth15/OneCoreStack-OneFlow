from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.config import settings
from app.core.database import get_session
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.dependencies.auth import get_current_active_user
from app.models.department import Department
from app.models.token import RefreshToken
from app.models.user import User
from app.models.user_department import UserDepartment

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

COOKIE_NAME = "oneflow_refresh"
COOKIE_MAX_AGE = 60 * 60 * 24 * settings.refresh_token_expire_days


# ── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMeResponse(BaseModel):
    id: int
    username: str
    role: str
    inventory_access: list[str] = []
    inventory_edit: list[str] = []
    request_departments: list[int] = []
    request_inventory: list[str] = []
    grn_access: bool = False
    dispatch_access: bool = False
    gate_pass_access: bool = False
    purchase_access: bool = False
    photo_base64: Optional[str] = None
    department_codes: list[str] = []
    department_names: list[str] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure or settings.environment != "development",
        samesite="strict",
        max_age=COOKIE_MAX_AGE,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/api/v1/auth")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> TokenResponse:
    client_host = request.client.host if request.client else "unknown"
    enforce_rate_limit("login", client_host, settings.login_rate_limit)
    user = session.exec(select(User).where(User.username == body.username)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # Store hashed refresh token in DB
    db_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(db_token)
    session.commit()

    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    oneflow_refresh: str | None = Cookie(default=None),
) -> TokenResponse:
    client_host = request.client.host if request.client else "unknown"
    enforce_rate_limit("refresh", client_host, settings.refresh_rate_limit)
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please log in again")

    if not oneflow_refresh:
        raise exc

    try:
        payload = decode_token(oneflow_refresh)
    except jwt.PyJWTError:
        raise exc

    if payload.get("type") != "refresh":
        raise exc

    user_id = int(payload["sub"])
    token_hash = hash_token(oneflow_refresh)

    db_token = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
        )
    ).first()

    if not db_token or db_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(tz=timezone.utc):
        raise exc

    # Rotate: revoke old token, issue new one
    db_token.revoked = True
    session.add(db_token)

    new_refresh = create_refresh_token(user_id)
    new_db_token = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(new_refresh),
        expires_at=datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(new_db_token)
    session.commit()

    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(access_token=create_access_token(user_id))


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    oneflow_refresh: str | None = Cookie(default=None),
) -> None:
    if oneflow_refresh:
        token_hash = hash_token(oneflow_refresh)
        db_token = session.exec(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        ).first()
        if db_token:
            db_token.revoked = True
            session.add(db_token)
            session.commit()
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserMeResponse)
def me(
    user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UserMeResponse:
    def _parse_csv(val: str | None) -> list[str]:
        return [t.strip() for t in (val or "").split(",") if t.strip()]

    def _parse_int_csv(val: str | None) -> list[int]:
        result = []
        for t in (val or "").split(","):
            t = t.strip()
            if t:
                try:
                    result.append(int(t))
                except ValueError:
                    pass
        return result

    links = session.exec(
        select(UserDepartment).where(UserDepartment.user_id == user.id)
    ).all()
    dept_ids = [lnk.department_id for lnk in links]
    dept_codes: list[str] = []
    dept_names: list[str] = []
    if dept_ids:
        depts = session.exec(
            select(Department).where(Department.id.in_(dept_ids))  # type: ignore[attr-defined]
        ).all()
        dept_codes = [d.code for d in depts]
        dept_names = [d.name for d in depts]

    return UserMeResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        inventory_access=_parse_csv(user.inventory_access),
        inventory_edit=_parse_csv(user.inventory_edit),
        request_departments=_parse_int_csv(user.request_departments),
        request_inventory=_parse_csv(user.request_inventory),
        grn_access=user.grn_access or user.role in ("admin", "super_admin"),
        dispatch_access=user.dispatch_access or user.role in ("admin", "super_admin"),
        gate_pass_access=user.gate_pass_access or user.role in ("admin", "super_admin"),
        purchase_access=user.purchase_access or user.role in ("admin", "super_admin"),
        photo_base64=user.photo_base64,
        department_codes=dept_codes,
        department_names=dept_names,
    )
