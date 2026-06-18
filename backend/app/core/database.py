import logging
import os
import sqlite3
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)

# SQLite needs check_same_thread=False; PostgreSQL does not need it
connect_args = {}
if "sqlite" in settings.database_url:
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=connect_args, echo=settings.debug)


def init_db() -> None:
    """Create all tables. Called on startup."""
    # Models must be imported before this call so SQLModel knows about them.
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # Ensure the SQLite db file is group-writable so Docker containers running
    # as a different UID (e.g. appuser) can write to the mounted volume.
    if "sqlite" in settings.database_url:
        db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
        try:
            os.chmod(db_path, 0o664)
        except OSError:
            pass  # best-effort — may fail if running as a different owner


def _col_exists(cursor: "sqlite3.Cursor", table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return column in {row[1] for row in cursor.fetchall()}


def _table_exists(cursor: "sqlite3.Cursor", table: str) -> bool:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None


def _safe_alter(cursor: "sqlite3.Cursor", conn: "sqlite3.Connection", table: str, column: str, col_type: str) -> None:
    """Add a column only if it doesn't already exist."""
    if not _col_exists(cursor, table, column):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        conn.commit()
        logger.info("Migration: added column %s.%s", table, column)


def run_migrations() -> None:
    """Apply all ALTER TABLE migrations for new columns (SQLite-safe, idempotent).

    Each block is wrapped independently — a failure in one step never blocks
    subsequent steps.  All errors are logged so production failures are visible.
    """
    if "sqlite" not in settings.database_url:
        return  # SQLite only; use Alembic for PostgreSQL

    import sqlite3
    db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    logger.info("run_migrations: starting against %s", db_path)

    # ── spare_item_variant ────────────────────────────────────────────────────
    try:
        _safe_alter(cursor, conn, "spare_item_variant", "reorder_level", "REAL DEFAULT 0.0 NOT NULL")
    except Exception as exc:
        logger.warning("Migration spare_item_variant.reorder_level failed: %s", exc)

    # ── spare_item_history ────────────────────────────────────────────────────
    try:
        _safe_alter(cursor, conn, "spare_item_history", "variant_label", "TEXT")
    except Exception as exc:
        logger.warning("Migration spare_item_history.variant_label failed: %s", exc)

    # ── users ─────────────────────────────────────────────────────────────────
    for col_name, col_def in [
        ("inventory_edit",       "TEXT DEFAULT '' NOT NULL"),
        ("request_departments",  "TEXT DEFAULT '' NOT NULL"),
        ("request_inventory",    "TEXT DEFAULT '' NOT NULL"),
        ("photo_base64",         "TEXT"),
        ("can_create_receipt",   "INTEGER NOT NULL DEFAULT 0"),
        ("grn_access",           "INTEGER NOT NULL DEFAULT 0"),
        ("department",           "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "users", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration users.%s failed: %s", col_name, exc)

    # ── weeder_item ───────────────────────────────────────────────────────────
    for col_name, col_def in [
        ("category_id", "INTEGER REFERENCES weeder_category(id)"),
        ("name",        "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "weeder_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration weeder_item.%s failed: %s", col_name, exc)

    # ── timeline_days on multiple tables ─────────────────────────────────────
    for table in ("inventory_item", "consumable", "attachment_item", "weeder_item", "spare_item_variant"):
        try:
            _safe_alter(cursor, conn, table, "timeline_days", "INTEGER")
        except Exception as exc:
            logger.warning("Migration %s.timeline_days failed: %s", table, exc)

    # ── receipt table ─────────────────────────────────────────────────────────
    try:
        if not _table_exists(cursor, "receipt"):
            cursor.execute(
                """
                CREATE TABLE receipt (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sn_no TEXT NOT NULL,
                    request_id INTEGER NOT NULL,
                    item_name TEXT,
                    item_code TEXT,
                    quantity_requested REAL NOT NULL DEFAULT 0.0,
                    quantity_received REAL NOT NULL DEFAULT 0.0,
                    notes TEXT,
                    created_by_user_id INTEGER REFERENCES users(id),
                    created_by_username TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_ack',
                    acknowledged_by_user_id INTEGER REFERENCES users(id),
                    acknowledged_by_username TEXT,
                    acknowledged_at TEXT,
                    acknowledgment_note TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()
            logger.info("Migration: created table receipt")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_sn_no ON receipt(sn_no)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_request_id ON receipt(request_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_status ON receipt(status)")
        conn.commit()
    except Exception as exc:
        logger.warning("Migration receipt table failed: %s", exc)

    # ── receipt.department ────────────────────────────────────────────────────
    try:
        _safe_alter(cursor, conn, "receipt", "department", "TEXT")
    except Exception as exc:
        logger.warning("Migration receipt.department failed: %s", exc)

    # ── purchase_request_item columns ─────────────────────────────────────────
    for col_name, col_def in [
        ("department",           "TEXT"),
        ("item_status",          "TEXT"),
        ("accepted_by_username", "TEXT"),
        ("accepted_at",          "TEXT"),
        ("acceptance_note",      "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "purchase_request_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration purchase_request_item.%s failed: %s", col_name, exc)

    # ── purchase_request fulfilment columns ───────────────────────────────────
    for col_name, col_def in [
        ("fulfilled_by_user_id",    "INTEGER"),
        ("fulfilled_by_username",   "TEXT"),
        ("fulfillment_accepted_at", "TEXT"),
        ("fulfillment_note",        "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "purchase_request", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration purchase_request.%s failed: %s", col_name, exc)

    # ── notification table ────────────────────────────────────────────────────
    try:
        if not _table_exists(cursor, "notification"):
            cursor.execute(
                """
                CREATE TABLE notification (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT,
                    request_id INTEGER,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    read_at TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()
            logger.info("Migration: created table notification")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_notification_user_id ON notification(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_notification_is_read ON notification(is_read)")
        conn.commit()
    except Exception as exc:
        logger.warning("Migration notification table failed: %s", exc)

    # ── bom_item new columns ──────────────────────────────────────────────────
    for col_name, col_def in [
        ("material_used", "REAL"),
        ("scrap",         "REAL"),
        ("material_unit", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "bom_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration bom_item.%s failed: %s", col_name, exc)

    conn.close()
    logger.info("run_migrations: complete")


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
