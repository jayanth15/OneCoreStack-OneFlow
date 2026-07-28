"""Add sha256 and size_bytes to attachment_document

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0012"
down_revision: Union[str, Sequence[str], None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if "attachment_document" not in sa.inspect(op.get_bind()).get_table_names():
        return
    att_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("attachment_document")}

    if "sha256" not in att_cols:
        with op.batch_alter_table("attachment_document") as batch_op:
            batch_op.add_column(sa.Column("sha256", sa.String(), nullable=True))

    if "size_bytes" not in att_cols:
        with op.batch_alter_table("attachment_document") as batch_op:
            batch_op.add_column(sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")))

    if "ix_attachment_document_attachment_item_id" not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("attachment_document")}:
        op.create_index("ix_attachment_document_attachment_item_id", "attachment_document", ["attachment_item_id"])


def downgrade() -> None:
    if "attachment_document" not in sa.inspect(op.get_bind()).get_table_names():
        return

    att_cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("attachment_document")}

    if "ix_attachment_document_attachment_item_id" in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("attachment_document")}:
        op.drop_index("ix_attachment_document_attachment_item_id", table_name="attachment_document")

    for col in ("size_bytes", "sha256"):
        if col in att_cols:
            with op.batch_alter_table("attachment_document") as batch_op:
                batch_op.drop_column(col)
