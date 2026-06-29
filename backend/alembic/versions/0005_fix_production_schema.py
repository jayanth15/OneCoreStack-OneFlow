"""Fix missing schema in production DB.

The production DB is stamped at alembic head (0004) but several migrations
were never actually applied:

  - 0002: weight_value, weight_unit (applied to inventory_item but not
    migrated to weight_unit_id), gate_pass.purchase_order_*, dispatch.request_*
  - 0003: Unit-table migration — never applied, so `unit` columns still
    exist on inventory_item, bom_item, grn_item, dispatch, dispatch_item,
    gate_pass, gate_pass_item, purchase_order_item, receipt_item (already
    done), spare_item, supplier_jobs, supplier_materials,
    production_process.material_unit → material_unit_id
  - 0004: job_card.actual_qty — never applied

Additionally, the new `request` table was created without `from_department`
(it was added in commit 98937db but no migration was added).

This migration is idempotent — every step checks for the column/table
existence before running, so it can be applied to any DB state.

Revision ID: 0005
Revises: 0004
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels = None
depends_on = None


# (table, old_col, new_col) tuples — mirrors 0003_unit_table_and_migration
UNIT_MIGRATIONS = [
    ("inventory_item", "unit", "unit_id"),
    ("inventory_item", "weight_unit", "weight_unit_id"),
    ("bom_item", "material_unit", "material_unit_id"),
    ("grn_item", "unit", "unit_id"),
    ("dispatch", "unit", "unit_id"),
    ("dispatch_item", "unit", "unit_id"),
    ("gate_pass", "unit", "unit_id"),
    ("gate_pass_item", "unit", "unit_id"),
    ("purchase_order_item", "unit", "unit_id"),
    ("spare_item", "unit", "unit_id"),
    ("supplier_jobs", "unit", "unit_id"),
    ("supplier_materials", "unit", "unit_id"),
    ("production_process", "material_unit", "material_unit_id"),
]


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    # ── 1. Ensure unit table exists and is populated ────────────────────────
    if not _table_exists("unit"):
        op.create_table(
            "unit",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(50), unique=True, index=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    # ── 2. Migrate unit → unit_id (and weight_unit → weight_unit_id, etc.) ─
    bind = op.get_bind()

    for table, old_col, new_col in UNIT_MIGRATIONS:
        if not _table_exists(table):
            continue
        if _col_exists(table, new_col):
            # Already migrated — skip
            continue
        if not _col_exists(table, old_col):
            # Old column missing too — just add the new one
            fk_name = f"fk_{table}_{new_col}"
            with op.batch_alter_table(table) as batch_op:
                batch_op.add_column(
                    sa.Column(new_col, sa.Integer(), sa.ForeignKey("unit.id", name=fk_name), nullable=True)
                )
            continue

        # Populate unit table from any non-null string values of the old column
        # across all relevant tables (so we don't miss units used only in other
        # tables when migrating the first one).
        union_parts = []
        for t2, oc2, _ in UNIT_MIGRATIONS:
            if _table_exists(t2) and _col_exists(t2, oc2):
                union_parts.append(
                    f"SELECT DISTINCT TRIM({oc2}) AS name FROM {t2} "
                    f"WHERE {oc2} IS NOT NULL AND TRIM({oc2}) != ''"
                )
        if union_parts:
            union_sql = " UNION ".join(union_parts)
            bind.execute(text(f"""
                INSERT OR IGNORE INTO unit (name)
                SELECT DISTINCT name FROM ({union_sql}) AS all_units
            """))

        # Add new FK column
        fk_name = f"fk_{table}_{new_col}"
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(
                sa.Column(new_col, sa.Integer(), sa.ForeignKey("unit.id", name=fk_name), nullable=True)
            )

        # Backfill from the legacy string column
        bind.execute(text(f"""
            UPDATE {table}
            SET {new_col} = (SELECT id FROM unit WHERE unit.name = TRIM({table}.{old_col}))
            WHERE {old_col} IS NOT NULL AND TRIM({old_col}) != ''
        """))

        # Drop the legacy column
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(old_col)

    # ── 3. request.from_department (added to model in 98937db, no migration) ─
    if _table_exists("request") and not _col_exists("request", "from_department"):
        with op.batch_alter_table("request") as batch_op:
            batch_op.add_column(sa.Column("from_department", sa.String(), nullable=True))

    # ── 4. job_card.actual_qty (0004 claimed to add it, but DB shows missing) ─
    if _table_exists("job_card") and not _col_exists("job_card", "actual_qty"):
        with op.batch_alter_table("job_card") as batch_op:
            batch_op.add_column(sa.Column("actual_qty", sa.Float(), server_default="0.0"))

    # ── 5. departments.handles_customer_dispatch (legacy migration path only) ─
    if _table_exists("departments") and not _col_exists("departments", "handles_customer_dispatch"):
        with op.batch_alter_table("departments") as batch_op:
            batch_op.add_column(sa.Column("handles_customer_dispatch", sa.Boolean(), server_default=sa.text("0")))
        # Backfill legacy "marketing"/"sales" semantics
        bind.execute(text(
            "UPDATE departments SET handles_customer_dispatch = 1 "
            "WHERE upper(code) IN ('MKT', 'SAL', 'MARKETING', 'SALES') "
            "OR lower(name) LIKE '%marketing%' OR lower(name) LIKE '%sales%'"
        ))


def downgrade() -> None:
    # Reverse-order, idempotent
    if _table_exists("departments") and _col_exists("departments", "handles_customer_dispatch"):
        with op.batch_alter_table("departments") as batch_op:
            batch_op.drop_column("handles_customer_dispatch")

    if _table_exists("job_card") and _col_exists("job_card", "actual_qty"):
        with op.batch_alter_table("job_card") as batch_op:
            batch_op.drop_column("actual_qty")

    if _table_exists("request") and _col_exists("request", "from_department"):
        with op.batch_alter_table("request") as batch_op:
            batch_op.drop_column("from_department")

    # Reverse unit migrations: add back the old string column, copy data, drop FK
    for table, old_col, new_col in UNIT_MIGRATIONS:
        if not _table_exists(table):
            continue
        if not _col_exists(table, new_col):
            continue
        if _col_exists(table, old_col):
            continue
        bind = op.get_bind()
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column(old_col, sa.String(50), nullable=True))
        bind.execute(text(f"""
            UPDATE {table}
            SET {old_col} = (SELECT name FROM unit WHERE unit.id = {table}.{new_col})
            WHERE {new_col} IS NOT NULL
        """))
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(new_col)
