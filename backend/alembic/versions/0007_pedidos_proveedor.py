"""Add pedidos_proveedor table"""
from alembic import op
import sqlalchemy as sa

revision = '0007_pedidos_proveedor'
down_revision = '0006_in_app_notifications'
branch_labels = None
depends_on = None

ESTADO_ENTREGA_ENUM = ('pendiente', 'parcial', 'completado')

def upgrade():
    op.create_table('pedidos_proveedor',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('presupuesto_id', sa.Integer(), nullable=False),
        sa.Column('proveedor', sa.String(length=255), nullable=False),
        sa.Column('numero_pedido', sa.String(length=120), nullable=True),
        sa.Column('fecha_pedido', sa.Date(), nullable=True),
        sa.Column('importe', sa.Float(), nullable=True),
        sa.Column('estado_entrega', sa.String(length=40), nullable=False, server_default='pendiente'),
        sa.Column('fecha_entrega_prevista', sa.Date(), nullable=True),
        sa.Column('fecha_entrega_real', sa.Date(), nullable=True),
        sa.Column('observaciones', sa.Text(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['presupuesto_id'], ['presupuestos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pedidos_proveedor_presupuesto_id', 'pedidos_proveedor', ['presupuesto_id'])

def downgrade():
    op.drop_table('pedidos_proveedor')