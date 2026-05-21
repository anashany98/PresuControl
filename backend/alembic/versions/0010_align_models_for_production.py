"""Align production schema with current models

Revision ID: 0010_align_models_for_production
Revises: 0009_presupuestos_proveedores
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0010_align_models_for_production"
down_revision: Union[str, None] = "0009_presupuestos_proveedores"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presupuestos ALTER COLUMN importe TYPE NUMERIC(12, 2) USING importe::numeric(12, 2)")
    op.execute("ALTER TABLE pedidos_proveedor ALTER COLUMN importe TYPE NUMERIC(12, 2) USING importe::numeric(12, 2)")
    op.execute("ALTER TABLE proveedores ALTER COLUMN evaluacion_promedio TYPE NUMERIC(3, 2) USING evaluacion_promedio::numeric(3, 2)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_presupuestos_fecha_aceptacion ON presupuestos (fecha_aceptacion)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_presupuestos_estado_archivado_fecha_limite ON presupuestos (estado, archivado, fecha_limite_siguiente_accion)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_proveedores_email ON proveedores (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_evaluaciones_pedido_id ON evaluaciones_proveedor (pedido_id)")

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_estado_valid') THEN
                ALTER TABLE presupuestos ADD CONSTRAINT ck_estado_valid CHECK (
                    estado IN (
                        'Borrador',
                        'Pendiente de enviar',
                        'Enviado al cliente',
                        'Aceptado - pendiente pedido proveedor',
                        'Pedido proveedor realizado',
                        'Plazo proveedor confirmado',
                        'En preparación / fabricación',
                        'Bloqueado / incidencia',
                        'Cancelado / rechazado',
                        'Entregado / cerrado'
                    )
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_prioridad_valid') THEN
                ALTER TABLE presupuestos ADD CONSTRAINT ck_prioridad_valid CHECK (
                    prioridad_calculada IN ('Verde', 'Amarillo', 'Naranja', 'Rojo', 'Crítico')
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_importe_positivo') THEN
                ALTER TABLE presupuestos ADD CONSTRAINT ck_importe_positivo CHECK (importe >= 0);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_estado_entrega_valid') THEN
                ALTER TABLE pedidos_proveedor ADD CONSTRAINT ck_estado_entrega_valid CHECK (
                    estado_entrega IN ('pendiente', 'parcial', 'completado')
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pp_estado_valid') THEN
                ALTER TABLE presupuestos_proveedores ADD CONSTRAINT ck_pp_estado_valid CHECK (
                    estado IN ('contactado', 'cotizacion_recibida', 'descartado')
                );
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE presupuestos_proveedores DROP CONSTRAINT IF EXISTS ck_pp_estado_valid")
    op.execute("ALTER TABLE pedidos_proveedor DROP CONSTRAINT IF EXISTS ck_estado_entrega_valid")
    op.execute("ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS ck_importe_positivo")
    op.execute("ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS ck_prioridad_valid")
    op.execute("ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS ck_estado_valid")
    op.execute("DROP INDEX IF EXISTS ix_evaluaciones_pedido_id")
    op.execute("DROP INDEX IF EXISTS ix_proveedores_email")
    op.execute("DROP INDEX IF EXISTS ix_presupuestos_estado_archivado_fecha_limite")
    op.execute("DROP INDEX IF EXISTS ix_presupuestos_fecha_aceptacion")
    op.execute("ALTER TABLE proveedores ALTER COLUMN evaluacion_promedio TYPE DOUBLE PRECISION USING evaluacion_promedio::double precision")
    op.execute("ALTER TABLE pedidos_proveedor ALTER COLUMN importe TYPE DOUBLE PRECISION USING importe::double precision")
    op.execute("ALTER TABLE presupuestos ALTER COLUMN importe TYPE DOUBLE PRECISION USING importe::double precision")
