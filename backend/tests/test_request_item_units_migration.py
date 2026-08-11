from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.core.config import settings


def test_request_unit_migration_handles_legacy_text_units(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy-request-units.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_engine(database_url)

    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE unit ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(50) UNIQUE, "
            "is_active BOOLEAN NOT NULL, created_at DATETIME NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE inventory_item ("
            "id INTEGER PRIMARY KEY, unit VARCHAR(50))"
        ))
        connection.execute(text(
            "CREATE TABLE spare_item ("
            "id INTEGER PRIMARY KEY, unit VARCHAR(50))"
        ))
        connection.execute(text(
            "CREATE TABLE spare_item_variant ("
            "id INTEGER PRIMARY KEY, spare_item_id INTEGER NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE request_item ("
            "id INTEGER PRIMARY KEY, inventory_item_id INTEGER, item_type VARCHAR(50))"
        ))
        connection.execute(text(
            "INSERT INTO inventory_item (id, unit) VALUES (10, 'Kg')"
        ))
        connection.execute(text(
            "INSERT INTO spare_item (id, unit) VALUES (20, 'Piece')"
        ))
        connection.execute(text(
            "INSERT INTO spare_item_variant (id, spare_item_id) VALUES (30, 20)"
        ))
        connection.execute(text(
            "INSERT INTO request_item (id, inventory_item_id, item_type) "
            "VALUES (1, 10, 'raw_material'), (2, 30, 'spare')"
        ))

    monkeypatch.setattr(settings, "database_url", database_url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "0015")
    command.upgrade(config, "0016")

    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT request_item.id, unit.name "
            "FROM request_item JOIN unit ON unit.id = request_item.unit_id "
            "ORDER BY request_item.id"
        )).all()
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert rows == [(1, "Kg"), (2, "Piece")]
    assert revision == "0016"
