"""Phase 5 data integrity and supplier normalization

Revision ID: 0014_phase5_data_integrity
Revises: 0013_add_usuario_rol
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_phase5_data_integrity"
down_revision: Union[str, None] = "0013_add_usuario_rol"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pedidos_proveedor", sa.Column("proveedor_id", sa.Integer(), nullable=True))
    op.add_column("pedidos_proveedor", sa.Column("proveedor_nombre_snapshot", sa.String(length=255), nullable=True))
    op.execute("UPDATE pedidos_proveedor SET proveedor_nombre_snapshot = proveedor WHERE proveedor_nombre_snapshot IS NULL")
    op.create_index("ix_pedidos_proveedor_proveedor_id", "pedidos_proveedor", ["proveedor_id"])
    # FK is conditional: proveedores table might not exist yet
    # if created via Base.metadata.create_all() before migrations ran
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proveedores') THEN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedidos_proveedor_proveedor_id'
                ) THEN
                    ALTER TABLE pedidos_proveedor ADD CONSTRAINT fk_pedidos_proveedor_proveedor_id
                        FOREIGN KEY (proveedor_id) REFERENCES proveedores (id) ON DELETE SET NULL;
                END IF;
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pedido_importe_no_negativo') THEN
                ALTER TABLE pedidos_proveedor ADD CONSTRAINT ck_pedido_importe_no_negativo CHECK (importe IS NULL OR importe >= 0);
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'presupuestos_proveedores') THEN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pp_importe_cotizado_no_negativo') THEN
                    ALTER TABLE presupuestos_proveedores ADD CONSTRAINT ck_pp_importe_cotizado_no_negativo CHECK (importe_cotizado IS NULL OR importe_cotizado >= 0);
                END IF;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_pp_importe_cotizado_no_negativo", "presupuestos_proveedores", type_="check")
    op.drop_constraint("ck_pedido_importe_no_negativo", "pedidos_proveedor", type_="check")
    op.drop_constraint("fk_pedidos_proveedor_proveedor_id", "pedidos_proveedor", type_="foreignkey")
    op.drop_index("ix_pedidos_proveedor_proveedor_id", table_name="pedidos_proveedor")
    op.drop_column("pedidos_proveedor", "proveedor_nombre_snapshot")
    op.drop_column("pedidos_proveedor", "proveedor_id")
