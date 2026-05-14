import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app

test_engine = create_engine("sqlite:///:memory:", echo=False)
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
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


def test_search_pagination_page_and_page_size(monkeypatch):
    monkeypatch.setattr("app.auth.AUTH_ENABLED", False)
    response = client.get("/search?q=test&page=2&page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 2
    assert data["page_size"] == 10


def test_search_page_size_max_enforced():
    response = client.get("/search?q=test&page=1&page_size=200")
    assert response.status_code == 422


def test_search_page_size_100_is_valid(monkeypatch):
    monkeypatch.setattr("app.auth.AUTH_ENABLED", False)
    response = client.get("/search?q=test&page=1&page_size=100")
    assert response.status_code == 200


def test_search_response_has_total_presupuestos(monkeypatch):
    monkeypatch.setattr("app.auth.AUTH_ENABLED", False)
    response = client.get("/search?q=test&page=1&page_size=20")
    assert response.status_code == 200
    data = response.json()
    assert "total_presupuestos" in data
    assert isinstance(data["total_presupuestos"], int)


def test_search_response_has_total_pages(monkeypatch):
    monkeypatch.setattr("app.auth.AUTH_ENABLED", False)
    response = client.get("/search?q=test&page=1&page_size=20")
    assert response.status_code == 200
    data = response.json()
    assert "total_pages" in data
    assert isinstance(data["total_pages"], int)


def test_search_page_minimum_is_1():
    response = client.get("/search?q=test&page=0&page_size=20")
    assert response.status_code == 422