"""Copy a fully upgraded OneFlow SQLite database into an empty PostgreSQL DB.

The source is opened read-only. Primary keys, stock quantities, and audit
history are copied verbatim. Legacy text unit columns are normalized into the
current unit foreign keys during the copy.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401 - populate SQLModel metadata


UNIT_COLUMNS = [
    ("inventory_item", "unit", "unit_id"),
    ("inventory_item", "weight_unit", "weight_unit_id"),
    ("bom_item", "material_unit", "material_unit_id"),
    ("grn_item", "unit", "unit_id"),
    ("dispatch_item", "unit", "unit_id"),
    ("dispatch", "unit", "unit_id"),
    ("gate_pass", "unit", "unit_id"),
    ("gate_pass_item", "unit", "unit_id"),
    ("purchase_order_item", "unit", "unit_id"),
    ("receipt_item", "unit", "unit_id"),
    ("supplier_materials", "unit", "unit_id"),
    ("supplier_jobs", "unit", "unit_id"),
    ("spare_item", "unit", "unit_id"),
    ("production_process", "material_unit", "material_unit_id"),
]


def _source_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%'"
        )
    }


def _source_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    escaped = table.replace('"', '""')
    return {row[1] for row in connection.execute(f'PRAGMA table_info("{escaped}")')}


def _read_units(
    source: sqlite3.Connection, source_tables: set[str]
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    units: list[dict[str, Any]] = []
    by_name: dict[str, int] = {}
    next_id = 1

    if "unit" in source_tables:
        for row in source.execute(
            "SELECT id, name, is_active, created_at FROM unit ORDER BY id"
        ):
            name = (row["name"] or "").strip()
            if not name:
                continue
            unit_id = int(row["id"])
            units.append(
                {
                    "id": unit_id,
                    "name": name,
                    "is_active": bool(row["is_active"]),
                    "created_at": _coerce_datetime(row["created_at"])
                    or datetime.now(),
                }
            )
            by_name[name.casefold()] = unit_id
            next_id = max(next_id, unit_id + 1)

    for table, old_column, _ in UNIT_COLUMNS:
        if table not in source_tables:
            continue
        columns = _source_columns(source, table)
        if old_column not in columns:
            continue
        escaped_table = table.replace('"', '""')
        escaped_column = old_column.replace('"', '""')
        query = (
            f'SELECT DISTINCT TRIM("{escaped_column}") '
            f'FROM "{escaped_table}" WHERE "{escaped_column}" IS NOT NULL '
            f'AND TRIM("{escaped_column}") != \'\''
        )
        for (raw_name,) in source.execute(query):
            name = raw_name.strip()
            key = name.casefold()
            if key in by_name:
                continue
            by_name[key] = next_id
            units.append(
                {
                    "id": next_id,
                    "name": name,
                    "is_active": True,
                    "created_at": datetime.now(),
                }
            )
            next_id += 1
    return units, by_name


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    return value


def _column_value(column: sa.Column[Any], value: Any) -> Any:
    if value is None:
        return None
    if isinstance(column.type, sa.Boolean):
        return bool(value)
    if isinstance(column.type, sa.DateTime):
        return _coerce_datetime(value)
    if isinstance(column.type, sa.Date) and not isinstance(value, date):
        try:
            return date.fromisoformat(value)
        except (TypeError, ValueError):
            return value
    if isinstance(column.type, sa.JSON) and isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _default_value(column: sa.Column[Any]) -> tuple[bool, Any]:
    if column.default is None:
        return False, None
    value = column.default.arg
    if callable(value):
        try:
            value = value(None)
        except TypeError:
            value = value()
    return True, value


def migrate(source_path: Path, target_url: str) -> dict[str, int]:
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    source.row_factory = sqlite3.Row
    source_tables = _source_tables(source)
    source_revision = source.execute(
        "SELECT version_num FROM alembic_version"
    ).fetchone()
    if not source_revision or source_revision[0] != "0016":
        raise RuntimeError(
            f"Source must be upgraded to 0016; found {source_revision!r}"
        )

    target = create_engine(target_url, pool_pre_ping=True)
    existing_tables = set(inspect(target).get_table_names())
    populated = []
    with target.connect() as connection:
        for table in existing_tables:
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table}"')
            ).scalar_one()
            if count:
                populated.append((table, count))
    if populated:
        raise RuntimeError(f"Target database is not empty: {populated}")

    SQLModel.metadata.create_all(target)
    units, units_by_name = _read_units(source, source_tables)
    copied: dict[str, int] = {}

    unit_mapping = {
        (table, new_column): old_column
        for table, old_column, new_column in UNIT_COLUMNS
    }

    with target.begin() as connection:
        connection.execute(text("SET session_replication_role = replica"))
        for table in SQLModel.metadata.sorted_tables:
            if table.name == "unit":
                if units:
                    connection.execute(table.insert(), units)
                copied[table.name] = len(units)
                continue
            if table.name not in source_tables:
                copied[table.name] = 0
                continue

            source_columns = _source_columns(source, table.name)
            escaped_table = table.name.replace('"', '""')
            rows = source.execute(f'SELECT * FROM "{escaped_table}"')
            batch: list[dict[str, Any]] = []
            count = 0
            for source_row in rows:
                source_data = dict(source_row)
                output: dict[str, Any] = {}
                for column in table.columns:
                    if column.name in source_columns:
                        output[column.name] = _column_value(
                            column, source_data[column.name]
                        )
                        continue
                    old_unit_column = unit_mapping.get((table.name, column.name))
                    if old_unit_column and old_unit_column in source_columns:
                        raw_unit = source_data.get(old_unit_column)
                        output[column.name] = (
                            units_by_name.get(raw_unit.strip().casefold())
                            if isinstance(raw_unit, str) and raw_unit.strip()
                            else None
                        )
                        continue
                    if table.name == "receipt" and column.name == "receipt_number":
                        created_at = _coerce_datetime(source_data.get("created_at"))
                        year = created_at.year if created_at else datetime.now().year
                        output[column.name] = (
                            f"RCP-{year}-{int(source_data['id']):04d}"
                        )
                        continue
                    has_default, default = _default_value(column)
                    if has_default:
                        output[column.name] = default
                    elif (
                        not column.nullable
                        and not (column.primary_key and column.autoincrement)
                    ):
                        raise RuntimeError(
                            f"{table.name}.{column.name} is required but absent "
                            "from the source"
                        )
                batch.append(output)
                if len(batch) >= 500:
                    connection.execute(table.insert(), batch)
                    count += len(batch)
                    batch.clear()
            if batch:
                connection.execute(table.insert(), batch)
                count += len(batch)
            copied[table.name] = count

        connection.execute(text(
            "CREATE TABLE IF NOT EXISTS alembic_version "
            "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
        ))
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES ('0016')")
        )

        for table in SQLModel.metadata.sorted_tables:
            primary_keys = list(table.primary_key.columns)
            if len(primary_keys) != 1:
                continue
            column = primary_keys[0]
            if not isinstance(column.type, sa.Integer):
                continue
            connection.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence(:table_name, :column_name), "
                    "GREATEST(COALESCE(MAX_ID, 0), 1), COALESCE(MAX_ID, 0) > 0) "
                    f'FROM (SELECT MAX("{column.name}") AS MAX_ID '
                    f'FROM "{table.name}") AS sequence_value'
                ),
                {"table_name": table.name, "column_name": column.name},
            )
        connection.execute(text("SET session_replication_role = origin"))

    with target.connect() as connection:
        for table_name, source_count in copied.items():
            target_count = connection.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            ).scalar_one()
            if target_count != source_count:
                raise RuntimeError(
                    f"Row-count mismatch for {table_name}: "
                    f"source={source_count}, target={target_count}"
                )
    source.close()
    return copied


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("target_url")
    args = parser.parse_args()
    copied = migrate(args.source.resolve(), args.target_url)
    print(json.dumps(copied, sort_keys=True))


if __name__ == "__main__":
    main()
