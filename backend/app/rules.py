from datetime import date, datetime, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .schemas import ESTADOS
from .settings import get_settings


def has_pedidos(db: Session, presupuesto_id: int) -> bool:
    from .models import PedidoProveedor
    return db.query(PedidoProveedor).filter(PedidoProveedor.presupuesto_id == presupuesto_id).count() > 0


def get_pedido_counts(db: Session, presupuesto_ids: list[int]) -> dict[int, int]:
    """Pre-load pedido counts for multiple presupuesto IDs in a single query."""
    if not presupuesto_ids:
        return {}
    from sqlalchemy import func
    from .models import PedidoProveedor
    results = db.query(
        PedidoProveedor.presupuesto_id,
        func.count(PedidoProveedor.id).label('count')
    ).filter(
        PedidoProveedor.presupuesto_id.in_(presupuesto_ids)
    ).group_by(PedidoProveedor.presupuesto_id).all()
    return {row.presupuesto_id: row.count for row in results}


def all_pedidos_have_fecha_entrega_prevista(db: Session, presupuesto_id: int) -> bool:
    from .models import PedidoProveedor
    count = db.query(PedidoProveedor).filter(
        PedidoProveedor.presupuesto_id == presupuesto_id,
        PedidoProveedor.fecha_entrega_prevista.is_(None)
    ).count()
    return count == 0


def all_pedidos_completados(db: Session, presupuesto_id: int) -> bool:
    from .models import PedidoProveedor
    count = db.query(PedidoProveedor).filter(
        PedidoProveedor.presupuesto_id == presupuesto_id,
        PedidoProveedor.estado_entrega != "completado"
    ).count()
    return count == 0


CLOSED_STATES = {"Entregado / cerrado", "Cancelado / rechazado"}
ACCEPTED_STATES = {
    "Aceptado - pendiente pedido proveedor",
    "Pedido proveedor realizado",
    "Plazo proveedor confirmado",
    "En preparación / fabricación",
    "Entregado / cerrado",
}

FLOW = {
    "Pendiente de enviar": ["Enviado al cliente", "Cancelado / rechazado", "Bloqueado / incidencia"],
    "Enviado al cliente": ["Aceptado - pendiente pedido proveedor", "Cancelado / rechazado", "Bloqueado / incidencia"],
    "Aceptado - pendiente pedido proveedor": ["Pedido proveedor realizado", "Cancelado / rechazado", "Bloqueado / incidencia"],
    "Pedido proveedor realizado": ["Plazo proveedor confirmado", "Bloqueado / incidencia"],
    "Plazo proveedor confirmado": ["En preparación / fabricación", "Bloqueado / incidencia"],
    "En preparación / fabricación": ["Entregado / cerrado", "Bloqueado / incidencia"],
    "Bloqueado / incidencia": ESTADOS,
    "Cancelado / rechazado": ESTADOS,
    "Entregado / cerrado": ESTADOS,
}

def days_between(start: date | None, end: date | None = None) -> int:
    if not start:
        return 0
    end = end or date.today()
    return max((end - start).days, 0)

def empty(value):
    return value is None or (isinstance(value, str) and not value.strip())

