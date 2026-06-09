from contextlib import asynccontextmanager
import json
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, run_migrations
from app.core.backup import start_scheduler
from app.routers import auth as auth_router
from app.routers import bom as bom_router
from app.routers import vendors as vendors_router
from app.routers import suppliers as suppliers_router
from app.routers import dispatch as dispatch_router
from app.routers import gate_passes as gate_passes_router
from app.routers import purchase_orders as purchase_orders_router
from app.routers import dashboard as dashboard_router
from app.routers import departments as departments_router
from app.routers import inventory as inventory_router
from app.routers import production as production_router
from app.routers import schedule as schedule_router
from app.routers import users as users_router
from app.routers import spares as spares_router
from app.routers import work_types as work_types_router
from app.routers import consumables as consumables_router
from app.routers import settings as settings_router
from app.routers import attachments as attachments_router
from app.routers import weeders as weeders_router
from app.routers import purchase_requests as purchase_requests_router
from app.routers import marketing_requests as marketing_requests_router
from app.routers import receipts as receipts_router
from app.routers import notifications as notifications_router
from app.routers import grn as grn_router
from app.routers import history as history_router
from app.models.spare_sub_category import SpareSubCategory  # noqa: F401 — ensures table is created
from app.models.consumable import Consumable  # noqa: F401 — ensures table is created
from app.models.consumable_history import ConsumableHistory  # noqa: F401 — ensures table is created
from app.models.spare_item_history import SpareItemHistory  # noqa: F401 — ensures table is created
from app.models.spare_item_variant import SpareItemVariant  # noqa: F401 — ensures table is created
from app.models.company_settings import CompanySettings  # noqa: F401 — ensures table is created
from app.models.attachment_item import AttachmentItem  # noqa: F401 — ensures table is created
from app.models.attachment_history import AttachmentHistory  # noqa: F401 — ensures table is created
from app.models.weeder_item import WeederItem  # noqa: F401 — ensures table is created
from app.models.weeder_history import WeederHistory  # noqa: F401 — ensures table is created
from app.models.purchase_request import PurchaseRequest  # noqa: F401 — ensures table is created
from app.models.purchase_request_history import PurchaseRequestHistory  # noqa: F401 — ensures table is created
from app.models.purchase_request_item import PurchaseRequestItem  # noqa: F401 — ensures table is created
from app.models.marketing_request import MarketingRequest  # noqa: F401 — ensures table is created
from app.models.marketing_request_history import MarketingRequestHistory  # noqa: F401 — ensures table is created
from app.models.dispatch import Dispatch  # noqa: F401 — ensures table is created
from app.models.dispatch_item import DispatchItem  # noqa: F401 — ensures table is created
from app.models.dispatch_history import DispatchHistory  # noqa: F401 — ensures table is created
from app.models.gate_pass import GatePass  # noqa: F401 — ensures table is created
from app.models.gate_pass_item import GatePassItem  # noqa: F401 — ensures table is created
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem  # noqa: F401 — ensures table is created
from app.models.supplier_job import SupplierJob  # noqa: F401 — ensures table is created
from app.models.supplier_material import SupplierMaterial  # noqa: F401 — ensures table is created


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    run_migrations()
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
    # Migrate spare_item to v4: add storage_location column
    _migrate_spare_item_v4()
    # Migrate consumable to v2: add qty column
    _migrate_consumable_v2()
    # Create consumable_history table
    _migrate_consumable_history()
    # Migrate consumable to v3: add storage_type column
    _migrate_consumable_v3()
    # Migrate consumable to v4: add reorder_level column
    _migrate_consumable_v4()
    # Create spare_item_history table
    _migrate_spare_item_history()
    # Create spare_item_variant table
    _migrate_spare_item_variant()
    # Add inventory_access column to users table
    _migrate_user_inventory_access()
    # Create company_settings table
    _migrate_company_settings()
    # Create attachment_item + attachment_history tables
    _migrate_attachment_tables()
    # Create weeder_item + weeder_history tables
    _migrate_weeder_tables()
    # Create purchase_request + purchase_request_history tables
    _migrate_purchase_request_tables()
    # Migrate existing purchase_request rows to purchase_request_item table
    _migrate_purchase_request_items()
    # Create marketing_request + marketing_request_history tables
    _migrate_marketing_request_tables()
    # Create grn_record + grn_item tables
    _migrate_grn_tables()
    # Add new columns to grn_record and grn_item (v2 additions)
    _migrate_grn_v2()
    # Add quantity_pr_requested column to grn_item (v3)
    _migrate_grn_v3()
    # Add changed_by_username to inventory_history and job_card_history
    _migrate_history_username_columns()
    # Rename customers table to vendors (idempotent)
    _migrate_customers_to_vendors()
    # Create suppliers table
    _migrate_suppliers_table()
    # Add job_type + supplier fields to job_card table
    _migrate_job_card_supplier_fields()
    # Add dispatch/gate_pass/purchase_access columns to users table
    _migrate_user_access_flags()
    # Create dispatch, gate_pass, purchase_order tables
    _migrate_new_module_tables()
    # Add supplier/party fields to dispatch; vendor/party fields to purchase_order
    _migrate_dispatch_supplier_fields()
    _migrate_po_vendor_fields()
    # Add estimated_time_minutes, material_qty, waste_qty, material_unit to production_process
    _migrate_production_process_v2()
    # Add worker_names JSON column to job_card table
    _migrate_job_card_worker_names()
    # Add purchase_request_id/number to gate_pass and purchase_order
    _migrate_gate_pass_pr_fields()
    _migrate_po_pr_fields()
    # Create dispatch_history table
    _migrate_dispatch_history_table()
    # supplier_jobs and supplier_materials tables created by init_db via SQLModel metadata
    # Auto-seed a default admin user on a brand-new / empty database
    _auto_seed_if_empty()
    # Start daily DB backup scheduler (fires at 17:30 every day)
    start_scheduler()
    yield


