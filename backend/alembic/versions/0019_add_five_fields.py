"""Add five new fields to presupuestos

Revision ID: 0019_add_five_fields
Revises: 0018_add_numero_pedido_cliente
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0019_add_five_fields"
down_revision: Union[str, None] = "0018_add_numero_pedido_cliente"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS codigo_cliente_factusol VARCHAR(80)")
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_medicion DATE")
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_recepcion_mercancia DATE")
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS plazo_confeccion DATE")
    op.execute("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_entrega_cliente DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS codigo_cliente_factusol")
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS fecha_medicion")
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS fecha_recepcion_mercancia")
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS plazo_confeccion")
    op.execute("ALTER TABLE presupuestos DROP COLUMN IF EXISTS fecha_entrega_cliente")
