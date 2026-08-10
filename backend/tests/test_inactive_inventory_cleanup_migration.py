from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

import app.models  # noqa: F401
from app.core.config import settings
from app.models.attachment_item import AttachmentItem
from app.models.consumable import Consumable
from app.models.inventory import InventoryItem
from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
from app.models.weeder_item import WeederItem


def test_cleanup_migration_never_changes_active_quantities(tmp_path, monkeypatch):
    database_path = tmp_path / "inactive-cleanup.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_engine(database_url)
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        category = SpareCategory(name="Cleanup")
        session.add(category)
        session.commit()
        session.refresh(category)

        records = [
            InventoryItem(code="ACTIVE", name="Active", quantity_on_hand=17, rate=10, is_active=True),
            InventoryItem(code="INACTIVE", name="Inactive", quantity_on_hand=23, rate=10, is_active=False),
            Consumable(name="Active consumable", qty=19, is_active=True),
            Consumable(name="Inactive consumable", qty=29, is_active=False),
            AttachmentItem(description="Active attachment", qty=31, is_active=True),
            AttachmentItem(description="Inactive attachment", qty=37, is_active=False),
            WeederItem(name="Active weeder", qty=41, is_active=True),
            WeederItem(name="Inactive weeder", qty=43, is_active=False),
        ]
        session.add_all(records)
        active_spare = SpareItem(category_id=category.id, name="Active spare", recorded_qty=47, is_active=True)
        inactive_spare = SpareItem(category_id=category.id, name="Inactive spare", recorded_qty=53, is_active=False)
        session.add(active_spare)
        session.add(inactive_spare)
        session.commit()
        session.refresh(active_spare)
        session.refresh(inactive_spare)
        active_spare_id = active_spare.id
        inactive_spare_id = inactive_spare.id
        session.add(SpareItemVariant(spare_item_id=active_spare.id, serial_number="ACTIVE-V", qty=59, is_active=True))
        session.add(SpareItemVariant(spare_item_id=active_spare.id, serial_number="INACTIVE-V", qty=61, is_active=False))
        session.commit()

    monkeypatch.setattr(settings, "database_url", database_url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "0014")
    command.upgrade(config, "head")

    with Session(engine) as session:
        assert session.get(InventoryItem, 1).quantity_on_hand == 17
        assert session.get(InventoryItem, 2).quantity_on_hand == 0
        assert session.get(Consumable, 1).qty == 19
        assert session.get(Consumable, 2).qty == 0
        assert session.get(AttachmentItem, 1).qty == 31
        assert session.get(AttachmentItem, 2).qty == 0
        assert session.get(WeederItem, 1).qty == 41
        assert session.get(WeederItem, 2).qty == 0
        assert session.get(SpareItem, active_spare_id).recorded_qty == 47
        assert session.get(SpareItem, inactive_spare_id).recorded_qty == 0
        variants = list(session.exec(select(SpareItemVariant).order_by(SpareItemVariant.id)).all())
        assert variants[0].qty == 59
        assert variants[1].qty == 0


def test_cleanup_migration_handles_legacy_history_required_columns(tmp_path, monkeypatch):
    database_path = tmp_path / "legacy-required-history.db"
    database_url = f"sqlite:///{database_path}"
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE inventory_item ("
            "id INTEGER PRIMARY KEY, is_active BOOLEAN NOT NULL, quantity_on_hand FLOAT NOT NULL)"
        ))
        connection.execute(text(
            "CREATE TABLE inventory_history ("
            "id INTEGER PRIMARY KEY, inventory_item_id INTEGER NOT NULL, "
            "changed_at DATETIME NOT NULL, change_type VARCHAR NOT NULL, "
            "quantity_before FLOAT, quantity_after FLOAT, quantity_delta FLOAT, notes VARCHAR, "
            "legacy_actor VARCHAR NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO inventory_item (id, is_active, quantity_on_hand) "
            "VALUES (1, 1, 3), (2, 0, 5)"
        ))

    monkeypatch.setattr(settings, "database_url", database_url)
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.stamp(config, "0014")
    command.upgrade(config, "0015")

    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT id, quantity_on_hand FROM inventory_item ORDER BY id"
        )).all()
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        history_count = connection.execute(text("SELECT COUNT(*) FROM inventory_history")).scalar_one()

    assert rows == [(1, 3.0), (2, 0.0)]
    assert revision == "0015"
    assert history_count == 0
