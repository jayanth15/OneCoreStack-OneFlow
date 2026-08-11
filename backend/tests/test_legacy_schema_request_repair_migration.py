from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlmodel import SQLModel

import app.models  # noqa: F401
from app.core.config import settings


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
