from datetime import date, datetime, timezone

from app.models import PedidoProveedor, Presupuesto, PresupuestoProveedor, Proveedor
from app.schemas import ESTADOS


def create_presupuesto(db_session, numero="P5-001", estado="Pendiente de enviar"):
    presupuesto = Presupuesto(
        numero_presupuesto=numero,
        cliente="Cliente",
        obra_referencia="Obra",
        gestor="Gestor",
        fecha_presupuesto=date.today(),
        importe=1000,
        estado=estado,
        version=1,
        prioridad_calculada="Verde",
        dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc),
        actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(presupuesto)
    db_session.commit()
    db_session.refresh(presupuesto)
    return presupuesto


def test_borrador_is_valid_across_api_contract(client, db_session):
    assert "Borrador" in ESTADOS
    payload = {
        "numero_presupuesto": "BOR-001",
        "cliente": "Cliente",
        "obra_referencia": "Obra",
        "gestor": "Gestor",
        "fecha_presupuesto": date.today().isoformat(),
        "importe": 100,
        "estado": "Borrador",
    }

    response = client.post("/presupuestos", json=payload)

    assert response.status_code == 201, response.json()
    assert response.json()["estado"] == "Borrador"


def test_invalid_presupuesto_estado_is_rejected(client):
    payload = {
        "numero_presupuesto": "BAD-EST-001",
        "cliente": "Cliente",
        "obra_referencia": "Obra",
        "gestor": "Gestor",
        "fecha_presupuesto": date.today().isoformat(),
        "importe": 100,
        "estado": "Estado inventado",
    }

    response = client.post("/presupuestos", json=payload)

    assert response.status_code == 422


def test_presupuesto_output_exposes_proveedores_asociados(client, db_session):
    presupuesto = create_presupuesto(db_session, numero="P5-REL-001")
    proveedor = Proveedor(nombre="Proveedor Relacionado")
    db_session.add(proveedor)
    db_session.commit()
    db_session.refresh(proveedor)
    db_session.add(PresupuestoProveedor(
        presupuesto_id=presupuesto.id,
        proveedor_id=proveedor.id,
        estado="contactado",
    ))
    db_session.commit()

    response = client.get(f"/presupuestos/{presupuesto.id}")

    assert response.status_code == 200, response.json()
    data = response.json()
    assert "proveedores_asociados" in data
    assert data["proveedores_asociados"][0]["proveedor"]["nombre"] == "Proveedor Relacionado"


def test_create_pedido_can_reference_catalog_provider(client, db_session):
    presupuesto = create_presupuesto(db_session, numero="P5-PED-001")
    proveedor = Proveedor(nombre="Proveedor Catalogado")
    db_session.add(proveedor)
    db_session.commit()
    db_session.refresh(proveedor)

    response = client.post(f"/presupuestos/{presupuesto.id}/pedidos", json={
        "proveedor_id": proveedor.id,
        "proveedor": "",
        "numero_pedido": "PO-5",
    })

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["proveedor_id"] == proveedor.id
    assert data["proveedor"] == "Proveedor Catalogado"
    assert data["proveedor_nombre_snapshot"] == "Proveedor Catalogado"


def test_invalid_pedido_values_are_rejected(client, db_session):
    presupuesto = create_presupuesto(db_session, numero="P5-BAD-PED-001")

    negative_amount = client.post(f"/presupuestos/{presupuesto.id}/pedidos", json={
        "proveedor": "Proveedor",
        "importe": -1,
    })
    invalid_state = client.post(f"/presupuestos/{presupuesto.id}/pedidos", json={
        "proveedor": "Proveedor",
        "estado_entrega": "inventado",
    })

    assert negative_amount.status_code == 422
    assert invalid_state.status_code == 422


def test_invalid_presupuesto_proveedor_values_are_rejected(client, db_session):
    presupuesto = create_presupuesto(db_session, numero="P5-BAD-PP-001")
    proveedor = Proveedor(nombre="Proveedor")
    db_session.add(proveedor)
    db_session.commit()
    db_session.refresh(proveedor)

    invalid_state = client.post(f"/presupuestos/{presupuesto.id}/proveedores", json={
        "proveedor_id": proveedor.id,
        "estado": "inventado",
    })
    negative_quote = client.post(f"/presupuestos/{presupuesto.id}/proveedores", json={
        "proveedor_id": proveedor.id,
        "importe_cotizado": -1,
    })

    assert invalid_state.status_code == 422
    assert negative_quote.status_code == 422
