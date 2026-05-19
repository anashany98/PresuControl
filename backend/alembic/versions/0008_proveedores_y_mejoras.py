"""añadir tabla proveedores, evaluaciones y índices de rendimiento

Revision ID: 0008_proveedores_y_mejoras
Revises: 0007_pedidos_proveedor
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0008_proveedores_y_mejoras'
down_revision = '0007_pedidos_proveedor'
branch_labels = None
depends_on = None


def upgrade():
    # Tabla de proveedores
    op.create_table(
        'proveedores',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('nombre', sa.String(length=255), nullable=False),
        sa.Column('contacto', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('telefono', sa.String(length=50), nullable=True),
        sa.Column('direccion', sa.Text(), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.Column('evaluacion_promedio', sa.Float(), nullable=True),
        sa.Column('total_evaluaciones', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_proveedores_id'), 'proveedores', ['id'], unique=False)
    op.create_index(op.f('ix_proveedores_nombre'), 'proveedores', ['nombre'], unique=False)
    op.create_index(op.f('ix_proveedores_activo'), 'proveedores', ['activo'], unique=False)

    # Tabla de evaluaciones de proveedores
    op.create_table(
        'evaluaciones_proveedor',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('proveedor_id', sa.Integer(), nullable=False),
        sa.Column('pedido_id', sa.Integer(), nullable=True),
        sa.Column('puntualidad', sa.Integer(), nullable=False),
        sa.Column('calidad', sa.Integer(), nullable=False),
        sa.Column('comunicacion', sa.Integer(), nullable=False),
        sa.Column('comentario', sa.Text(), nullable=True),
        sa.Column('evaluado_por', sa.String(length=255), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['proveedor_id'], ['proveedores.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pedido_id'], ['pedidos_proveedor.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_evaluaciones_proveedor_id'), 'evaluaciones_proveedor', ['id'], unique=False)
    op.create_index(op.f('ix_evaluaciones_proveedor_proveedor_id'), 'evaluaciones_proveedor', ['proveedor_id'], unique=False)

    # Índices compuestos para mejorar rendimiento (N+1 queries)
    op.create_index('ix_presupuestos_fecha_actualizacion', 'presupuestos', ['fecha_ultima_actualizacion'], unique=False)
    op.create_index('ix_presupuestos_cliente_gestor', 'presupuestos', ['cliente', 'gestor'], unique=False)


def downgrade():
    op.drop_index('ix_presupuestos_cliente_gestor', table_name='presupuestos')
    op.drop_index('ix_presupuestos_fecha_actualizacion', table_name='presupuestos')
    op.drop_index(op.f('ix_evaluaciones_proveedor_proveedor_id'), table_name='evaluaciones_proveedor')
    op.drop_index(op.f('ix_evaluaciones_proveedor_id'), table_name='evaluaciones_proveedor')
    op.drop_table('evaluaciones_proveedor')
    op.drop_index(op.f('ix_proveedores_activo'), table_name='proveedores')
    op.drop_index(op.f('ix_proveedores_nombre'), table_name='proveedores')
    op.drop_index(op.f('ix_proveedores_id'), table_name='proveedores')
    op.drop_table('proveedores')
