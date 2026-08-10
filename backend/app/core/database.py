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


def _alembic_config():
    from alembic.config import Config

    config = Config(os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _current_alembic_revision() -> str | None:
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def run_alembic_upgrade() -> None:
    """Upgrade one revision per transaction so completed cleanup cannot loop.

    A single ``upgrade head`` can roll the version marker back to the starting
    revision when a later migration fails. Applying ``+1`` in separate Alembic
    environments checkpoints every successful revision before continuing.
    """
    from alembic import command
    from alembic.script import ScriptDirectory

    alembic_cfg = _alembic_config()
    head = ScriptDirectory.from_config(alembic_cfg).get_current_head()
    if head is None:
        raise RuntimeError("Alembic has no head revision")

    for _ in range(100):
        current = _current_alembic_revision()
        if current == head:
            return
        logger.info("Applying next database migration after %s", current or "base")
        command.upgrade(alembic_cfg, "+1")
        progressed = _current_alembic_revision()
        if progressed == current:
            raise RuntimeError(f"Database migration made no progress from revision {current!r}")
        logger.info("Committed database migration revision %s", progressed)

    raise RuntimeError("Database migration exceeded 100 revisions without reaching head")


def stamp_alembic_revision(revision: str) -> None:
    """Stamp a legacy database at a known covered revision.

    This records migration history only; pending revisions must be applied
    immediately afterwards with :func:`run_alembic_upgrade`.
    """
    from alembic import command

    command.stamp(_alembic_config(), revision)


def alembic_version_exists() -> bool:
    """Check if the alembic_version table exists (i.e., DB is already Alembic-managed)."""
    from sqlalchemy import text, inspect

    inspector = inspect(engine)
    return "alembic_version" in inspector.get_table_names()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
