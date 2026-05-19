"""Add password_reset_attempts table for rate limiting

Revision ID: 0014_password_reset_attempts_table
Revises: 0013_add_security_performance_indexes
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0014_password_reset_attempts_table"
down_revision: Union[str, None] = "0013_add_security_performance_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'password_reset_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ip', sa.String(length=45), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('window_start', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_unique_constraint('uq_password_reset_attempt_ip', 'password_reset_attempts', ['ip'])
    op.create_index('ix_password_reset_attempts_ip', 'password_reset_attempts', ['ip'], unique=True)
    op.create_index('ix_password_reset_attempts_window_start', 'password_reset_attempts', ['window_start'])


def downgrade() -> None:
    op.drop_index('ix_password_reset_attempts_window_start')
    op.drop_index('ix_password_reset_attempts_ip')
    op.drop_constraint('uq_password_reset_attempt_ip', 'password_reset_attempts', type_='unique')
    op.drop_table('password_reset_attempts')