"""Create proveedores and related tables missed by earlier migrations.

Revision ID: 0016_create_missing_tables
Revises: 0015_phase6_search_indexes
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_create_missing_tables"
down_revision: Union[str, None] = "0015_phase6_search_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proveedores') THEN
                CREATE TABLE proveedores (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    contacto VARCHAR(255),
                    email VARCHAR(255),
                    telefono VARCHAR(50),
                    direccion TEXT,
                    notas TEXT,
                    evaluacion_promedio NUMERIC(3, 2),
                    total_evaluaciones INTEGER NOT NULL DEFAULT 0,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                );
                CREATE INDEX ix_proveedores_nombre ON proveedores (nombre);
                CREATE INDEX ix_proveedores_activo ON proveedores (activo);
                CREATE INDEX ix_proveedores_email ON proveedores (email);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evaluaciones_proveedor') THEN
                CREATE TABLE evaluaciones_proveedor (
                    id SERIAL PRIMARY KEY,
                    proveedor_id INTEGER NOT NULL REFERENCES proveedores (id) ON DELETE CASCADE,
                    pedido_id INTEGER REFERENCES pedidos_proveedor (id) ON DELETE SET NULL,
                    puntualidad INTEGER NOT NULL CHECK (puntualidad >= 1 AND puntualidad <= 5),
                    calidad INTEGER NOT NULL CHECK (calidad >= 1 AND calidad <= 5),
                    comunicacion INTEGER NOT NULL CHECK (comunicacion >= 1 AND comunicacion <= 5),
                    comentario TEXT,
                    evaluado_por VARCHAR(255),
                    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                );
                CREATE INDEX ix_evaluaciones_proveedor_id ON evaluaciones_proveedor (proveedor_id);
                CREATE INDEX ix_evaluaciones_pedido_id ON evaluaciones_proveedor (pedido_id);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'presupuestos_proveedores') THEN
                CREATE TABLE presupuestos_proveedores (
                    id SERIAL PRIMARY KEY,
                    presupuesto_id INTEGER NOT NULL REFERENCES presupuestos (id) ON DELETE CASCADE,
                    proveedor_id INTEGER NOT NULL REFERENCES proveedores (id) ON DELETE CASCADE,
                    estado VARCHAR(40) NOT NULL DEFAULT 'contactado',
                    importe_cotizado NUMERIC(12, 2),
                    fecha_cotizacion DATE,
                    notas TEXT,
                    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                    UNIQUE (presupuesto_id, proveedor_id),
                    CHECK (estado IN ('contactado','cotizacion_recibida','descartado')),
                    CHECK (importe_cotizado IS NULL OR importe_cotizado >= 0)
                );
                CREATE INDEX ix_pp_presupuesto_id ON presupuestos_proveedores (presupuesto_id);
                CREATE INDEX ix_pp_proveedor_id ON presupuestos_proveedores (proveedor_id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS presupuestos_proveedores CASCADE")
    op.execute("DROP TABLE IF EXISTS evaluaciones_proveedor CASCADE")
    op.execute("DROP TABLE IF EXISTS proveedores CASCADE")
