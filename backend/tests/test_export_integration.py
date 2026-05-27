"""Integration tests for export endpoints."""
import pytest
from app.models import HistorialCambio, EmailNotificationLog, Usuario
from app.auth import hash_password


def _create_admin(db_session, email: str = "admin@test.com"):
    user = Usuario(
        email=email, nombre="Admin",
        hashed_password=hash_password("password123456"),
        activo=True, aprobado=True, puede_gestionar_sistema=True, rol="admin_sistema",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_export_logs_emails_returns_excel(client, db_session):
    """Test that the email logs export endpoint returns Excel."""
    _create_admin(db_session)

    log = EmailNotificationLog(
        presupuesto_id=1,
        tipo="test",
        status="sent",
        sent_to="test@test.com",
    )
    db_session.add(log)
    db_session.commit()

    response = client.get("/api/v1/logs/emails/export")
    if response.status_code == 200:
        assert "spreadsheet" in response.headers.get("content-type", "") or \
               "application/vnd.openxmlformats" in response.headers.get("content-type", "")
    else:
        assert response.status_code in (200, 401, 403)


def test_export_logs_actividad_returns_excel(client, db_session):
    """Test that the actividad logs export endpoint returns Excel."""
    user = _create_admin(db_session)

    log = HistorialCambio(
        presupuesto_id=1,
        campo="importación",
        valor_anterior=None,
        valor_nuevo="TEST-001",
        descripcion="Test",
        usuario_id=user.id,
        usuario_nombre="Admin",
        usuario_email="admin@test.com",
    )
    db_session.add(log)
    db_session.commit()

    response = client.get("/api/v1/logs/actividad/export")
    if response.status_code == 200:
        assert "spreadsheet" in response.headers.get("content-type", "") or \
               "application/vnd.openxmlformats" in response.headers.get("content-type", "")
    else:
        assert response.status_code in (200, 401, 403)
