"""Cleanup: remove password reset feature and consolidate duplicate indexes

Revision ID: 0017_cleanup_password_reset
Revises: 0016_create_missing_tables
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0017_cleanup_password_reset"
down_revision: Union[str, None] = "0016_create_missing_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop password_reset_attempts table
    op.execute("DROP TABLE IF EXISTS password_reset_attempts CASCADE")

    # 2. Drop password reset columns from usuarios
    op.execute("ALTER TABLE usuarios DROP COLUMN IF EXISTS reset_password_token_hash")
    op.execute("ALTER TABLE usuarios DROP COLUMN IF EXISTS reset_password_expira_en")

    # 3. Drop duplicate/redundant indexes
    # ix_presupuestos_fecha_actualizacion duplicates ix_presupuestos_fecha_ultima_actualizacion
    op.execute("DROP INDEX IF EXISTS ix_presupuestos_fecha_actualizacion")
    # PK already creates an index on id columns
    op.execute("DROP INDEX IF EXISTS ix_proveedores_id")
    op.execute("DROP INDEX IF EXISTS ix_evaluaciones_proveedor_id")


def downgrade() -> None:
    # Recreate password_reset_attempts table
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_attempts (
            id SERIAL PRIMARY KEY,
            ip VARCHAR(45) NOT NULL UNIQUE,
            attempts INTEGER NOT NULL DEFAULT 1,
            window_start TIMESTAMP WITH TIME ZONE NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_reset_attempts_ip ON password_reset_attempts (ip)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_reset_attempts_window ON password_reset_attempts (window_start)")

    # Re-add password reset columns
    op.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_password_token_hash VARCHAR(128)")
    op.execute("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_password_expira_en TIMESTAMP WITH TIME ZONE")

    # Recreate dropped indexes
    op.execute("CREATE INDEX IF NOT EXISTS ix_presupuestos_fecha_actualizacion ON presupuestos (fecha_ultima_actualizacion)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_proveedores_id ON proveedores (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_evaluaciones_proveedor_id ON evaluaciones_proveedor (id)")
