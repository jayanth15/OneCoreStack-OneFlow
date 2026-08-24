from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlmodel import SQLModel, Session

import app.models  # noqa: F401
from app.core.config import settings
from app.models.inventory import InventoryItem
from app.models.receipt import Receipt
from app.models.spare_item import SpareItem


def _config(database_url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_repair_maps_units_without_changing_active_quantity(tmp_path, monkeypatch):
    path = tmp_path / "legacy-units.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE unit (id INTEGER PRIMARY KEY, name TEXT UNIQUE, "
            "is_active BOOLEAN NOT NULL, created_at DATETIME NOT NULL)"
        ))
        connection.execute(text("INSERT INTO unit VALUES (1, 'pcs', 1, CURRENT_TIMESTAMP)"))
        connection.execute(text(
            "CREATE TABLE inventory_item (id INTEGER PRIMARY KEY, unit TEXT, weight_unit TEXT, "
            "quantity_on_hand FLOAT NOT NULL, is_active BOOLEAN NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO inventory_item VALUES "
            "(1, 'pcs', NULL, 12.5, 1), (2, 'kg', NULL, 99, 0)"
        ))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0016")
    command.upgrade(_config(url), "0017")

    with engine.connect() as connection:
        columns = {row[1] for row in connection.execute(text("PRAGMA table_info(inventory_item)"))}
        active_qty = connection.execute(text(
            "SELECT SUM(quantity_on_hand) FROM inventory_item WHERE is_active = 1"
        )).scalar_one()
        mapped = connection.execute(text(
            "SELECT inventory_item.id, unit.name FROM inventory_item "
            "JOIN unit ON unit.id = inventory_item.unit_id ORDER BY inventory_item.id"
        )).all()

    assert {"unit_id", "weight_unit_id"}.issubset(columns)
    assert active_qty == 12.5
    assert mapped == [(1, "pcs"), (2, "kg")]


def test_repair_restores_legacy_purchase_requests(tmp_path, monkeypatch):
    path = tmp_path / "legacy-requests.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    SQLModel.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO purchase_request ("
            "id, sn_no, item_name, item_code, quantity, status, requested_by_username, "
            "department, is_active, created_at, updated_at"
            ") VALUES (5, 'PR-2026-0005', 'Bearing', 'BR-1', 10, 'received', "
            "'worker', 'Spares', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ))
        connection.execute(text(
            "INSERT INTO purchase_request_item ("
            "id, request_id, item_name, item_code, quantity, department"
            ") VALUES (9, 5, 'Bearing', 'BR-1', 10, 'Spares')"
        ))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0016")
    command.upgrade(_config(url), "0017")

    with engine.connect() as connection:
        restored_request = connection.execute(text(
            "SELECT id, sn_no, status, is_active FROM request"
        )).one()
        restored_item = connection.execute(text(
            "SELECT id, request_id, item_name, quantity FROM request_item"
        )).one()
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    assert restored_request == (5, "REQ-2026-0005", "received", 1)
    assert restored_item == (9, 5, "Bearing", 10.0)
    assert revision == "0017"