def _migrate_schedule_created_at() -> None:
    """Add created_at and customer_id columns to schedule table if they don't exist (SQLite)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(schedule)")).fetchall()]
        if "created_at" not in cols:
            conn.execute(text("ALTER TABLE schedule ADD COLUMN created_at TEXT"))
            conn.commit()
        if "customer_id" not in cols:
            conn.execute(text("ALTER TABLE schedule ADD COLUMN customer_id INTEGER REFERENCES vendors(id)"))
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


def _migrate_new_module_tables() -> None:
    """Create dispatch, gate_pass, purchase_order, purchase_order_item tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}

        if "dispatch" not in tables:
            conn.execute(text("""
                CREATE TABLE dispatch (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dispatch_number TEXT NOT NULL UNIQUE,
                    vendor_id INTEGER,
                    vendor_name TEXT,
                    schedule_id INTEGER,
                    schedule_number TEXT,
                    product_name TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 0,
                    unit TEXT,
                    dispatch_date TEXT,
                    vehicle_number TEXT,
                    driver_name TEXT,
                    notes TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_by TEXT,
                    created_at TEXT
                )
            """))

        if "gate_pass" not in tables:
            conn.execute(text("""
                CREATE TABLE gate_pass (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gate_pass_number TEXT NOT NULL UNIQUE,
                    pass_type TEXT NOT NULL DEFAULT 'out',
                    vendor_id INTEGER,
                    vendor_name TEXT,
                    supplier_id INTEGER,
                    supplier_name TEXT,
                    material TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 0,
                    unit TEXT,
                    purpose TEXT,
                    vehicle_number TEXT,
                    date TEXT,
                    notes TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_by TEXT,
                    created_at TEXT
                )
            """))

        if "purchase_order" not in tables:
            conn.execute(text("""
                CREATE TABLE purchase_order (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    po_number TEXT NOT NULL UNIQUE,
                    supplier_id INTEGER,
                    supplier_name TEXT,
                    po_date TEXT,
                    expected_delivery TEXT,
                    notes TEXT,
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_by TEXT,
                    created_at TEXT
                )
            """))

        if "purchase_order_item" not in tables:
            conn.execute(text("""
                CREATE TABLE purchase_order_item (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_order_id INTEGER NOT NULL REFERENCES purchase_order(id),
                    item_name TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 0,
                    unit TEXT,
                    rate REAL,
                    notes TEXT
                )
            """))

        conn.commit()


