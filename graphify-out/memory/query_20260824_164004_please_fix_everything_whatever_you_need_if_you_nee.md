---
type: "query"
date: "2026-08-24T16:40:04.577663+00:00"
question: "Please fix everything whatever you need if you need the schema of the database running on the server we can ssh and get its schema just fix it there should no more errors on production database."
contributor: "graphify"
outcome: "useful"
source_nodes: ["backend_app_main_migrate_database_on_startup", "InventoryItem", "SpareItem", "Unit", "Backend Quality Gate"]
---

# Q: Please fix everything whatever you need if you need the schema of the database running on the server we can ssh and get its schema just fix it there should no more errors on production database.

## Answer

Expanded from original query via vocab: [migration, alembic, database, startup, schema, legacy, upgrade, sqlite, inventory, spare, receipt, unit]. Added forward-only revision 0020 after committed 0019 so already-upgraded environments remain safe. It backfills and removes all 14 known legacy text-unit columns across inventory, spares, BOM, GRN, dispatch, gate pass, PO, receipt items, suppliers, and production. Added an ORM/schema compatibility plus Alembic-head/SQLite-integrity validator, repaired CI to run the exact fresh startup twice, fixed linkable PR unit resolution and seed unit_id writes, and added production-shaped regression coverage. Validation: 16 focused tests pass; a copy of the revision-0017 legacy DB upgraded through 0018/0019/0020 twice, passed schema/integrity/FK validation, preserved audited row counts and quantity sums, and accepted current inventory and spare inserts. Dokploy logs and metadata confirm production still runs the pre-repair deployment. Local commit/push is pending because git index escalation timed out twice and production push is held until an SSH backup of the mounted SQLite DB can be verified.

## Outcome

- Signal: useful

## Source Nodes

- backend_app_main_migrate_database_on_startup
- InventoryItem
- SpareItem
- Unit
- Backend Quality Gate