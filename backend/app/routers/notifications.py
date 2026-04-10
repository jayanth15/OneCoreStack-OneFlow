"""Notifications router."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user
from app.models.notification import Notification
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
) -> list[NotificationOut]:
    """Return last 50 notifications for the current user, unread first."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.is_read, Notification.created_at.desc())  # type: ignore[union-attr]
        .limit(10)
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
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
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
        n.read_at = datetime.now(tz=timezone.utc)
        session.add(n)
        session.commit()
        session.refresh(n)
    return _out(n)


@router.post("/read-all", response_model=UnreadCount)
def mark_all_read(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> UnreadCount:
    now = datetime.now(tz=timezone.utc)
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    ).all()
    for n in unread:
        n.is_read = True
        n.read_at = now
        session.add(n)
    session.commit()
    return UnreadCount(count=0)
