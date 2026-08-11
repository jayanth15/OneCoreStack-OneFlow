"""Repair legacy schemas stamped past migrations and restore request data.

Revision ID: 0017
Revises: 0016

Some pre-Alembic databases were caught up by the legacy startup helpers and
then stamped at 0009. Those helpers kept text unit columns and the old request
tables, while the current ORM expects FK unit columns and unified requests.
This migration is idempotent, preserves the legacy columns/tables, and never
changes inventory quantities.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0017"
down_revision: Union[str, Sequence[str], None] = "0016"
branch_labels = None
depends_on = None


UNIT_MIGRATIONS = (
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
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    if table not in _tables():
        return set()
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def _add_column(table: str, column: sa.Column) -> None:
    if table in _tables() and column.name not in _columns(table):
        op.add_column(table, column)


def _repair_unit_columns() -> None:
    bind = op.get_bind()
    if "unit" not in _tables():
        op.create_table(
            "unit",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_unit_name", "unit", ["name"], unique=True)

    # Retain every source label and map it before adding ORM-facing columns.
    for table, old_column, _new_column in UNIT_MIGRATIONS:
        if table not in _tables() or old_column not in _columns(table):
            continue
        bind.execute(sa.text(f"""
            INSERT INTO unit (name, is_active, created_at)
            SELECT DISTINCT TRIM(src.{old_column}), 1, CURRENT_TIMESTAMP
            FROM {table} AS src
            WHERE src.{old_column} IS NOT NULL
              AND TRIM(src.{old_column}) != ''
              AND NOT EXISTS (
                  SELECT 1 FROM unit WHERE unit.name = TRIM(src.{old_column})
              )
        """))

    for table, old_column, new_column in UNIT_MIGRATIONS:
        if table not in _tables():
            continue
        _add_column(table, sa.Column(new_column, sa.Integer(), nullable=True))
        if old_column in _columns(table):
            bind.execute(sa.text(f"""
                UPDATE {table}
                SET {new_column} = (
                    SELECT unit.id FROM unit
                    WHERE unit.name = TRIM({table}.{old_column})
                    LIMIT 1
                )
                WHERE {new_column} IS NULL
                  AND {old_column} IS NOT NULL
                  AND TRIM({old_column}) != ''
            """))


def _repair_job_cards() -> None:
    _add_column(
        "job_card",
        sa.Column("actual_qty", sa.Float(), nullable=False, server_default=sa.text("0.0")),
    )


def _restore_purchase_requests() -> None:
    bind = op.get_bind()
    required = {"purchase_request", "purchase_request_item", "request", "request_item"}
    if not required.issubset(_tables()):
        return

    # The broken legacy bootstrap creates empty unified tables. Preserve source
    # ids so receipt.request_id and all historical links remain valid.
    if bind.execute(sa.text("SELECT COUNT(*) FROM request")).scalar() == 0:
        bind.execute(sa.text("""
            INSERT INTO request (
                id, sn_no, request_type, from_department, department, from_whom,
                quantity, notes, status, requested_by_user_id,
                requested_by_username, created_at, updated_at,
                reviewed_by_user_id, reviewed_by_username, reviewed_at,
                review_note, fulfilled_by_user_id, fulfilled_by_username,
                fulfillment_accepted_at, fulfillment_note, is_active
            )
            SELECT
                pr.id,
                CASE WHEN pr.sn_no LIKE 'PR-%' THEN 'REQ-' || SUBSTR(pr.sn_no, 4)
                     ELSE COALESCE(pr.sn_no, 'REQ-LEGACY-' || PRINTF('%04d', pr.id)) END,
                CASE WHEN pr.from_whom IS NOT NULL AND TRIM(pr.from_whom) != ''
                     THEN 'vendor_purchase' ELSE 'internal_transfer' END,
                (SELECT users.department FROM users WHERE users.id = pr.requested_by_user_id),
                pr.department, pr.from_whom, COALESCE(pr.quantity, 0), pr.notes,
                CASE
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('approved', 'approve', 'accepted', 'accept') THEN 'approved'
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('rejected', 'reject', 'not_approved', 'denied', 'deny') THEN 'not_approved'
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('cancelled', 'cancel', 'closed') THEN 'cancelled'
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('in_progress', 'in-progress', 'inprogress', 'processing', 'in_process') THEN 'in_progress'
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('awaiting_signoff', 'awaiting-signoff', 'pending_signoff') THEN 'awaiting_signoff'
                    WHEN LOWER(COALESCE(pr.status, 'pending')) IN ('received', 'delivered', 'fulfilled', 'complete', 'completed') THEN 'received'
                    ELSE 'pending'
                END,
                pr.requested_by_user_id, pr.requested_by_username,
                COALESCE(pr.created_at, CURRENT_TIMESTAMP),
                COALESCE(pr.updated_at, pr.created_at, CURRENT_TIMESTAMP),
                pr.reviewed_by_user_id, pr.reviewed_by_username, pr.reviewed_at,
                pr.review_note, pr.fulfilled_by_user_id, pr.fulfilled_by_username,
                pr.fulfillment_accepted_at, pr.fulfillment_note, pr.is_active
            FROM purchase_request AS pr
        """))

    if bind.execute(sa.text("SELECT COUNT(*) FROM request_item")).scalar() == 0:
        bind.execute(sa.text("""
            INSERT INTO request_item (
                id, request_id, inventory_item_id, item_name, item_code,
                item_type, unit_id, description, quantity, timeline_days,
                department, item_status, accepted_by_username, accepted_at,
                acceptance_note
            )
            SELECT
                pri.id, pri.request_id, pri.inventory_item_id, pri.item_name,
                pri.item_code, pri.item_type,
                CASE
                    WHEN LOWER(COALESCE(pri.item_type, '')) = 'spare' THEN (
                        SELECT spare_item.unit_id
                        FROM spare_item_variant
                        JOIN spare_item ON spare_item.id = spare_item_variant.spare_item_id
                        WHERE spare_item_variant.id = pri.inventory_item_id
                    )
                    ELSE (SELECT inventory_item.unit_id FROM inventory_item WHERE inventory_item.id = pri.inventory_item_id)
                END,
                pri.description, COALESCE(pri.quantity, 1), pri.timeline_days,
                pri.department, pri.item_status, pri.accepted_by_username,
                pri.accepted_at, pri.acceptance_note
            FROM purchase_request_item AS pri
            WHERE EXISTS (SELECT 1 FROM request WHERE request.id = pri.request_id)
        """))

    if {"purchase_request_history", "request_history"}.issubset(_tables()):
        if bind.execute(sa.text("SELECT COUNT(*) FROM request_history")).scalar() == 0:
            bind.execute(sa.text("""
                INSERT INTO request_history (
                    id, request_id, changed_by_user_id, changed_by_username,
                    change_type, field_name, old_value, new_value, note, changed_at
                )
                SELECT
                    h.id, h.request_id, h.changed_by_user_id, h.changed_by_username,
                    h.change_type, h.field_name, h.old_value, h.new_value, h.note,
                    COALESCE(h.changed_at, CURRENT_TIMESTAMP)
                FROM purchase_request_history AS h
                WHERE EXISTS (SELECT 1 FROM request WHERE request.id = h.request_id)
            """))


def _repair_receipts() -> None:
    bind = op.get_bind()
    if "receipt" not in _tables():
        return

    legacy_layout = "sn_no" in _columns("receipt")
    _add_column("receipt", sa.Column("receipt_number", sa.String(), nullable=True))
    _add_column("receipt", sa.Column("signed_off_by_user_id", sa.Integer(), nullable=True))
    _add_column("receipt", sa.Column("signed_off_by_username", sa.String(), nullable=True))
    _add_column("receipt", sa.Column("signed_off_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("receipt", sa.Column("disputed_at", sa.DateTime(timezone=True), nullable=True))
    _add_column("receipt", sa.Column("dispute_note", sa.String(), nullable=True))

    if legacy_layout:
        bind.execute(sa.text("""
            UPDATE receipt
            SET receipt_number = COALESCE(receipt_number, sn_no),
                signed_off_by_user_id = CASE WHEN LOWER(status) = 'acknowledged'
                    THEN acknowledged_by_user_id ELSE signed_off_by_user_id END,
                signed_off_by_username = CASE WHEN LOWER(status) = 'acknowledged'
                    THEN acknowledged_by_username ELSE signed_off_by_username END,
                signed_off_at = CASE WHEN LOWER(status) = 'acknowledged'
                    THEN acknowledged_at ELSE signed_off_at END,
                status = CASE WHEN LOWER(status) = 'acknowledged'
                    THEN 'signed_off' WHEN LOWER(status) = 'pending_ack'
                    THEN 'created' ELSE status END
        """))

    if "ix_receipt_receipt_number" not in _indexes("receipt"):
        op.create_index("ix_receipt_receipt_number", "receipt", ["receipt_number"], unique=True)

    if legacy_layout and "receipt_item" in _tables() and "request_item" in _tables():
        bind.execute(sa.text("""
            WITH matched_receipts AS (
                SELECT receipt.*,
                    COALESCE(
                        (SELECT ri.id FROM request_item AS ri
                         WHERE ri.request_id = receipt.request_id
                           AND receipt.item_code IS NOT NULL
                           AND ri.item_code = receipt.item_code
                         LIMIT 1),
                        (SELECT ri.id FROM request_item AS ri
                         WHERE ri.request_id = receipt.request_id
                           AND receipt.item_name IS NOT NULL
                           AND ri.item_name = receipt.item_name
                         LIMIT 1),
                        (SELECT ri.id FROM request_item AS ri
                         WHERE ri.request_id = receipt.request_id
                         ORDER BY ri.id LIMIT 1)
                    ) AS matched_item_id
                FROM receipt
            )
            INSERT INTO receipt_item (
                receipt_id, request_item_id, inventory_item_id, item_name,
                item_code, item_type, unit_id, quantity_requested,
                quantity_delivered, quantity_signed_off
            )
            SELECT
                matched.id, matched.matched_item_id, ri.inventory_item_id,
                matched.item_name, matched.item_code, ri.item_type, ri.unit_id,
                COALESCE(matched.quantity_requested, 0),
                COALESCE(matched.quantity_received, 0),
                CASE WHEN matched.status = 'signed_off' THEN matched.quantity_received END
            FROM matched_receipts AS matched
            JOIN request_item AS ri ON ri.id = matched.matched_item_id
            WHERE NOT EXISTS (
                SELECT 1 FROM receipt_item WHERE receipt_item.receipt_id = matched.id
            )
        """))


def upgrade() -> None:
    _repair_unit_columns()
    _repair_job_cards()
    _restore_purchase_requests()
    _repair_receipts()


def downgrade() -> None:
    # Forward-only repair; removing these columns or rows would lose data.
    pass
