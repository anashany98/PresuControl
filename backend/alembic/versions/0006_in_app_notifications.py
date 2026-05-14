"""Add in_app_notifications table"""
from alembic import op
import sqlalchemy as sa

revision = '0006_in_app_notifications'
down_revision = '0005_performance_indexes'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('in_app_notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('tipo', sa.String(length=80), nullable=False),
        sa.Column('titulo', sa.String(length=255), nullable=False),
        sa.Column('mensaje', sa.Text(), nullable=False),
        sa.Column('fingerprint', sa.String(length=255), nullable=False),
        sa.Column('leida', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('link', sa.String(length=255), nullable=True),
        sa.Column('extra_data', sa.Text(), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('fingerprint'),
    )
    op.create_index('ix_in_app_notifications_user_id', 'in_app_notifications', ['user_id'])
    op.create_index('ix_in_app_notifications_leida', 'in_app_notifications', ['leida'])
    op.create_index('ix_in_app_notifications_creado_en', 'in_app_notifications', ['creado_en'])

def downgrade():
    op.drop_table('in_app_notifications')