import json
import re
from contextvars import ContextVar
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from .models import AppSetting
from .schemas import ESTADOS

DEFAULT_SETTINGS = {
    "estados": ESTADOS,
    "gestores": ["Administración", "Comercial", "Compras", "Producción"],
    "proveedores": [],
    "tipos_incidencia": ["Falta información", "Proveedor pendiente", "Cliente pendiente", "Precio pendiente", "Plazo pendiente", "Otro"],
    "dias_critico_aceptado_sin_pedido": 2,
    "dias_vencido_seguimiento_comercial": 7,
    "dias_aviso_pedido_sin_plazo": 2,
    "email_avisos_activo": False,
    "emails_destino_avisos": [],
    "enviar_email_criticos_inmediato": False,
    "asunto_email_avisos": "PresuControl · Avisos activos",
    "avisos_automaticos_activos": False,
    "resumen_diario_automatico_activo": True,
    "hora_resumen_diario": "08:30",
    "intervalo_revision_avisos_minutos": 30,
    "escalado_automatico_activo": True,
    "emails_escalado_avisos": [],
    "horas_escalado_nivel_1": 24,
    "horas_escalado_nivel_2": 48,
    "horas_escalado_nivel_3": 72,
    "dias_sin_actualizar_aviso": 3,
}

LIST_KEYS = {
    "estados",
    "gestores",
    "proveedores",
    "tipos_incidencia",
    "emails_destino_avisos",
    "emails_escalado_avisos",
}
EMAIL_LIST_KEYS = {"emails_destino_avisos", "emails_escalado_avisos"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# Per-request cache using contextvars (async-safe)
_settings_cache: ContextVar[Optional[tuple[dict, datetime]]] = ContextVar("_settings_cache", default=None)

def _load_settings_from_db(db: Session) -> dict:
    """Load settings from database, merging with defaults."""
    data = DEFAULT_SETTINGS.copy()
    rows = db.query(AppSetting).all()
    for row in rows:
        try:
            data[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            data[row.key] = row.value
    return data

class SettingsCache:
    TTL_SECONDS: int = 60

    @classmethod
    def get(cls, db: Session | None = None) -> dict:
        """Get settings from per-request cache or load from DB."""
        now = datetime.now()
        cached = _settings_cache.get()
        if cached is not None:
            data, expires_at = cached
            if now < expires_at:
                return data.copy()

        owns_session = db is None
        if db is None:
            from .database import SessionLocal
            db = SessionLocal()
        try:
            data = _load_settings_from_db(db)
            expires_at = now + timedelta(seconds=cls.TTL_SECONDS)
            _settings_cache.set((data, expires_at))
        finally:
            if owns_session:
                db.close()

        return data.copy()

    @classmethod
    def invalidate(cls):
        """Invalidate cache to force refresh on next call."""
        _settings_cache.set(None)

def get_settings(db: Session) -> dict:
    """Get settings - uses cache for performance."""
    return SettingsCache.get(db)

def validate_settings_value(key: str, value) -> None:
    """Raise ValueError if setting is out of valid range."""
    RANGES = {
        "dias_critico_aceptado_sin_pedido": (1, 90),
        "dias_vencido_seguimiento_comercial": (1, 90),
        "dias_aviso_pedido_sin_plazo": (1, 60),
        "intervalo_revision_avisos_minutos": (5, 1440),
        "horas_escalado_nivel_1": (1, 168),
        "horas_escalado_nivel_2": (1, 336),
        "horas_escalado_nivel_3": (1, 720),
    }
    if key in RANGES:
        mn, mx = RANGES[key]
        if not (mn <= value <= mx):
            raise ValueError(f"{key} must be between {mn} and {mx}, got {value}")
    if key == "hora_resumen_diario" and value and not TIME_RE.match(str(value)):
        raise ValueError("hora_resumen_diario debe tener formato HH:MM entre 00:00 y 23:59")
    if key in EMAIL_LIST_KEYS:
        for email in value:
            if not EMAIL_RE.match(email):
                raise ValueError(f"{key} contiene un email no válido: {email}")


def normalize_string_list(key: str, value) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{key} debe ser una lista.")
    output: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item).strip() if item is not None else ""
        if not text:
            continue
        dedupe_key = text.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        output.append(text)
    return output


def normalize_settings_value(key: str, value):
    if key in LIST_KEYS:
        return normalize_string_list(key, value)
    if isinstance(value, str):
        return value.strip()
    return value

def update_settings(db: Session, payload: dict) -> dict:
    for key, value in payload.items():
        if value is None:
            continue
        value = normalize_settings_value(key, value)
        try:
            validate_settings_value(key, value)
        except ValueError:
            raise
        row = db.get(AppSetting, key)
        raw = json.dumps(value, ensure_ascii=False)
        if not row:
            row = AppSetting(key=key, value=raw)
            db.add(row)
        else:
            row.value = raw
    db.commit()
    SettingsCache.invalidate()
    return SettingsCache.get(db)