def test_repair_rebuilds_legacy_receipt_for_current_orm_inserts(tmp_path, monkeypatch):
    path = tmp_path / "legacy-receipt.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE receipt (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sn_no TEXT NOT NULL,
                receipt_number TEXT,
                request_id INTEGER NOT NULL,
                item_name TEXT,
                item_code TEXT,
                quantity_requested REAL NOT NULL DEFAULT 0.0,
                quantity_received REAL NOT NULL DEFAULT 0.0,
                department TEXT,
                notes TEXT,
                created_by_user_id INTEGER,
                created_by_username TEXT,
                status TEXT NOT NULL DEFAULT 'pending_ack',
                acknowledged_by_user_id INTEGER,
                acknowledged_by_username TEXT,
                acknowledged_at DATETIME,
                acknowledgment_note TEXT,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                signed_off_by_user_id INTEGER,
                signed_off_by_username TEXT,
                signed_off_at DATETIME,
                disputed_at DATETIME,
                dispute_note TEXT
            )
        """))
        connection.execute(text("""
            INSERT INTO receipt (
                sn_no, request_id, item_name, quantity_requested,
                quantity_received, status, created_at, updated_at
            ) VALUES (
                'RCPT-2026-0001', 7, 'Bearing', 4, 4,
                'acknowledged', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX ix_receipt_sn_no ON receipt (sn_no)"))
        connection.execute(text("CREATE INDEX ix_receipt_status ON receipt (status)"))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0016")
    command.upgrade(_config(url), "head")

    with engine.connect() as connection:
        columns = {
            row[1]: row for row in connection.execute(text("PRAGMA table_info(receipt)"))
        }
        indexes = {
            row[1] for row in connection.execute(text("PRAGMA index_list(receipt)"))
        }
        migrated = connection.execute(text(
            "SELECT receipt_number, request_id, status FROM receipt WHERE id = 1"
        )).one()
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    assert "sn_no" not in columns
    assert "updated_at" not in columns
    assert not {
        "item_name", "item_code", "quantity_requested", "quantity_received",
        "acknowledged_by_user_id", "acknowledged_by_username", "acknowledged_at",
        "acknowledgment_note", "is_active",
    }.intersection(columns)
    assert columns["receipt_number"][3] == 1
    assert {
        "ix_receipt_receipt_number", "ix_receipt_request_id", "ix_receipt_department"
    }.issubset(indexes)
    assert "ix_receipt_sn_no" not in indexes
    assert migrated == ("RCPT-2026-0001", 7, "signed_off")
    assert revision == "0020"

    with Session(engine) as session:
        session.add(Receipt(receipt_number="RCP-2026-0002", request_id=8))
        session.commit()

    with engine.connect() as connection:
        inserted = connection.execute(text(
            "SELECT receipt_number, request_id, status FROM receipt WHERE request_id = 8"
        )).one()
    assert inserted == ("RCP-2026-0002", 8, "created")


def test_repair_removes_required_legacy_inventory_unit_for_current_orm_inserts(
    tmp_path, monkeypatch
):
    path = tmp_path / "legacy-inventory-unit.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE unit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("""
            CREATE TABLE inventory_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                item_type TEXT NOT NULL DEFAULT 'raw_material',
                unit TEXT NOT NULL,
                unit_id INTEGER,
                quantity_on_hand REAL NOT NULL DEFAULT 0.0,
                reorder_level REAL NOT NULL DEFAULT 0.0,
                storage_type TEXT,
                storage_location TEXT,
                rate REAL,
                timeline_days INTEGER,
                image_base64 TEXT,
                vendor_name TEXT,
                design_drawing_pdf TEXT,
                weight_value REAL,
                weight_unit TEXT,
                weight_unit_id INTEGER,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(unit_id) REFERENCES unit(id),
                FOREIGN KEY(weight_unit_id) REFERENCES unit(id)
            )
        """))
        connection.execute(text(
            "CREATE INDEX ix_inventory_item_unit ON inventory_item (unit)"
        ))
        connection.execute(text("""
            INSERT INTO inventory_item (
                code, name, unit, quantity_on_hand, weight_unit, updated_at
            ) VALUES (
                'LEGACY-001', 'Legacy sheet', 'pcs', 37.5, 'kg', CURRENT_TIMESTAMP
            )
        """))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0018")
    command.upgrade(_config(url), "head")

    with engine.connect() as connection:
        columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(inventory_item)"))
        }
        legacy = connection.execute(text("""
            SELECT inventory_item.quantity_on_hand, item_unit.name, weight_unit.name
            FROM inventory_item
            LEFT JOIN unit AS item_unit ON item_unit.id = inventory_item.unit_id
            LEFT JOIN unit AS weight_unit ON weight_unit.id = inventory_item.weight_unit_id
            WHERE inventory_item.code = 'LEGACY-001'
        """)).one()
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert "unit" not in columns
    assert "weight_unit" not in columns
    assert {"unit_id", "weight_unit_id"}.issubset(columns)
    assert legacy == (37.5, "pcs", "kg")
    assert revision == "0020"

    with Session(engine) as session:
        session.add(InventoryItem(
            code="TEST-001",
            name="0.75 MM SHEET",
            unit_id=1,
            quantity_on_hand=2000,
            reorder_level=100,
            storage_type="Pallet",
            storage_location="PRESS SHOP AREA",
            timeline_days=5,
        ))
        session.commit()

    with engine.connect() as connection:
        inserted = connection.execute(text("""
            SELECT code, name, unit_id, quantity_on_hand
            FROM inventory_item
            WHERE code = 'TEST-001'
        """)).one()
    assert inserted == ("TEST-001", "0.75 MM SHEET", 1, 2000.0)


def test_finalize_unit_schema_repairs_required_legacy_spare_column(
    tmp_path, monkeypatch
):
    path = tmp_path / "legacy-spare-unit.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE unit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("""
            CREATE TABLE spare_category (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """))
        connection.execute(text("""
            INSERT INTO spare_category (name, created_at, updated_at)
            VALUES ('Bearings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """))
        connection.execute(text("""
            CREATE TABLE spare_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                sub_category_id INTEGER,
                name TEXT NOT NULL,
                part_number TEXT,
                part_description TEXT,
                variant_model TEXT,
                rate REAL,
                unit TEXT NOT NULL,
                unit_id INTEGER,
                opening_qty REAL NOT NULL DEFAULT 0.0,
                recorded_qty REAL NOT NULL DEFAULT 0.0,
                reorder_level REAL NOT NULL DEFAULT 0.0,
                storage_type TEXT,
                storage_location TEXT,
                tags TEXT,
                image_base64 TEXT,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(category_id) REFERENCES spare_category(id),
                FOREIGN KEY(unit_id) REFERENCES unit(id)
            )
        """))
        connection.execute(text("""
            INSERT INTO spare_item (
                category_id, name, unit, opening_qty, recorded_qty,
                created_at, updated_at
            ) VALUES (
                1, 'Legacy bearing', 'Piece', 8, 6,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0019")
    command.upgrade(_config(url), "head")

    with engine.connect() as connection:
        columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(spare_item)"))
        }
        legacy = connection.execute(text("""
            SELECT spare_item.opening_qty, spare_item.recorded_qty, unit.name
            FROM spare_item
            JOIN unit ON unit.id = spare_item.unit_id
            WHERE spare_item.name = 'Legacy bearing'
        """)).one()

    assert "unit" not in columns
    assert "unit_id" in columns
    assert legacy == (8.0, 6.0, "Piece")

    with Session(engine) as session:
        session.add(SpareItem(
            category_id=1,
            name="Current bearing",
            unit_id=1,
            opening_qty=4,
            recorded_qty=4,
        ))
        session.commit()

    with engine.connect() as connection:
        inserted = connection.execute(text("""
            SELECT name, unit_id, opening_qty, recorded_qty
            FROM spare_item
            WHERE name = 'Current bearing'
        """)).one()
    assert inserted == ("Current bearing", 1, 4.0, 4.0)


def test_finalize_unit_schema_removes_all_known_legacy_text_columns(
    tmp_path, monkeypatch
):
    path = tmp_path / "all-legacy-unit-columns.db"
    url = f"sqlite:///{path}"
    engine = create_engine(url)
    migrations = (
        ("inventory_item", "unit", "unit_id"),
        ("inventory_item", "weight_unit", "weight_unit_id"),
        ("bom_item", "material_unit", "material_unit_id"),
        ("grn_item", "unit", "unit_id"),
        ("dispatch", "unit", "unit_id"),
        ("dispatch_item", "unit", "unit_id"),
        ("gate_pass", "unit", "unit_id"),
        ("gate_pass_item", "unit", "unit_id"),
        ("purchase_order_item", "unit", "unit_id"),
        ("receipt_item", "unit", "unit_id"),
        ("spare_item", "unit", "unit_id"),
        ("supplier_jobs", "unit", "unit_id"),
        ("supplier_materials", "unit", "unit_id"),
        ("production_process", "material_unit", "material_unit_id"),
    )
    grouped: dict[str, list[tuple[str, str]]] = {}
    for table, old_column, new_column in migrations:
        grouped.setdefault(table, []).append((old_column, new_column))

    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE unit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        for table, columns in grouped.items():
            definitions = ["id INTEGER PRIMARY KEY"]
            definitions.extend(f"{old} TEXT" for old, _new in columns)
            definitions.extend(f"{new} INTEGER" for _old, new in columns)
            connection.execute(text(
                f"CREATE TABLE {table} ({', '.join(definitions)})"
            ))
            names = [old for old, _new in columns]
            values = [f"'Unit-{table}-{index}'" for index, _name in enumerate(names)]
            connection.execute(text(
                f"INSERT INTO {table} (id, {', '.join(names)}) "
                f"VALUES (1, {', '.join(values)})"
            ))

    monkeypatch.setattr(settings, "database_url", url)
    command.stamp(_config(url), "0019")
    command.upgrade(_config(url), "head")

    with engine.connect() as connection:
        for table, old_column, new_column in migrations:
            columns = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info({table})"))
            }
            assert old_column not in columns
            assert new_column in columns
            assert connection.execute(text(
                f"SELECT {new_column} FROM {table} WHERE id = 1"
            )).scalar_one() is not None
