import pytest

from app.config import get_fastapi_docs_config, get_public_paths, validate_runtime_config


def test_docs_enabled_outside_production(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("DISABLE_API_DOCS", raising=False)

    assert get_fastapi_docs_config()["docs_url"] == "/docs"
    assert "/docs" in get_public_paths()


def test_docs_disabled_in_production(monkeypatch):
    monkeypatch.setenv("ENV", "production")

    assert get_fastapi_docs_config() == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    assert "/docs" not in get_public_paths()
    assert "/openapi.json" not in get_public_paths()


def test_production_rejects_placeholder_secrets(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://presucontrol:change_this@postgres:5432/presucontrol")
    monkeypatch.setenv("POSTGRES_PASSWORD", "cambia_esta_password")
    monkeypatch.setenv("JWT_SECRET_KEY", "cambia_esta_clave_larga_y_aleatoria")
    monkeypatch.setenv("CORS_ORIGINS", "*")
    monkeypatch.setenv("APP_PUBLIC_URL", "http://localhost:8088")
    monkeypatch.setenv("AUTH_ENABLED", "false")

    with pytest.raises(RuntimeError) as exc:
        validate_runtime_config()

    message = str(exc.value)
    assert "JWT_SECRET_KEY" in message
    assert "POSTGRES_PASSWORD" in message
    assert "CORS_ORIGINS" in message
    assert "APP_PUBLIC_URL" in message
    assert "AUTH_ENABLED" in message
