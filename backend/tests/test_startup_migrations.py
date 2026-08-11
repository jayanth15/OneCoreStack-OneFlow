from app import main
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.script import ScriptDirectory

from app.core import database, legacy_migrations


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


def test_upgrade_checkpoints_each_revision(monkeypatch):
    state = {"revision": "0014"}
    calls: list[str] = []
    next_revision = {"0014": "0015", "0015": "0016", "0016": "0017"}

    monkeypatch.setattr(database, "_alembic_config", lambda: object())
    monkeypatch.setattr(database, "_current_alembic_revision", lambda: state["revision"])
    monkeypatch.setattr(
        ScriptDirectory,
        "from_config",
        lambda _config: SimpleNamespace(get_current_head=lambda: "0017"),
    )

    def upgrade(_config, target):
        assert target == "+1"
        calls.append(state["revision"])
        state["revision"] = next_revision[state["revision"]]

    monkeypatch.setattr(command, "upgrade", upgrade)

    database.run_alembic_upgrade()

    assert calls == ["0014", "0015", "0016"]
    assert state["revision"] == "0017"


def test_upgrade_stops_when_revision_does_not_advance(monkeypatch):
    monkeypatch.setattr(database, "_alembic_config", lambda: object())
    monkeypatch.setattr(database, "_current_alembic_revision", lambda: "0014")
    monkeypatch.setattr(
        ScriptDirectory,
        "from_config",
        lambda _config: SimpleNamespace(get_current_head=lambda: "0017"),
    )
    monkeypatch.setattr(command, "upgrade", lambda _config, _target: None)

    with pytest.raises(RuntimeError, match="made no progress"):
        database.run_alembic_upgrade()
