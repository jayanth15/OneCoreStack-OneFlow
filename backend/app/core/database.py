import logging
import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)

connect_args = {}
if "sqlite" in settings.database_url:
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=connect_args)


def init_db() -> None:
    """Create all tables from SQLModel metadata. Called on startup.

    For fresh databases this creates every table. For existing databases
    this is a no-op (create_all only adds missing tables).
    """
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    if "sqlite" in settings.database_url:
        db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
        try:
            os.chmod(db_path, 0o664)
        except OSError:
            pass


def run_alembic_upgrade() -> None:
    """Run Alembic migrations to bring the database to the latest revision."""
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(alembic_cfg, "head")


def stamp_alembic_head() -> None:
    """Stamp the database at the current Alembic head (for legacy catch-up)."""
    from alembic import command
    from alembic.config import Config

    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.stamp(alembic_cfg, "head")


def alembic_version_exists() -> bool:
    """Check if the alembic_version table exists (i.e., DB is already Alembic-managed)."""
    from sqlalchemy import text, inspect

    inspector = inspect(engine)
    return "alembic_version" in inspector.get_table_names()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
