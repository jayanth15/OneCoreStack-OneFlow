---
type: "implementation"
date: "2026-08-22T07:03:34.930094+00:00"
question: "can you fix that ?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["backend_alembic_versions_0018_rebuild_legacy_receipt_table_upgrade", "backend_alembic_versions_0018_rebuild_legacy_receipt_table_drop_legacy_indexes", "backend_tests_test_legacy_schema_request_repair_migration_test_repair_rebuilds_legacy_receipt_for_current_orm_inserts", "backend_app_models_receipt_receipt", "backend_app_main_migrate_database_on_startup"]
---

# Q: can you fix that ?

## Answer

Expanded from the production receipt failure via graph vocab: [receipt, legacy, schema, sqlite, migration, alembic, repair, insert, model, delivery, upgrade, request]. Added Alembic revision 0018 to backfill receipt_number, remove legacy receipt indexes and obsolete NOT NULL columns including sn_no and updated_at through SQLite-safe batch migration, enforce receipt_number NOT NULL, and restore current indexes. Added a production-shaped migration regression that preserves existing receipt data/status and proves a current Receipt ORM insert succeeds. Updated the checkpointed startup migration test through head 0018. Validation: 10 migration tests passed, Python compileall passed, Alembic reports 0018 head, and git diff check passed.

## Outcome

- Signal: useful

## Source Nodes

- backend_alembic_versions_0018_rebuild_legacy_receipt_table_upgrade
- backend_alembic_versions_0018_rebuild_legacy_receipt_table_drop_legacy_indexes
- backend_tests_test_legacy_schema_request_repair_migration_test_repair_rebuilds_legacy_receipt_for_current_orm_inserts
- backend_app_models_receipt_receipt
- backend_app_main_migrate_database_on_startup