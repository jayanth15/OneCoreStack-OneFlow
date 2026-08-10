"""Persist inventory units on request line items.

Revision ID: 0016
Revises: 0015
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, Sequence[str], None] = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("request_item")}
    if "unit_id" not in columns:
        with op.batch_alter_table("request_item") as batch:
            batch.add_column(sa.Column("unit_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_request_item_unit_id", "unit", ["unit_id"], ["id"])

    # Backfill existing general-inventory request lines without touching stock.
    op.execute(sa.text("""
        UPDATE request_item
        SET unit_id = (
            SELECT inventory_item.unit_id
            FROM inventory_item
            WHERE inventory_item.id = request_item.inventory_item_id
        )
        WHERE unit_id IS NULL
          AND item_type IN ('raw_material', 'finished_good', 'semi_finished', 'scrap')
    """))

    # Spare requests point at a variant; the unit belongs to its parent item.
    op.execute(sa.text("""
        UPDATE request_item
        SET unit_id = (
            SELECT spare_item.unit_id
            FROM spare_item_variant
            JOIN spare_item ON spare_item.id = spare_item_variant.spare_item_id
            WHERE spare_item_variant.id = request_item.inventory_item_id
        )
        WHERE unit_id IS NULL AND item_type = 'spare'
    """))


def downgrade() -> None:
    with op.batch_alter_table("request_item") as batch:
        batch.drop_constraint("fk_request_item_unit_id", type_="foreignkey")
        batch.drop_column("unit_id")
