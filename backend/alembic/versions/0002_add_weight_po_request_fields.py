"""Add weight, PO link, and request link columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-27

Adds:
  - inventory_item.weight_value (REAL)
  - inventory_item.weight_unit (TEXT)
  - gate_pass.purchase_order_id (INTEGER)
  - gate_pass.purchase_order_number (TEXT)
  - dispatch.request_id (INTEGER)
  - dispatch.request_sn_no (TEXT)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, column: str) -> bool:
    from sqlalchemy import inspect, text
    bind = op.get_bind()
    inspector = inspect(bind)
    return column in {c["name"] for c in inspector.get_columns(table)}


def upgrade() -> None:
    if not _col_exists("inventory_item", "weight_value"):
        op.add_column("inventory_item", sa.Column("weight_value", sa.Float(), nullable=True))
    if not _col_exists("inventory_item", "weight_unit"):
        op.add_column("inventory_item", sa.Column("weight_unit", sa.String(), nullable=True))
    if not _col_exists("gate_pass", "purchase_order_id"):
        op.add_column("gate_pass", sa.Column("purchase_order_id", sa.Integer(), nullable=True))
    if not _col_exists("gate_pass", "purchase_order_number"):
        op.add_column("gate_pass", sa.Column("purchase_order_number", sa.String(), nullable=True))
    if not _col_exists("dispatch", "request_id"):
        op.add_column("dispatch", sa.Column("request_id", sa.Integer(), nullable=True))
    if not _col_exists("dispatch", "request_sn_no"):
        op.add_column("dispatch", sa.Column("request_sn_no", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_item", "weight_value")
    op.drop_column("inventory_item", "weight_unit")
    op.drop_column("gate_pass", "purchase_order_id")
    op.drop_column("gate_pass", "purchase_order_number")
    op.drop_column("dispatch", "request_id")
    op.drop_column("dispatch", "request_sn_no")
