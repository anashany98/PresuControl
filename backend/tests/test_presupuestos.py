"""Tests for presupuesto flows: CRUD, state transitions, quick actions, expected_version, validations."""
import pytest
from datetime import date, datetime, timezone
from app.models import Presupuesto, PedidoProveedor


def create_presupuesto(db_session, numero="TEST-001", estado="Pendiente de enviar", cliente="Test Client",
                       gestor="Gestor Test", importe=1000.0, fecha_presupuesto=None, **kwargs):
    if fecha_presupuesto is None:
        fecha_presupuesto = date.today()
    defaults = dict(
        numero_presupuesto=numero,
        estado=estado,
        cliente=cliente,
        obra_referencia="Obra test",
        gestor=gestor,
        fecha_presupuesto=fecha_presupuesto,
        importe=importe,
        version=1,
        prioridad_calculada="Verde",
        dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc),
        actualizado_en=datetime.now(timezone.utc),
    )
    defaults.update(kwargs)
    p = Presupuesto(**defaults)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def create_pedido(db_session, presupuesto_id, proveedor="Test Supplier", numero_pedido="PO-001"):
    pedido = PedidoProveedor(
        presupuesto_id=presupuesto_id,
        proveedor=proveedor,
        numero_pedido=numero_pedido,
        fecha_pedido=date.today(),
        estado_entrega="pendiente"
    )
    db_session.add(pedido)
    db_session.commit()
    db_session.refresh(pedido)
    return pedido


class TestCreatePresupuesto:

    def test_crear_presupuesto_valido(self, client, db_session):
        """POST /presupuestos con campos obligatorios crea presupuesto."""
        payload = {
            "numero_presupuesto": "NEW-001",
            "cliente": "Nuevo Cliente",
            "obra_referencia": "Nueva Obra",
            "gestor": "Gestor Nuevo",
            "fecha_presupuesto": date.today().isoformat(),
            "importe": 1500.0,
            "estado": "Pendiente de enviar",
        }
        response = client.post("/presupuestos", json=payload)
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["numero_presupuesto"] == "NEW-001"
        assert data["version"] == 1

    def test_crear_presupuesto_sin_campos_obligatorios(self, client, db_session):
        """POST /presupuestos sin campos obligatorios devuelve 422."""
        payload = {
            "numero_presupuesto": "",
            "cliente": "",
            "obra_referencia": "",
            "gestor": "",
            "fecha_presupuesto": None,
            "importe": -100,
            "estado": "",
        }
        response = client.post("/presupuestos", json=payload)
        assert response.status_code == 422


