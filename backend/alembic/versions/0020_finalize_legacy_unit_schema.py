"""Finish legacy text-unit normalization across every current model.

Revision ID: 0020
Revises: 0019

Some databases reached revision 0017 through the legacy catch-up path. That
revision backfilled the normalized ``*_unit_id`` columns but intentionally
retained the text columns. Required legacy columns such as
``spare_item.unit`` can then reject inserts made by the current ORM. Preserve
every remaining label and mapping before removing all known legacy columns.
"""

from collections import defaultdict
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0020"
down_revision: Union[str, Sequence[str], None] = "0019"
branch_labels = None
depends_on = None


LEGACY_UNIT_COLUMNS = (
    ("inventory_item", "unit", "unit_id"),
    ("inventory_item", "weight_unit", "weight_unit_id"),
    ("bom_item", "material_unit", "material_unit_id"),
    ("grn_item", "unit", "unit_id"),
    ("dispatch", "unit", "unit_id"),
    ("dispatch_item", "unit", "unit_id"),
    ("gate_pass", "unit", "unit_id"),
    ("gate_pass_item", "unit", "unit_id"),
    ("purchase_order_item", "unit", "unit_id"),
    ("receipt_item", "unit", "unit_id"),
    ("spare_item", "unit", "unit_id"),
    ("supplier_jobs", "unit", "unit_id"),
    ("supplier_materials", "unit", "unit_id"),
    ("production_process", "material_unit", "material_unit_id"),
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> dict[str, dict]:
    if table not in _tables():
        return {}
    return {
        column["name"]: column
        for column in sa.inspect(op.get_bind()).get_columns(table)
    }


def _ensure_unit_table() -> None:
    if "unit" in _tables():
        return

    op.create_table(
        "unit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_unit_name", "unit", ["name"], unique=True)


def _preserve_unit_values(table: str, old_column: str, new_column: str) -> None:
    bind = op.get_bind()
    columns = _columns(table)
    if old_column not in columns:
        return

    if new_column not in columns:
        op.add_column(table, sa.Column(new_column, sa.Integer(), nullable=True))

    labels = list(bind.execute(sa.text(f"""
        SELECT DISTINCT TRIM({old_column})
        FROM {table}
        WHERE {old_column} IS NOT NULL AND TRIM({old_column}) != ''
    """)).scalars())
    for label in labels:
        unit_id = bind.execute(
            sa.text("""
                SELECT id FROM unit
                WHERE LOWER(TRIM(name)) = LOWER(TRIM(:name))
                ORDER BY id
                LIMIT 1
            """),
            {"name": label},
        ).scalar()
        if unit_id is None:
            bind.execute(
                sa.text("""
                    INSERT INTO unit (name, is_active, created_at)
                    VALUES (:name, 1, CURRENT_TIMESTAMP)
                """),
                {"name": label},
            )

    bind.execute(sa.text(f"""
        UPDATE {table}
        SET {new_column} = (
            SELECT unit.id FROM unit
            WHERE LOWER(TRIM(unit.name)) = LOWER(TRIM({table}.{old_column}))
            ORDER BY unit.id
            LIMIT 1
        )
        WHERE {new_column} IS NULL
          AND {old_column} IS NOT NULL
          AND TRIM({old_column}) != ''
    """))


def _drop_legacy_indexes(table: str, legacy_columns: list[str]) -> None:
    for index in sa.inspect(op.get_bind()).get_indexes(table):
        if set(index.get("column_names") or ()).intersection(legacy_columns):
            op.drop_index(index["name"], table_name=table)


def upgrade() -> None:
    present = [
        migration
        for migration in LEGACY_UNIT_COLUMNS
        if migration[1] in _columns(migration[0])
    ]
    if not present:
        return

    _ensure_unit_table()
    for table, old_column, new_column in present:
        _preserve_unit_values(table, old_column, new_column)

    columns_by_table: dict[str, list[str]] = defaultdict(list)
    for table, old_column, _new_column in present:
        columns_by_table[table].append(old_column)

    for table, legacy_columns in columns_by_table.items():
        _drop_legacy_indexes(table, legacy_columns)
        # SQLite requires a table rebuild to remove columns. Alembic copies
        # all retained rows, quantities, constraints, and indexes.
        with op.batch_alter_table(table, recreate="auto") as batch_op:
            for old_column in legacy_columns:
                batch_op.drop_column(old_column)


def downgrade() -> None:
    # Forward-only repair: restoring legacy columns would reintroduce insert
    # failures and cannot safely recover their former nullability contracts.
    pass
