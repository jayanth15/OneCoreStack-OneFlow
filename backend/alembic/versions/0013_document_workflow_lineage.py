"""Add durable document numbering and workflow lineage.

Revision ID: 0013
Revises: 0012
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, Sequence[str], None] = "0012"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def _add(table: str, column: sa.Column) -> None:
    if table in _tables() and column.name not in _columns(table):
        with op.batch_alter_table(table) as batch:
            batch.add_column(column)


def _index(table: str, column: str) -> None:
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

    for name, typ in (
        ("inventory_type", sa.String()),
        ("inventory_item_id", sa.Integer()),
        ("request_item_id", sa.Integer()),
    ):
        _add("purchase_order_item", sa.Column(name, typ, nullable=True))
        _index("purchase_order_item", name)

    _add("grn_record", sa.Column("request_id", sa.Integer(), nullable=True))
    _add("grn_record", sa.Column("purchase_order_id", sa.Integer(), nullable=True))
    _index("grn_record", "request_id")
    _index("grn_record", "purchase_order_id")
    _add("grn_item", sa.Column("request_item_id", sa.Integer(), nullable=True))
    _add("grn_item", sa.Column("purchase_order_item_id", sa.Integer(), nullable=True))
    _index("grn_item", "request_item_id")
    _index("grn_item", "purchase_order_item_id")

    _add("gate_pass", sa.Column("party_type", sa.String(), nullable=False, server_default="vendor"))
    _add("gate_pass", sa.Column("dispatch_id", sa.Integer(), nullable=True))
    _add("gate_pass", sa.Column("grn_id", sa.Integer(), nullable=True))
    _index("gate_pass", "dispatch_id")
    _index("gate_pass", "grn_id")
    if "gate_pass" in _tables():
        op.execute(sa.text("UPDATE gate_pass SET party_type = CASE WHEN supplier_id IS NOT NULL THEN 'supplier' ELSE 'vendor' END"))

    if "grn_record" in _tables() and "purchase_order" in _tables():
        op.execute(sa.text(
            "UPDATE grn_record SET purchase_order_id = "
            "(SELECT purchase_order.id FROM purchase_order WHERE purchase_order.po_number = grn_record.po_number LIMIT 1) "
            "WHERE purchase_order_id IS NULL AND po_number IS NOT NULL"
        ))


def downgrade() -> None:
    changes = {
        "gate_pass": ("grn_id", "dispatch_id", "party_type"),
        "grn_item": ("purchase_order_item_id", "request_item_id"),
        "grn_record": ("purchase_order_id", "request_id"),
        "purchase_order_item": ("request_item_id", "inventory_item_id", "inventory_type"),
    }
    for table, columns in changes.items():
        if table not in _tables():
            continue
        for column in columns:
            name = f"ix_{table}_{column}"
            if name in _indexes(table):
                op.drop_index(name, table_name=table)
            if column in _columns(table):
                with op.batch_alter_table(table) as batch:
                    batch.drop_column(column)
    if "document_counter" in _tables():
        op.drop_table("document_counter")
