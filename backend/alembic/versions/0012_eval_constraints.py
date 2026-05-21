"""Add CHECK constraints for EvaluacionProveedor rating ranges

Revision ID: 0012_eval_constraints
Revises: 0011_add_missing_indexes
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012_eval_constraints"
down_revision: Union[str, None] = "0011_add_missing_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE evaluaciones_proveedor ADD CONSTRAINT ck_puntualidad_range CHECK (puntualidad BETWEEN 1 AND 5)"
    )
    op.execute(
        "ALTER TABLE evaluaciones_proveedor ADD CONSTRAINT ck_calidad_range CHECK (calidad BETWEEN 1 AND 5)"
    )
    op.execute(
        "ALTER TABLE evaluaciones_proveedor ADD CONSTRAINT ck_comunicacion_range CHECK (comunicacion BETWEEN 1 AND 5)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE evaluaciones_proveedor DROP CONSTRAINT IF EXISTS ck_comunicacion_range")
    op.execute("ALTER TABLE evaluaciones_proveedor DROP CONSTRAINT IF EXISTS ck_calidad_range")
    op.execute("ALTER TABLE evaluaciones_proveedor DROP CONSTRAINT IF EXISTS ck_puntualidad_range")
