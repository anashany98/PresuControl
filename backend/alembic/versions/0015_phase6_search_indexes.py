"""Phase 6 search indexes and trigram support

Revision ID: 0015_phase6_search_indexes
Revises: 0014_phase5_data_integrity
Create Date: 2026-05-22
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0015_phase6_search_indexes"
down_revision: Union[str, None] = "0014_phase5_data_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEARCH_INDEXES = (
    ("ix_presupuestos_numero_presupuesto_trgm", "presupuestos", "numero_presupuesto"),
    ("ix_presupuestos_cliente_trgm", "presupuestos", "cliente"),
    ("ix_presupuestos_obra_referencia_trgm", "presupuestos", "obra_referencia"),
    ("ix_presupuestos_gestor_trgm", "presupuestos", "gestor"),
    ("ix_presupuestos_proveedor_trgm", "presupuestos", "proveedor"),
    ("ix_presupuestos_numero_pedido_proveedor_trgm", "presupuestos", "numero_pedido_proveedor"),
    ("ix_presupuestos_observaciones_trgm", "presupuestos", "observaciones"),
    ("ix_presupuestos_descripcion_incidencia_trgm", "presupuestos", "descripcion_incidencia"),
    ("ix_comentarios_comentario_trgm", "comentarios", "comentario"),
    ("ix_historial_descripcion_trgm", "historial_cambios", "descripcion"),
    ("ix_historial_valor_anterior_trgm", "historial_cambios", "valor_anterior"),
    ("ix_historial_valor_nuevo_trgm", "historial_cambios", "valor_nuevo"),
    ("ix_proveedores_nombre_trgm", "proveedores", "nombre"),
    ("ix_proveedores_contacto_trgm", "proveedores", "contacto"),
    ("ix_proveedores_email_trgm", "proveedores", "email"),
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for index_name, table_name, column_name in SEARCH_INDEXES:
        op.execute(
            f"DO $$ BEGIN "
            f"IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '{table_name}') THEN "
            f"  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '{table_name}' AND column_name = '{column_name}') THEN "
            f"    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '{index_name}') THEN "
            f"      CREATE INDEX {index_name} ON {table_name} USING gin ({column_name} gin_trgm_ops); "
            f"    END IF; "
            f"  END IF; "
            f"END IF; "
            f"END $$;"
        )


def downgrade() -> None:
    for index_name, _table_name, _column_name in reversed(SEARCH_INDEXES):
        op.execute(f"DROP INDEX IF EXISTS {index_name}")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
