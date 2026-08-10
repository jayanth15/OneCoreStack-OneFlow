"""Clear residual stock from inactive inventory records only.

Revision ID: 0015
Revises: 0014
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, Sequence[str], None] = "0014"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _run(statement: str) -> None:
    op.execute(sa.text(statement))


def _columns(table: str) -> list[dict]:
    return sa.inspect(op.get_bind()).get_columns(table)


def _can_insert(table: str, provided: set[str]) -> bool:
    """Return false for legacy history tables with extra required columns."""
    for column in _columns(table):
        if column["name"] in provided or column.get("primary_key"):
            continue
        if column.get("nullable", True) or column.get("default") is not None:
            continue
        return False
    return True


def upgrade() -> None:
    """Audit and zero quantities only where the record is already inactive."""
    tables = _tables()
    if {"inventory_item", "inventory_history"}.issubset(tables):
        inventory_history_columns = {
            "inventory_item_id", "changed_at", "change_type", "quantity_before",
            "quantity_after", "quantity_delta", "notes",
        }
        if _can_insert("inventory_history", inventory_history_columns):
            _run("""
            INSERT INTO inventory_history
                (inventory_item_id, changed_at, change_type, quantity_before,
                 quantity_after, quantity_delta, notes)
            SELECT id, CURRENT_TIMESTAMP, 'set', quantity_on_hand, 0,
                   -quantity_on_hand, 'One-time cleanup of inactive inventory stock'
            FROM inventory_item
            WHERE is_active = false AND ABS(COALESCE(quantity_on_hand, 0)) > 0.000001
            """)
        _run("UPDATE inventory_item SET quantity_on_hand = 0 WHERE is_active = false AND quantity_on_hand != 0")

    domains = (
        ("consumable", "consumable_history", "consumable_id"),
        ("attachment_item", "attachment_history", "attachment_id"),
        ("weeder_item", "weeder_history", "weeder_id"),
    )
    for table, history, foreign_key in domains:
        if {table, history}.issubset(tables):
            history_columns = {
                foreign_key, "changed_at", "change_type", "qty_before",
                "qty_after", "qty_delta", "note",
            }
            if _can_insert(history, history_columns):
                _run(f"""
                INSERT INTO {history}
                    ({foreign_key}, changed_at, change_type, qty_before,
                     qty_after, qty_delta, note)
                SELECT id, CURRENT_TIMESTAMP, 'set', qty, 0, -qty,
                       'One-time cleanup of inactive inventory stock'
                FROM {table}
                WHERE is_active = false AND ABS(COALESCE(qty, 0)) > 0.000001
                """)
            _run(f"UPDATE {table} SET qty = 0 WHERE is_active = false AND qty != 0")

    if {"spare_item_variant", "spare_item_history"}.issubset(tables):
        spare_history_columns = {
            "spare_item_id", "spare_item_variant_id", "changed_at", "change_type",
            "qty_before", "qty_after", "qty_delta", "note",
        }
        if _can_insert("spare_item_history", spare_history_columns):
            _run("""
            INSERT INTO spare_item_history
                (spare_item_id, spare_item_variant_id, changed_at, change_type,
                 qty_before, qty_after, qty_delta, note)
            SELECT spare_item_id, id, CURRENT_TIMESTAMP, 'remove_variant',
                   qty, 0, -qty, 'One-time cleanup of inactive spare stock'
            FROM spare_item_variant
            WHERE is_active = false AND ABS(COALESCE(qty, 0)) > 0.000001
            """)
        _run("UPDATE spare_item_variant SET qty = 0 WHERE is_active = false AND qty != 0")

    if "spare_item" in tables:
        _run("UPDATE spare_item SET recorded_qty = 0 WHERE is_active = false AND recorded_qty != 0")


def downgrade() -> None:
    # Quantities cannot be reconstructed safely; audit rows retain old values.
    pass