def validate_presupuesto(obj, db: Session, existing_id: int | None = None) -> list[str]:
    errors: list[str] = []
    warnings: list[str] = []

    if empty(obj.numero_presupuesto):
        errors.append("El nº presupuesto FactuSOL es obligatorio.")
    if empty(obj.estado):
        errors.append("El estado es obligatorio.")
    elif obj.estado not in ESTADOS:
        errors.append(f"Estado no válido: {obj.estado}")

    if obj.estado == "Aceptado - pendiente pedido proveedor" and not obj.fecha_aceptacion:
        errors.append("No se puede marcar como aceptado sin fecha de aceptación.")

    if obj.estado == "Cancelado / rechazado":
        if empty(getattr(obj, "motivo_cancelacion_rechazo", None)):
            errors.append("Para cancelar o rechazar un presupuesto debes indicar el motivo de cancelación/rechazo.")
        if not getattr(obj, "fecha_cancelacion_rechazo", None):
            obj.fecha_cancelacion_rechazo = date.today()

    if obj.estado in {"Pedido proveedor realizado", "Plazo proveedor confirmado", "En preparación / fabricación", "Entregado / cerrado"}:
        if existing_id is None:
            errors.append("ID de presupuesto no proporcionado para validación.")
        elif not has_pedidos(db, existing_id):
            errors.append("No se puede marcar como pedido realizado sin pedidos de proveedor registrados.")
        obj.pedido_proveedor_realizado = True

    if obj.estado in {"Plazo proveedor confirmado", "En preparación / fabricación", "Entregado / cerrado"}:
        if existing_id is None:
            errors.append("ID de presupuesto no proporcionado para validación.")
        elif not all_pedidos_have_fecha_entrega_prevista(db, existing_id):
            errors.append("No se puede confirmar plazo sin fecha de entrega prevista en todos los pedidos.")
        if not obj.plazo_proveedor:
            errors.append("No se puede marcar plazo proveedor confirmado sin plazo proveedor.")

    if obj.estado == "Entregado / cerrado":
        if existing_id is None:
            errors.append("ID de presupuesto no proporcionado para validación.")
        elif not has_pedidos(db, existing_id):
            errors.append("No se puede cerrar si sigue pendiente el pedido proveedor.")
        elif not all_pedidos_completados(db, existing_id):
            errors.append("No se puede cerrar si hay pedidos sin entregar completamente.")

    if obj.estado in ACCEPTED_STATES and empty(obj.responsable_actual):
        errors.append("El responsable actual es obligatorio cuando el presupuesto está aceptado.")

    if obj.estado in ACCEPTED_STATES - {"Entregado / cerrado"} and empty(obj.siguiente_accion):
        errors.append("La siguiente acción es obligatoria cuando el presupuesto está aceptado y no cerrado.")

    if obj.fecha_envio_cliente and obj.fecha_presupuesto and obj.fecha_envio_cliente < obj.fecha_presupuesto:
        errors.append("La fecha de envío al cliente no puede ser anterior a la fecha del presupuesto.")

    if obj.fecha_aceptacion and obj.fecha_envio_cliente and obj.fecha_aceptacion < obj.fecha_envio_cliente:
        errors.append("La fecha de aceptación no puede ser anterior a la fecha de envío al cliente.")

    if obj.fecha_pedido_proveedor and obj.fecha_aceptacion and obj.fecha_pedido_proveedor < obj.fecha_aceptacion:
        errors.append("La fecha de pedido proveedor no puede ser anterior a la fecha de aceptación.")

    if obj.plazo_proveedor and obj.fecha_pedido_proveedor and obj.plazo_proveedor < obj.fecha_pedido_proveedor:
        errors.append("El plazo proveedor no puede ser anterior a la fecha de pedido proveedor.")

    if obj.fecha_prevista_entrega and obj.plazo_proveedor and obj.fecha_prevista_entrega < obj.plazo_proveedor:
        errors.append("La fecha prevista de entrega no puede ser anterior al plazo proveedor.")

    if obj.fecha_limite_siguiente_accion and obj.fecha_limite_siguiente_accion < date.today():
        if obj.prioridad_calculada not in {"Rojo", "Crítico"} and not obj.incidencia:
            warnings.append("Advertencia: la fecha límite está vencida sin prioridad alta o incidencia.")

    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors, "warnings": warnings})
    return warnings

def calculate_risk(obj, db: Session, settings: dict | None = None, pedido_counts: dict[int, int] | None = None) -> tuple[str, int]:
    if settings is None:
        settings = get_settings(db)
    today = date.today()
    last_update = obj.fecha_ultima_actualizacion.date() if getattr(obj, "fecha_ultima_actualizacion", None) else today
    dias_parado = days_between(last_update, today)

    # Use pre-loaded pedido counts if available (to avoid N+1)
    if pedido_counts is not None:
        pedido_count = pedido_counts.get(obj.id, 0)
        pedido_realizado = pedido_count > 0
    else:
        pedido_realizado = has_pedidos(db, obj.id) if obj.id else getattr(obj, "pedido_proveedor_realizado", False)
    accepted_no_order = obj.estado == "Aceptado - pendiente pedido proveedor" or (obj.fecha_aceptacion and not pedido_realizado)
    deadline_overdue = obj.fecha_limite_siguiente_accion and obj.fecha_limite_siguiente_accion < today
    deadline_soon = obj.fecha_limite_siguiente_accion and 0 <= (obj.fecha_limite_siguiente_accion - today).days <= 1
    sent_no_response_days = days_between(obj.fecha_envio_cliente, today) if obj.estado == "Enviado al cliente" else 0
    order_no_deadline_days = days_between(obj.fecha_pedido_proveedor, today) if pedido_realizado and not obj.plazo_proveedor else 0
    accepted_no_order_days = days_between(obj.fecha_aceptacion, today) if accepted_no_order else 0

    if (
        (accepted_no_order and accepted_no_order_days > settings["dias_critico_aceptado_sin_pedido"])
        or (obj.incidencia and dias_parado > 3)
        or (order_no_deadline_days > settings["dias_aviso_pedido_sin_plazo"])
    ):
        return "Crítico", dias_parado

    if accepted_no_order or deadline_overdue:
        return "Rojo", dias_parado

    if deadline_soon or sent_no_response_days > settings["dias_vencido_seguimiento_comercial"]:
        return "Naranja", dias_parado

    if obj.siguiente_accion and obj.estado not in CLOSED_STATES:
        return "Amarillo", dias_parado

    return "Verde", dias_parado

def apply_derived_fields(obj, db: Session):
    obj.prioridad_calculada, obj.dias_parado = calculate_risk(obj, db)
    obj.fecha_ultima_actualizacion = datetime.now(timezone.utc)
    if obj.estado == "Pedido proveedor realizado":
        obj.pedido_proveedor_realizado = True
    if obj.incidencia and obj.estado not in {"Bloqueado / incidencia", "Cancelado / rechazado", "Entregado / cerrado"}:
        pass
