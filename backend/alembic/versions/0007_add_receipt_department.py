"""Add department to receipt.

Revision ID: 0007
Revises: 0006
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0007"
down_revision: Union[str, Sequence[str], None] = "0006"
branch_labels = None
depends_on = None


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    if _col_exists("receipt", "department"):
        return
    with op.batch_alter_table("receipt") as batch_op:
        batch_op.add_column(sa.Column("department", sa.String(), nullable=True))
    op.create_index("ix_receipt_department", "receipt", ["department"], unique=False)


def downgrade() -> None:
    if not _col_exists("receipt", "department"):
        return
    op.drop_index("ix_receipt_department", table_name="receipt")
    with op.batch_alter_table("receipt") as batch_op:
        batch_op.drop_column("department")
