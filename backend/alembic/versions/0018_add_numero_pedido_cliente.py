"""Add numero_pedido_cliente column

Revision ID: 0018_add_numero_pedido_cliente
Revises: 0017_cleanup_password_reset
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0018_add_numero_pedido_cliente"
down_revision: Union[str, None] = "0017_cleanup_password_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS numero_pedido_cliente VARCHAR(120)")


def downgrade() -> None:
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS numero_pedido_cliente")
