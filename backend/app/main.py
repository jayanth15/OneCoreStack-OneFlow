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
from app.routers import spares as spares_router
from app.routers import work_types as work_types_router
from app.routers import consumables as consumables_router
from app.models.spare_sub_category import SpareSubCategory  # noqa: F401 — ensures table is created
from app.models.consumable import Consumable  # noqa: F401 — ensures table is created


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    _migrate_schedule_created_at()
    _migrate_production_plan_v2()
    _migrate_production_plan_v3()
    _migrate_departments_description()
    _migrate_job_card_worker_id()
    # Migrate schedule customer names → Customer table (runs once, idempotent)
    _seed_customers_from_schedules()
    # Migrate spare_item table to v2 schema (new fields)
    _migrate_spare_item_v2()
    # Migrate spare_item to v3: add sub_category_id column
    _migrate_spare_item_v3()
    # Auto-seed a default admin user on a brand-new / empty database
    _auto_seed_if_empty()
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


def _migrate_job_card_worker_id() -> None:
    """Add worker_id FK column to job_card table if it doesn't exist.
    Also back-fill from worker_name → users.username."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(job_card)")).fetchall()]
        if "worker_id" not in cols:
            conn.execute(text("ALTER TABLE job_card ADD COLUMN worker_id INTEGER REFERENCES users(id)"))
            # Back-fill worker_id from worker_name
            conn.execute(text("""
                UPDATE job_card
                SET worker_id = (
                    SELECT u.id FROM users u WHERE u.username = job_card.worker_name
                )
                WHERE worker_name IS NOT NULL
            """))
            conn.commit()


def _migrate_spare_item_v2() -> None:
    """
    Migrate spare_item to v2 schema (idempotent).

    Phase 1 – ADD new columns if missing (fast path for fresh DBs).
    Phase 2 – If the legacy quantity_on_hand column still exists, rebuild the
               table to drop it (and its NOT NULL constraint) so that INSERTs
               from the new SQLModel model no longer fail.
    """
    from app.core.database import engine
    from sqlalchemy import text

    new_columns = [
        ("part_description", "TEXT"),
        ("variant_model",    "TEXT"),
        ("rate",             "REAL"),
        ("opening_qty",      "REAL NOT NULL DEFAULT 0.0"),
        ("recorded_qty",     "REAL NOT NULL DEFAULT 0.0"),
        ("storage_type",     "TEXT"),
        ("tags",             "TEXT"),
        ("image_base64",     "TEXT"),
        ("created_at",       "TEXT"),
        ("updated_at",       "TEXT"),
    ]
    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(spare_item)")).fetchall()]

        # Phase 1: add any missing v2 columns
        for col_name, col_def in new_columns:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE spare_item ADD COLUMN {col_name} {col_def}"))
        conn.commit()

        # Refresh column list after phase 1
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(spare_item)")).fetchall()]

        # Phase 2: if the old quantity_on_hand column still exists, rebuild the table
        if "quantity_on_hand" in existing:
            # Seed recorded_qty from quantity_on_hand before dropping it
            conn.execute(text("""
                UPDATE spare_item SET recorded_qty = quantity_on_hand
                WHERE recorded_qty = 0.0 AND quantity_on_hand > 0
            """))
            conn.execute(text("""
                UPDATE spare_item SET opening_qty = quantity_on_hand
                WHERE opening_qty = 0.0 AND quantity_on_hand > 0
            """))

            # SQLite table rebuild to drop quantity_on_hand (and legacy cols)
            # ── Step 1: create new table with correct schema ──────────────────
            conn.execute(text("""
                CREATE TABLE spare_item_new (
                    id              INTEGER PRIMARY KEY,
                    category_id     INTEGER NOT NULL REFERENCES spare_category(id),
                    name            TEXT    NOT NULL,
                    part_number     TEXT,
                    part_description TEXT,
                    variant_model   TEXT,
                    rate            REAL,
                    unit            TEXT    NOT NULL DEFAULT 'pcs',
                    opening_qty     REAL    NOT NULL DEFAULT 0.0,
                    recorded_qty    REAL    NOT NULL DEFAULT 0.0,
                    reorder_level   REAL    NOT NULL DEFAULT 0.0,
                    storage_type    TEXT,
                    tags            TEXT,
                    image_base64    TEXT,
                    is_active       INTEGER NOT NULL DEFAULT 1,
                    created_at      TEXT,
                    updated_at      TEXT
                )
            """))

            # ── Step 2: copy data, mapping old columns → new ──────────────────
            # Determine which columns actually exist to build a safe SELECT list
            copy_cols = [
                "id", "category_id", "name", "part_number", "part_description",
                "variant_model", "rate", "unit", "opening_qty", "recorded_qty",
                "reorder_level", "storage_type", "tags", "image_base64",
                "is_active", "created_at", "updated_at",
            ]
            safe_select = ", ".join(
                col if col in existing else f"NULL AS {col}"
                for col in copy_cols
            )
            conn.execute(text(f"""
                INSERT INTO spare_item_new ({', '.join(copy_cols)})
                SELECT {safe_select} FROM spare_item
            """))

            # ── Step 3: swap tables ───────────────────────────────────────────
            conn.execute(text("DROP TABLE spare_item"))
            conn.execute(text("ALTER TABLE spare_item_new RENAME TO spare_item"))
            conn.commit()
    # Phase 3: backfill NULL created_at / updated_at for any legacy rows
    from datetime import datetime, timezone
    with engine.connect() as conn:
        now_str = datetime.now(tz=timezone.utc).isoformat()
        conn.execute(text(f"UPDATE spare_item SET created_at = '{now_str}' WHERE created_at IS NULL"))
        conn.execute(text(f"UPDATE spare_item SET updated_at = '{now_str}' WHERE updated_at IS NULL"))
        conn.commit()

def _migrate_spare_item_v3() -> None:
    """Add sub_category_id column to spare_item (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(spare_item)")).fetchall()]
        if "sub_category_id" not in existing:
            conn.execute(text(
                "ALTER TABLE spare_item ADD COLUMN sub_category_id INTEGER REFERENCES spare_sub_category(id)"
            ))
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


def _auto_seed_if_empty() -> None:
    """If the database has no users at all (fresh deployment), create a default
    super_admin account so the app is immediately usable.
    Credentials: username=admin  password=admin123
    Change the password immediately after first login.
    """
    from app.core.database import engine
    from app.core.security import hash_password
    from app.models.user import User
    from sqlmodel import Session, select

    with Session(engine) as session:
        existing = session.exec(select(User)).first()
        if existing:
            return  # DB already has users — do nothing

        default_admin = User(
            username="admin",
            email="admin@oneflow.local",
            password_hash=hash_password("admin123"),
            role="super_admin",
            is_active=True,
        )
        session.add(default_admin)
        session.commit()
        import logging
        logging.getLogger("oneflow").warning(
            "[AUTO-SEED] No users found — created default super_admin: "
            "username=admin  password=admin123  — CHANGE THIS PASSWORD NOW!"
        )


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
app.include_router(work_types_router.router)
app.include_router(spares_router.router)
app.include_router(consumables_router.router)

# ── Optional module routers (enabled by env var) ──────────────────────────────
# Example:
# if settings.module_planning:
#     from app.routers import planning
#     app.include_router(planning.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
