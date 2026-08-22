"""Rebuild legacy receipt tables to match the current receipt model.

Revision ID: 0018
Revises: 0017

Revision 0017 copied ``sn_no`` into ``receipt_number`` but intentionally kept
the legacy columns.  On SQLite, the retained ``sn_no`` and ``updated_at``
columns are NOT NULL, so current ORM inserts that only know about the normalized
receipt model still fail.  This repair removes the obsolete header columns
after preserving their normalized values.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0018"
down_revision: Union[str, Sequence[str], None] = "0017"
branch_labels = None
depends_on = None


LEGACY_COLUMNS = (
    "sn_no",
    "item_name",
    "item_code",
    "quantity_requested",
    "quantity_received",
    "acknowledged_by_user_id",
    "acknowledged_by_username",
    "acknowledged_at",
    "acknowledgment_note",
    "is_active",
    "updated_at",
)


def _columns() -> dict[str, dict]:
    inspector = sa.inspect(op.get_bind())
    if "receipt" not in inspector.get_table_names():
        return {}
    return {column["name"]: column for column in inspector.get_columns("receipt")}


def _indexes() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if "receipt" not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes("receipt")}


def _drop_legacy_indexes(legacy_columns: list[str]) -> None:
    inspector = sa.inspect(op.get_bind())
    for index in inspector.get_indexes("receipt"):
        if set(index.get("column_names") or ()).intersection(legacy_columns):
            op.drop_index(index["name"], table_name="receipt")


def upgrade() -> None:
    columns = _columns()
    if not columns:
        return

    if "receipt_number" not in columns:
        op.add_column("receipt", sa.Column("receipt_number", sa.String(), nullable=True))
        columns = _columns()

    if "sn_no" in columns:
        op.execute(sa.text(
            "UPDATE receipt SET receipt_number = COALESCE(receipt_number, sn_no)"
        ))

    # Protect unusual partially migrated rows before enforcing the current
    # NOT NULL contract.  The id suffix makes the fallback deterministic and
    # unique without consuming a live document number.
    op.execute(sa.text("""
        UPDATE receipt
        SET receipt_number = 'RCP-LEGACY-' || CAST(id AS VARCHAR)
        WHERE receipt_number IS NULL OR TRIM(receipt_number) = ''
    """))

    legacy_columns = [name for name in LEGACY_COLUMNS if name in columns]
    receipt_number_nullable = bool(columns["receipt_number"].get("nullable", True))
    if legacy_columns or receipt_number_nullable:
        _drop_legacy_indexes(legacy_columns)
        # Alembic's batch mode recreates the table on SQLite, which is the only
        # safe way to remove NOT NULL legacy columns.  It uses native ALTER
        # operations on databases that support them.
        with op.batch_alter_table("receipt", recreate="auto") as batch_op:
            for name in legacy_columns:
                batch_op.drop_column(name)
            if receipt_number_nullable:
                batch_op.alter_column(
                    "receipt_number",
                    existing_type=columns["receipt_number"]["type"],
                    nullable=False,
                )

    indexes = _indexes()
    if "ix_receipt_receipt_number" not in indexes:
        op.create_index(
            "ix_receipt_receipt_number", "receipt", ["receipt_number"], unique=True
        )
    if "ix_receipt_request_id" not in indexes:
        op.create_index("ix_receipt_request_id", "receipt", ["request_id"], unique=False)
    if "ix_receipt_department" not in indexes:
        op.create_index("ix_receipt_department", "receipt", ["department"], unique=False)


def downgrade() -> None:
    # Forward-only repair: restoring required legacy columns would make current
    # receipt inserts fail again.
    pass
