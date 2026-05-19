"""añadir tabla presupuestos_proveedores (relación N:N con estado de cotización)

Revision ID: 0009_presupuestos_proveedores
Revises: 0008_proveedores_y_mejoras
Create Date: 2025-01-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '0009_presupuestos_proveedores'
down_revision = '0008_proveedores_y_mejoras'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'presupuestos_proveedores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('presupuesto_id', sa.Integer(), nullable=False),
        sa.Column('proveedor_id', sa.Integer(), nullable=False),
        sa.Column('estado', sa.String(length=40), nullable=False, server_default='contactado'),
        sa.Column('importe_cotizado', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('fecha_cotizacion', sa.Date(), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('presupuesto_id', 'proveedor_id', name='uq_presupuesto_proveedor'),
        sa.ForeignKeyConstraint(['presupuesto_id'], ['presupuestos.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['proveedor_id'], ['proveedores.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_pp_presupuesto_id', 'presupuestos_proveedores', ['presupuesto_id'], unique=False)
    op.create_index('ix_pp_proveedor_id', 'presupuestos_proveedores', ['proveedor_id'], unique=False)
    op.create_index('ix_pp_estado', 'presupuestos_proveedores', ['estado'], unique=False)


def downgrade():
    op.drop_index('ix_pp_estado', table_name='presupuestos_proveedores')
    op.drop_index('ix_pp_proveedor_id', table_name='presupuestos_proveedores')
    op.drop_index('ix_pp_presupuesto_id', table_name='presupuestos_proveedores')
    op.drop_table('presupuestos_proveedores')