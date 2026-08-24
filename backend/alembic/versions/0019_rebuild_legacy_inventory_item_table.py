"""Remove obsolete inventory unit columns after preserving their values.

Revision ID: 0019
Revises: 0018

Legacy SQLite databases can still have a required ``inventory_item.unit``
text column even though the current ORM writes ``unit_id``.  Current inserts
therefore omit the legacy column and fail its NOT NULL constraint.  This
migration finishes the normalization started by revision 0017, then removes
the obsolete text columns without changing stock quantities.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0019"
down_revision: Union[str, Sequence[str], None] = "0018"
branch_labels = None
depends_on = None


LEGACY_UNIT_COLUMNS = (
    ("unit", "unit_id"),
    ("weight_unit", "weight_unit_id"),
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns() -> dict[str, dict]:
    if "inventory_item" not in _tables():
        return {}
    return {
        column["name"]: column
        for column in sa.inspect(op.get_bind()).get_columns("inventory_item")
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


def _preserve_unit_values(old_column: str, new_column: str) -> None:
    bind = op.get_bind()
    columns = _columns()
    if old_column not in columns:
        return

    if new_column not in columns:
        op.add_column("inventory_item", sa.Column(new_column, sa.Integer(), nullable=True))

    labels = bind.execute(sa.text(f"""
        SELECT DISTINCT TRIM({old_column})
        FROM inventory_item
        WHERE {old_column} IS NOT NULL AND TRIM({old_column}) != ''
    """)).scalars()
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
        UPDATE inventory_item
        SET {new_column} = (
            SELECT unit.id FROM unit
            WHERE LOWER(TRIM(unit.name)) =
                  LOWER(TRIM(inventory_item.{old_column}))
            ORDER BY unit.id
            LIMIT 1
        )
        WHERE {new_column} IS NULL
          AND {old_column} IS NOT NULL
          AND TRIM({old_column}) != ''
    """))


def _drop_legacy_indexes(legacy_columns: list[str]) -> None:
    inspector = sa.inspect(op.get_bind())
    for index in inspector.get_indexes("inventory_item"):
        if set(index.get("column_names") or ()).intersection(legacy_columns):
            op.drop_index(index["name"], table_name="inventory_item")


def upgrade() -> None:
    columns = _columns()
    if not columns:
        return

    legacy_columns = [
        old_column
        for old_column, _new_column in LEGACY_UNIT_COLUMNS
        if old_column in columns
    ]
    if not legacy_columns:
        return

    _ensure_unit_table()
    for old_column, new_column in LEGACY_UNIT_COLUMNS:
        _preserve_unit_values(old_column, new_column)

    _drop_legacy_indexes(legacy_columns)
    # SQLite requires a table rebuild to remove columns. Alembic batch mode
    # copies every retained row and column, including quantity_on_hand.
    with op.batch_alter_table("inventory_item", recreate="auto") as batch_op:
        for name in legacy_columns:
            batch_op.drop_column(name)


def downgrade() -> None:
    # Forward-only repair: restoring a required legacy unit column would make
    # current ORM inserts fail again.
    pass
