from __future__ import annotations

from typing import Any

from .models import Presupuesto

SERIALIZE_FIELDS = [
    "id", "numero_presupuesto", "cliente", "obra_referencia", "gestor", "fecha_presupuesto",
    "fecha_envio_cliente", "fecha_aceptacion", "importe", "estado", "proveedor",
    "pedido_proveedor_realizado", "numero_pedido_proveedor", "fecha_pedido_proveedor",
    "plazo_proveedor", "fecha_prevista_entrega", "responsable_actual", "siguiente_accion",
    "fecha_limite_siguiente_accion", "incidencia", "descripcion_incidencia", "observaciones",
    "motivo_cancelacion_rechazo", "fecha_cancelacion_rechazo", "archivado", "archivado_en",
    "archivado_por", "motivo_archivado", "prioridad_calculada", "dias_parado",
    "fecha_ultima_actualizacion", "creado_en", "actualizado_en", "version",
]


def serialize(obj: Presupuesto) -> dict[str, Any]:
    return {field: getattr(obj, field) for field in SERIALIZE_FIELDS}
