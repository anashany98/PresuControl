from __future__ import annotations

import os
from urllib.parse import urlparse

PLACEHOLDER_MARKERS = (
    "change_this",
    "cambia_esta",
    "generar_",
    "generated_secure",
    "tu_password",
    "password_o_app_password",
    "app_password",
    "your_",
)

PRODUCTION_ENV_VALUES = {"prod", "production"}


def get_environment() -> str:
    return (
        os.getenv("ENV")
        or os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or "development"
    ).strip().lower()


def is_production() -> bool:
    return get_environment() in PRODUCTION_ENV_VALUES


def env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _is_placeholder(value: str | None) -> bool:
    if not value:
        return True
    normalized = value.strip().lower()
    return any(marker in normalized for marker in PLACEHOLDER_MARKERS)


def _require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def validate_runtime_config() -> None:
    """Fail fast when production is configured with unsafe placeholders."""
    if not is_production():
        return

    errors: list[str] = []
    jwt_secret = os.getenv("JWT_SECRET_KEY")
    database_url = os.getenv("DATABASE_URL")
    postgres_password = os.getenv("POSTGRES_PASSWORD")
    cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
    app_public_url = os.getenv("APP_PUBLIC_URL", "").strip()

    _require(bool(database_url), "DATABASE_URL is required in production.", errors)
    _require(bool(jwt_secret) and len(jwt_secret or "") >= 32 and not _is_placeholder(jwt_secret), "JWT_SECRET_KEY must be at least 32 characters and not a placeholder in production.", errors)
    if postgres_password:
        _require(len(postgres_password) >= 16 and not _is_placeholder(postgres_password), "POSTGRES_PASSWORD must be strong and not a placeholder in production.", errors)
    _require(bool(cors_origins), "CORS_ORIGINS must be explicit in production.", errors)
    _require("*" not in cors_origins, "CORS_ORIGINS cannot contain '*' in production.", errors)
    _require(bool(app_public_url), "APP_PUBLIC_URL is required in production.", errors)
    if app_public_url:
        parsed = urlparse(app_public_url)
        _require(parsed.scheme == "https" and bool(parsed.netloc), "APP_PUBLIC_URL must be an absolute HTTPS URL in production.", errors)
    _require(env_flag("AUTH_ENABLED", "true"), "AUTH_ENABLED cannot be disabled in production.", errors)

    if errors:
        raise RuntimeError("Unsafe production configuration: " + " ".join(errors))


def get_fastapi_docs_config() -> dict[str, str | None]:
    if is_production() or env_flag("DISABLE_API_DOCS", "false"):
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


def get_public_paths() -> set[str]:
    paths = {"/health", "/health/db", "/auth/register", "/auth/login", "/auth/password/request", "/auth/password/reset"}
    if not is_production() and not env_flag("DISABLE_API_DOCS", "false"):
        paths.update({"/openapi.json", "/docs", "/redoc"})
    return paths
