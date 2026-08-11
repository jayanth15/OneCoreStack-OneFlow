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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("request_item")}
    if "unit_id" not in columns:
        with op.batch_alter_table("request_item") as batch:
            batch.add_column(sa.Column("unit_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_request_item_unit_id", "unit", ["unit_id"], ["id"])

    # Legacy databases stamped at 0009 can still have the old text ``unit``
    # columns because their catch-up path predates migration 0003. Support both
    # shapes here without changing any stock quantity.
    inventory_columns = {
        column["name"] for column in inspector.get_columns("inventory_item")
    }
    if "unit_id" in inventory_columns:
        inventory_unit_expression = "inventory_item.unit_id"
    elif "unit" in inventory_columns:
        op.execute(sa.text("""
            INSERT INTO unit (name, is_active, created_at)
            SELECT DISTINCT TRIM(inventory_item.unit), 1, CURRENT_TIMESTAMP
            FROM inventory_item
            WHERE inventory_item.unit IS NOT NULL
              AND TRIM(inventory_item.unit) != ''
              AND NOT EXISTS (
                  SELECT 1 FROM unit
                  WHERE LOWER(TRIM(unit.name)) = LOWER(TRIM(inventory_item.unit))
              )
        """))
        inventory_unit_expression = """(
            SELECT unit.id FROM unit
            WHERE LOWER(TRIM(unit.name)) = LOWER(TRIM(inventory_item.unit))
            LIMIT 1
        )"""
    else:
        inventory_unit_expression = "NULL"

    # Backfill existing general-inventory request lines without touching stock.
    op.execute(sa.text(f"""
        UPDATE request_item
        SET unit_id = (
            SELECT {inventory_unit_expression}
            FROM inventory_item
            WHERE inventory_item.id = request_item.inventory_item_id
        )
        WHERE unit_id IS NULL
          AND item_type IN ('raw_material', 'finished_good', 'semi_finished', 'scrap')
    """))

    spare_columns = {column["name"] for column in inspector.get_columns("spare_item")}
    if "unit_id" in spare_columns:
        spare_unit_expression = "spare_item.unit_id"
    elif "unit" in spare_columns:
        op.execute(sa.text("""
            INSERT INTO unit (name, is_active, created_at)
            SELECT DISTINCT TRIM(spare_item.unit), 1, CURRENT_TIMESTAMP
            FROM spare_item
            WHERE spare_item.unit IS NOT NULL
              AND TRIM(spare_item.unit) != ''
              AND NOT EXISTS (
                  SELECT 1 FROM unit
                  WHERE LOWER(TRIM(unit.name)) = LOWER(TRIM(spare_item.unit))
              )
        """))
        spare_unit_expression = """(
            SELECT unit.id FROM unit
            WHERE LOWER(TRIM(unit.name)) = LOWER(TRIM(spare_item.unit))
            LIMIT 1
        )"""
    else:
        spare_unit_expression = "NULL"

    # Spare requests point at a variant; the unit belongs to its parent item.
    op.execute(sa.text(f"""
        UPDATE request_item
        SET unit_id = (
            SELECT {spare_unit_expression}
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
