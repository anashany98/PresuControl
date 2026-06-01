"""Add fecha_estimacion_termino column to presupuestos

Revision ID: 0023_add_fecha_estimacion_termino
Revises: 0022_add_etiquetas
Create Date: 2026-06-01

Adds an optional estimated finish date for presupuestos in the
'En preparación / fabricación' state. Surfaces in the Kanban board
so the user can record a target completion date when moving the card
to that column.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0023_add_fecha_estimacion_termino"
down_revision: Union[str, None] = "0022_add_etiquetas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_estimacion_termino DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS fecha_estimacion_termino")
