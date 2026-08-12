"""Notifications router."""
from datetime import datetime, timezone
from app.core.timezone import now
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.notification import Notification
from app.models.request import Request
from app.models.user import User

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])

# ── Schemas ───────────────────────────────────────────────────────────────────


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str]
    request_id: Optional[int]
    is_read: bool
    read_at: Optional[str]
    created_at: str


class UnreadCount(BaseModel):
    count: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,  # type: ignore[arg-type]
        type=n.type,
        title=n.title,
        body=n.body,
        request_id=n.request_id,
        is_read=n.is_read,
        read_at=n.read_at.isoformat() if n.read_at else None,
        created_at=n.created_at.isoformat(),
    )


def create_notification(
    session: Session,
    user_id: int,
    notif_type: str,
    title: str,
    body: Optional[str] = None,
    request_id: Optional[int] = None,
) -> None:
    """Create a notification for a user. Called from other routers."""
    session.add(
        Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            body=body,
            request_id=request_id,
        )
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    limit: int = 50,
    offset: int = 0,
) -> list[NotificationOut]:
    """Return unread notifications whose linked request still exists."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = (
        select(Notification)
        .join(Request, Notification.request_id == Request.id, isouter=True)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
            or_(Notification.request_id == None, Request.is_active == True),  # noqa: E711,E712
        )
        .order_by(Notification.created_at.desc())  # type: ignore[union-attr]
        .offset(offset)
        .limit(limit)
    )
    notifications = session.exec(stmt).all()
    return [_out(n) for n in notifications]


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UnreadCount:
    from sqlmodel import func
    count = session.exec(
        select(func.count())
        .select_from(Notification)
        .join(Request, Notification.request_id == Request.id, isouter=True)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
            or_(Notification.request_id == None, Request.is_active == True),  # noqa: E711,E712
        )
    ).one()
    return UnreadCount(count=count)


@router.post("/{notif_id}/read", response_model=NotificationOut)
def mark_read(
    notif_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> NotificationOut:
    n = session.get(Notification, notif_id)
    if not n or n.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not n.is_read:
        n.is_read = True
        n.read_at = now()
        session.add(n)
        session.commit()
        session.refresh(n)
    return _out(n)


@router.post("/read-all", response_model=UnreadCount)
def mark_all_read(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UnreadCount:
    now_ts = now()
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    ).all()
    for n in unread:
        n.is_read = True
        n.read_at = now_ts
        session.add(n)
    session.commit()
    return UnreadCount(count=0)
