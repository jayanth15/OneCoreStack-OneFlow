from app import main
from app.core import legacy_migrations


def test_managed_database_checks_upgrade_without_restamping(monkeypatch):
    calls: list[object] = []
    monkeypatch.setattr(main, "init_db", lambda: calls.append("init"))
    monkeypatch.setattr(main, "alembic_version_exists", lambda: True)
    monkeypatch.setattr(main, "run_alembic_upgrade", lambda: calls.append("upgrade"))
    monkeypatch.setattr(main, "stamp_alembic_revision", lambda revision: calls.append(("stamp", revision)))

    main._migrate_database_on_startup()

    assert calls == ["init", "upgrade"]


def test_legacy_database_stamps_covered_revision_then_upgrades(monkeypatch):
    calls: list[object] = []
    monkeypatch.setattr(main, "init_db", lambda: calls.append("init"))
    monkeypatch.setattr(main, "alembic_version_exists", lambda: False)
    monkeypatch.setattr(legacy_migrations, "run_all", lambda: calls.append("legacy"))
    monkeypatch.setattr(main, "stamp_alembic_revision", lambda revision: calls.append(("stamp", revision)))
    monkeypatch.setattr(main, "run_alembic_upgrade", lambda: calls.append("upgrade"))

    main._migrate_database_on_startup()

    assert calls == ["init", "legacy", "init", ("stamp", "0009"), "upgrade"]
