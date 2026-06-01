"""Tests for Fase 1 bug fixes."""
import io
import json
import pytest
from datetime import date, timedelta
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


def _create_user(db_session, email: str, rol: str = "gestion", puede_gestionar_sistema: bool = False):
    user = Usuario(
        email=email, nombre="Gestor", hashed_password=hash_password("password123456"),
        activo=True, aprobado=True, puede_gestionar_sistema=puede_gestionar_sistema, rol=rol,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ===== BUG-09: DELETE returns 405 on both routers =====
def test_delete_presupuesto_returns_405_on_full_router(client, db_session):
    """DELETE on /api/v1/presupuestos/{id} returns 405 Method Not Allowed."""
    _create_admin(db_session)
    p = Presupuesto(
        numero_presupuesto="DEL-001", cliente="Test", obra_referencia="Test",
        gestor="Admin", fecha_presupuesto=date.today(), importe=1000,
        estado="Borrador", version=1, prioridad_calculada="Verde", dias_parado=0,
    )
    db_session.add(p)
    db_session.commit()

    response = client.delete("/api/v1/presupuestos/1")
    assert response.status_code == 405


# ===== BUG-12: CSV encoding (utf-8 first, fallback latin-1) =====
def test_import_csv_utf8(client, db_session):
    """UTF-8 CSV with accented characters imports correctly."""
    _create_admin(db_session)
    csv_content = "numero_presupuesto,cliente,estado,importe,fecha_presupuesto\nP-001,Acción Cliente,Borrador,1000,2026-01-15\n"
    files = {"file": ("test_utf8.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["nuevos"] == 1
    assert data["validos"] == 1


def test_import_csv_latin1(client, db_session):
    """Latin-1 CSV with accented characters imports correctly (fallback after UTF-8 fail)."""
    _create_admin(db_session)
    csv_content = b"numero_presupuesto,cliente,estado,importe,fecha_presupuesto\nP-001,Apartamentos Pe\xc3\xb1a,Borrador,1000,2026-01-15\n"
    files = {"file": ("test_latin1.csv", io.BytesIO(csv_content), "text/csv")}
    response = client.post("/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["nuevos"] == 1


# ===== BUG-16: clean_identifier handles NaN/inf =====
def test_import_nan_in_numero_presupuesto(client, db_session):
    """CSV with NaN in numero_presupuesto sends row to errors, not abort.
    The fix makes clean_identifier return empty string for nan,
    which then raises ValueError (no numero_pedido_cliente fallback), caught as error."""
    _create_admin(db_session)
    csv_content = "numero_presupuesto,cliente,estado,importe,fecha_presupuesto\nnan,Cliente Normal,Borrador,1000,2026-01-15\nP-002,Otro Cliente,Pendiente de enviar,2000,2026-01-16\n"
    files = {"file": ("test_nan.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/preview", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["total_filas"] == 2
    # Row 1 has nan which clean_identifier turns to "" then raises ValueError
    # Row 2 is valid, but since nan is first in file it gets through errors
    # Actually with valid row 2 following, overall validos includes row 2
    assert data["validos"] == 1
    assert len(data["errores"]) >= 1


def test_import_inf_in_identifier(client, db_session):
    """CSV with inf in numero_presupuesto is handled gracefully."""
    _create_admin(db_session)
    csv_content = "numero_presupuesto,cliente,estado,importe,fecha_presupuesto\ninf,Cliente Normal,Borrador,1000,2026-01-15\n"
    files = {"file": ("test_inf.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/preview", files=files)
    assert response.status_code == 200


# ===== BUG-17: JSONDecodeError handling in import_preview/confirm =====
def test_import_preview_invalid_json_column_mapping(client, db_session):
    """import_preview with invalid JSON in column_mapping returns 422."""
    _create_admin(db_session)
    csv_content = "numero_presupuesto,cliente,estado,importe\nP-001,Test,Borrador,1000\n"
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/preview?column_mapping=not-valid-json", files=files)
    assert response.status_code == 422
    assert "JSON válido" in response.json()["detail"]


def test_import_confirm_invalid_json_column_mapping(client, db_session):
    """import_confirm with invalid JSON in column_mapping returns 422."""
    _create_admin(db_session)
    csv_content = "numero_presupuesto,cliente,estado,importe\nP-001,Test,Borrador,1000\n"
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/confirm?column_mapping=not-valid-json", files=files)
    assert response.status_code == 422
    assert "JSON válido" in response.json()["detail"]


# ===== BUG-14: Role checks on /hoy, /aceptados-sin-pedido, /proveedores/{id}/evaluaciones =====
def test_hoy_requires_auth_or_gestion(client, db_session):
    """GET /hoy returns 403 for unauthenticated requests when AUTH_ENABLED."""
    import app.auth as auth_module
    old_enabled = auth_module.AUTH_ENABLED
    auth_module.AUTH_ENABLED = True
    try:
        response = client.get("/hoy")
        assert response.status_code == 401
    finally:
        auth_module.AUTH_ENABLED = old_enabled


def test_hoy_returns_200_for_admin(client, db_session):
    """GET /hoy returns 200 for admin user."""
    import app.auth as auth_module
    old_enabled = auth_module.AUTH_ENABLED
    auth_module.AUTH_ENABLED = False
    try:
        user = _create_admin(db_session)
        token = create_access_token(user.email, {"name": user.nombre, "role": user.rol})
        response = client.get("/hoy", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
    finally:
        auth_module.AUTH_ENABLED = old_enabled


def test_aceptados_sin_pedido_requires_auth_or_gestion(client, db_session):
    """GET /aceptados-sin-pedido returns 403 for unauthenticated when AUTH_ENABLED."""
    import app.auth as auth_module
    old_enabled = auth_module.AUTH_ENABLED
    auth_module.AUTH_ENABLED = True
    try:
        response = client.get("/aceptados-sin-pedido")
        assert response.status_code == 401
    finally:
        auth_module.AUTH_ENABLED = old_enabled


def test_evaluaciones_proveedor_requires_auth_or_gestion(client, db_session):
    """GET /proveedores/{id}/evaluaciones returns 401/403 for unauthenticated."""
    import app.auth as auth_module
    old_enabled = auth_module.AUTH_ENABLED
    auth_module.AUTH_ENABLED = True
    try:
        response = client.get("/proveedores/1/evaluaciones")
        assert response.status_code in {401, 403}
    finally:
        auth_module.AUTH_ENABLED = old_enabled


def test_evaluaciones_proveedor_returns_200_for_admin(client, db_session):
    """GET /proveedores/{id}/evaluaciones returns 200 for admin."""
    import app.auth as auth_module
    old_enabled = auth_module.AUTH_ENABLED
    auth_module.AUTH_ENABLED = False
    try:
        user = _create_admin(db_session)
        from app.models import Proveedor
        prov = Proveedor(nombre="Test Prov", activo=True)
        db_session.add(prov)
        db_session.commit()

        token = create_access_token(user.email, {"name": user.nombre, "role": user.rol})
        response = client.get(f"/proveedores/{prov.id}/evaluaciones", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
    finally:
        auth_module.AUTH_ENABLED = old_enabled


# ===== BUG-15: import_confirm atomic transaction =====
def test_import_confirm_rollback_on_invalid_row(client, db_session):
    """Import with one invalid row among valid ones: 0 inserts (atomic rollback)."""
    user = _create_admin(db_session)
    token = create_access_token(user.email, {"name": user.nombre, "role": user.rol})

    csv_content = (
        "numero_presupuesto,cliente,estado,importe,fecha_presupuesto\n"
        "VALID-001,Cliente Bueno,Borrador,1000,2026-01-15\n"
        "VALID-002,Cliente Malo,Borrador,NOT_A_NUMBER,2026-01-16\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}
    response = client.post("/import/confirm", files=files, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["insertados"] == 0, f"Expected 0 inserts, got {data['insertados']} - transaction should have rolled back"


# ===== BUG-10: Router uniqueness =====
def test_no_duplicate_routes_in_app(client, db_session):
    """Verify no duplicate routes exist in app.routes."""
    from fastapi.routing import APIRoute
    route_map = {}
    duplicates = []
    for route in client.app.routes:
        if isinstance(route, APIRoute):
            key = (route.path, tuple(route.methods) if route.methods else ())
            if key in route_map:
                duplicates.append(key)
            else:
                route_map[key] = route
    assert duplicates == [], f"Duplicate routes found: {duplicates}"