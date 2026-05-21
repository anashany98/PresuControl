"""Tests for PedidoProveedor (supplier order) flows."""
import pytest
from datetime import date, datetime, timezone
from app.models import Presupuesto, PedidoProveedor


def create_presupuesto(db_session, numero="TEST-001", estado="Pendiente de enviar"):
    p = Presupuesto(
        numero_presupuesto=numero,
        cliente="Test",
        obra_referencia="Obra",
        gestor="Gestor",
        fecha_presupuesto=date.today(),
        importe=1000.0,
        estado=estado,
        version=1,
        prioridad_calculada="Verde",
        dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc),
        actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


class TestCreatePedido:

    def test_crear_pedido_valido(self, client, db_session):
        """POST /presupuestos/{id}/pedidos con proveedor crea pedido."""
        p = create_presupuesto(db_session, numero="PED-001")
        payload = {
            "proveedor": "Supplier ABC",
            "numero_pedido": "PO-001",
            "fecha_pedido": date.today().isoformat(),
            "importe": 500.0,
            "estado_entrega": "pendiente",
        }
        response = client.post(f"/presupuestos/{p.id}/pedidos", json=payload)
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["proveedor"] == "Supplier ABC"
        assert data["numero_pedido"] == "PO-001"
        assert data["presupuesto_id"] == p.id

    def test_crear_pedido_sin_proveedor(self, client, db_session):
        """POST /presupuestos/{id}/pedidos sin proveedor (min_length=1) devuelve 422."""
        p = create_presupuesto(db_session, numero="NOPROV-001")
        payload = {
            "proveedor": "",
        }
        response = client.post(f"/presupuestos/{p.id}/pedidos", json=payload)
        assert response.status_code == 422

    def test_crear_pedido_linked_to_presupuesto(self, client, db_session):
        """El pedido se crea correctamente linked al presupuesto."""
        p = create_presupuesto(db_session, numero="LINKED-001")
        payload = {
            "proveedor": "Linked Supplier",
        }
        response = client.post(f"/presupuestos/{p.id}/pedidos", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["presupuesto_id"] == p.id


class TestUpdatePedido:

    def test_update_pedido_numero(self, client, db_session):
        """PATCH /pedidos/{id} actualiza numero_pedido."""
        p = create_presupuesto(db_session, numero="UPD-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        payload = {
            "numero_pedido": "PO-NEW-001",
        }
        response = client.patch(f"/pedidos/{pedido_id}", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["numero_pedido"] == "PO-NEW-001"

    def test_update_pedido_importe(self, client, db_session):
        """PATCH /pedidos/{id} actualiza importe."""
        p = create_presupuesto(db_session, numero="UPDIMP-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        payload = {
            "importe": 1500.0,
        }
        response = client.patch(f"/pedidos/{pedido_id}", json=payload)
        assert response.status_code == 200
        assert response.json()["importe"] == 1500.0

    def test_update_pedido_estado_entrega(self, client, db_session):
        """PATCH /pedidos/{id} actualiza estado_entrega."""
        p = create_presupuesto(db_session, numero="UPEST-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        payload = {
            "estado_entrega": "completado",
        }
        response = client.patch(f"/pedidos/{pedido_id}", json=payload)
        assert response.status_code == 200
        assert response.json()["estado_entrega"] == "completado"

    def test_update_pedido_fecha_entrega_prevista(self, client, db_session):
        """PATCH /pedidos/{id} actualiza fecha_entrega_prevista."""
        p = create_presupuesto(db_session, numero="UPFECHA-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        nueva_fecha = date.today()
        payload = {
            "fecha_entrega_prevista": nueva_fecha.isoformat(),
        }
        response = client.patch(f"/pedidos/{pedido_id}", json=payload)
        assert response.status_code == 200
        assert response.json()["fecha_entrega_prevista"] is not None

    def test_update_pedido_observaciones(self, client, db_session):
        """PATCH /pedidos/{id} actualiza observaciones."""
        p = create_presupuesto(db_session, numero="UPOBS-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        payload = {
            "observaciones": "Entregado en perfectas condiciones",
        }
        response = client.patch(f"/pedidos/{pedido_id}", json=payload)
        assert response.status_code == 200
        assert response.json()["observaciones"] == "Entregado en perfectas condiciones"


class TestDeletePedido:

    def test_delete_pedido_no_existe(self, client, db_session):
        """DELETE /pedidos/{id} inexistente devuelve 404."""
        response = client.delete("/pedidos/99999")
        assert response.status_code == 404

    def test_delete_pedido_existe(self, client, db_session):
        """DELETE /pedidos/{id} elimina pedido."""
        p = create_presupuesto(db_session, numero="DELPED-001")
        pedido_response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Delete Supplier",
        })
        pedido_id = pedido_response.json()["id"]
        response = client.delete(f"/pedidos/{pedido_id}")
        assert response.status_code == 200, response.json()