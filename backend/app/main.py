from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.routers import auth as auth_router
from app.routers import bom as bom_router
from app.routers import customers as customers_router
from app.routers import dashboard as dashboard_router
from app.routers import departments as departments_router
from app.routers import inventory as inventory_router
from app.routers import production as production_router
from app.routers import schedule as schedule_router
from app.routers import users as users_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    _migrate_schedule_created_at()
    _migrate_production_plan_v2()
    _migrate_production_plan_v3()
    _migrate_departments_description()
    # Migrate schedule customer names → Customer table (runs once, idempotent)
    _seed_customers_from_schedules()
    yield


def _migrate_schedule_created_at() -> None:
    """Add created_at column to schedule table if it doesn't exist (SQLite)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(schedule)")).fetchall()]
        if "created_at" not in cols:
            conn.execute(text("ALTER TABLE schedule ADD COLUMN created_at TEXT"))
            conn.commit()


def _migrate_departments_description() -> None:
    """Add description column to departments table if it doesn't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(departments)")).fetchall()]
        if "description" not in cols:
            conn.execute(text("ALTER TABLE departments ADD COLUMN description TEXT"))
            conn.commit()


def _migrate_production_plan_v2() -> None:
    """
    Migrate production_plan to the new schedule-linked schema.

    Strategy:
    - If old columns (manpower) exist: rebuild the table with the new schema,
      preserving id, plan_number, title, notes, status, is_active.
    - If already migrated but new columns missing: ADD COLUMN (idempotent).
    """
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(production_plan)")).fetchall()]

        if "manpower" in existing:
            # OLD schema (or partial migration) → rebuild to drop old columns + NOT NULL constraints
            conn.execute(text("PRAGMA foreign_keys = OFF"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS production_plan_v2 (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_number TEXT NOT NULL UNIQUE,
                    title       TEXT NOT NULL,
                    schedule_id INTEGER REFERENCES schedule(id),
                    planned_qty REAL NOT NULL DEFAULT 0.0,
                    start_date  TEXT,
                    end_date    TEXT,
                    process     TEXT,
                    department  TEXT,
                    assigned_to TEXT,
                    notes       TEXT,
                    status      TEXT NOT NULL DEFAULT 'draft',
                    is_active   INTEGER NOT NULL DEFAULT 1
                )
            """))
            conn.execute(text("""
                INSERT INTO production_plan_v2 (id, plan_number, title, notes, status, is_active)
                SELECT id, plan_number, title, notes, status, is_active
                FROM production_plan
            """))
            conn.execute(text("DROP TABLE production_plan"))
            conn.execute(text("ALTER TABLE production_plan_v2 RENAME TO production_plan"))
            conn.execute(text("PRAGMA foreign_keys = ON"))
            conn.commit()
        else:
            # New schema: ADD any missing columns idempotently
            new_columns = [
                ("schedule_id",  "INTEGER"),
                ("planned_qty",  "REAL NOT NULL DEFAULT 0.0"),
                ("start_date",   "TEXT"),
                ("end_date",     "TEXT"),
                ("process",      "TEXT"),
                ("department",   "TEXT"),
                ("assigned_to",  "TEXT"),
            ]
            changed = False
            for col_name, col_type in new_columns:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE production_plan ADD COLUMN {col_name} {col_type}"))
                    changed = True
            if changed:
                conn.commit()


def _migrate_production_plan_v3() -> None:
    """
    v3: Remove process/department/assigned_to columns (no longer on plan);
    create production_process table for multi-step process management.
    Uses table rebuild to drop columns (SQLite doesn't support DROP COLUMN easily).
    Creates production_process table idempotently.
    """
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(production_plan)")).fetchall()]

        # Rebuild if old columns present
        if any(c in existing for c in ("process", "department", "assigned_to")):
            conn.execute(text("PRAGMA foreign_keys = OFF"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS production_plan_v3 (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    plan_number TEXT NOT NULL UNIQUE,
                    title       TEXT NOT NULL,
                    schedule_id INTEGER REFERENCES schedule(id),
                    planned_qty REAL NOT NULL DEFAULT 0.0,
                    start_date  TEXT,
                    end_date    TEXT,
                    notes       TEXT,
                    status      TEXT NOT NULL DEFAULT 'draft',
                    is_active   INTEGER NOT NULL DEFAULT 1
                )
            """))
            conn.execute(text("""
                INSERT INTO production_plan_v3
                    (id, plan_number, title, schedule_id, planned_qty, start_date, end_date, notes, status, is_active)
                SELECT id, plan_number, title, schedule_id, COALESCE(planned_qty,0),
                       start_date, end_date, notes, status, is_active
                FROM production_plan
            """))
            conn.execute(text("DROP TABLE production_plan"))
            conn.execute(text("ALTER TABLE production_plan_v3 RENAME TO production_plan"))
            conn.execute(text("PRAGMA foreign_keys = ON"))
            conn.commit()

        # Create production_process table if not exists
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS production_process (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id  INTEGER NOT NULL REFERENCES production_plan(id),
                name     TEXT NOT NULL,
                sequence INTEGER NOT NULL DEFAULT 0,
                notes    TEXT
            )
        """))
        conn.commit()


def _seed_customers_from_schedules() -> None:
    """
    One-time idempotent migration: copy unique customer_name values from existing
    Schedule rows into the Customer table so the dropdown is pre-populated.
    """
    from app.core.database import engine
    from app.models.customer import Customer
    from app.models.schedule import Schedule
    from sqlmodel import Session, select

    with Session(engine) as session:
        existing_names = {
            c.name for c in session.exec(select(Customer)).all()
        }
        schedule_names = {
            s.customer_name for s in session.exec(select(Schedule)).all()
        }
        for name in sorted(schedule_names - existing_names):
            if name and name.strip():
                session.add(Customer(name=name.strip()))
        session.commit()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core routers (always on) ──────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(bom_router.router)
app.include_router(customers_router.router)
app.include_router(dashboard_router.router)
app.include_router(departments_router.router)
app.include_router(inventory_router.router)
app.include_router(production_router.router)
app.include_router(schedule_router.router)
app.include_router(users_router.router)

# ── Optional module routers (enabled by env var) ──────────────────────────────
# Example:
# if settings.module_planning:
#     from app.routers import planning
#     app.include_router(planning.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
