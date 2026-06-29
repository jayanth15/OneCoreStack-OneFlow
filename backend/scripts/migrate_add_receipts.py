"""Migration: add receipt support to existing database.

Adds:
  - receipt table
  - receipt_item table
  - from_department column on request table
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.database import engine, init_db
from sqlmodel import Session, text


def migrate():
    print("Running migration: add receipt tables + from_department...")

    # Create new tables using SQLModel metadata (non-destructive — only adds missing tables)
    init_db()

    # Add from_department column to request table if it doesn't exist
    with Session(engine) as session:
        # Check if from_department exists
        result = session.exec(text("PRAGMA table_info(request)")).all()
        columns = {row[1] for row in result}
        if "from_department" not in columns:
            print("Adding from_department column to request table...")
            session.exec(text("ALTER TABLE request ADD COLUMN from_department VARCHAR"))
            session.commit()
            print("  done.")
        else:
            print("from_department column already exists — skipping.")

    print("Migration complete.")


if __name__ == "__main__":
    migrate()
