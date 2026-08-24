from sqlalchemy import create_engine, text
from sqlmodel import SQLModel

import app.models  # noqa: F401
from app.core.schema_validation import collect_model_schema_issues


def test_current_metadata_has_no_model_schema_issues():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    assert collect_model_schema_issues(engine) == []


def test_validator_detects_unknown_required_and_forbidden_legacy_columns():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE unit (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                is_active BOOLEAN NOT NULL,
                created_at DATETIME NOT NULL,
                legacy_required TEXT NOT NULL
            )
        """))
        connection.execute(text("""
            CREATE TABLE inventory_item (
                id INTEGER PRIMARY KEY,
                unit TEXT NOT NULL
            )
        """))

    issues = collect_model_schema_issues(engine)
    issue_keys = {(issue.kind, issue.table, issue.column) for issue in issues}

    assert ("unexpected_required_column", "unit", "legacy_required") in issue_keys
    assert ("forbidden_legacy_column", "inventory_item", "unit") in issue_keys
