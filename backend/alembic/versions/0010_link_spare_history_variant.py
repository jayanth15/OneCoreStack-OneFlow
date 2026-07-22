"""Link spare stock history to an individual variant.

Revision ID: 0010
Revises: 0009
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0010"
down_revision: Union[str, Sequence[str], None] = "0009"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return table in inspector.get_table_names() and column in {
        item["name"] for item in inspector.get_columns(table)
    }


def upgrade() -> None:
    if _column_exists("spare_item_history", "spare_item_variant_id"):
        return
    with op.batch_alter_table("spare_item_history") as batch_op:
        batch_op.add_column(sa.Column("spare_item_variant_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_spare_item_history_variant",
            "spare_item_variant",
            ["spare_item_variant_id"],
            ["id"],
        )
        batch_op.create_index(
            "ix_spare_item_history_spare_item_variant_id",
            ["spare_item_variant_id"],
            unique=False,
        )


def downgrade() -> None:
    if not _column_exists("spare_item_history", "spare_item_variant_id"):
        return
    with op.batch_alter_table("spare_item_history") as batch_op:
        batch_op.drop_index("ix_spare_item_history_spare_item_variant_id")
        batch_op.drop_constraint("fk_spare_item_history_variant", type_="foreignkey")
        batch_op.drop_column("spare_item_variant_id")