def _migrate_user_access_flags() -> None:
    """Add dispatch_access, gate_pass_access, purchase_access columns to users table."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
        if "dispatch_access" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN dispatch_access INTEGER NOT NULL DEFAULT 0"))
        if "gate_pass_access" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN gate_pass_access INTEGER NOT NULL DEFAULT 0"))
        if "purchase_access" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN purchase_access INTEGER NOT NULL DEFAULT 0"))
        conn.commit()


def _migrate_job_card_supplier_fields() -> None:
    """Add job_type, supplier_id, supplier_name columns to job_card table."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(job_card)")).fetchall()]
        if "job_type" not in cols:
            conn.execute(text("ALTER TABLE job_card ADD COLUMN job_type TEXT NOT NULL DEFAULT 'internal'"))
        if "supplier_id" not in cols:
            conn.execute(text("ALTER TABLE job_card ADD COLUMN supplier_id INTEGER"))
        if "supplier_name" not in cols:
            conn.execute(text("ALTER TABLE job_card ADD COLUMN supplier_name TEXT"))
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


def _migrate_spare_item_v4() -> None:
    """Add storage_location column to spare_item (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(spare_item)")).fetchall()]
        if "storage_location" not in existing:
            conn.execute(text("ALTER TABLE spare_item ADD COLUMN storage_location TEXT"))
            conn.commit()


def _migrate_consumable_v2() -> None:
    """Add qty column to consumable table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(consumable)")).fetchall()]
        if "qty" not in existing:
            conn.execute(text("ALTER TABLE consumable ADD COLUMN qty REAL NOT NULL DEFAULT 0.0"))
            conn.commit()


def _migrate_consumable_history() -> None:
    """Create consumable_history table if it doesn't exist (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS consumable_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                consumable_id         INTEGER NOT NULL REFERENCES consumable(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                qty_before            REAL NOT NULL,
                qty_after             REAL NOT NULL,
                qty_delta             REAL NOT NULL,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_consumable_v3() -> None:
    """Add storage_type column to consumable table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(consumable)")).fetchall()]
        if "storage_type" not in existing:
            conn.execute(text("ALTER TABLE consumable ADD COLUMN storage_type TEXT"))
            conn.commit()


def _migrate_consumable_v4() -> None:
    """Add reorder_level column to consumable table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        existing = [row[1] for row in conn.execute(text("PRAGMA table_info(consumable)")).fetchall()]
        if "reorder_level" not in existing:
            conn.execute(text("ALTER TABLE consumable ADD COLUMN reorder_level REAL NOT NULL DEFAULT 0.0"))
            conn.commit()


def _migrate_spare_item_history() -> None:
    """Create spare_item_history table if it doesn't exist (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS spare_item_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                spare_item_id         INTEGER NOT NULL REFERENCES spare_item(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                qty_before            REAL NOT NULL,
                qty_after             REAL NOT NULL,
                qty_delta             REAL NOT NULL,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_spare_item_variant() -> None:
    """Create spare_item_variant table if it doesn't exist (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS spare_item_variant (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                spare_item_id   INTEGER NOT NULL REFERENCES spare_item(id),
                serial_number   TEXT,
                variant_color   TEXT,
                image_base64    TEXT,
                qty             REAL NOT NULL DEFAULT 0.0,
                storage_location TEXT,
                storage_type    TEXT,
                rate            REAL,
                is_active       INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT,
                updated_at      TEXT
            )
        """))
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
    Schedule rows into the Vendor table so the dropdown is pre-populated.
    """
    from app.core.database import engine
    from app.models.vendor import Vendor
    from app.models.schedule import Schedule
    from sqlmodel import Session, select

    with Session(engine) as session:
        existing_names = {
            v.name for v in session.exec(select(Vendor)).all()
        }
        schedule_names = {
            s.customer_name for s in session.exec(select(Schedule)).all()
        }
        for name in sorted(schedule_names - existing_names):
            if name and name.strip():
                session.add(Vendor(name=name.strip()))
        session.commit()


def _migrate_user_inventory_access() -> None:
    """Add inventory_access column to users table if it doesn't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
        if "inventory_access" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN inventory_access TEXT NOT NULL DEFAULT ''"))
            conn.commit()


