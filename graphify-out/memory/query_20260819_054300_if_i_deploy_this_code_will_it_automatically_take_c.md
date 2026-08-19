---
type: "query"
date: "2026-08-19T05:43:00.295126+00:00"
question: "if i deploy this code will it automatically take care of the migration ?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Automatic Alembic Migrations", "lifespan()", "_migrate_database_on_startup()", "run_alembic_upgrade()", "alembic_version_exists()"]
---

# Q: if i deploy this code will it automatically take care of the migration ?

## Answer

Expanded from original query via graph vocabulary: deploy, deployment, backend, startup, lifespan, database, alembic, migration, upgrade, revision, head, automatic. Yes, provided the updated FastAPI backend starts successfully against the same persistent database. lifespan calls _migrate_database_on_startup before serving requests. If alembic_version exists, run_alembic_upgrade applies one revision at a time until the current head. A database at 0016 should therefore be upgraded automatically to 0017. Migration failure occurs before lifespan yields, so the new backend should fail startup instead of serving with the old schema. Required conditions are the correct DATABASE_URL or mounted SQLite volume, database write permission, and an actual backend restart. Back up the database and verify startup logs plus SELECT version_num FROM alembic_version returning 0017.

## Outcome

- Signal: useful

## Source Nodes

- Automatic Alembic Migrations
- lifespan()
- _migrate_database_on_startup()
- run_alembic_upgrade()
- alembic_version_exists()