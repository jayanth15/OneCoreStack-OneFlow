---
type: "diagnosis"
date: "2026-08-22T06:44:44.104625+00:00"
question: "Why does production fail with sqlite3 NOT NULL constraint failed receipt.sn_no when marking a request delivered?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["backend_app_models_receipt_receipt", "backend_app_routers_receipts_create_department_receipts_for_request", "backend_alembic_versions_0017_repair_legacy_schema_and_requests_repair_receipts", "backend_alembic_versions_0009_repair_request_delivery_receipt_schema_upgrade", "backend_app_main_migrate_database_on_startup"]
---

# Q: Why does production fail with sqlite3 NOT NULL constraint failed receipt.sn_no when marking a request delivered?

## Answer

Production has a legacy SQLite receipt table that still contains sn_no as NOT NULL. The current Receipt ORM and delivery path insert receipt_number and omit sn_no. Migration 0017 backfills receipt_number from sn_no but intentionally retains the legacy schema, so it does not remove or relax the NOT NULL sn_no constraint; therefore the database can be at Alembic head 0017 and still reject every new receipt insert. A new migration must rebuild the SQLite receipt table to the current ORM schema while preserving data and indexes.

## Outcome

- Signal: useful

## Source Nodes

- backend_app_models_receipt_receipt
- backend_app_routers_receipts_create_department_receipts_for_request
- backend_alembic_versions_0017_repair_legacy_schema_and_requests_repair_receipts
- backend_alembic_versions_0009_repair_request_delivery_receipt_schema_upgrade
- backend_app_main_migrate_database_on_startup