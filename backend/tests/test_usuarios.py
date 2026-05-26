"""Tests for user management flows: list, approve, deactivate, toggle system manager."""
import pytest
from app.models import Usuario
from app.auth import hash_password, create_access_token


def get_auth_header(email):
    """Get auth header for user with given email."""
    token = create_access_token(email, {"name": "Test"})
    return {"Authorization": f"Bearer {token}"}


# =============================================================================
# LIST USUARIOS
# =============================================================================

class TestListUsuarios:

    def test_list_usuarios_solo_gestores(self, monkeypatch, client, db_session):
        """GET /usuarios solo accesible para gestores del sistema."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        user = Usuario(
            email="normal@test.com",
            hashed_password=hash_password("pass"),
            nombre="Normal",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=False,
        )
        db_session.add(user)
        db_session.commit()

        response = client.get("/usuarios", headers=get_auth_header("normal@test.com"))
        assert response.status_code == 403

    def test_list_usuarios_devuelve_lista(self, monkeypatch, client, db_session):
        """Gestor puede listar todos los usuarios."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        user1 = Usuario(email="user1@test.com", hashed_password=hash_password("pass"), nombre="User 1", activo=True, aprobado=True)
        user2 = Usuario(email="user2@test.com", hashed_password=hash_password("pass"), nombre="User 2", activo=True, aprobado=True)
        db_session.add(manager)
        db_session.add(user1)
        db_session.add(user2)
        db_session.commit()

        response = client.get("/usuarios", headers=get_auth_header("manager@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3


class TestCreateUsuario:

    def test_admin_puede_crear_usuario(self, monkeypatch, client, db_session):
        """Admin puede crear usuarios desde el router de auth."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager-create@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
            rol="admin_sistema",
        )
        db_session.add(manager)
        db_session.commit()

        response = client.post("/usuarios", headers=get_auth_header("manager-create@test.com"), json={
            "nombre": "Nuevo Usuario",
            "email": "nuevo@test.com",
            "password": "newpassword456",
            "rol": "gestion",
        })

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "nuevo@test.com"
        assert data["aprobado"] is True


class TestUsuariosPendientes:

    def test_list_pendientes_solo_gestores(self, monkeypatch, client, db_session):
        """GET /usuarios/pendientes solo accesible para gestores."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        user = Usuario(
            email="normal@test.com",
            hashed_password=hash_password("pass"),
            nombre="Normal",
            activo=True,
            aprobado=True,
        )
        db_session.add(user)
        db_session.commit()

        response = client.get("/usuarios/pendientes", headers=get_auth_header("normal@test.com"))
        assert response.status_code == 403

    def test_list_pendientes_devuelve_pendientes(self, monkeypatch, client, db_session):
        """Gestor ve usuarios pendientes de aprobación."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        pending = Usuario(
            email="pending@test.com",
            hashed_password=hash_password("pass"),
            nombre="Pending",
            activo=True,
            aprobado=False,
        )
        db_session.add(manager)
        db_session.add(pending)
        db_session.commit()

        response = client.get("/usuarios/pendientes", headers=get_auth_header("manager@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestAprobarUsuario:

    def test_aprobar_usuario_pendiente(self, monkeypatch, client, db_session):
        """Gestor puede aprobar un usuario pendiente."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        pending = Usuario(
            email="pending@test.com",
            hashed_password=hash_password("pass"),
            nombre="Pending",
            activo=True,
            aprobado=False,
        )
        db_session.add(manager)
        db_session.add(pending)
        db_session.commit()

        response = client.post(f"/usuarios/{pending.id}/aceptar", headers=get_auth_header("manager@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert data["aprobado"] is True
        assert data["activo"] is True

    def test_aprobar_usuario_no_existe(self, monkeypatch, client, db_session):
        """Aprobar usuario inexistente devuelve 404."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        db_session.add(manager)
        db_session.commit()

        response = client.post("/usuarios/99999/aceptar", headers=get_auth_header("manager@test.com"))
        assert response.status_code == 404


class TestDesactivarUsuario:

    def test_desactivar_usuario(self, monkeypatch, client, db_session):
        """Gestor puede desactivar un usuario."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        todeactivate = Usuario(
            email="todeactivate@test.com",
            hashed_password=hash_password("pass"),
            nombre="ToDeactivate",
            activo=True,
            aprobado=True,
        )
        db_session.add(manager)
        db_session.add(todeactivate)
        db_session.commit()

        response = client.post(f"/usuarios/{todeactivate.id}/desactivar", headers=get_auth_header("manager@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert data["activo"] is False

    def test_no_puede_desactivarse_a_si_mismo(self, monkeypatch, client, db_session):
        """Usuario no puede desactivarse a sí mismo."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        user = Usuario(
            email="self@test.com",
            hashed_password=hash_password("pass"),
            nombre="Self",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        db_session.add(user)
        db_session.commit()

        response = client.post(f"/usuarios/{user.id}/desactivar", headers=get_auth_header("self@test.com"))
        assert response.status_code == 422


class TestToggleGestion:

    def test_conceder_gestion_sistema(self, monkeypatch, client, db_session):
        """Gestor puede conceder permisos de gestión del sistema."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        newmanager = Usuario(
            email="newmanager@test.com",
            hashed_password=hash_password("pass"),
            nombre="NewManager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=False,
        )
        db_session.add(manager)
        db_session.add(newmanager)
        db_session.commit()

        response = client.post(f"/usuarios/{newmanager.id}/toggle-gestion", headers=get_auth_header("manager@test.com"), json={
            "puede_gestionar_sistema": True
        })
        assert response.status_code == 200
        data = response.json()
        assert data["puede_gestionar_sistema"] is True

    def test_quitar_gestion_sistema(self, monkeypatch, client, db_session):
        """Gestor puede quitar permisos de gestión del sistema."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        oldmanager = Usuario(
            email="oldmanager@test.com",
            hashed_password=hash_password("pass"),
            nombre="OldManager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        db_session.add(manager)
        db_session.add(oldmanager)
        db_session.commit()

        response = client.post(f"/usuarios/{oldmanager.id}/toggle-gestion", headers=get_auth_header("manager@test.com"), json={
            "puede_gestionar_sistema": False
        })
        assert response.status_code == 200
        data = response.json()
        assert data["puede_gestionar_sistema"] is False

    def test_toggle_gestion_sin_valor_devuelve_422(self, monkeypatch, client, db_session):
        """Toggle sin puede_gestionar_sistema devuelve 422."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        toggle_user = Usuario(
            email="toggle@test.com",
            hashed_password=hash_password("pass"),
            nombre="Toggle",
            activo=True,
            aprobado=True,
        )
        db_session.add(manager)
        db_session.add(toggle_user)
        db_session.commit()

        response = client.post(f"/usuarios/{toggle_user.id}/toggle-gestion", headers=get_auth_header("manager@test.com"), json={
            # falta puede_gestionar_sistema
        })
        assert response.status_code == 422


class TestAdminResetPassword:

    def test_admin_reset_password(self, monkeypatch, client, db_session):
        """Gestor puede resetear password de cualquier usuario."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        toreset = Usuario(
            email="toreset@test.com",
            hashed_password=hash_password("pass"),
            nombre="ToReset",
            activo=True,
            aprobado=True,
        )
        db_session.add(manager)
        db_session.add(toreset)
        db_session.commit()

        response = client.post(f"/usuarios/{toreset.id}/reset-password", headers=get_auth_header("manager@test.com"), json={
            "password": "newpassword456"
        })
        assert response.status_code == 200

    def test_admin_reset_password_no_existe(self, monkeypatch, client, db_session):
        """Reset password de usuario inexistente devuelve 404."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        manager = Usuario(
            email="manager@test.com",
            hashed_password=hash_password("pass"),
            nombre="Manager",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        db_session.add(manager)
        db_session.commit()

        response = client.post("/usuarios/99999/reset-password", headers=get_auth_header("manager@test.com"), json={
            "password": "newpassword456"
        })
        assert response.status_code == 404


class TestPreferenciasUsuario:

    def test_usuario_puede_guardar_sus_preferencias(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        user = Usuario(
            email="prefs@test.com",
            hashed_password=hash_password("pass"),
            nombre="Prefs",
            activo=True,
            aprobado=True,
            rol="gestion",
        )
        db_session.add(user)
        db_session.commit()

        response = client.patch("/usuarios/me/preferencias", headers=get_auth_header("prefs@test.com"), json={
            "sidebarCollapsed": True,
        })

        assert response.status_code == 200
        assert response.json()["sidebarCollapsed"] is True

        response = client.get("/usuarios/me/preferencias", headers=get_auth_header("prefs@test.com"))
        assert response.status_code == 200
        assert response.json()["sidebarCollapsed"] is True