def _migrate_company_settings() -> None:
    """Create company_settings table if it does not exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS company_settings (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                key   TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL DEFAULT ''
            )
        """))
        conn.commit()


def _migrate_attachment_tables() -> None:
    """Create attachment_item and attachment_history tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS attachment_item (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                sn_no            TEXT,
                description      TEXT,
                qty              REAL NOT NULL DEFAULT 0.0,
                reorder_level    REAL NOT NULL DEFAULT 0.0,
                rate_per_unit    REAL,
                storage_location TEXT,
                image_base64     TEXT,
                is_active        INTEGER NOT NULL DEFAULT 1,
                created_at       TEXT,
                updated_at       TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS attachment_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                attachment_id         INTEGER NOT NULL REFERENCES attachment_item(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                qty_before            REAL NOT NULL,
                qty_after             REAL NOT NULL,
                qty_delta             REAL NOT NULL,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_weeder_tables() -> None:
    """Create weeder_item and weeder_history tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS weeder_item (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                sn_no            TEXT,
                description      TEXT,
                qty              REAL NOT NULL DEFAULT 0.0,
                reorder_level    REAL NOT NULL DEFAULT 0.0,
                rate_per_unit    REAL,
                storage_location TEXT,
                image_base64     TEXT,
                is_active        INTEGER NOT NULL DEFAULT 1,
                created_at       TEXT,
                updated_at       TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS weeder_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                weeder_id             INTEGER NOT NULL REFERENCES weeder_item(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                qty_before            REAL NOT NULL,
                qty_after             REAL NOT NULL,
                qty_delta             REAL NOT NULL,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_purchase_request_tables() -> None:
    """Create purchase_request and purchase_request_history tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS purchase_request (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                sn_no                   TEXT NOT NULL,
                inventory_item_id       INTEGER,
                item_name               TEXT,
                item_code               TEXT,
                item_type               TEXT,
                description             TEXT,
                quantity                REAL NOT NULL DEFAULT 1.0,
                from_whom               TEXT,
                timeline_days           INTEGER,
                notes                   TEXT,
                status                  TEXT NOT NULL DEFAULT 'pending',
                requested_by_user_id    INTEGER REFERENCES users(id),
                requested_by_username   TEXT,
                department              TEXT,
                reviewed_by_user_id     INTEGER REFERENCES users(id),
                reviewed_by_username    TEXT,
                reviewed_at             TEXT,
                review_note             TEXT,
                is_active               INTEGER NOT NULL DEFAULT 1,
                created_at              TEXT NOT NULL,
                updated_at              TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS purchase_request_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id            INTEGER NOT NULL REFERENCES purchase_request(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                field_name            TEXT,
                old_value             TEXT,
                new_value             TEXT,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_marketing_request_tables() -> None:
    """Create marketing_request and marketing_request_history tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS marketing_request (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                sn_no                   TEXT NOT NULL,
                inventory_type          TEXT NOT NULL DEFAULT 'weeder',
                item_id                 INTEGER,
                item_sn_no              TEXT,
                item_description        TEXT,
                quantity                REAL NOT NULL DEFAULT 1.0,
                timeline_days           INTEGER,
                customer_name           TEXT,
                customer_phone          TEXT,
                customer_address        TEXT,
                bought_by               TEXT,
                delivery_type           TEXT,
                remarks                 TEXT,
                status                  TEXT NOT NULL DEFAULT 'pending',
                requested_by_user_id    INTEGER REFERENCES users(id),
                requested_by_username   TEXT,
                department              TEXT,
                reviewed_by_user_id     INTEGER REFERENCES users(id),
                reviewed_by_username    TEXT,
                reviewed_at             TEXT,
                review_note             TEXT,
                is_active               INTEGER NOT NULL DEFAULT 1,
                created_at              TEXT NOT NULL,
                updated_at              TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS marketing_request_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id            INTEGER NOT NULL REFERENCES marketing_request(id),
                changed_by_user_id    INTEGER REFERENCES users(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL,
                field_name            TEXT,
                old_value             TEXT,
                new_value             TEXT,
                note                  TEXT
            )
        """))
        conn.commit()


def _migrate_grn_tables() -> None:
    """Create grn_record and grn_item tables if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS grn_record (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                grn_number              TEXT NOT NULL,
                transport_type          TEXT NOT NULL DEFAULT 'own',
                vehicle_number          TEXT,
                received_by_user_id     INTEGER REFERENCES users(id),
                received_by_username    TEXT,
                notes                   TEXT,
                status                  TEXT NOT NULL DEFAULT 'draft',
                stock_filled_by_user_id INTEGER REFERENCES users(id),
                stock_filled_by_username TEXT,
                stock_filled_at         TEXT,
                is_active               INTEGER NOT NULL DEFAULT 1,
                created_at              TEXT NOT NULL,
                updated_at              TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS grn_item (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                grn_id              INTEGER NOT NULL REFERENCES grn_record(id),
                inventory_item_id   INTEGER REFERENCES inventory_item(id),
                item_name           TEXT,
                item_code           TEXT,
                item_type           TEXT,
                unit                TEXT,
                quantity_received   REAL NOT NULL DEFAULT 0.0
            )
        """))
        conn.commit()


def _migrate_grn_v2() -> None:
    """Add v2 columns to grn_record and grn_item if they don't exist."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        grn_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(grn_record)")).fetchall()}
        for col, defn in [
            ("inspected_by_user_id", "INTEGER"),
            ("inspected_by_username", "TEXT"),
            ("purchase_request_id", "INTEGER"),
            ("po_number", "TEXT"),
            ("dc_number", "TEXT"),
        ]:
            if col not in grn_cols:
                conn.execute(text(f"ALTER TABLE grn_record ADD COLUMN {col} {defn}"))

        item_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(grn_item)")).fetchall()}
        for col, defn in [
            ("quantity_filled", "REAL NOT NULL DEFAULT 0.0"),
            ("quantity_returned", "REAL NOT NULL DEFAULT 0.0"),
        ]:
            if col not in item_cols:
                conn.execute(text(f"ALTER TABLE grn_item ADD COLUMN {col} {defn}"))

        conn.commit()


def _migrate_grn_v3() -> None:
    """Add quantity_pr_requested column to grn_item."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        item_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(grn_item)")).fetchall()}
        if "quantity_pr_requested" not in item_cols:
            conn.execute(text("ALTER TABLE grn_item ADD COLUMN quantity_pr_requested REAL"))
        conn.commit()


def _migrate_purchase_request_items() -> None:
    """
    Create purchase_request_item table and migrate existing purchase_request
    row data (one item per request) into the new line-items table. Idempotent.
    """
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        # Create table if not exists
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS purchase_request_item (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id          INTEGER NOT NULL REFERENCES purchase_request(id),
                inventory_item_id   INTEGER,
                item_name           TEXT,
                item_code           TEXT,
                item_type           TEXT,
                description         TEXT,
                quantity            REAL NOT NULL DEFAULT 1.0,
                timeline_days       INTEGER
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_purchase_request_item_request_id "
            "ON purchase_request_item (request_id)"
        ))

        # Migrate legacy rows: any purchase_request that has an item_name or
        # inventory_item_id but no corresponding rows in purchase_request_item yet.
        conn.execute(text("""
            INSERT INTO purchase_request_item
                (request_id, inventory_item_id, item_name, item_code,
                 item_type, description, quantity, timeline_days)
            SELECT pr.id, pr.inventory_item_id, pr.item_name, pr.item_code,
                   pr.item_type, pr.description, COALESCE(pr.quantity, 1.0), pr.timeline_days
            FROM purchase_request pr
            WHERE (pr.item_name IS NOT NULL OR pr.inventory_item_id IS NOT NULL)
              AND pr.id NOT IN (
                  SELECT DISTINCT request_id FROM purchase_request_item
              )
        """))
        conn.commit()


def _migrate_history_username_columns() -> None:
    """Add changed_by_username column to inventory_history and job_card_history.
    Backfills existing rows by joining against the users table. Idempotent.
    """
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        # inventory_history
        ih_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(inventory_history)")).fetchall()}
        if "changed_by_username" not in ih_cols:
            conn.execute(text("ALTER TABLE inventory_history ADD COLUMN changed_by_username TEXT"))
            conn.execute(text("""
                UPDATE inventory_history
                SET changed_by_username = (
                    SELECT username FROM users WHERE users.id = inventory_history.changed_by_user_id
                )
                WHERE changed_by_user_id IS NOT NULL
            """))

        # job_card_history
        jch_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(job_card_history)")).fetchall()}
        if "changed_by_username" not in jch_cols:
            conn.execute(text("ALTER TABLE job_card_history ADD COLUMN changed_by_username TEXT"))
            conn.execute(text("""
                UPDATE job_card_history
                SET changed_by_username = (
                    SELECT username FROM users WHERE users.id = job_card_history.changed_by_user_id
                )
                WHERE changed_by_user_id IS NOT NULL
            """))

        conn.commit()


def _migrate_customers_to_vendors() -> None:
    """Rename the 'customers' table to 'vendors' (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
        if "customers" in tables and "vendors" not in tables:
            conn.execute(text("ALTER TABLE customers RENAME TO vendors"))
            conn.commit()


def _migrate_suppliers_table() -> None:
    """Create the suppliers table if it doesn't exist (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        tables = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()}
        if "suppliers" not in tables:
            conn.execute(text("""
                CREATE TABLE suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    contact_person TEXT,
                    phone TEXT,
                    email TEXT,
                    address TEXT,
                    notes TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT
                )
            """))
            conn.commit()


def _migrate_dispatch_supplier_fields() -> None:
    """Add supplier_id, supplier_name, party_type columns to dispatch table."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(dispatch)")).fetchall()]
        if "supplier_id" not in cols:
            conn.execute(text("ALTER TABLE dispatch ADD COLUMN supplier_id INTEGER"))
        if "supplier_name" not in cols:
            conn.execute(text("ALTER TABLE dispatch ADD COLUMN supplier_name TEXT"))
        if "party_type" not in cols:
            conn.execute(text("ALTER TABLE dispatch ADD COLUMN party_type TEXT NOT NULL DEFAULT 'vendor'"))
        conn.commit()


def _migrate_po_vendor_fields() -> None:
    """Add vendor_id, vendor_name, party_type columns to purchase_order table."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(purchase_order)")).fetchall()]
        if "vendor_id" not in cols:
            conn.execute(text("ALTER TABLE purchase_order ADD COLUMN vendor_id INTEGER"))
        if "vendor_name" not in cols:
            conn.execute(text("ALTER TABLE purchase_order ADD COLUMN vendor_name TEXT"))
        if "party_type" not in cols:
            conn.execute(text("ALTER TABLE purchase_order ADD COLUMN party_type TEXT NOT NULL DEFAULT 'supplier'"))
        conn.commit()


def _migrate_production_process_v2() -> None:
    """Add estimated_time_minutes, material_qty, waste_qty, material_unit columns
    to the production_process table (SQLite ALTER TABLE, idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(production_process)")).fetchall()]
        if "estimated_time_minutes" not in cols:
            conn.execute(text("ALTER TABLE production_process ADD COLUMN estimated_time_minutes REAL"))
        if "material_qty" not in cols:
            conn.execute(text("ALTER TABLE production_process ADD COLUMN material_qty REAL"))
        if "waste_qty" not in cols:
            conn.execute(text("ALTER TABLE production_process ADD COLUMN waste_qty REAL"))
        if "material_unit" not in cols:
            conn.execute(text("ALTER TABLE production_process ADD COLUMN material_unit TEXT"))
        conn.commit()


def _migrate_job_card_worker_names() -> None:
    """Add worker_names TEXT column (JSON array) to job_card table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(job_card)")).fetchall()]
        if "worker_names" not in cols:
            conn.execute(text("ALTER TABLE job_card ADD COLUMN worker_names TEXT"))
        conn.commit()


def _migrate_gate_pass_pr_fields() -> None:
    """Add purchase_request_id and purchase_request_number to gate_pass table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(gate_pass)")).fetchall()]
        if "purchase_request_id" not in cols:
            conn.execute(text("ALTER TABLE gate_pass ADD COLUMN purchase_request_id INTEGER"))
        if "purchase_request_number" not in cols:
            conn.execute(text("ALTER TABLE gate_pass ADD COLUMN purchase_request_number TEXT"))
        conn.commit()


def _migrate_po_pr_fields() -> None:
    """Add purchase_request_id and purchase_request_number to purchase_order table (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(purchase_order)")).fetchall()]
        if "purchase_request_id" not in cols:
            conn.execute(text("ALTER TABLE purchase_order ADD COLUMN purchase_request_id INTEGER"))
        if "purchase_request_number" not in cols:
            conn.execute(text("ALTER TABLE purchase_order ADD COLUMN purchase_request_number TEXT"))
        conn.commit()


def _migrate_dispatch_history_table() -> None:
    """Create dispatch_history table if it doesn't exist (idempotent)."""
    from app.core.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS dispatch_history (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                dispatch_id           INTEGER NOT NULL REFERENCES dispatch(id),
                changed_by_username   TEXT,
                changed_at            TEXT NOT NULL,
                change_type           TEXT NOT NULL DEFAULT 'status_change',
                old_status            TEXT,
                new_status            TEXT,
                notes                 TEXT
            )
        """))
        conn.commit()


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
app.include_router(vendors_router.router)
app.include_router(suppliers_router.router)
app.include_router(dispatch_router.router)
app.include_router(gate_passes_router.router)
app.include_router(purchase_orders_router.router)
app.include_router(dashboard_router.router)
app.include_router(departments_router.router)
app.include_router(departments_router.public_router)
app.include_router(departments_router.public_router)
app.include_router(inventory_router.router)
app.include_router(production_router.router)
app.include_router(schedule_router.router)
app.include_router(users_router.router)
app.include_router(work_types_router.router)
app.include_router(spares_router.router)
app.include_router(consumables_router.router)
app.include_router(settings_router.public_router)
app.include_router(settings_router.router)
app.include_router(attachments_router.router)
app.include_router(weeders_router.router)
app.include_router(purchase_requests_router.router)
app.include_router(marketing_requests_router.router)
app.include_router(receipts_router.router)
app.include_router(notifications_router.router)
app.include_router(grn_router.router)
app.include_router(history_router.router)

# ── Optional module routers (enabled by env var) ──────────────────────────────
# Example:
# if settings.module_planning:
#     from app.routers import planning
#     app.include_router(planning.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
