"""Create unit table and migrate all unit columns to FK references

Revision ID: 0003
Revises: 0002
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels = None
depends_on = None

SOURCE_COLUMNS = [
    ("inventory_item", "unit", "unit_id"),
    ("inventory_item", "weight_unit", "weight_unit_id"),
    ("bom_item", "material_unit", "material_unit_id"),
    ("grn_item", "unit", "unit_id"),
    ("dispatch_item", "unit", "unit_id"),
    ("dispatch", "unit", "unit_id"),
    ("gate_pass", "unit", "unit_id"),
    ("gate_pass_item", "unit", "unit_id"),
    ("purchase_order_item", "unit", "unit_id"),
    ("receipt_item", "unit", "unit_id"),
    ("supplier_materials", "unit", "unit_id"),
    ("supplier_jobs", "unit", "unit_id"),
    ("spare_item", "unit", "unit_id"),
    ("production_process", "material_unit", "material_unit_id"),
]


def upgrade():
    op.create_table(
        "unit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(50), unique=True, index=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    union_parts = []
    for table, old_col, _ in SOURCE_COLUMNS:
        union_parts.append(f"SELECT DISTINCT TRIM({old_col}) AS name FROM {table} WHERE {old_col} IS NOT NULL AND TRIM({old_col}) != ''")
    if union_parts:
        union_sql = " UNION ".join(union_parts)
        op.execute(f"""
            INSERT INTO unit (name)
            SELECT DISTINCT name FROM ({union_sql}) AS all_units
            WHERE name NOT IN (SELECT name FROM unit)
        """)

    for table, old_col, new_col in SOURCE_COLUMNS:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        cols = {c["name"] for c in inspector.get_columns(table)}
        if old_col not in cols:
            continue

        fk_name = f"fk_{table}_{new_col}"
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column(new_col, sa.Integer(), sa.ForeignKey("unit.id", name=fk_name), nullable=True))

        op.execute(f"""
            UPDATE {table}
            SET {new_col} = (SELECT id FROM unit WHERE unit.name = TRIM({table}.{old_col}))
            WHERE {old_col} IS NOT NULL AND TRIM({old_col}) != ''
        """)

        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(old_col)


def downgrade():
    for table, old_col, new_col in reversed(SOURCE_COLUMNS):
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        cols = {c["name"] for c in inspector.get_columns(table)}
        if old_col in cols:
            continue
        fk_name = f"fk_{table}_{new_col}"
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column(old_col, sa.String(50), nullable=True))
        op.execute(f"""
            UPDATE {table}
            SET {old_col} = (SELECT name FROM unit WHERE unit.id = {table}.{new_col})
            WHERE {new_col} IS NOT NULL
        """)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column(new_col)
    op.drop_table("unit")
