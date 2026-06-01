"""Add etiquetas column to presupuestos

Revision ID: 0022_add_etiquetas
Revises: 0021_add_usuario_fk
Create Date: 2026-06-01

Missing migration for model field added in commit 3bd2bbd (Fase 0).
Column was added to app/models.py but the corresponding Alembic
migration was never created. SQLite test DB masked the issue (auto-creates
columns), but PostgreSQL production requires explicit DDL.

Production error observed on Coolify:
  sqlalchemy.exc.ProgrammingError: column presupuestos.etiquetas does not exist
Affected endpoints: /api/dashboard, /api/dashboard/ejecutivo,
  /api/sidebar-counters, /api/mi-mesa, /api/presupuestos, /api/presupuestos-page
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0022_add_etiquetas"
down_revision: Union[str, None] = "0021_add_usuario_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS etiquetas TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS etiquetas")
