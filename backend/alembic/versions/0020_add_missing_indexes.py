"""Add missing indexes for frequent queries

Revision ID: 0020_add_missing_indexes
Revises: 0019_add_five_fields
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0020_add_missing_indexes"
down_revision: Union[str, None] = "0019_add_five_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_presupuestos_fecha_presupuesto', 'presupuestos', ['fecha_presupuesto'])
    op.create_index('ix_presupuestos_importe', 'presupuestos', ['importe'])
    op.create_index('ix_pedidos_proveedor_estado_entrega', 'pedidos_proveedor', ['estado_entrega'])
    op.create_index('ix_usuarios_activo', 'usuarios', ['activo'])
    op.create_index('ix_comentarios_creado_en', 'comentarios', ['creado_en'])
    op.create_index('ix_historial_cambios_creado_en', 'historial_cambios', ['creado_en'])


def downgrade() -> None:
    op.drop_index('ix_presupuestos_fecha_presupuesto')
    op.drop_index('ix_presupuestos_importe')
    op.drop_index('ix_pedidos_proveedor_estado_entrega')
    op.drop_index('ix_usuarios_activo')
    op.drop_index('ix_comentarios_creado_en')
    op.drop_index('ix_historial_cambios_creado_en')