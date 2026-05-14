"""Add login_attempts table

Revision ID: 0003_login_attempts_table
Revises: 0002_presucontrol_v5_hardening
Create Date: 2026-05-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0003_login_attempts_table'
down_revision: Union[str, None] = '0002_presucontrol_v5_hardening'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'login_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ip', sa.String(length=45), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('window_start', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ip', 'email', name='uq_login_attempt_ip_email'),
    )


def downgrade() -> None:
    op.drop_table('login_attempts')
