"""Add performance and security indexes

Revision ID: 0013_add_security_performance_indexes
Revises: 0012_eval_constraints
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0013_add_security_performance_indexes"
down_revision: Union[str, None] = "0012_eval_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index for login_attempts rate limiting queries (cleanup by window_start)
    op.execute("CREATE INDEX IF NOT EXISTS ix_login_attempts_window_start ON login_attempts (window_start)")

    # Index for email_notification_logs queries (ordering by created_en)
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_notification_logs_creado_en ON email_notification_logs (creado_en)")

    # Index for password_reset_attempts rate limiting (new table)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_password_reset_attempts_ip ON password_reset_attempts (ip)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_password_reset_attempts_window_start ON password_reset_attempts (window_start)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_login_attempts_window_start")
    op.execute("DROP INDEX IF EXISTS ix_email_notification_logs_creado_en")
    op.execute("DROP INDEX IF EXISTS ix_password_reset_attempts_ip")
    op.execute("DROP INDEX IF EXISTS ix_password_reset_attempts_window_start")