"""Helpers used by both the new /requests router and the legacy shims."""
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.department import Department
from app.models.user import User
from app.routers.notifications import create_notification
from app.models.request import Request, REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE, REQUEST_TYPE_CUSTOMER_DISPATCH
from app.models.request_history import RequestHistory
from app.models.user_department import UserDepartment


def _prefix_for(request_type: str) -> str:
    if request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        return "MKT"
    return "REQ"


def get_user_departments(session: Session, user_id: int) -> list[Department]:
    """Return the Department rows the given user belongs to (via the
    user_departments M2M junction that is populated at user creation/edit)."""
    links = session.exec(
        select(UserDepartment).where(UserDepartment.user_id == user_id)
    ).all()
    dept_ids = [lnk.department_id for lnk in links]
    if not dept_ids:
        return []
    return list(session.exec(
        select(Department).where(Department.id.in_(dept_ids))  # type: ignore[arg-defined]
    ).all())


def build_department_label_map(session: Session) -> dict[str, str]:
    """Return {code: "CODE — Name"} for all active departments. Used to attach
    a human-readable `department_label` to request payloads while storing only
    the stable code on the row."""
    depts = session.exec(
        select(Department).where(Department.is_active == True)  # noqa: E712
    ).all()
    return {d.code: f"{d.code} — {d.name}" for d in depts}


def label_for_code(code: Optional[str], label_map: dict[str, str]) -> Optional[str]:
    """Resolve a department code to its display label, falling back to the
    raw value if the department no longer exists (e.g. was deleted)."""
    if not code:
        return None
    return label_map.get(code, code)


def generate_sn(session: Session, request_type: str) -> str:
    """Generate the next serial number, e.g. REQ-2026-0001 / MKT-2026-0001.

    Strategy: SELECT MAX(sequence) for current year.
    """
    prefix = _prefix_for(request_type)
    year = datetime.utcnow().year
    sn_prefix = f"{prefix}-{year}-"
    rows = session.exec(
        select(Request.sn_no).where(Request.sn_no.like(f"{sn_prefix}%"))
    ).all()
    max_seq = 0
    for sn in rows:
        try:
            seq = int(sn.split("-")[-1])
            if seq > max_seq:
                max_seq = seq
        except (ValueError, IndexError):
            continue
    return f"{sn_prefix}{max_seq + 1:04d}"


def log_history(
    session: Session,
    request_id: int,
    *,
    changed_by_user_id: Optional[int],
    changed_by_username: Optional[str],
    change_type: str,
    field_name: Optional[str] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    note: Optional[str] = None,
) -> RequestHistory:
    h = RequestHistory(
        request_id=request_id,
        changed_by_user_id=changed_by_user_id,
        changed_by_username=changed_by_username,
        change_type=change_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        note=note,
    )
    session.add(h)
    return h


def notify_department_users(
    session: Session,
    department_code: str,
    notif_type: str,
    title: str,
    body: str,
    request_id: int,
) -> None:
    """Create a notification for every active user belonging to the department
    whose code matches `department_code`.

    Resolves department.code -> department.id, then user_departments.user_id,
    then creates one Notification per active user. Silently no-ops if the
    department code is unknown or has no members.
    """
    dept = session.exec(
        select(Department).where(Department.code == department_code)
    ).one_or_none()
    if not dept:
        return
    links = session.exec(
        select(UserDepartment).where(UserDepartment.department_id == dept.id)
    ).all()
    if not links:
        return
    user_ids = [lnk.user_id for lnk in links]
    users = session.exec(select(User).where(User.id.in_(user_ids), User.is_active == True)).all()  # noqa: E712
    for u in users:
        create_notification(
            session,
            user_id=u.id,  # type: ignore[arg-type]
            notif_type=notif_type,
            title=title,
            body=body,
            request_id=request_id,
        )
