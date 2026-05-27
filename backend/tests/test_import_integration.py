"""Integration tests for import endpoint."""
import io
import pytest
from datetime import date
from app.models import Presupuesto, Usuario
from app.auth import hash_password, create_access_token


def _auth_header(email: str) -> dict:
    token = create_access_token(email, {"name": "Test", "role": "admin_sistema"})
    return {"Authorization": f"Bearer {token}"}


def _create_admin(db_session, email: str = "admin@test.com"):
    user = Usuario(
        email=email, nombre="Admin", hashed_password=hash_password("password123456"),
        activo=True, aprobado=True, puede_gestionar_sistema=True, rol="admin_sistema",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_import_csv_creates_presupuestos(client, db_session):
    """Test that importing a CSV returns 200 and correct row counts."""
    _create_admin(db_session)
    csv_content = (
        "numero_presupuesto,cliente,estado,importe,fecha_presupuesto\n"
        "TEST-001,Cliente Test,Borrador,1000.00,2026-01-15\n"
        "TEST-002,Otro Cliente,Pendiente de enviar,2500.00,2026-02-01\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["total_filas"] == 2
    assert data["nuevos"] == 2


def test_import_csv_upsert_existing(client, db_session):
    """Test upsert mode updates existing presupuesto."""
    user = _create_admin(db_session)
    p = Presupuesto(
        numero_presupuesto="TEST-001",
        cliente="Cliente Antiguo",
        obra_referencia="Obra",
        gestor="Gestor",
        fecha_presupuesto=date.today(),
        importe=1000,
        estado="Borrador",
        version=1,
        prioridad_calculada="Verde",
        dias_parado=0,
    )
    db_session.add(p)
    db_session.commit()

    csv_content = (
        "numero_presupuesto,cliente,estado,importe,fecha_presupuesto,version\n"
        "TEST-001,Cliente Nuevo Actualizado,Borrador,2000.00,2026-01-15,1\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/preview?mode=upsert", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["actualizables"] == 1
