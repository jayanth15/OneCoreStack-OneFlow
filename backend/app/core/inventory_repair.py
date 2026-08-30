"""Startup inventory value repair — idempotent, safe to run on every boot.

Fixes data-level inconsistencies that make the dashboard/category/sub totals
miscount inventory value:

1. **Inactive main inventory items** must hold zero stock (legacy rows may
   have been deactivated before the delete endpoint zeroed quantities).
2. **Inactive consumables / weeders / attachments** same as above.
3. **Inactive spare items**: their active variants must be cleared too, or the
   variant stock survives deactivation and resurfaces on restore. Also zeroes
   the item's recorded_qty.
4. **Active spare items with variants**: re-sync recorded_qty/rate from their
   active variants so aggregation columns match the variant rows.
5. **Active spare items with NO variants**: untouched — they are manual-stock
   rows whose recorded_qty/rate are the source of truth.

Implemented with guarded raw SQL (mirrors 0015) so it works on both current
and legacy pre-Alembic schemas regardless of ORM column drift. Audit-trailed
where a history table exists; fully idempotent (second run writes nothing).
"""

import logging

from sqlalchemy import text

from app.core.database import engine

logger = logging.getLogger(__name__)

EPSILON = 1e-6
NOTE = "One-time startup repair of inactive inventory stock"


def _cols(conn, table: str) -> set[str]:
    try:
        return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
    except Exception:  # noqa: BLE001
        return set()


def _table_exists(conn, table: str) -> bool:
    try:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:t"),
            {"t": table},
        ).all()
        return bool(rows)
    except Exception:  # noqa: BLE001
        return False


def _simple_domain(conn, table: str, history: str, fk: str) -> int:
    """Zero qty on inactive rows of a qty-column domain, with audit rows."""
    if not _table_exists(conn, table):
        return 0
    cols = _cols(conn, table)
    if "qty" not in cols or "is_active" not in cols or "updated_at" not in cols:
        return 0
    # Audit first (qty_before is still live), then zero.
    if _table_exists(conn, history):
        hcols = _cols(conn, history)
        needed = {fk, "changed_at", "change_type", "qty_before", "qty_after", "qty_delta"}
        if needed.issubset(hcols):
            conn.execute(
                text(
                    f"INSERT INTO {history} "
                    f"({fk}, changed_at, change_type, qty_before, qty_after, qty_delta, note) "
                    f"SELECT id, CURRENT_TIMESTAMP, 'set', qty, 0, -qty, :note "
                    f"FROM {table} WHERE is_active = 0 AND ABS(COALESCE(qty, 0)) > {EPSILON}"
                ),
                {"note": NOTE},
            )
    changed = conn.execute(
        text(
            f"UPDATE {table} SET qty = 0, updated_at = CURRENT_TIMESTAMP "
            f"WHERE is_active = 0 AND ABS(COALESCE(qty, 0)) > {EPSILON}"
        )
    ).rowcount
    return changed


def _repair_simple_domains(conn) -> int:
    total = 0
    total += _simple_domain(conn, "consumable", "consumable_history", "consumable_id")
    total += _simple_domain(conn, "weeder_item", "weeder_history", "weeder_id")
    total += _simple_domain(conn, "attachment_item", "attachment_history", "attachment_id")
    return total


def _repair_main_inventory(conn) -> int:
    if not _table_exists(conn, "inventory_item"):
        return 0
    cols = _cols(conn, "inventory_item")
    if not {"quantity_on_hand", "is_active", "updated_at"}.issubset(cols):
        return 0
    # Audit first (quantity_before is still live), then zero.
    if _table_exists(conn, "inventory_history"):
        hcols = _cols(conn, "inventory_history")
        needed = {"inventory_item_id", "changed_at", "change_type",
                  "quantity_before", "quantity_after", "quantity_delta"}
        if needed.issubset(hcols):
            conn.execute(
                text(
                    "INSERT INTO inventory_history "
                    "(inventory_item_id, changed_at, change_type, quantity_before, "
                    " quantity_after, quantity_delta, notes) "
                    "SELECT id, CURRENT_TIMESTAMP, 'set', quantity_on_hand, 0, -quantity_on_hand, :note "
                    f"FROM inventory_item WHERE is_active = 0 AND ABS(COALESCE(quantity_on_hand, 0)) > {EPSILON}"
                ),
                {"note": NOTE},
            )
    changed = conn.execute(
        text(
            "UPDATE inventory_item SET quantity_on_hand = 0, updated_at = CURRENT_TIMESTAMP "
            f"WHERE is_active = 0 AND ABS(COALESCE(quantity_on_hand, 0)) > {EPSILON}"
        )
    ).rowcount
    return changed


