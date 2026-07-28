"""Add receipt tracking to dispatch, Gate Pass history audit fields, and attachment documents

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-28

Adds:
  - dispatch.receipt_id (INTEGER, FK to receipt.id, nullable)
  - dispatch.receipt_number (TEXT, denormalized immutable snapshot, nullable)
  - dispatch.inventory_deducted_at (TIMESTAMP, nullable)
  - dispatch.inventory_deducted_by_user_id (INTEGER, nullable)
  - dispatch.inventory_deducted_by_username (TEXT, nullable)
  - gate_pass_history.changed_by_user_id (INTEGER, nullable)
  - gate_pass_history.field_name (TEXT, nullable)
  - gate_pass_history.old_value (TEXT, nullable)
  - gate_pass_history.new_value (TEXT, nullable)
  - gate_pass_history.details_json (TEXT, nullable)
  - attachment_document table
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0011"
down_revision: Union[str, Sequence[str], None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {c["name"] for c in inspector.get_columns(table)}


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    # ── 1. Dispatch receipt and deduction fields ──────────────────
    has_dispatch = _table_exists("dispatch")
    dispatch_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("dispatch")} if has_dispatch else set()

    if has_dispatch and "receipt_id" not in dispatch_cols:
        with op.batch_alter_table("dispatch") as batch_op:
            batch_op.add_column(sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("receipt.id", name="fk_dispatch_receipt_id_receipt"), nullable=True))

    if has_dispatch and "receipt_number" not in dispatch_cols:
        with op.batch_alter_table("dispatch") as batch_op:
            batch_op.add_column(sa.Column("receipt_number", sa.String(), nullable=True))

    if has_dispatch and "inventory_deducted_at" not in dispatch_cols:
        with op.batch_alter_table("dispatch") as batch_op:
            batch_op.add_column(sa.Column("inventory_deducted_at", sa.DateTime(timezone=True), nullable=True))

    if has_dispatch and "inventory_deducted_by_user_id" not in dispatch_cols:
        with op.batch_alter_table("dispatch") as batch_op:
            batch_op.add_column(sa.Column("inventory_deducted_by_user_id", sa.Integer(), nullable=True))

    if has_dispatch and "inventory_deducted_by_username" not in dispatch_cols:
        with op.batch_alter_table("dispatch") as batch_op:
            batch_op.add_column(sa.Column("inventory_deducted_by_username", sa.String(), nullable=True))

    # Index for idempotency check
    if has_dispatch and "ix_dispatch_inventory_deducted_at" not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("dispatch")}:
        op.create_index("ix_dispatch_inventory_deducted_at", "dispatch", ["inventory_deducted_at"])

    # ── 2. Gate Pass history audit fields ────────────────────────
    has_gp_history = _table_exists("gate_pass_history")
    gp_hist_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("gate_pass_history")} if has_gp_history else set()

    if has_gp_history and "changed_by_user_id" not in gp_hist_cols:
        with op.batch_alter_table("gate_pass_history") as batch_op:
            batch_op.add_column(sa.Column("changed_by_user_id", sa.Integer(), nullable=True))

    if has_gp_history and "field_name" not in gp_hist_cols:
        with op.batch_alter_table("gate_pass_history") as batch_op:
            batch_op.add_column(sa.Column("field_name", sa.Text(), nullable=True))

    if has_gp_history and "old_value" not in gp_hist_cols:
        with op.batch_alter_table("gate_pass_history") as batch_op:
            batch_op.add_column(sa.Column("old_value", sa.Text(), nullable=True))

    if has_gp_history and "new_value" not in gp_hist_cols:
        with op.batch_alter_table("gate_pass_history") as batch_op:
            batch_op.add_column(sa.Column("new_value", sa.Text(), nullable=True))

    if has_gp_history and "details_json" not in gp_hist_cols:
        with op.batch_alter_table("gate_pass_history") as batch_op:
            batch_op.add_column(sa.Column("details_json", sa.Text(), nullable=True))

    # ── 3. Attachment document table ──────────────────────────
    if not _table_exists("attachment_document"):
        op.create_table(
            "attachment_document",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("attachment_item_id", sa.Integer(), sa.ForeignKey("attachment_item.id"), nullable=False, index=True),
            sa.Column("filename", sa.String(), nullable=False),
            sa.Column("content_type", sa.String(), nullable=False),
            sa.Column("document_data", sa.LargeBinary(), nullable=False),
            sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
            sa.Column("uploaded_by_username", sa.String(), nullable=True),
            sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
        )

    # ── 4. has_document on attachment_item ────────────────────
    has_attachment_item = _table_exists("attachment_item")
    ai_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("attachment_item")} if has_attachment_item else set()
    if has_attachment_item and "has_document" not in ai_cols:
        with op.batch_alter_table("attachment_item") as batch_op:
            batch_op.add_column(sa.Column("has_document", sa.Boolean(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    if _table_exists("attachment_item"):
        ai_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("attachment_item")}
        if "has_document" in ai_cols:
            with op.batch_alter_table("attachment_item") as batch_op:
                batch_op.drop_column("has_document")

    if _table_exists("attachment_document"):
        op.drop_table("attachment_document")

    if _table_exists("gate_pass_history"):
        gp_hist_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("gate_pass_history")}
        for col in ("details_json", "new_value", "old_value", "field_name", "changed_by_user_id"):
            if col in gp_hist_cols:
                with op.batch_alter_table("gate_pass_history") as batch_op:
                    batch_op.drop_column(col)

    if _table_exists("dispatch"):
        dispatch_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("dispatch")}
        for col in ("inventory_deducted_by_username", "inventory_deducted_by_user_id",
                     "inventory_deducted_at", "receipt_number", "receipt_id"):
            if col in dispatch_cols:
                with op.batch_alter_table("dispatch") as batch_op:
                    batch_op.drop_column(col)

        if "ix_dispatch_inventory_deducted_at" in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("dispatch")}:
            op.drop_index("ix_dispatch_inventory_deducted_at", table_name="dispatch")