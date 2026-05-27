import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

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


def run_migrations() -> None:
    """Apply lightweight ALTER TABLE migrations for new columns (SQLite-safe)."""
    if "sqlite" not in settings.database_url:
        return  # Only needed for SQLite; use Alembic for PostgreSQL
    import sqlite3
    db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # spare_item_variant — reorder_level column
        cursor.execute("PRAGMA table_info(spare_item_variant)")
        cols = {row[1] for row in cursor.fetchall()}
        if "reorder_level" not in cols:
            cursor.execute("ALTER TABLE spare_item_variant ADD COLUMN reorder_level REAL DEFAULT 0.0 NOT NULL")

        # spare_item_history — variant_label column
        cursor.execute("PRAGMA table_info(spare_item_history)")
        cols = {row[1] for row in cursor.fetchall()}
        if "variant_label" not in cols:
            cursor.execute("ALTER TABLE spare_item_history ADD COLUMN variant_label TEXT")

        # users — new permission columns
        cursor.execute("PRAGMA table_info(users)")
        user_cols = {row[1] for row in cursor.fetchall()}
        for col_name in ("inventory_edit", "request_departments", "request_inventory"):
            if col_name not in user_cols:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} TEXT DEFAULT '' NOT NULL")
        if "photo_base64" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN photo_base64 TEXT")
        if "can_create_receipt" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN can_create_receipt INTEGER NOT NULL DEFAULT 0")
        if "grn_access" not in user_cols:
            cursor.execute("ALTER TABLE users ADD COLUMN grn_access INTEGER NOT NULL DEFAULT 0")

        # weeder_item — migrations
        cursor.execute("PRAGMA table_info(weeder_item)")
        weeder_cols = {row[1] for row in cursor.fetchall()}
        if "category_id" not in weeder_cols:
            cursor.execute("ALTER TABLE weeder_item ADD COLUMN category_id INTEGER REFERENCES weeder_category(id)")
        if "name" not in weeder_cols:
            cursor.execute("ALTER TABLE weeder_item ADD COLUMN name TEXT")

        # timeline_days — add to all inventory item tables
        for table in ("inventory_item", "consumable", "attachment_item", "weeder_item", "spare_item_variant"):
            cursor.execute(f"PRAGMA table_info({table})")
            tbl_cols = {row[1] for row in cursor.fetchall()}
            if "timeline_days" not in tbl_cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN timeline_days INTEGER")

        # receipt table — create if not present
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS receipt (
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
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_sn_no ON receipt(sn_no)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_request_id ON receipt(request_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_receipt_status ON receipt(status)")

        # purchase_request_item — department column
        cursor.execute("PRAGMA table_info(purchase_request_item)")
        pri_cols = {row[1] for row in cursor.fetchall()}
        if "department" not in pri_cols:
            cursor.execute("ALTER TABLE purchase_request_item ADD COLUMN department TEXT")
        # purchase_request_item — per-item acceptance tracking columns
        if "item_status" not in pri_cols:
            cursor.execute("ALTER TABLE purchase_request_item ADD COLUMN item_status TEXT")
        if "accepted_by_username" not in pri_cols:
            cursor.execute("ALTER TABLE purchase_request_item ADD COLUMN accepted_by_username TEXT")
        if "accepted_at" not in pri_cols:
            cursor.execute("ALTER TABLE purchase_request_item ADD COLUMN accepted_at TEXT")
        if "acceptance_note" not in pri_cols:
            cursor.execute("ALTER TABLE purchase_request_item ADD COLUMN acceptance_note TEXT")

        # receipt — department column (for multi-dept requests)
        cursor.execute("PRAGMA table_info(receipt)")
        rcpt_cols = {row[1] for row in cursor.fetchall()}
        if "department" not in rcpt_cols:
            cursor.execute("ALTER TABLE receipt ADD COLUMN department TEXT")

        # purchase_request — fulfilment response columns
        cursor.execute("PRAGMA table_info(purchase_request)")
        pr_cols = {row[1] for row in cursor.fetchall()}
        for col_def in (
            ("fulfilled_by_user_id",    "INTEGER"),
            ("fulfilled_by_username",   "TEXT"),
            ("fulfillment_accepted_at", "TEXT"),
            ("fulfillment_note",        "TEXT"),
        ):
            if col_def[0] not in pr_cols:
                cursor.execute(f"ALTER TABLE purchase_request ADD COLUMN {col_def[0]} {col_def[1]}")

        # notification table — create if not present
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS notification (
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
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_notification_user_id ON notification(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_notification_is_read ON notification(is_read)")

        # bom_item — material_used and scrap columns
        cursor.execute("PRAGMA table_info(bom_item)")
        bom_cols = {row[1] for row in cursor.fetchall()}
        if "material_used" not in bom_cols:
            cursor.execute("ALTER TABLE bom_item ADD COLUMN material_used REAL")
        if "scrap" not in bom_cols:
            cursor.execute("ALTER TABLE bom_item ADD COLUMN scrap REAL")
        if "material_unit" not in bom_cols:
            cursor.execute("ALTER TABLE bom_item ADD COLUMN material_unit TEXT")

        conn.commit()
        conn.close()
    except Exception:
        pass  # Non-fatal — table may not exist yet (first run)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
