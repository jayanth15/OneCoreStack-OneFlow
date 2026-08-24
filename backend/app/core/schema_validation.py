"""Database compatibility checks used by CI and deployment verification."""

from dataclasses import dataclass

from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text
from sqlmodel import SQLModel


FORBIDDEN_LEGACY_COLUMNS = {
    ("inventory_item", "unit"),
    ("inventory_item", "weight_unit"),
    ("bom_item", "material_unit"),
    ("grn_item", "unit"),
    ("dispatch", "unit"),
    ("dispatch_item", "unit"),
    ("gate_pass", "unit"),
    ("gate_pass_item", "unit"),
    ("purchase_order_item", "unit"),
    ("receipt_item", "unit"),
    ("spare_item", "unit"),
    ("supplier_jobs", "unit"),
    ("supplier_materials", "unit"),
    ("production_process", "material_unit"),
    ("receipt", "sn_no"),
    ("receipt", "quantity_requested"),
    ("receipt", "quantity_received"),
    ("receipt", "updated_at"),
}


@dataclass(frozen=True)
class SchemaIssue:
    kind: str
    table: str
    column: str | None
    detail: str

    def __str__(self) -> str:
        target = self.table if self.column is None else f"{self.table}.{self.column}"
        return f"{self.kind}: {target}: {self.detail}"


def collect_model_schema_issues(engine: Engine) -> list[SchemaIssue]:
    """Find schema states that can make current ORM reads or writes fail."""
    import app.models  # noqa: F401 - populate SQLModel metadata

    inspector = inspect(engine)
    database_tables = set(inspector.get_table_names())
    issues: list[SchemaIssue] = []

    for table_name, model_table in SQLModel.metadata.tables.items():
        if table_name not in database_tables:
            issues.append(SchemaIssue(
                "missing_table", table_name, None, "required by current SQLModel metadata"
            ))
            continue

        database_columns = {
            column["name"]: column for column in inspector.get_columns(table_name)
        }
        model_columns = set(model_table.columns.keys())

        for column_name in sorted(model_columns - database_columns.keys()):
            issues.append(SchemaIssue(
                "missing_column",
                table_name,
                column_name,
                "required by the current ORM",
            ))

        for column_name, column in database_columns.items():
            if (table_name, column_name) in FORBIDDEN_LEGACY_COLUMNS:
                issues.append(SchemaIssue(
                    "forbidden_legacy_column",
                    table_name,
                    column_name,
                    "must be removed after its normalized replacement is backfilled",
                ))
            elif (
                column_name not in model_columns
                and not column.get("nullable", True)
                and column.get("default") is None
            ):
                issues.append(SchemaIssue(
                    "unexpected_required_column",
                    table_name,
                    column_name,
                    "current ORM inserts cannot provide a value",
                ))

    return issues


def collect_database_health_issues(engine: Engine) -> list[SchemaIssue]:
    """Check Alembic position plus SQLite data and FK integrity."""
    from app.core.database import _alembic_config

    issues = collect_model_schema_issues(engine)
    head = ScriptDirectory.from_config(_alembic_config()).get_current_head()
    with engine.connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
        if current != head:
            issues.append(SchemaIssue(
                "revision_mismatch",
                "alembic_version",
                None,
                f"database is at {current!r}, expected {head!r}",
            ))

        if engine.dialect.name == "sqlite":
            integrity = connection.execute(text("PRAGMA integrity_check")).scalar()
            if integrity != "ok":
                issues.append(SchemaIssue(
                    "integrity_error", "sqlite", None, str(integrity)
                ))
            violations = connection.execute(text("PRAGMA foreign_key_check")).all()
            if violations:
                issues.append(SchemaIssue(
                    "foreign_key_violation",
                    "sqlite",
                    None,
                    f"{len(violations)} violation(s)",
                ))

    return issues


def main() -> None:
    from app.core.database import engine

    issues = collect_database_health_issues(engine)
    if issues:
        print("Database schema validation failed:")
        for issue in issues:
            print(f"- {issue}")
        raise SystemExit(1)
    print("Database schema validation passed: ORM-compatible, at Alembic head, integrity OK")


if __name__ == "__main__":
    main()
