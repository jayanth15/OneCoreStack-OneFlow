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

        conn.commit()
        conn.close()
    except Exception:
        pass  # Non-fatal — table may not exist yet (first run)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
