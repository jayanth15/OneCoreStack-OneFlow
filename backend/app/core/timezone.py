"""Application-wide timezone.

All business timestamps (created_at/updated_at columns, history rows,
document number prefixes, backups, schedulers) use India Standard Time
(UTC+05:30) as the application default.

Note: SQLAlchemy's SQLite dialect stores DATETIME values as naive
wall-clock strings, so ``now()`` values persist as IST wall-clock time.
"""
from datetime import datetime, timedelta, timezone

APP_TZ = timezone(timedelta(hours=5, minutes=30))


def now() -> datetime:
    """Current time in the application timezone (IST, UTC+05:30)."""
    return datetime.now(APP_TZ)


def as_app_tz(dt: datetime) -> datetime:
    """Attach the app timezone to a naive datetime (e.g. one read back from SQLite)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=APP_TZ)
    return dt
