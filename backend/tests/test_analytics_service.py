from datetime import date, datetime, timedelta, timezone

from app.analytics import build_dashboard_payload, build_sidebar_counters, get_report_rows
from app.auth import hash_password
from app.models import PedidoProveedor, Presupuesto, Usuario


def create_presupuesto(db_session, numero: str, **kwargs):
    defaults = {
        "numero_presupuesto": numero,
        "cliente": f"Cliente {numero}",
        "obra_referencia": "Obra test",
        "gestor": "Gestor Test",
        "fecha_presupuesto": date.today() - timedelta(days=10),
        "importe": 1000.0,
        "estado": "Pendiente de enviar",
        "pedido_proveedor_realizado": False,
        "incidencia": False,
        "prioridad_calculada": "Verde",
        "dias_parado": 0,
        "fecha_ultima_actualizacion": datetime.now(timezone.utc) - timedelta(days=1),
        "creado_en": datetime.now(timezone.utc) - timedelta(days=10),
        "actualizado_en": datetime.now(timezone.utc),
        "version": 1,
    }
    defaults.update(kwargs)
    obj = Presupuesto(**defaults)
    db_session.add(obj)
    db_session.commit()
    db_session.refresh(obj)
    return obj


def create_pedido(db_session, presupuesto_id: int, estado_entrega: str = "pendiente"):
    pedido = PedidoProveedor(
        presupuesto_id=presupuesto_id,
        proveedor="Proveedor test",
        numero_pedido="PO-001",
        fecha_pedido=date.today() - timedelta(days=3),
        estado_entrega=estado_entrega,
    )
    db_session.add(pedido)
    db_session.commit()
    return pedido


def test_sidebar_counters_uses_aggregates_and_real_order_state(db_session):
    accepted_no_order = create_presupuesto(
        db_session,
        "ACC-001",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=4),
        importe=1000,
    )
    create_presupuesto(
        db_session,
        "INC-001",
        estado="Enviado al cliente",
        incidencia=True,
        importe=500,
    )
    pending_order = create_presupuesto(
        db_session,
        "PED-001",
        estado="Pedido proveedor realizado",
        pedido_proveedor_realizado=True,
        fecha_aceptacion=date.today() - timedelta(days=5),
        fecha_pedido_proveedor=date.today() - timedelta(days=3),
        responsable_actual="Compras",
        siguiente_accion="Confirmar plazo",
        importe=300,
    )
    create_pedido(db_session, pending_order.id, "pendiente")
    create_presupuesto(
        db_session,
        "OK-001",
        estado="Enviado al cliente",
        importe=200,
    )
    db_session.add(Usuario(
        nombre="Pendiente",
        email="pendiente@test.com",
        hashed_password=hash_password("password123"),
        activo=True,
        aprobado=False,
    ))
    db_session.commit()

    counters = build_sidebar_counters(db_session)

    assert counters["aceptados_sin_pedido"] == 1
    assert counters["incidencias"] == 1
    assert counters["pedidos_pendientes"] == 1
    assert counters["usuarios_pendientes"] == 1
    assert counters["riesgo"] == 3
    assert counters["hoy"] == 3
    assert counters["dinero_riesgo"] == accepted_no_order.importe + 500 + pending_order.importe


def test_report_rows_alias_accepted_without_order_uses_pedidos_table(db_session):
    without_order = create_presupuesto(
        db_session,
        "NO-ORDER",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=2),
    )
    with_order = create_presupuesto(
        db_session,
        "WITH-ORDER",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=2),
    )
    create_pedido(db_session, with_order.id, "pendiente")

    rows = get_report_rows(db_session, "aceptados_sin_pedido")

    assert [row.numero_presupuesto for row in rows] == [without_order.numero_presupuesto]


def test_dashboard_payload_groups_work_into_cards_and_sections(db_session):
    create_presupuesto(
        db_session,
        "DASH-ACC",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=3),
        importe=750,
    )
    create_presupuesto(
        db_session,
        "DASH-INC",
        estado="Enviado al cliente",
        incidencia=True,
        importe=250,
    )

    payload = build_dashboard_payload(db_session)

    assert payload["cards"]["total_activos"] == 2
    assert payload["cards"]["aceptados_sin_pedido"] == 1
    assert payload["cards"]["incidencias_abiertas"] == 1
    assert payload["cards"]["importe_aceptado_pendiente_pedido"] == 750
    assert payload["sections"]["criticos_aceptados_sin_pedido"][0]["numero_presupuesto"] == "DASH-ACC"
