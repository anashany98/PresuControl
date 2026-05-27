from datetime import date, datetime, timedelta, timezone

from app.models import PedidoProveedor, Presupuesto


def create_presupuesto(db_session, numero: str, **kwargs):
    defaults = {
        "numero_presupuesto": numero,
        "cliente": f"Cliente {numero}",
        "obra_referencia": "Obra test",
        "gestor": "Gestor Test",
        "fecha_presupuesto": date.today() - timedelta(days=12),
        "importe": 1000.0,
        "estado": "Pendiente de enviar",
        "pedido_proveedor_realizado": False,
        "incidencia": False,
        "prioridad_calculada": "Verde",
        "dias_parado": 0,
        "fecha_ultima_actualizacion": datetime.now(timezone.utc) - timedelta(days=4),
        "creado_en": datetime.now(timezone.utc) - timedelta(days=12),
        "actualizado_en": datetime.now(timezone.utc),
        "version": 1,
    }
    defaults.update(kwargs)
    obj = Presupuesto(**defaults)
    db_session.add(obj)
    db_session.commit()
    db_session.refresh(obj)
    return obj


def create_pedido(db_session, presupuesto_id: int, **kwargs):
    defaults = {
        "presupuesto_id": presupuesto_id,
        "proveedor": "Proveedor test",
        "numero_pedido": "PED-001",
        "fecha_pedido": date.today() - timedelta(days=5),
        "importe": None,
        "estado_entrega": "pendiente",
        "fecha_entrega_prevista": date.today() - timedelta(days=1),
    }
    defaults.update(kwargs)
    pedido = PedidoProveedor(**defaults)
    db_session.add(pedido)
    db_session.commit()
    db_session.refresh(pedido)
    return pedido


def test_mi_mesa_returns_operational_fields_for_accepted_without_order(client, db_session):
    create_presupuesto(
        db_session,
        "MM-001",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=3),
        fecha_limite_siguiente_accion=date.today() - timedelta(days=1),
        responsable_actual="Gestor Test",
        siguiente_accion="Hacer pedido proveedor",
    )

    response = client.get("/mi-mesa")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["prioridad_operativa"] == "urgente"
    assert "Aceptado sin pedido proveedor" in item["motivos"]
    assert item["accion_recomendada"]["tipo"] == "crear_pedido"
    assert item["accion_recomendada"]["label"] == "Crear pedido"
    assert "pedido proveedor" in item["faltantes"]


def test_mi_mesa_returns_pedido_faltantes_and_serialized_pedidos(client, db_session):
    presupuesto = create_presupuesto(
        db_session,
        "MM-002",
        estado="Pedido proveedor realizado",
        pedido_proveedor_realizado=True,
        fecha_pedido_proveedor=date.today() - timedelta(days=5),
        fecha_limite_siguiente_accion=date.today() + timedelta(days=4),
        responsable_actual="Gestor Test",
        siguiente_accion="Confirmar plazo proveedor",
    )
    create_pedido(db_session, presupuesto.id)

    response = client.get("/mi-mesa")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["prioridad_operativa"] == "urgente"
    assert "Pedido proveedor vencido" in item["motivos"]
    assert "pedido sin importe" in item["faltantes"]
    assert item["accion_recomendada"]["tipo"] == "confirmar_plazo"
    assert item["pedidos"][0]["proveedor"] == "Proveedor test"


def test_presupuestos_page_quick_filters(client, db_session):
    sin_pedido = create_presupuesto(
        db_session,
        "PF-001",
        estado="Aceptado - pendiente pedido proveedor",
        fecha_aceptacion=date.today() - timedelta(days=2),
    )
    vencido = create_presupuesto(
        db_session,
        "PF-002",
        estado="Pedido proveedor realizado",
        pedido_proveedor_realizado=True,
        fecha_limite_siguiente_accion=date.today() + timedelta(days=5),
    )
    create_pedido(db_session, vencido.id)
    sin_accion = create_presupuesto(
        db_session,
        "PF-003",
        estado="Enviado al cliente",
        siguiente_accion="",
        fecha_limite_siguiente_accion=None,
    )

    response = client.get("/presupuestos-page?page_size=10&filtro_rapido=sin_pedido")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [sin_pedido.id]

    response = client.get("/presupuestos-page?page_size=10&filtro_rapido=pedidos_vencidos")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [vencido.id]

    response = client.get("/presupuestos-page?page_size=10&filtro_rapido=sin_proxima_accion")
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    assert sin_accion.id in ids
