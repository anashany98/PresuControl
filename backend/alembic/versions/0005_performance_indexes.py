"""Add performance indexes for search and filtering

Revision ID: 0005_performance_indexes
Revises: 0004_registration_attempts_table
Create Date: 2026-05-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0005_performance_indexes'
down_revision: Union[str, None] = '0004_registration_attempts_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_presupuestos_estado_archivado', 'presupuestos', ['estado', 'archivado'])
    op.create_index('ix_presupuestos_gestor_estado', 'presupuestos', ['gestor', 'estado'])
    op.create_index('ix_presupuestos_fecha_ultima_actualizacion', 'presupuestos', ['fecha_ultima_actualizacion'])
    op.create_index('ix_presupuestos_estado_fecha_limite', 'presupuestos', ['estado', 'fecha_limite_siguiente_accion'])
    op.create_index('ix_login_attempts_ip_window', 'login_attempts', ['ip', 'window_start'])
    op.create_index('ix_registration_attempts_ip', 'registration_attempts', ['ip'])


def downgrade() -> None:
    op.drop_index('ix_registration_attempts_ip', table_name='registration_attempts')
    op.drop_index('ix_login_attempts_ip_window', table_name='login_attempts')
    op.drop_index('ix_presupuestos_estado_fecha_limite', table_name='presupuestos')
    op.drop_index('ix_presupuestos_fecha_ultima_actualizacion', table_name='presupuestos')
    op.drop_index('ix_presupuestos_gestor_estado', table_name='presupuestos')
    op.drop_index('ix_presupuestos_estado_archivado', table_name='presupuestos')