ESTADOS = [
    "Pendiente de enviar",
    "Enviado al cliente",
    "Aceptado - pendiente pedido proveedor",
    "Pedido proveedor realizado",
    "Plazo proveedor confirmado",
    "En preparación / fabricación",
    "Entregado / cerrado",
    "Cancelado / rechazado",
    "Bloqueado / incidencia",
]

CLOSED_STATES = {"Entregado / cerrado", "Cancelado / rechazado"}

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

ACCEPTED_STATES = {
    "Aceptado - pendiente pedido proveedor",
    "Pedido proveedor realizado",
    "Plazo proveedor confirmado",
    "En preparación / fabricación",
    "Entregado / cerrado",
}
