"""Tests for authentication flows: register, login, password reset, rate limits."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from app.models import Usuario
from app.auth import hash_password, create_access_token


# =============================================================================
# REGISTRO
# =============================================================================

class TestRegistro:

    def test_registro_primer_usuario_auto_aprobado(self, monkeypatch, client, db_session):
        """Primer usuario registrado debe quedar aprobado y con puede_gestionar_sistema=true."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/register", json={
            "nombre": "Primero",
            "email": "primero@test.com",
            "password": "password12345",
        })
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["user"]["aprobado"] is True
        assert data["user"]["activo"] is True
        assert data["user"]["puede_gestionar_sistema"] is True
        assert "access_token" in data

    def test_registro_usuario_normal_queda_pendiente(self, monkeypatch, client, db_session):
        """Usuarios siguientes al primero quedan pendientes de aprobación."""
        # Crear primer usuario primero (auto-approved)
        user1 = Usuario(
            email="admin@test.com",
            hashed_password=hash_password("pass"),
            nombre="Admin",
            activo=True,
            aprobado=True,
            puede_gestionar_sistema=True,
        )
        db_session.add(user1)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/register", json={
            "nombre": "Segundo",
            "email": "segundo@test.com",
            "password": "password12345",
        })
        assert response.status_code == 202, response.json()

    def test_registro_email_duplicado(self, monkeypatch, client, db_session):
        """No se puede registrar dos usuarios con el mismo email."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        # Registro inicial
        client.post("/auth/register", json={
            "nombre": "Usuario 1",
            "email": "duplicado@test.com",
            "password": "password12345",
        })
        # Segundo registro con mismo email
        response = client.post("/auth/register", json={
            "nombre": "Usuario 2",
            "email": "duplicado@test.com",
            "password": "password12345",
        })
        assert response.status_code == 409

    def test_registro_campos_invalidos(self, monkeypatch, client, db_session):
        """Registro con email/password corto debe fallar."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/register", json={
            "nombre": "X",
            "email": "bad",
            "password": "12345",
        })
        assert response.status_code == 422


# =============================================================================
# LOGIN
# =============================================================================

class TestLogin:

    def test_login_exitoso(self, monkeypatch, client, db_session):
        """Login con credenciales correctas devuelve token y usuario."""
        user = Usuario(
            email="login@test.com",
            hashed_password=hash_password("password12345"),
            nombre="Login Test",
            activo=True,
            aprobado=True,
        )
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/login", json={
            "email": "login@test.com",
            "password": "password12345",
        })
        assert response.status_code == 200, response.json()
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "login@test.com"

    def test_login_email_incorrecto(self, monkeypatch, client, db_session):
        """Login con email inexistente devuelve 401."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/login", json={
            "email": "noexiste@test.com",
            "password": "password12345",
        })
        assert response.status_code == 401

    def test_login_password_incorrecto(self, monkeypatch, client, db_session):
        """Login con password incorrecto devuelve 401."""
        user = Usuario(
            email="wrongpass@test.com",
            hashed_password=hash_password("password12345"),
            nombre="WrongPass",
            activo=True,
            aprobado=True,
        )
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/login", json={
            "email": "wrongpass@test.com",
            "password": "wrongpassword",
        })
        assert response.status_code == 401

    def test_login_usuario_no_aprobado(self, monkeypatch, client, db_session):
        """Login de usuario no aprobado devuelve 403."""
        user = Usuario(
            email="pending@test.com",
            hashed_password=hash_password("password12345"),
            nombre="Pending",
            activo=True,
            aprobado=False,
        )
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/login", json={
            "email": "pending@test.com",
            "password": "password12345",
        })
        assert response.status_code == 403

    def test_login_usuario_desactivado(self, monkeypatch, client, db_session):
        """Login de usuario desactivado devuelve 403."""
        user = Usuario(
            email="inactive@test.com",
            hashed_password=hash_password("password12345"),
            nombre="Inactive",
            activo=False,
            aprobado=True,
        )
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.post("/auth/login", json={
            "email": "inactive@test.com",
            "password": "password12345",
        })
        assert response.status_code == 403


# =============================================================================
# AUTH ME
# =============================================================================

class TestAuthMe:

    def test_me_devuelve_usuario_autenticado(self, monkeypatch, client, db_session):
        """GET /auth/me con token válido devuelve datos del usuario."""
        user = Usuario(
            email="me@test.com",
            hashed_password=hash_password("password12345"),
            nombre="Me Test",
            activo=True,
            aprobado=True,
        )
        db_session.add(user)
        db_session.commit()

        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        token = create_access_token("me@test.com", {"name": "Me Test"})
        response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200, response.json()
        assert response.json()["email"] == "me@test.com"

    def test_me_sin_token_devuelve_401(self, monkeypatch, client, db_session):
        """GET /auth/me sin Authorization header devuelve 401."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.get("/auth/me")
        assert response.status_code == 401

    def test_me_token_invalido_devuelve_401(self, monkeypatch, client, db_session):
        """GET /auth/me con token inválido devuelve 401."""
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        response = client.get("/auth/me", headers={"Authorization": "Bearer token_invalido"})
        assert response.status_code == 401
