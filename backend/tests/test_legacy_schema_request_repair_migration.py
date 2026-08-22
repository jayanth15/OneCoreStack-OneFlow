from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlmodel import SQLModel, Session

import app.models  # noqa: F401
from app.core.config import settings
from app.models.receipt import Receipt


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
    assert revision == "0018"

    with Session(engine) as session:
        session.add(Receipt(receipt_number="RCP-2026-0002", request_id=8))
        session.commit()

    with engine.connect() as connection:
        inserted = connection.execute(text(
            "SELECT receipt_number, request_id, status FROM receipt WHERE request_id = 8"
        )).one()
    assert inserted == ("RCP-2026-0002", 8, "created")
