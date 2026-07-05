"""Add department purchase request access.

Revision ID: 0008
Revises: 0007
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0008"
down_revision: Union[str, Sequence[str], None] = "0007"
branch_labels = None
depends_on = None


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    if _col_exists("departments", "can_create_purchase_request"):
        return
    with op.batch_alter_table("departments") as batch_op:
        batch_op.add_column(sa.Column("can_create_purchase_request", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    if not _col_exists("departments", "can_create_purchase_request"):
        return
    with op.batch_alter_table("departments") as batch_op:
        batch_op.drop_column("can_create_purchase_request")
