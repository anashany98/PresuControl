"""Add usuario_id FK to comentarios and historial_cambios

Revision ID: 0021_add_usuario_fk
Revises: 0020_add_missing_indexes
Create Date: 2026-06-01
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0021_add_usuario_fk"
down_revision: Union[str, None] = "0020_add_missing_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add FK to comentarios.usuario_id
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_comentarios_usuario_id'
            ) THEN
                ALTER TABLE comentarios ADD CONSTRAINT fk_comentarios_usuario_id
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )
    # Add FK to historial_cambios.usuario_id
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_cambios_usuario_id'
            ) THEN
                ALTER TABLE historial_cambios ADD CONSTRAINT fk_historial_cambios_usuario_id
                    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_comentarios_usuario_id", "comentarios", type_="foreignkey")
    op.drop_constraint("fk_historial_cambios_usuario_id", "historial_cambios", type_="foreignkey")