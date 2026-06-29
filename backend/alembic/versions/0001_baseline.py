"""baseline

Revision ID: 0001
Revises:
Create Date: 2026-06-21

Baseline migration — captures the full current schema state.

Existing databases (already migrated via legacy _migrate_* functions)
are stamped at this revision via `alembic stamp head` during the
one-time catch-up in the startup lifespan.

Fresh databases get all tables created by init_db()
(SQLModel.metadata.create_all) before being stamped here.

All future schema changes must go through `alembic revision --autogenerate`.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
