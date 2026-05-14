import json
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

def get_settings(db: Session) -> dict:
    data = DEFAULT_SETTINGS.copy()
    rows = db.query(AppSetting).all()
    for row in rows:
        try:
            data[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            data[row.key] = row.value
    return data

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

def update_settings(db: Session, payload: dict) -> dict:
    for key, value in payload.items():
        if value is None:
            continue
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
    return get_settings(db)
