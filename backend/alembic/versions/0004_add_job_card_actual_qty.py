"""Add actual_qty column to job_card

Revision ID: 0004
Revises: 0003
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, Sequence[str], None] = "0003"
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("job_card")}
    if "actual_qty" not in cols:
        op.add_column("job_card", sa.Column("actual_qty", sa.Float(), server_default="0.0"))

def downgrade() -> None:
    op.drop_column("job_card", "actual_qty")
