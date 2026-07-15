"""Repair the schema used by request delivery.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-15

The delivery workflow added columns to ``request`` and replaced the legacy
header-only ``receipt`` table with ``receipt`` + ``receipt_item``.  Those
changes predated Alembic and were only present in the one-time legacy
migration path.  Databases that had already been stamped therefore retain
the old table/column layout, while a fresh database works correctly.

This migration is deliberately idempotent.  It adds the missing request
columns and replaces only the recognisably legacy receipt table, preserving
its header records where possible.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text


revision: str = "0009"
down_revision: Union[str, Sequence[str], None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table: str) -> bool:
    return table in sa.inspect(op.get_bind()).get_table_names()


def _columns(table: str) -> set[str]:
    if not _table_exists(table):
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _create_receipt_table() -> None:
    op.create_table(
        "receipt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("receipt_number", sa.String(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_username", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("signed_off_by_user_id", sa.Integer(), nullable=True),
        sa.Column("signed_off_by_username", sa.String(), nullable=True),
        sa.Column("signed_off_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disputed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispute_note", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
    )
    op.create_index("ix_receipt_receipt_number", "receipt", ["receipt_number"], unique=True)
    op.create_index("ix_receipt_request_id", "receipt", ["request_id"], unique=False)
    op.create_index("ix_receipt_department", "receipt", ["department"], unique=False)


def _create_receipt_item_table() -> None:
    op.create_table(
        "receipt_item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("request_item_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=True),
        sa.Column("item_name", sa.String(), nullable=True),
        sa.Column("item_code", sa.String(), nullable=True),
        sa.Column("item_type", sa.String(), nullable=True),
        sa.Column("unit_id", sa.Integer(), nullable=True),
        sa.Column("quantity_requested", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("quantity_delivered", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("quantity_signed_off", sa.Float(), nullable=True),
        sa.Column("discrepancy_note", sa.String(), nullable=True),
        sa.Column("condition", sa.String(), nullable=True),
    )
    op.create_index("ix_receipt_item_receipt_id", "receipt_item", ["receipt_id"], unique=False)
    op.create_index("ix_receipt_item_request_item_id", "receipt_item", ["request_item_id"], unique=False)


def _migrate_legacy_receipts() -> None:
    bind = op.get_bind()
    legacy_table = "receipt_legacy_0009"
    # A previous interrupted run can leave the renamed table behind.
    if _table_exists(legacy_table):
        if not _table_exists("receipt"):
            _create_receipt_table()
    else:
        op.rename_table("receipt", legacy_table)
        _create_receipt_table()

    legacy_columns = _columns(legacy_table)
    if not {"id", "sn_no", "request_id"}.issubset(legacy_columns):
        return

    # The old table had no receipt-line data, but retaining its headers avoids
    # silently deleting historical acknowledgements during the repair.
    bind.execute(text("""
        INSERT INTO receipt (
            id, receipt_number, request_id, department,
            created_by_user_id, created_by_username, created_at,
            signed_off_by_user_id, signed_off_by_username, signed_off_at,
            status, notes
        )
        SELECT
            id, sn_no, request_id, department,
            created_by_user_id, created_by_username,
            COALESCE(created_at, CURRENT_TIMESTAMP),
            CASE WHEN status = 'acknowledged' THEN acknowledged_by_user_id END,
            CASE WHEN status = 'acknowledged' THEN acknowledged_by_username END,
            CASE WHEN status = 'acknowledged' THEN acknowledged_at END,
            CASE WHEN status = 'acknowledged' THEN 'signed_off' ELSE 'created' END,
            notes
        FROM receipt_legacy_0009
        WHERE NOT EXISTS (SELECT 1 FROM receipt WHERE receipt.id = receipt_legacy_0009.id)
    """))


def upgrade() -> None:
    request_columns = _columns("request")
    request_delivery_columns = (
        ("delivered_by_user_id", sa.Integer()),
        ("delivered_by_username", sa.String()),
        ("delivered_at", sa.DateTime(timezone=True)),
        ("delivery_note", sa.String()),
        ("acknowledged_by_user_id", sa.Integer()),
        ("acknowledged_by_username", sa.String()),
        ("acknowledged_at", sa.DateTime(timezone=True)),
        ("acknowledgment_note", sa.String()),
    )
    for name, column_type in request_delivery_columns:
        if name not in request_columns:
            op.add_column("request", sa.Column(name, column_type, nullable=True))

    receipt_columns = _columns("receipt")
    if not receipt_columns:
        _create_receipt_table()
    elif "receipt_number" not in receipt_columns:
        _migrate_legacy_receipts()

    if not _table_exists("receipt_item"):
        _create_receipt_item_table()


def downgrade() -> None:
    # Forward-only repair: reverting would reintroduce the production failure.
    pass
