"""Repair workflow columns skipped by the former legacy-head bootstrap.

Revision ID: 0014
Revises: 0013
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, Sequence[str], None] = "0013"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def _ensure_column(table: str, column: sa.Column) -> None:
    if table in _tables() and column.name not in _columns(table):
        with op.batch_alter_table(table) as batch:
            batch.add_column(column)


def _ensure_index(table: str, column: str) -> None:
    name = f"ix_{table}_{column}"
    if table in _tables() and name not in _indexes(table):
        op.create_index(name, table, [column])


def upgrade() -> None:
    if "document_counter" not in _tables():
        op.create_table(
            "document_counter",
            sa.Column("key", sa.String(length=40), primary_key=True),
            sa.Column("next_value", sa.Integer(), nullable=False, server_default="1"),
        )

    changes = {
        "purchase_order_item": (
            sa.Column("inventory_type", sa.String(), nullable=True),
            sa.Column("inventory_item_id", sa.Integer(), nullable=True),
            sa.Column("request_item_id", sa.Integer(), nullable=True),
        ),
        "grn_record": (
            sa.Column("request_id", sa.Integer(), nullable=True),
            sa.Column("purchase_order_id", sa.Integer(), nullable=True),
        ),
        "grn_item": (
            sa.Column("request_item_id", sa.Integer(), nullable=True),
            sa.Column("purchase_order_item_id", sa.Integer(), nullable=True),
        ),
        "gate_pass": (
            sa.Column("party_type", sa.String(), nullable=False, server_default="vendor"),
            sa.Column("dispatch_id", sa.Integer(), nullable=True),
            sa.Column("grn_id", sa.Integer(), nullable=True),
        ),
    }
    for table, columns in changes.items():
        for column in columns:
            _ensure_column(table, column)
            _ensure_index(table, column.name)

    if "gate_pass" in _tables():
        op.execute(sa.text(
            "UPDATE gate_pass SET party_type = CASE WHEN supplier_id IS NOT NULL "
            "THEN 'supplier' ELSE 'vendor' END WHERE party_type IS NULL OR party_type = ''"
        ))
    if "grn_record" in _tables() and "purchase_order" in _tables():
        op.execute(sa.text(
            "UPDATE grn_record SET purchase_order_id = "
            "(SELECT purchase_order.id FROM purchase_order "
            "WHERE purchase_order.po_number = grn_record.po_number LIMIT 1) "
            "WHERE purchase_order_id IS NULL AND po_number IS NOT NULL"
        ))


def downgrade() -> None:
    # Forward-only repair. Removing these columns would discard workflow links.
    pass
