"""PresuControl V4 base schema

Revision ID: 0001_presucontrol_v4
Revises:
Create Date: 2026-05-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_presucontrol_v4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('app_settings', sa.Column('key', sa.String(length=120), primary_key=True), sa.Column('value', sa.Text(), nullable=False), sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table('usuarios', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('nombre', sa.String(length=120), nullable=False), sa.Column('email', sa.String(length=255), nullable=False), sa.Column('hashed_password', sa.String(length=255), nullable=False), sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column('aprobado', sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column('aprobado_en', sa.DateTime(timezone=True)), sa.Column('aprobado_por', sa.String(length=255)), sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column('ultimo_login', sa.DateTime(timezone=True)), sa.UniqueConstraint('email', name='uq_usuario_email'))
    op.create_index('ix_usuarios_email', 'usuarios', ['email'])
    op.create_table('presupuestos', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('numero_presupuesto', sa.String(length=80), nullable=False), sa.Column('cliente', sa.String(length=255), nullable=False), sa.Column('obra_referencia', sa.String(length=255), nullable=False), sa.Column('gestor', sa.String(length=120), nullable=False), sa.Column('fecha_presupuesto', sa.Date(), nullable=False), sa.Column('fecha_envio_cliente', sa.Date()), sa.Column('fecha_aceptacion', sa.Date()), sa.Column('importe', sa.Float(), nullable=False, server_default='0'), sa.Column('estado', sa.String(length=80), nullable=False), sa.Column('proveedor', sa.String(length=255)), sa.Column('pedido_proveedor_realizado', sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column('numero_pedido_proveedor', sa.String(length=120)), sa.Column('fecha_pedido_proveedor', sa.Date()), sa.Column('plazo_proveedor', sa.Date()), sa.Column('fecha_prevista_entrega', sa.Date()), sa.Column('responsable_actual', sa.String(length=120)), sa.Column('siguiente_accion', sa.String(length=255)), sa.Column('fecha_limite_siguiente_accion', sa.Date()), sa.Column('incidencia', sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column('descripcion_incidencia', sa.Text()), sa.Column('observaciones', sa.Text()), sa.Column('motivo_cancelacion_rechazo', sa.Text()), sa.Column('fecha_cancelacion_rechazo', sa.Date()), sa.Column('archivado', sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column('archivado_en', sa.DateTime(timezone=True)), sa.Column('archivado_por', sa.String(length=255)), sa.Column('motivo_archivado', sa.Text()), sa.Column('prioridad_calculada', sa.String(length=40), nullable=False, server_default='Verde'), sa.Column('dias_parado', sa.Integer(), nullable=False, server_default='0'), sa.Column('fecha_ultima_actualizacion', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column('version', sa.Integer(), nullable=False, server_default='1'), sa.UniqueConstraint('numero_presupuesto', name='uq_numero_presupuesto'))
    for ix in ['numero_presupuesto','cliente','obra_referencia','gestor','estado','proveedor','responsable_actual','incidencia','prioridad_calculada','archivado']:
        op.create_index(f'ix_presupuestos_{ix}', 'presupuestos', [ix])
    op.create_table('comentarios', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('presupuesto_id', sa.Integer(), sa.ForeignKey('presupuestos.id', ondelete='CASCADE')), sa.Column('comentario', sa.Text(), nullable=False), sa.Column('nombre_opcional', sa.String(length=120)), sa.Column('usuario_id', sa.Integer()), sa.Column('usuario_nombre', sa.String(length=120)), sa.Column('usuario_email', sa.String(length=255)), sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index('ix_comentarios_presupuesto_id', 'comentarios', ['presupuesto_id'])
    op.create_table('historial_cambios', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('presupuesto_id', sa.Integer(), sa.ForeignKey('presupuestos.id', ondelete='CASCADE')), sa.Column('campo', sa.String(length=120), nullable=False), sa.Column('valor_anterior', sa.Text()), sa.Column('valor_nuevo', sa.Text()), sa.Column('descripcion', sa.Text(), nullable=False), sa.Column('nombre_opcional', sa.String(length=120)), sa.Column('usuario_id', sa.Integer()), sa.Column('usuario_nombre', sa.String(length=120)), sa.Column('usuario_email', sa.String(length=255)), sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index('ix_historial_cambios_presupuesto_id', 'historial_cambios', ['presupuesto_id'])
    op.create_table('email_notification_logs', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('presupuesto_id', sa.Integer(), sa.ForeignKey('presupuestos.id', ondelete='SET NULL')), sa.Column('tipo', sa.String(length=160), nullable=False), sa.Column('fingerprint', sa.String(length=255), nullable=False), sa.Column('sent_to', sa.Text()), sa.Column('status', sa.String(length=40), nullable=False, server_default='pending'), sa.Column('error', sa.Text()), sa.Column('escalation_level', sa.Integer(), nullable=False, server_default='0'), sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint('fingerprint', name='uq_email_notification_fingerprint'))
    op.create_index('ix_email_notification_logs_presupuesto_id', 'email_notification_logs', ['presupuesto_id'])
    op.create_index('ix_email_notification_logs_tipo', 'email_notification_logs', ['tipo'])


def downgrade() -> None:
    op.drop_table('email_notification_logs')
    op.drop_table('historial_cambios')
    op.drop_table('comentarios')
    op.drop_table('presupuestos')
    op.drop_table('usuarios')
    op.drop_table('app_settings')
