"""Legacy inline database migrations from database.py run_migrations().

Kept for the one-time catch-up for pre-Alembic databases.
Delete after all deployments are stamped.
"""
import logging
import sqlite3

from app.core.config import settings

logger = logging.getLogger(__name__)


def _col_exists(cursor, table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    return column in {row[1] for row in cursor.fetchall()}


def _table_exists(cursor, table):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None


def _safe_alter(cursor, conn, table, column, col_type):
    if not _col_exists(cursor, table, column):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        conn.commit()
        logger.info("Migration: added column %s.%s", table, column)


def run_inline_migrations():
    """Apply all ALTER TABLE migrations for new columns (SQLite-safe, idempotent)."""
    if "sqlite" not in settings.database_url:
        return

    db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    logger.info("run_inline_migrations: starting against %s", db_path)

    try:
        _safe_alter(cursor, conn, "spare_item_variant", "reorder_level", "REAL DEFAULT 0.0 NOT NULL")
    except Exception as exc:
        logger.warning("Migration spare_item_variant.reorder_level failed: %s", exc)

    try:
        _safe_alter(cursor, conn, "spare_item_history", "variant_label", "TEXT")
    except Exception as exc:
        logger.warning("Migration spare_item_history.variant_label failed: %s", exc)

    for col_name, col_def in [
        ("inventory_edit", "TEXT DEFAULT '' NOT NULL"),
        ("request_departments", "TEXT DEFAULT '' NOT NULL"),
        ("request_inventory", "TEXT DEFAULT '' NOT NULL"),
        ("photo_base64", "TEXT"),
        ("grn_access", "INTEGER NOT NULL DEFAULT 0"),
        ("department", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "users", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration users.%s failed: %s", col_name, exc)

    for col_name, col_def in [
        ("category_id", "INTEGER REFERENCES weeder_category(id)"),
        ("name", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "weeder_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration weeder_item.%s failed: %s", col_name, exc)

    for table in ("inventory_item", "consumable", "attachment_item", "weeder_item", "spare_item_variant"):
        try:
            _safe_alter(cursor, conn, table, "timeline_days", "INTEGER")
        except Exception as exc:
            logger.warning("Migration %s.timeline_days failed: %s", table, exc)

    # --- weight_value / weight_unit columns ---
    cursor.execute("SELECT COUNT(*) AS cnt FROM pragma_table_info('inventory_item') WHERE name='weight_value'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("ALTER TABLE inventory_item ADD COLUMN weight_value REAL")
        cursor.execute("ALTER TABLE inventory_item ADD COLUMN weight_unit TEXT")
        conn.commit()

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

    try:
        _safe_alter(cursor, conn, "receipt", "department", "TEXT")
    except Exception as exc:
        logger.warning("Migration receipt.department failed: %s", exc)

    for col_name, col_def in [
        ("department", "TEXT"),
        ("item_status", "TEXT"),
        ("accepted_by_username", "TEXT"),
        ("accepted_at", "TEXT"),
        ("acceptance_note", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "purchase_request_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration purchase_request_item.%s failed: %s", col_name, exc)

    for col_name, col_def in [
        ("fulfilled_by_user_id", "INTEGER"),
        ("fulfilled_by_username", "TEXT"),
        ("fulfillment_accepted_at", "TEXT"),
        ("fulfillment_note", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "purchase_request", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration purchase_request.%s failed: %s", col_name, exc)

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

    for col_name, col_def in [
        ("material_used", "REAL"),
        ("scrap", "REAL"),
        ("material_unit", "TEXT"),
    ]:
        try:
            _safe_alter(cursor, conn, "bom_item", col_name, col_def)
        except Exception as exc:
            logger.warning("Migration bom_item.%s failed: %s", col_name, exc)

    conn.close()
    logger.info("run_inline_migrations: complete")
