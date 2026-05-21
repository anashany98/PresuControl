"""Add missing indexes for query performance

Revision ID: 0011_add_missing_indexes
Revises: 0010_align_models_for_production
Create Date: 2026-05-19
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011_add_missing_indexes"
down_revision: Union[str, None] = "0010_align_models_for_production"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_comentarios_usuario_id", "comentarios", ["usuario_id"], unique=False)
    op.create_index("ix_historial_cambios_usuario_id", "historial_cambios", ["usuario_id"], unique=False)
    op.create_index("ix_email_notification_logs_status", "email_notification_logs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_notification_logs_status", table_name="email_notification_logs")
    op.drop_index("ix_historial_cambios_usuario_id", table_name="historial_cambios")
    op.drop_index("ix_comentarios_usuario_id", table_name="comentarios")