def _repair_spares(conn) -> tuple[int, int, int]:
    """Returns (variants_cleared, items_synced, items_zeroed)."""
    cleared = synced = zeroed = 0
    if not _table_exists(conn, "spare_item"):
        return cleared, synced, zeroed

    # 1) Clear active variants of inactive items.
    if _table_exists(conn, "spare_item_variant"):
        var_cols = _cols(conn, "spare_item_variant")
        if {"spare_item_id", "qty", "is_active", "updated_at"}.issubset(var_cols):
            # Audit first (qty_before is still live), then clear.
            if _table_exists(conn, "spare_item_history"):
                hcols = _cols(conn, "spare_item_history")
                needed = {"spare_item_id", "spare_item_variant_id", "changed_at",
                          "change_type", "qty_before", "qty_after", "qty_delta"}
                if needed.issubset(hcols):
                    conn.execute(
                        text(
                            "INSERT INTO spare_item_history "
                            "(spare_item_id, spare_item_variant_id, changed_at, change_type, "
                            " qty_before, qty_after, qty_delta, note) "
                            "SELECT spare_item_id, id, CURRENT_TIMESTAMP, 'remove_variant', "
                            " qty, 0, -qty, :note FROM spare_item_variant "
                            "WHERE spare_item_id IN "
                            "(SELECT id FROM spare_item WHERE is_active = 0) "
                            f" AND is_active = 1 AND ABS(COALESCE(qty, 0)) > {EPSILON}"
                        ),
                        {"note": NOTE},
                    )
            cleared = conn.execute(
                text(
                    "UPDATE spare_item_variant SET is_active = 0, qty = 0, "
                    "updated_at = CURRENT_TIMESTAMP WHERE spare_item_id IN "
                    "(SELECT id FROM spare_item WHERE is_active = 0) "
                    "AND is_active = 1"
                )
            ).rowcount
    item_cols = _cols(conn, "spare_item")
    if "recorded_qty" in item_cols and "is_active" in item_cols and "updated_at" in item_cols:
        if _table_exists(conn, "spare_item_history"):
            hcols = _cols(conn, "spare_item_history")
            needed = {"spare_item_id", "changed_at", "change_type",
                      "qty_before", "qty_after", "qty_delta"}
            if needed.issubset(hcols):
                conn.execute(
                    text(
                        "INSERT INTO spare_item_history "
                        "(spare_item_id, changed_at, change_type, qty_before, qty_after, qty_delta, note) "
                        "SELECT id, CURRENT_TIMESTAMP, 'set', recorded_qty, 0, -recorded_qty, :note "
                        f"FROM spare_item WHERE is_active = 0 AND ABS(COALESCE(recorded_qty, 0)) > {EPSILON}"
                    ),
                    {"note": NOTE},
                )
        zeroed = conn.execute(
            text(
                "UPDATE spare_item SET recorded_qty = 0, updated_at = CURRENT_TIMESTAMP "
                f"WHERE is_active = 0 AND ABS(COALESCE(recorded_qty, 0)) > {EPSILON}"
            )
        ).rowcount

    # 2) Re-sync active items that HAVE variants (aggregation drift).
    if _table_exists(conn, "spare_item_variant") and "rate" in item_cols and "recorded_qty" in item_cols:
        mismatches = conn.execute(
            text(
                "SELECT s.id, s.recorded_qty, COALESCE(SUM(v.qty), 0) AS total_qty, s.rate "
                "FROM spare_item s "
                "JOIN spare_item_variant v ON v.spare_item_id = s.id AND v.is_active = 1 "
                "WHERE s.is_active = 1 GROUP BY s.id HAVING ABS(s.recorded_qty - SUM(v.qty)) > 0.001"
            )
        ).all()
        # Recompute value-weighted effective rate per item in Python.
        for row in mismatches:
            item_id = row[0]
            rows = conn.execute(
                text(
                    "SELECT qty, rate FROM spare_item_variant "
                    "WHERE spare_item_id = :i AND is_active = 1"
                ),
                {"i": item_id},
            ).all()
            total_qty = sum(float(r[0]) for r in rows)
            total_val = sum(float(r[0]) * (float(r[1]) if r[1] is not None else 0) for r in rows)
            new_rate = round(total_val / total_qty, 4) if total_qty > 0 and total_val > 0 else None
            conn.execute(
                text(
                    "UPDATE spare_item SET recorded_qty = :q, rate = :r, updated_at = CURRENT_TIMESTAMP "
                    "WHERE id = :i"
                ),
                {"q": total_qty, "r": new_rate, "i": item_id},
            )
            synced += 1

    return cleared, synced, zeroed


def repair_inventory_values() -> None:
    """Idempotent startup repair; logs what it changed."""
    main = simple = 0
    spares = (0, 0, 0)
    with engine.connect() as conn:
        # Alembic startup runs migrations first; guard here regardless.
        try:
            with conn.begin():
                main = _repair_main_inventory(conn)
                simple = _repair_simple_domains(conn)
                spares = _repair_spares(conn)
        except Exception:  # noqa: BLE001
            logger.exception("Inventory repair failed — continuing startup")
            return
    if main or simple or any(spares):
        logger.info(
            "Inventory repair: main=%d simple=%d spares(cleared=%d, synced=%d, zeroed=%d)",
            main, simple, spares[0], spares[1], spares[2],
        )
    else:
        logger.info("Inventory repair: nothing to fix")
