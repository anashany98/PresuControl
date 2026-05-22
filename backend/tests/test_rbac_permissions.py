"""Tests de permisos RBAC: admin_sistema vs gestion en endpoints reales."""
import pytest
from datetime import date, datetime, timezone
from app.models import Usuario, Presupuesto, PedidoProveedor, Proveedor
from app.auth import hash_password, create_access_token


def _auth_header(email: str, nombre: str = "Test") -> dict:
    token = create_access_token(email, {"name": nombre, "role": "admin_sistema"})
    return {"Authorization": f"Bearer {token}"}


def _create_user(db_session, email: str, nombre: str, **kwargs):
    defaults = {
        "email": email, "nombre": nombre,
        "hashed_password": hash_password("password123456"),
        "activo": True, "aprobado": True,
    }
    defaults.update(kwargs)
    user = Usuario(**defaults)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_presupuesto(db_session, numero: str, estado: str = "Pendiente de enviar"):
    p = Presupuesto(
        numero_presupuesto=numero, cliente="Cliente", obra_referencia="Obra",
        gestor="Gestor", fecha_presupuesto=date.today(), importe=1000,
        estado=estado, version=1, prioridad_calculada="Verde", dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc), actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


class TestAccessControlUnit:
    """Tests unitarios de funciones de access_control."""

    def test_user_role_admin_by_legacy_flag(self):
        from app.access_control import user_role
        user = Usuario(email="a@t.com", hashed_password="x", nombre="A", puede_gestionar_sistema=True)
        assert user_role(user) == "admin_sistema"

    def test_user_role_gestion_by_default(self):
        from app.access_control import user_role
        user = Usuario(email="g@t.com", hashed_password="x", nombre="G")
        assert user_role(user) == "gestion"

    def test_user_role_admin_by_rol_column(self):
        from app.access_control import user_role
        user = Usuario(email="a2@t.com", hashed_password="x", nombre="A2", rol="admin_sistema")
        assert user_role(user) == "admin_sistema"

    def test_user_role_none_for_none_user(self):
        from app.access_control import user_role
        assert user_role(None) is None

    def test_sync_legacy_flag_sets_true_for_admin(self):
        from app.access_control import sync_legacy_system_flag
        user = Usuario(email="x@t.com", hashed_password="x", nombre="X", rol="admin_sistema")
        sync_legacy_system_flag(user)
        assert user.puede_gestionar_sistema is True

    def test_require_role_returns_none_when_auth_disabled(self, monkeypatch):
        from app.access_control import require_role
        from fastapi import Request
        monkeypatch.setattr("app.access_control.is_auth_enabled", lambda: False)
        request = Request({"type": "http", "method": "GET", "path": "/"})
        assert require_role(request, "admin_sistema") is None

    def test_require_role_raises_401_when_no_user(self, monkeypatch):
        from app.access_control import require_role
        from fastapi import Request
        import pytest as pt
        monkeypatch.setattr("app.access_control.is_auth_enabled", lambda: True)
        request = Request({"type": "http", "method": "GET", "path": "/"})
        with pt.raises(Exception) as exc:
            require_role(request, "admin_sistema")
        assert exc.value.status_code == 401

    def test_require_role_raises_403_when_wrong_role(self, monkeypatch):
        from app.access_control import require_role
        from fastapi import Request
        import pytest as pt
        monkeypatch.setattr("app.access_control.is_auth_enabled", lambda: True)
        user = Usuario(email="x@t.com", hashed_password="x", nombre="X", rol="gestion")
        request = Request({"type": "http", "method": "GET", "path": "/"})
        request.state.user = user
        with pt.raises(Exception) as exc:
            require_role(request, "admin_sistema")
        assert exc.value.status_code == 403


class TestAdminOnlyEndpoints:
    """Endpoints que solo admin_sistema puede acceder."""

    def test_gestion_cannot_list_usuarios(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion@test.com", "Gestion", rol="gestion", puede_gestionar_sistema=False)
        response = client.get("/usuarios", headers=_auth_header("gestion@test.com"))
        assert response.status_code == 403

    def test_admin_can_list_usuarios(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "admin@test.com", "Admin", rol="admin_sistema", puede_gestionar_sistema=True)
        response = client.get("/usuarios", headers=_auth_header("admin@test.com"))
        assert response.status_code == 200

    def test_gestion_cannot_access_settings(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion2@test.com", "Gestion2", rol="gestion", puede_gestionar_sistema=False)
        response = client.get("/settings", headers=_auth_header("gestion2@test.com"))
        assert response.status_code == 403

    def test_admin_can_access_settings(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "admin2@test.com", "Admin2", rol="admin_sistema", puede_gestionar_sistema=True)
        response = client.get("/settings", headers=_auth_header("admin2@test.com"))
        assert response.status_code == 200

    def test_gestion_cannot_access_logs(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion3@test.com", "Gestion3", rol="gestion", puede_gestionar_sistema=False)
        response = client.get("/logs/emails", headers=_auth_header("gestion3@test.com"))
        assert response.status_code == 403


class TestOperationalEndpoints:
    """Endpoints operativos accesibles por ambos roles."""

    def test_gestion_can_create_presupuesto(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion4@test.com", "Gestion4", rol="gestion", puede_gestionar_sistema=False)
        response = client.post("/presupuestos", json={
            "numero_presupuesto": "RB-001", "cliente": "C", "obra_referencia": "O",
            "gestor": "G", "fecha_presupuesto": date.today().isoformat(),
            "importe": 100, "estado": "Pendiente de enviar",
        }, headers=_auth_header("gestion4@test.com"))
        assert response.status_code == 201

    def test_gestion_can_list_presupuestos(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion5@test.com", "Gestion5", rol="gestion", puede_gestionar_sistema=False)
        _create_presupuesto(db_session, "RB-002")
        response = client.get("/presupuestos", headers=_auth_header("gestion5@test.com"))
        assert response.status_code == 200

    def test_gestion_can_create_pedido(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion6@test.com", "Gestion6", rol="gestion", puede_gestionar_sistema=False)
        p = _create_presupuesto(db_session, "RB-003")
        response = client.post(f"/presupuestos/{p.id}/pedidos", json={
            "proveedor": "Supplier",
        }, headers=_auth_header("gestion6@test.com"))
        assert response.status_code == 201

    def test_gestion_can_access_dashboard(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion7@test.com", "Gestion7", rol="gestion", puede_gestionar_sistema=False)
        response = client.get("/dashboard", headers=_auth_header("gestion7@test.com"))
        assert response.status_code == 200

    def test_gestion_can_access_reports(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "gestion8@test.com", "Gestion8", rol="gestion", puede_gestionar_sistema=False)
        response = client.get("/reports/list?type=sin_pedido", headers=_auth_header("gestion8@test.com"))
        assert response.status_code == 200


class TestPublicEndpoints:
    """Endpoints publicos accesibles sin autenticacion."""

    def test_health_public(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_login_public(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_user(db_session, "login@test.com", "Login", aprobado=True)
        response = client.post("/auth/login", json={
            "email": "login@test.com", "password": "password123456",
        })
        assert response.status_code == 200

    def test_me_requires_auth(self, monkeypatch, client):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.get("/auth/me")
        assert response.status_code == 401
