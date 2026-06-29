"""Seed common unit rows (idempotent).

Production 0005 added the unit_id FK columns but the unit table was empty,
so per-row unit_id backfills came out NULL. This migration seeds a
standard starter set so the units UI / future item creation has options.

Revision ID: 0006
Revises: 0005
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text


revision: str = "0006"
down_revision: Union[str, Sequence[str], None] = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    for name in (
        "kg", "g", "mg", "lb",
        "pcs", "nos", "set", "box", "dozen", "pair",
        "ltr", "ml",
        "mtr", "cm", "mm", "ft", "in",
        "sqft", "sqm", "cft",
        "roll", "bag", "drum", "can", "tube", "sheet", "coil",
    ):
        bind.execute(text(
            "INSERT OR IGNORE INTO unit (name, is_active) VALUES (:name, 1)"
        ), {"name": name})


def downgrade() -> None:
    # No-op: removing units would orphan existing references; this is a
    # forward-only seed.
    pass
