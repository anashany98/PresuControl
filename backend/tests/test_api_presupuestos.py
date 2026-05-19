import pytest
import os
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["AUTH_ENABLED"] = "false"  # Start with auth disabled for most tests

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app

test_engine = create_engine(
    "sqlite://",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    from app import models

    assert models.Presupuesto
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


def test_sidebar_counters_returns_expected_keys():
    response = client.get("/sidebar-counters")
    assert response.status_code == 200
    data = response.json()
    assert "hoy" in data
    assert "aceptados_sin_pedido" in data


def test_sidebar_counters_returns_all_expected_fields():
    response = client.get("/sidebar-counters")
    assert response.status_code == 200
    data = response.json()
    expected_keys = {"hoy", "aceptados_sin_pedido", "riesgo", "incidencias", "usuarios_pendientes", "dinero_riesgo"}
    assert expected_keys.issubset(data.keys()), f"Missing keys: {expected_keys - set(data.keys())}"


def test_search_without_auth_returns_401(monkeypatch):
    monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
    response = client.get("/search?q=testquery")
    assert response.status_code == 401


def test_search_with_auth_returns_results():
    response = client.get("/search?q=test&page=1&page_size=20")
    assert response.status_code == 200
    data = response.json()
    assert "presupuestos" in data
    assert "comentarios" in data
    assert "historial" in data
    assert "total_presupuestos" in data
    assert "total_pages" in data
    assert "page" in data
    assert "page_size" in data


def test_search_pagination_fields_present():
    response = client.get("/search?q=texto&page=2&page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert "total_presupuestos" in data
    assert "total_pages" in data
    assert "total_comentarios" in data
    assert "total_historial" in data


def test_reports_list_returns_array_for_supported_type():
    response = client.get("/reports/list?type=sin_pedido")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_reports_export_list_returns_excel():
    response = client.post(
        "/reports/export-list",
        json={"filename": "test.xlsx", "items": []},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")


def test_avisos_historial_without_rows_returns_array():
    response = client.get("/avisos/historial")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
