"""
Database backup scheduler.

Schedule:
  - 17:30 (5:30 PM) every day: take a safe SQLite backup.
  - Same time: delete backups older than 90 days (3 months).

Backup folder layout:
  backend/app/db/backups/
    YYYY/
      MM/
        DD/
          oneflow.db   ← safe sqlite3.backup() copy

Implementation uses only stdlib — no extra dependencies.
Uses sqlite3.Connection.backup() which is WAL-safe and works
even while SQLite is in use by other connections.
"""

import logging
import shutil
import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _db_path() -> Path:
    """Resolve the absolute filesystem path of the SQLite database file."""
    url = settings.database_url
    # Strip SQLAlchemy URL prefixes
    path_str = url.replace("sqlite:///", "").replace("sqlite://", "")
    return Path(path_str).resolve()


def _backup_dir_for(dt: datetime) -> Path:
    """Return the target directory for a given date (creates nothing)."""
    base = _db_path().parent / "backups"
    return base / f"{dt.year:04d}" / f"{dt.month:02d}" / f"{dt.day:02d}"


# ── Core jobs ─────────────────────────────────────────────────────────────────


def perform_backup() -> Path:
    """
    Copy the live SQLite database to the dated backup directory using
    sqlite3.Connection.backup(), which is atomic and WAL-safe.

    Returns the path of the backup file created.
    """
    now = datetime.now()
    dest_dir = _backup_dir_for(now)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / "oneflow.db"

    src_path = str(_db_path())
    dst_path = str(dest_file)

    try:
        with sqlite3.connect(src_path) as src_conn:
            with sqlite3.connect(dst_path) as dst_conn:
                src_conn.backup(dst_conn, pages=256)  # stream in 256-page chunks
        logger.info("DB backup created: %s", dest_file)
    except Exception as exc:
        logger.error("DB backup failed: %s", exc)
        raise

    return dest_file


def cleanup_old_backups(retention_days: int = 90) -> None:
    """
    Delete day-level backup folders whose date is older than `retention_days`
    (default 90 days ≈ 3 months).  Empty month / year parent folders are pruned.
    """
    base = _db_path().parent / "backups"
    if not base.exists():
        return

    cutoff = datetime.now() - timedelta(days=retention_days)

    for year_dir in sorted(base.iterdir()):
        if not year_dir.is_dir():
            continue
        for month_dir in sorted(year_dir.iterdir()):
            if not month_dir.is_dir():
                continue
            for day_dir in sorted(month_dir.iterdir()):
                if not day_dir.is_dir():
                    continue
                try:
                    backup_date = datetime(
                        int(year_dir.name),
                        int(month_dir.name),
                        int(day_dir.name),
                    )
                except ValueError:
                    continue  # skip folders with unexpected names

                if backup_date < cutoff:
                    try:
                        shutil.rmtree(day_dir)
                        logger.info("Deleted old backup: %s", day_dir)
                    except OSError as exc:
                        logger.warning("Could not delete old backup %s: %s", day_dir, exc)

    # Prune empty month / year directories left behind
    for year_dir in sorted(base.iterdir()):
        if not year_dir.is_dir():
            continue
        for month_dir in sorted(year_dir.iterdir()):
            if month_dir.is_dir() and not any(month_dir.iterdir()):
                try:
                    month_dir.rmdir()
                except OSError:
                    pass
        if year_dir.is_dir() and not any(year_dir.iterdir()):
            try:
                year_dir.rmdir()
            except OSError:
                pass


# ── Scheduler ─────────────────────────────────────────────────────────────────


def _seconds_until_next_1730() -> float:
    """Return the number of seconds until the next 17:30:00 (today or tomorrow)."""
    now = datetime.now()
    target = now.replace(hour=17, minute=30, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return max((target - now).total_seconds(), 1)


def _run_daily_jobs() -> None:
    """Execute backup + cleanup, then re-arm the timer for the next day."""
    try:
        perform_backup()
    except Exception:
        pass  # already logged inside perform_backup
    try:
        cleanup_old_backups()
    except Exception as exc:
        logger.error("Backup cleanup failed: %s", exc)

    # Re-arm for tomorrow 17:30
    _arm_timer()


def _arm_timer() -> None:
    delay = _seconds_until_next_1730()
    t = threading.Timer(delay, _run_daily_jobs)
    t.daemon = True  # won't block process shutdown
    t.name = "oneflow-db-backup"
    t.start()
    next_run = datetime.now() + timedelta(seconds=delay)
    logger.info(
        "DB backup scheduled: next run at %s (in %.0f s)",
        next_run.strftime("%Y-%m-%d %H:%M:%S"),
        delay,
    )


def start_scheduler() -> None:
    """
    Start the daily backup scheduler.  Call once at app startup.
    The scheduler fires at 17:30 every day and auto-reschedules itself.
    """
    _arm_timer()
