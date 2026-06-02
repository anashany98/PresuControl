from __future__ import annotations

import logging
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

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


def _is_placeholder(value: str | None) -> bool:
    if not value:
        return True
    normalized = value.strip().lower()
    return any(marker in normalized for marker in PLACEHOLDER_MARKERS)


class Settings(BaseSettings):
    """Centralized configuration loaded from environment variables.
    
    Usage:
        from app.config import settings
        print(settings.jwt_secret_key)
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Environment ──────────────────────────────────────────────
    env: str = Field(default="development", alias="ENV")
    app_env: str = Field(default="", alias="APP_ENV")
    environment: str = Field(default="", alias="ENVIRONMENT")

    @property
    def resolved_env(self) -> str:
        return (self.env or self.app_env or self.environment or "development").strip().lower()

    @property
    def is_production(self) -> bool:
        return self.resolved_env in PRODUCTION_ENV_VALUES

    # ── Database ─────────────────────────────────────────────────
    postgres_db: str = Field(default="presucontrol")
    postgres_user: str = Field(default="presucontrol")
    postgres_password: str = Field(default="")
    database_url: str = Field(default="")
    db_pool_size: int = Field(default=20, ge=1)
    db_max_overflow: int = Field(default=30, ge=0)
    db_pool_timeout: int = Field(default=30, ge=1)
    db_pool_recycle: int = Field(default=3600, ge=1)

    # ── Security ─────────────────────────────────────────────────
    jwt_secret_key: str = Field(default="")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=720, ge=1)
    auth_enabled: bool = Field(default=True)
    trusted_proxies: str = Field(default="")

    # ── CORS ─────────────────────────────────────────────────────
    cors_origins: str = Field(default="http://localhost:5173,http://localhost:3000")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ── App ──────────────────────────────────────────────────────
    app_public_url: str = Field(default="http://localhost:8088")
    app_timezone: str = Field(default="Europe/Madrid")
    disable_api_docs: bool = Field(default=False)
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    sqlalchemy_log_level: str = Field(default="WARNING", alias="SQLALCHEMY_LOG_LEVEL")

    # ── SMTP ─────────────────────────────────────────────────────
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_user: Optional[str] = Field(default=None)
    smtp_password: Optional[str] = Field(default=None)
    smtp_from: str = Field(default="")
    smtp_tls: bool = Field(default=True)

    # ── Scheduler ────────────────────────────────────────────────
    scheduler_enabled: bool = Field(default=True)

    # ── Registration ─────────────────────────────────────────────
    registration_requires_approval: bool = Field(default=True)
    login_rate_limit_attempts: int = Field(default=5, ge=1)
    login_rate_limit_window_minutes: int = Field(default=10, ge=1)

    # ── Migrations ───────────────────────────────────────────────
    run_create_all: bool = Field(default=False)
    run_defensive_migrations: bool = Field(default=False)

    # ── Debug ────────────────────────────────────────────────────
    debug_mode: bool = Field(default=False)
    seed_demo: bool = Field(default=False)

    # ── Sentry ───────────────────────────────────────────────────
    sentry_dsn: str = Field(default="")
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0.0, le=1.0)

    # ── Validation ───────────────────────────────────────────────
    @field_validator("jwt_secret_key")
    @classmethod
    def jwt_must_be_set(cls, v: str) -> str:
        if not v:
            raise ValueError("JWT_SECRET_KEY is required")
        return v

    @field_validator("database_url")
    @classmethod
    def db_url_must_be_set(cls, v: str) -> str:
        if not v:
            raise ValueError("DATABASE_URL is required")
        return v

    def validate_production(self) -> None:
        """Validate production configuration. Raises RuntimeError on unsafe values."""
        if not self.is_production:
            return

        errors: list[str] = []
        warnings: list[str] = []

        def _require(condition: bool, message: str) -> None:
            if not condition:
                errors.append(message)

        _require(bool(self.database_url), "DATABASE_URL is required in production.")
        _require(
            bool(self.jwt_secret_key) and len(self.jwt_secret_key) >= 16 and not _is_placeholder(self.jwt_secret_key),
            "JWT_SECRET_KEY must be at least 16 characters and not a placeholder.",
        )
        if self.postgres_password:
            if _is_placeholder(self.postgres_password):
                _require(False, "POSTGRES_PASSWORD must not be a placeholder.")
            elif len(self.postgres_password) < 8:
                warnings.append("POSTGRES_PASSWORD is short (<8 chars). Consider using a stronger password.")
        _require("*" not in self.cors_origin_list, "CORS_ORIGINS cannot contain '*' in production.")
        _require(self.auth_enabled, "AUTH_ENABLED cannot be disabled in production.")
        _require(bool(self.app_public_url), "APP_PUBLIC_URL is required in production.")
        if self.app_public_url:
            _require(self.app_public_url.startswith("https://"), "APP_PUBLIC_URL must use HTTPS in production.")
        if not self.cors_origin_list:
            warnings.append("CORS_ORIGINS is empty. No cross-origin requests will be allowed.")

        if warnings:
            for w in warnings:
                logger.warning("Production config: %s", w)

        if errors:
            raise RuntimeError("Unsafe production configuration: " + " ".join(errors))


# Singleton instance
settings = Settings()


# ── Backward-compatible helpers ──────────────────────────────────

def get_environment() -> str:
    return settings.resolved_env


def is_production() -> bool:
    return settings.is_production


def env_flag(name: str, default: str = "false") -> bool:
    """Backward-compat: check env var as bool."""
    import os
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def get_fastapi_docs_config() -> dict[str, str | None]:
    if settings.is_production or settings.disable_api_docs:
        return {"docs_url": None, "redoc_url": None, "openapi_url": None}
    return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}


def get_public_paths() -> set[str]:
    paths = {
        "/health", "/health/db",
        "/api/health", "/api/health/db",
        "/api/v1/health", "/api/v1/health/db",
        "/auth/register", "/auth/login",
        "/api/auth/register", "/api/auth/login",
        "/api/v1/auth/register", "/api/v1/auth/login",
    }
    if not settings.is_production and not settings.disable_api_docs:
        paths.update({"/openapi.json", "/docs", "/redoc"})
    return paths


def validate_runtime_config() -> None:
    """Validate production configuration. Delegates to Settings.validate_production()."""
    settings.validate_production()
