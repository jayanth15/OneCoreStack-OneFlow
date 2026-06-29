# OneFlow Backend Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the OneFlow backend from a working-but-fragile codebase with hand-written SQL migrations, duplicated patterns, no relationships, and security gaps into a professional, maintainable FastAPI application with Alembic migrations, shared utilities, proper ORM relationships, typed schemas, and security hardening.

**Architecture:** Token-first migration to Alembic (scaffold to current schema, stamp existing DBs, delete 1,500 lines of legacy migration code). Then extract shared utilities (pagination, soft-delete, history), add model relationships, introduce enums, create Pydantic schemas for unvalidated endpoints, fix security gaps, add logging, and fix N+1 queries.

**Tech Stack:** FastAPI 0.133.1, SQLModel 0.0.37, SQLAlchemy 2.0.47, Alembic 1.18.4, SQLite, Python 3.12+.

---

## Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | Full backend overhaul (all 12 issues) |
| Tests | Skip for now — focus on migrations + code quality |
| Alembic cutover | Scaffold to current state, stamp existing DBs, delete legacy code |
| PostgreSQL | SQLite only for now |

---

## Phase 1 — Alembic Migration System

**Goal:** Replace 1,500+ lines of hand-written migration SQL with Alembic. Existing DBs get caught up by legacy migrations one final time, then stamped.

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/`
- Create: `backend/alembic/versions/0001_baseline.py`
- Modify: `backend/app/main.py` — remove 40+ `_migrate_*()` functions, replace lifespan with Alembic upgrade
- Modify: `backend/app/core/database.py` — remove `run_migrations()`, keep `init_db()` + `get_session()`
- Modify: `backend/app/core/config.py` — add `auto_seed_admin: bool = False`

- [ ] Step 1: Initialize Alembic (`alembic init alembic`)
- [ ] Step 2: Configure `alembic/env.py` to use SQLModel metadata + settings.database_url
- [ ] Step 3: Generate baseline migration from current schema
- [ ] Step 4: Add legacy catch-up logic to main.py lifespan (run old migrations once if no alembic_version table, then stamp)
- [ ] Step 5: Delete all `_migrate_*()` functions from main.py
- [ ] Step 6: Delete `run_migrations()` from database.py
- [ ] Step 7: Gate auto-seed behind `settings.auto_seed_admin`
- [ ] Step 8: Verify — `python -c "from app.main import app"` + boot test

## Phase 2 — Shared Utilities

**Files:**
- Create: `backend/app/core/pagination.py`, `backend/app/core/crud.py`, `backend/app/core/history.py`
- Modify: all 27 routers

- [ ] Step 1: Create `paginate()` utility
- [ ] Step 2: Create `soft_delete()` utility
- [ ] Step 3: Create `write_history()` utility
- [ ] Step 4: Migrate dispatch/gate_passes/purchase_orders from load-all-then-slice to DB pagination
- [ ] Step 5: Replace inline pagination in all routers
- [ ] Step 6: Replace inline soft-delete in all routers

## Phase 3 — Model Relationships

**Files:**
- Modify: `backend/app/models/*.py`
- Modify: `backend/app/routers/history.py`, `backend/app/routers/inventory.py`

- [ ] Step 1: Add Relationship() to User/Department/Request/InventoryItem/SpareItem
- [ ] Step 2: Refactor history.py into generic function
- [ ] Step 3: Fix inventory.py N+1 queries

## Phase 4 — Enums + Auth Consolidation

**Files:**
- Create: `backend/app/core/enums.py`
- Modify: `backend/app/dependencies/auth.py`, all routers

- [ ] Step 1: Create Role/Status enums
- [ ] Step 2: Add permission dependencies
- [ ] Step 3: Fix super_admin exclusion bug
- [ ] Step 4: Adopt type-alias pattern across all routers
- [ ] Step 5: Replace string literals with enums

## Phase 5 — Pydantic Schemas

**Files:**
- Create: `backend/app/schemas/*.py`
- Modify: corresponding routers

- [ ] Step 1: Create schemas for dispatch, gate passes, purchase orders, suppliers, vendors
- [ ] Step 2: Move inline schemas from dashboard.py/history.py
- [ ] Step 3: Add response_model to bare-dict endpoints
- [ ] Step 4: Replace dict[str, Any] endpoints with typed schemas

## Phase 6 — Security Fixes

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/routers/auth.py`, `backend/app/main.py`, `backend/app/routers/settings.py`

- [ ] Step 1: Add environment + cookie_secure settings
- [ ] Step 2: Startup guard for default SECRET_KEY
- [ ] Step 3: Fix refresh cookie secure flag
- [ ] Step 4: Fix CORS default
- [ ] Step 5: Add rate limiting on login/refresh
- [ ] Step 6: Add global exception handler
- [ ] Step 7: Fix error detail leakage

## Phase 7 — Logging + N+1 + Health

**Files:**
- Modify: `backend/app/main.py`, all routers, `backend/app/routers/inventory.py`

- [ ] Step 1: Configure logging
- [ ] Step 2: Add request-ID middleware
- [ ] Step 3: Add logger to every router
- [ ] Step 4: Fix inventory.py N+1 queries
- [ ] Step 5: Update /health with DB check

## Phase 8 — Operational Fixes

**Files:**
- Modify: `backend/Procfile`, `backend/app/core/backup.py`, `backend/seed.py`, `backend/pyproject.toml`

- [ ] Step 1: Fix Procfile
- [ ] Step 2: Config-driven backup settings
- [ ] Step 3: Remove plaintext passwords from seed.py
- [ ] Step 4: Reconcile Python version
- [ ] Step 5: Fix notifications.py limit bug
- [ ] Step 6: Fix deprecated datetime.utcnow()