class TestListPresupuestos:

    def test_list_presupuestos_devuelve_lista(self, client, db_session):
        """GET /presupuestos devuelve lista de presupuestos."""
        create_presupuesto(db_session, numero="LIST-001")
        create_presupuesto(db_session, numero="LIST-002")
        response = client.get("/api/presupuestos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    def test_list_presupuestos_filtro_estado(self, client, db_session):
        """GET /api/presupuestos?estado=... filtra correctamente."""
        create_presupuesto(db_session, numero="FILTER-001", estado="Pendiente de enviar")
        create_presupuesto(db_session, numero="FILTER-002", estado="Enviado al cliente")
        response = client.get("/api/presupuestos?estado=Pendiente de enviar")
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert item["estado"] == "Pendiente de enviar"

    def test_list_presupuestos_con_archivados(self, client, db_session):
        """GET /api/presupuestos?include_archivados=true incluye archivados."""
        create_presupuesto(db_session, numero="ARCH-001", archivado=True)
        response = client.get("/api/presupuestos?include_archivados=true")
        assert response.status_code == 200
        data = response.json()
        assert any(p["numero_presupuesto"] == "ARCH-001" for p in data)

    def test_list_presupuestos_sin_archivados_por_defecto(self, client, db_session):
        """GET /presupuestos por defecto no incluye archivados."""
        create_presupuesto(db_session, numero="NOARCH-001", archivado=True)
        response = client.get("/api/presupuestos")
        assert response.status_code == 200
        data = response.json()
        assert not any(p["numero_presupuesto"] == "NOARCH-001" for p in data)


class TestGetPresupuesto:

    def test_get_presupuesto_existe(self, client, db_session):
        """GET /presupuestos/{id} devuelve presupuesto."""
        p = create_presupuesto(db_session, numero="GET-001")
        response = client.get(f"/presupuestos/{p.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["numero_presupuesto"] == "GET-001"
        assert "pedidos" in data

    def test_get_presupuesto_no_existe(self, client, db_session):
        """GET /presupuestos/{id} inexistente devuelve 404."""
        response = client.get("/presupuestos/99999")
        assert response.status_code == 404


class TestUpdatePresupuesto:

    def test_update_con_expected_version_correcto(self, client, db_session):
        """PATCH /presupuestos/{id} con expected_version correcto funciona."""
        p = create_presupuesto(db_session, numero="UPDATE-001", version=1)
        payload = {
            "cliente": "Cliente Actualizado",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["cliente"] == "Cliente Actualizado"
        assert data["version"] == 2

    def test_update_sin_expected_version(self, client, db_session):
        """PATCH sin expected_version devuelve 422."""
        p = create_presupuesto(db_session, numero="NOVERSION-001")
        payload = {
            "cliente": "Cliente",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_con_expected_version_obsoleto(self, client, db_session):
        """PATCH con expected_version obsoleto devuelve 409."""
        p = create_presupuesto(db_session, numero="STALE-001", version=3)
        payload = {
            "cliente": "Cliente",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 409


class TestStateValidations:

    def test_update_estado_sin_fecha_aceptacion(self, client, db_session):
        """Estado Aceptado sin fecha_aceptacion devuelve 422."""
        p = create_presupuesto(db_session, numero="NOACCEPT-001", estado="Enviado al cliente")
        payload = {
            "estado": "Aceptado - pendiente pedido proveedor",
            "responsable_actual": "Compras",
            "siguiente_accion": "Hacer pedido",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_pedido_realizado_sin_pedidos_proveedor(self, client, db_session):
        """Estado Pedido realizado sin pedidos de proveedor devuelve 422."""
        p = create_presupuesto(db_session, numero="NOPEDIDO-001", estado="Aceptado - pendiente pedido proveedor",
                               fecha_aceptacion=date.today())
        payload = {
            "estado": "Pedido proveedor realizado",
            "responsable_actual": "Compras",
            "siguiente_accion": "Confirmar plazo",
            "expected_version": 1,
            "modificado_por": "Test",
            "fecha_aceptacion": date.today().isoformat(),
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_cancelar_sin_motivo(self, client, db_session):
        """Estado Cancelado sin motivo_cancelacion_rechazo devuelve 422."""
        p = create_presupuesto(db_session, numero="NOCANCEL-001")
        payload = {
            "estado": "Cancelado / rechazado",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_plazo_confirmado_sin_fecha_entrega_en_pedidos(self, client, db_session):
        """Plazo confirmado sin fecha_entrega_prevista en todos los pedidos devuelve 422."""
        p = create_presupuesto(db_session, 
            numero="NOPLAZO-001",
            estado="Pedido proveedor realizado",
            fecha_aceptacion=date.today()
        )
        create_pedido(db_session, p.id, proveedor="Supplier1")
        payload = {
            "estado": "Plazo proveedor confirmado",
            "plazo_proveedor": date.today().isoformat(),
            "responsable_actual": "Compras",
            "siguiente_accion": "Esperar entrega",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_cerrar_con_pedidos_sin_entregar(self, client, db_session):
        """Cerrar presupuesto con pedidos sin entregar devuelve 422."""
        p = create_presupuesto(db_session, 
            numero="NOCLOSE-001",
            estado="En preparación / fabricación",
            fecha_aceptacion=date.today()
        )
        create_pedido(db_session, p.id, proveedor="Supplier1")
        payload = {
            "estado": "Entregado / cerrado",
            "responsable_actual": "Compras",
            "expected_version": 1,
            "modificado_por": "Test",
            "fecha_aceptacion": date.today().isoformat(),
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_aceptado_sin_responsable_actual(self, client, db_session):
        """Presupuesto aceptado sin responsable_actual devuelve 422."""
        p = create_presupuesto(db_session, numero="NORESP-001", estado="Enviado al cliente")
        payload = {
            "estado": "Aceptado - pendiente pedido proveedor",
            "fecha_aceptacion": date.today().isoformat(),
            "siguiente_accion": "Hacer pedido",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422

    def test_update_aceptado_sin_siguiente_accion(self, client, db_session):
        """Presupuesto aceptado sin siguiente_accion devuelve 422."""
        p = create_presupuesto(db_session, numero="NOACTION-001", estado="Enviado al cliente")
        payload = {
            "estado": "Aceptado - pendiente pedido proveedor",
            "fecha_aceptacion": date.today().isoformat(),
            "responsable_actual": "Compras",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.patch(f"/presupuestos/{p.id}", json=payload)
        assert response.status_code == 422


class TestQuickActions:

    def test_quick_action_marcar_enviado(self, client, db_session):
        """Quick action marcar_enviado setea fecha_envio_cliente."""
        p = create_presupuesto(db_session, numero="SEND-001")
        payload = {
            "action": "marcar_enviado",
            "expected_version": 1,
            "modificado_por": "Test",
            "fecha_envio_cliente": date.today().isoformat(),
        }
        response = client.post(f"/presupuestos/{p.id}/quick-action", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["fecha_envio_cliente"] is not None
        assert data["estado"] == "Enviado al cliente"

    def test_quick_action_marcar_aceptado(self, client, db_session):
        """Quick action marcar_aceptado setea fecha_aceptacion."""
        p = create_presupuesto(db_session, numero="ACC-001", estado="Enviado al cliente")
        payload = {
            "action": "marcar_aceptado",
            "expected_version": 1,
            "modificado_por": "Test",
            "fecha_aceptacion": date.today().isoformat(),
        }
        response = client.post(f"/presupuestos/{p.id}/quick-action", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["fecha_aceptacion"] is not None
        assert data["estado"] == "Aceptado - pendiente pedido proveedor"

    def test_quick_action_cancelar_sin_motivo(self, client, db_session):
        """Quick action cancelar sin motivo devuelve 422."""
        p = create_presupuesto(db_session, numero="QC-001")
        payload = {
            "action": "cancelar",
            "expected_version": 1,
            "modificado_por": "Test",
        }
        response = client.post(f"/presupuestos/{p.id}/quick-action", json=payload)
        assert response.status_code == 422

    def test_quick_action_cancelar_con_motivo(self, client, db_session):
        """Quick action cancelar con motivo funciona."""
        p = create_presupuesto(db_session, numero="QCOK-001")
        payload = {
            "action": "cancelar",
            "expected_version": 1,
            "modificado_por": "Test",
            "motivo_cancelacion_rechazo": "Cliente rechazó",
        }
        response = client.post(f"/presupuestos/{p.id}/quick-action", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["estado"] == "Cancelado / rechazado"
        assert data["motivo_cancelacion_rechazo"] == "Cliente rechazó"

    def test_quick_action_crear_pedido_proveedor(self, client, db_session):
        """Quick action crear_pedido_proveedor crea pedido y cambia estado."""
        p = create_presupuesto(db_session, numero="QCPED-001", estado="Aceptado - pendiente pedido proveedor",
                               fecha_aceptacion=date.today())
        payload = {
            "action": "crear_pedido_proveedor",
            "expected_version": 1,
            "modificado_por": "Test",
            "proveedor": "Supplier Quick",
        }
        response = client.post(f"/presupuestos/{p.id}/quick-action", json=payload)
        assert response.status_code == 200, response.json()


class TestArchive:

    def test_archivar_presupuesto(self, client, db_session):
        """POST /presupuestos/{id}/archivar archiva con motivo."""
        p = create_presupuesto(db_session, numero="ARCH-001")
        payload = {
            "motivo_archivado": "Proyecto cancelado",
            "expected_version": 1,
        }
        response = client.post(f"/presupuestos/{p.id}/archivar", json=payload)
        assert response.status_code == 200, response.json()
        data = response.json()
        assert data["archivado"] is True
        assert data["motivo_archivado"] == "Proyecto cancelado"

    def test_archivar_sin_motivo(self, client, db_session):
        """Archivar sin motivo devuelve 422."""
        p = create_presupuesto(db_session, numero="ARCHNO-001")
        payload = {
            "motivo_archivado": "",
            "expected_version": 1,
        }
        response = client.post(f"/presupuestos/{p.id}/archivar", json=payload)
        assert response.status_code == 422


class TestPresupuestoPedidos:

    def test_presupuesto_con_pedidos_cargados(self, client, db_session):
        """GET /presupuestos/{id} incluye pedidos."""
        p = create_presupuesto(db_session, numero="WPED-001")
        create_pedido(db_session, p.id, proveedor="Supplier 1", numero_pedido="PO-001")
        create_pedido(db_session, p.id, proveedor="Supplier 2", numero_pedido="PO-002")
        response = client.get(f"/presupuestos/{p.id}")
        assert response.status_code == 200
        data = response.json()
        assert "pedidos" in data
        assert len(data["pedidos"]) == 2


class TestComentarios:

    def test_crear_comentario(self, client, db_session):
        """POST /presupuestos/{id}/comentarios crea comentario."""
        p = create_presupuesto(db_session, numero="COMMENT-001")
        payload = {
            "comentario": "Este es un comentario de prueba",
            "nombre_opcional": "Test User",
        }
        response = client.post(f"/api/presupuestos/{p.id}/comentarios", json=payload)
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["comentario"] == "Este es un comentario de prueba"

    def test_list_comentarios(self, client, db_session):
        """GET /presupuestos/{id}/comentarios lista comentarios."""
        p = create_presupuesto(db_session, numero="LISTCOM-001")
        client.post(f"/api/presupuestos/{p.id}/comentarios", json={"comentario": "Comentario 1"})
        client.post(f"/api/presupuestos/{p.id}/comentarios", json={"comentario": "Comentario 2"})
        response = client.get(f"/api/presupuestos/{p.id}/comentarios")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2


class TestHistorial:

    def test_historial_vacio_inicialmente(self, client, db_session):
        """GET /presupuestos/{id}/historial devuelve array (vacío inicialmente)."""
        p = create_presupuesto(db_session, numero="HIST-001")
        response = client.get(f"/api/presupuestos/{p.id}/historial")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)