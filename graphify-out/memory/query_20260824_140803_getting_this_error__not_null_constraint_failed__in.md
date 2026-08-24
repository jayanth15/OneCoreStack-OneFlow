---
type: "query"
date: "2026-08-24T14:08:03.156789+00:00"
question: "Getting this error: NOT NULL constraint failed: inventory_item.unit. Explain what this is and proceed to fix it."
contributor: "graphify"
outcome: "useful"
source_nodes: ["InventoryItem", "Unit", "backend_app_main_migrate_database_on_startup"]
---

# Q: Getting this error: NOT NULL constraint failed: inventory_item.unit. Explain what this is and proceed to fix it.

## Answer

Expanded from original query via vocab: [inventory, item, unit, migration, schema, legacy, insert, alembic, model, repair, column]. The graph showed that InventoryItem now writes unit_id, revision 0017 preserved the legacy unit text column, revision 0018 established the table-rebuild repair pattern, and application startup upgrades Alembic automatically. Added revision 0019 to preserve and backfill unit and weight-unit references, remove obsolete inventory_item.unit and inventory_item.weight_unit columns without changing quantity_on_hand, and added production-shaped ORM-insert and startup regression tests. Focused result: 8 tests passed and Alembic head is 0019.

## Outcome

- Signal: useful

## Source Nodes

- InventoryItem
- Unit
- backend_app_main_migrate_database_on_startup