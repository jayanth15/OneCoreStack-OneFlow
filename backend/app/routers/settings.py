"""
Settings router — company info + database backup.
All endpoints require admin or super_admin.
"""
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.config import settings as app_settings
from app.core.database import get_session
from app.dependencies.auth import require_admin
from app.models.company_settings import CompanySettings

router = APIRouter(
    prefix="/api/v1/settings",
    tags=["settings"],
    dependencies=[Depends(require_admin)],
)

# ── Known company info keys (used to seed defaults) ──────────────────────────

COMPANY_KEYS = [
    "company_name",
    "company_address",
    "company_phone",
    "company_email",
    "company_gstin",
    "company_website",
    "company_logo_url",
    "company_city",
    "company_state",
    "company_country",
    "company_pincode",
]


# ── Schemas ───────────────────────────────────────────────────────────────────

class CompanyInfoResponse(BaseModel):
    company_name: str = ""
    company_address: str = ""
    company_phone: str = ""
    company_email: str = ""
    company_gstin: str = ""
    company_website: str = ""
    company_logo_url: str = ""
    company_city: str = ""
    company_state: str = ""
    company_country: str = ""
    company_pincode: str = ""


class CompanyInfoUpdate(BaseModel):
    company_name: str = ""
    company_address: str = ""
    company_phone: str = ""
    company_email: str = ""
    company_gstin: str = ""
    company_website: str = ""
    company_logo_url: str = ""
    company_city: str = ""
    company_state: str = ""
    company_country: str = ""
    company_pincode: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_setting(session: Session, key: str) -> str:
    row = session.exec(select(CompanySettings).where(CompanySettings.key == key)).first()
    return row.value if row else ""


def _set_setting(session: Session, key: str, value: str) -> None:
    row = session.exec(select(CompanySettings).where(CompanySettings.key == key)).first()
    if row:
        row.value = value
        session.add(row)
    else:
        session.add(CompanySettings(key=key, value=value))


def _db_file_path() -> str | None:
    """Return the absolute path to the SQLite database file, or None for non-SQLite."""
    url = app_settings.database_url
    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///"):]
        if os.path.isabs(raw):
            return raw
        # relative path — resolve against location of config.py's package root
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return os.path.join(backend_dir, raw)
    return None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/company", response_model=CompanyInfoResponse)
def get_company_info(
    session: Annotated[Session, Depends(get_session)],
) -> CompanyInfoResponse:
    return CompanyInfoResponse(**{k: _get_setting(session, k) for k in COMPANY_KEYS})


@router.put("/company", response_model=CompanyInfoResponse)
def update_company_info(
    body: CompanyInfoUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> CompanyInfoResponse:
    for key in COMPANY_KEYS:
        _set_setting(session, key, getattr(body, key, ""))
    session.commit()
    return CompanyInfoResponse(**{k: _get_setting(session, k) for k in COMPANY_KEYS})


@router.post("/backup")
def create_backup(background: BackgroundTasks) -> FileResponse:
    """
    Create a safe hot-backup of the SQLite database and return it as a download.
    Uses the sqlite3 backup API (safe while the DB is live, works on Linux & Windows).
    Returns 400 if the app is not using SQLite.
    """
    db_path = _db_file_path()
    if not db_path:
        raise HTTPException(
            status_code=400,
            detail="Database backup is only supported for SQLite databases.",
        )
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database file not found.")

    # Build timestamped backup filename
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"oneflow_backup_{ts}.db"

    # Write to a system temp file so we can stream it back
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".db", prefix="oneflow_bak_")
    os.close(tmp_fd)

    try:
        # sqlite3 backup API — safe hot backup (works on all platforms)
        src_conn = sqlite3.connect(db_path)
        dst_conn = sqlite3.connect(tmp_path)
        with dst_conn:
            src_conn.backup(dst_conn)
        src_conn.close()
        dst_conn.close()
    except Exception as exc:
        os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc

    # Schedule temp file deletion after response is sent
    background.add_task(os.unlink, tmp_path)

    return FileResponse(
        path=tmp_path,
        filename=filename,
        media_type="application/octet-stream",
    )
