"""Helpers used by both the new /requests router and the legacy shims."""
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.request import Request, REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE, REQUEST_TYPE_CUSTOMER_DISPATCH
from app.models.request_history import RequestHistory


def _prefix_for(request_type: str) -> str:
    if request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
        return "MKT"
    return "REQ"


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
