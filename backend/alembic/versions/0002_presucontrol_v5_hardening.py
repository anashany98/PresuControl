"""PresuControl V5 hardening

Revision ID: 0002_presucontrol_v5_hardening
Revises: 0001_presucontrol_v4
Create Date: 2026-05-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0002_presucontrol_v5_hardening'
down_revision: Union[str, None] = '0001_presucontrol_v4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('puede_gestionar_sistema', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('usuarios', sa.Column('reset_password_token_hash', sa.String(length=128), nullable=True))
    op.add_column('usuarios', sa.Column('reset_password_expira_en', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_usuarios_puede_gestionar_sistema', 'usuarios', ['puede_gestionar_sistema'])
    op.create_index('ix_usuarios_reset_password_token_hash', 'usuarios', ['reset_password_token_hash'])
    op.execute("UPDATE usuarios SET puede_gestionar_sistema = TRUE WHERE id = (SELECT MIN(id) FROM usuarios)")


def downgrade() -> None:
    op.drop_index('ix_usuarios_reset_password_token_hash', table_name='usuarios')
    op.drop_index('ix_usuarios_puede_gestionar_sistema', table_name='usuarios')
    op.drop_column('usuarios', 'reset_password_expira_en')
    op.drop_column('usuarios', 'reset_password_token_hash')
    op.drop_column('usuarios', 'puede_gestionar_sistema')
