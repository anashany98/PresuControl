from __future__ import annotations

import asyncio
import hashlib
import hmac
import io
import json
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import func, or_, desc, asc, text
from sqlalchemy.orm import Session, selectinload

from .database import Base, engine, get_db, SessionLocal
from .models import Comentario, EmailNotificationLog, EvaluacionProveedor, HistorialCambio, LoginAttempt, PedidoProveedor, Presupuesto, PresupuestoProveedor, Proveedor, RegistrationAttempt, Usuario
from .rules import CLOSED_STATES, apply_derived_fields, calculate_risk, get_pedido_counts, validate_presupuesto
from .schemas import (
    ComentarioCreate,
    ComentarioOut,
    ESTADOS,
    EvaluacionProveedorCreate,
    EvaluacionProveedorOut,
    HistorialOut,
    ImportPreview,
    PedidoProveedorCreate,
    PedidoProveedorOut,
    PedidoProveedorUpdate,
    PresupuestoCreate,
    PresupuestoOut,
    PresupuestoProveedorCreate,
    PresupuestoProveedorOut,
    PresupuestoProveedorUpdate,
    PresupuestoUpdate,
    ProveedorCreate,
    ProveedorOut,
    ProveedorUpdate,
    SettingsOut,
    SettingsUpdate,
    UserRegister,
    UserLogin,
    TokenOut,
    UserOut,
    QuickAction,
    EmailTestPayload,
    ArchivePayload,
    EmailLogOut,
    PaginatedPresupuestos,
    UserApprovalPayload,
    PasswordResetRequest,
    PasswordResetConfirm,
    PasswordAdminReset,
)
from .settings import get_settings, update_settings
from .auth import create_access_token, get_authenticated_user_from_request, hash_password, is_auth_enabled, normalize_email, verify_password
from .emailer import parse_recipients, send_email
from .notifications import build_alerts, money_at_risk, run_automatic_alert_checks, send_alert_digest, send_escalation_alerts, send_immediate_alerts_for_budget
from .notifications_inapp import obtener_notificaciones, contar_sin_leer, marcar_leida, marcar_todas_leidas

app = FastAPI(title="PresuControl API", version="1.3.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
origins_stripped = [o.strip() for o in origins if o.strip()]
if "*" in origins_stripped and True:  # credentials always enabled
    raise RuntimeError("CORS_ORIGINS contains '*' which is not allowed when allow_credentials=True. Specify explicit origins.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_stripped,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("RUN_CREATE_ALL", "false").lower() in {"1", "true", "yes", "on"}:
    Base.metadata.create_all(bind=engine)


def ensure_schema_compatibility():
    """Pequeña migración defensiva para instalaciones que ya venían de V1/V2 sin Alembic."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS motivo_cancelacion_rechazo TEXT"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS fecha_cancelacion_rechazo DATE"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMP WITH TIME ZONE"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS archivado_por VARCHAR(255)"))
        conn.execute(text("ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS motivo_archivado TEXT"))
        conn.execute(text("ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS usuario_id INTEGER"))
        conn.execute(text("ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS usuario_nombre VARCHAR(120)"))
        conn.execute(text("ALTER TABLE comentarios ADD COLUMN IF NOT EXISTS usuario_email VARCHAR(255)"))
        conn.execute(text("ALTER TABLE historial_cambios ADD COLUMN IF NOT EXISTS usuario_id INTEGER"))
        conn.execute(text("ALTER TABLE historial_cambios ADD COLUMN IF NOT EXISTS usuario_nombre VARCHAR(120)"))
        conn.execute(text("ALTER TABLE historial_cambios ADD COLUMN IF NOT EXISTS usuario_email VARCHAR(255)"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado BOOLEAN NOT NULL DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMP WITH TIME ZONE"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado_por VARCHAR(255)"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puede_gestionar_sistema BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_password_token_hash VARCHAR(128)"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_password_expira_en TIMESTAMP WITH TIME ZONE"))
        conn.execute(text("ALTER TABLE email_notification_logs ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0"))


if os.getenv("RUN_DEFENSIVE_MIGRATIONS", "false").lower() in {"1", "true", "yes", "on"}:
    ensure_schema_compatibility()


async def automatic_alert_loop():
    while True:
        db = SessionLocal()
        try:
            settings = get_settings(db)
            if settings.get("avisos_automaticos_activos"):
                run_automatic_alert_checks(db)
            minutes = max(int(settings.get("intervalo_revision_avisos_minutos", 30) or 30), 5)
        except Exception:
            minutes = 30
        finally:
            db.close()
        await asyncio.sleep(minutes * 60)


@app.on_event("startup")
async def start_automatic_alerts():
    if os.getenv("SCHEDULER_ENABLED", "true").lower() in {"1", "true", "yes", "on"}:
        asyncio.create_task(automatic_alert_loop())


PUBLIC_PATHS = {"/health", "/auth/register", "/auth/login", "/auth/password/request", "/auth/password/reset", "/openapi.json", "/docs", "/redoc"}


@app.middleware("http")
async def require_auth_middleware(request: Request, call_next):
    if not is_auth_enabled() or request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path.rstrip("/") or "/"
    if path in PUBLIC_PATHS or path.startswith("/docs") or path.startswith("/static"):
        return await call_next(request)
    from .database import SessionLocal
    db = SessionLocal()
    try:
        try:
            user = get_authenticated_user_from_request(request, db)
            request.state.user = user
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    finally:
        db.close()
    return await call_next(request)



def require_system_manager(request: Request):
    user = getattr(request.state, "user", None)
    if not user or not getattr(user, "puede_gestionar_sistema", False):
        raise HTTPException(status_code=403, detail="Solo un usuario con gestión del sistema puede hacer esta acción.")


def get_current_user(request: Request) -> Usuario:
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


def enforce_login_rate_limit(email: str, request: Request, db: Session):
    max_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5"))
    minutes = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "10"))
    now = datetime.now(timezone.utc)
    ip = request.client.host if request.client else "unknown"
    window_start = now - timedelta(minutes=minutes)
    db.query(LoginAttempt).filter(
        LoginAttempt.ip == ip,
        LoginAttempt.email == email,
        LoginAttempt.window_start < window_start,
    ).delete()
    db.commit()

    record = db.query(LoginAttempt).filter(
        LoginAttempt.ip == ip,
        LoginAttempt.email == email,
    ).with_for_update().first()

    if record and record.attempts >= max_attempts:
        raise HTTPException(status_code=429, detail=f"Demasiados intentos. Prueba de nuevo en {minutes} minutos.")

    if record:
        record.attempts += 1
        record.window_start = now
    else:
        db.add(LoginAttempt(ip=ip, email=email, attempts=1, window_start=now))
    db.commit()


def register_failed_login(email: str, request: Request, db: Session):
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    existing = db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).first()
    if existing:
        existing.attempts += 1
        db.commit()
    else:
        db.add(LoginAttempt(ip=ip, email=email, attempts=1, window_start=now))
        db.commit()


def clear_failed_logins(email: str, request: Request, db: Session):
    ip = request.client.host if request.client else "unknown"
    db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).delete()
    db.commit()


def enforce_registration_rate_limit(request: Request, db: Session):
    max_attempts = int(os.getenv("REGISTRATION_RATE_LIMIT_ATTEMPTS", "5"))
    minutes = int(os.getenv("REGISTRATION_RATE_LIMIT_WINDOW_MINUTES", "60"))
    now = datetime.now(timezone.utc)
    ip = request.client.host if request.client else "unknown"
    window_start = now - timedelta(minutes=minutes)
    db.query(RegistrationAttempt).filter(
        RegistrationAttempt.ip == ip,
        RegistrationAttempt.window_start < window_start,
    ).delete()
    db.commit()

    record = db.query(RegistrationAttempt).filter(
        RegistrationAttempt.ip == ip,
    ).with_for_update().first()

    if record and record.attempts >= max_attempts:
        raise HTTPException(status_code=429, detail=f"Demasiados intentos de registro. Prueba de nuevo en {minutes} minutos.")

    if record:
        record.attempts += 1
        record.window_start = now
    else:
        db.add(RegistrationAttempt(ip=ip, attempts=1, window_start=now))
    db.commit()


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def user_to_out(user: Usuario) -> Usuario:
    return user


@app.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    enforce_registration_rate_limit(request, db)
    email = normalize_email(payload.email)
    exists = db.query(Usuario).filter(Usuario.email == email).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email.")

    first_user = db.query(Usuario).count() == 0
    requires_approval = os.getenv("REGISTRATION_REQUIRES_APPROVAL", "true").lower() in {"1", "true", "yes", "on"}
    approved = first_user or not requires_approval
    user = Usuario(
        nombre=payload.nombre.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        activo=approved,
        aprobado=approved,
        aprobado_en=datetime.now(timezone.utc) if approved else None,
        aprobado_por="sistema" if approved else None,
        puede_gestionar_sistema=first_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if not approved:
        raise HTTPException(status_code=202, detail="Registro recibido. Tu cuenta queda pendiente de aceptación desde el panel.")
    token = create_access_token(user.email, {"name": user.nombre})
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    enforce_login_rate_limit(email, request, db)
    user = db.query(Usuario).filter(Usuario.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        register_failed_login(email, request, db)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos.")
    if not user.activo or not user.aprobado:
        raise HTTPException(status_code=403, detail="Cuenta pendiente de aceptación o desactivada.")
    clear_failed_logins(email, request, db)
    user.ultimo_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.email, {"name": user.nombre})
    return {"access_token": token, "token_type": "bearer", "user": user}



@app.post("/auth/password/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    user = db.query(Usuario).filter(Usuario.email == email, Usuario.activo == True, Usuario.aprobado == True).first()  # noqa: E712
    if not user:
        return {"ok": True, "message": "Si el email existe y está aprobado, recibirá instrucciones."}
    token = secrets.token_urlsafe(32)
    user.reset_password_token_hash = hash_reset_token(token)
    user.reset_password_expira_en = datetime.now(timezone.utc) + timedelta(hours=2)
    db.commit()
    app_url = os.getenv("APP_PUBLIC_URL", "http://localhost:8088").rstrip("/")
    reset_url = f"{app_url}/reset-password?token={token}"
    body = f"Solicitud de recuperación de contraseña PresuControl. Enlace válido 2 horas: {reset_url}"
    html = f"<p>Solicitud de recuperación de contraseña de <strong>PresuControl</strong>.</p><p><a href='{reset_url}'>Cambiar contraseña</a></p><p>El enlace caduca en 2 horas.</p>"
    try:
        send_email("PresuControl · recuperación de contraseña", [user.email], body, html)
    except Exception:
        # No revelar configuración SMTP ni existencia de cuenta.
        pass
    return {"ok": True, "message": "Si el email existe y está aprobado, recibirá instrucciones."}


@app.post("/auth/password/reset")
def reset_password(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    token_hash = hash_reset_token(payload.token)
    user = db.query(Usuario).filter(Usuario.reset_password_token_hash == token_hash).first()
    now = datetime.now(timezone.utc)
    if not user or not user.reset_password_expira_en or user.reset_password_expira_en < now:
        raise HTTPException(status_code=400, detail="Token inválido o caducado.")
    if not hmac.compare_digest(user.reset_password_token_hash or "", token_hash):
        raise HTTPException(status_code=400, detail="Token inválido o caducado.")
    user.hashed_password = hash_password(payload.password)
    user.reset_password_token_hash = None
    user.reset_password_expira_en = None
    db.commit()
    return {"ok": True}

@app.get("/auth/me", response_model=UserOut)
def me(request: Request, db: Session = Depends(get_db)):
    try:
        user = get_authenticated_user_from_request(request, db)
        if user:
            return user
    except HTTPException:
        pass
    return JSONResponse(status_code=401, content={"detail": "No autenticado. Haz logout y login de nuevo."})

@app.get("/usuarios", response_model=list[UserOut])
def list_usuarios(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return db.query(Usuario).order_by(desc(Usuario.creado_en)).all()


@app.get("/usuarios/pendientes", response_model=list[UserOut])
def list_usuarios_pendientes(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return db.query(Usuario).filter(or_(Usuario.aprobado == False, Usuario.activo == False)).order_by(desc(Usuario.creado_en)).all()  # noqa: E712


@app.post("/usuarios/{usuario_id}/aceptar", response_model=UserOut)
def aceptar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    actor = current_actor(request)
    user.aprobado = True
    user.activo = True
    user.aprobado_en = datetime.now(timezone.utc)
    user.aprobado_por = actor_label(actor)
    db.commit()
    db.refresh(user)
    return user


@app.post("/usuarios/{usuario_id}/desactivar", response_model=UserOut)
def desactivar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    current = getattr(request.state, "user", None)
    if current and current.id == usuario_id:
        raise HTTPException(status_code=422, detail="No puedes desactivar tu propio usuario desde esta pantalla.")
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.activo = False
    db.commit()
    db.refresh(user)
    return user


@app.post("/usuarios/{usuario_id}/toggle-gestion", response_model=UserOut)
def toggle_gestion_usuario(usuario_id: int, payload: UserApprovalPayload, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if payload.puede_gestionar_sistema is None:
        raise HTTPException(status_code=422, detail="Falta valor puede_gestionar_sistema.")
    user.puede_gestionar_sistema = payload.puede_gestionar_sistema
    db.commit()
    db.refresh(user)
    return user


@app.post("/usuarios/{usuario_id}/reset-password", response_model=UserOut)
def admin_reset_password(usuario_id: int, payload: PasswordAdminReset, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.hashed_password = hash_password(payload.password)
    user.reset_password_token_hash = None
    user.reset_password_expira_en = None
    db.commit()
    db.refresh(user)
    return user



REQUIRED_IMPORT_COLUMNS = {
    "numero_presupuesto": "Nº presupuesto FactuSOL",
    "cliente": "Cliente",
    "obra_referencia": "Obra / referencia",
    "gestor": "Gestor",
    "fecha_presupuesto": "Fecha presupuesto",
    "importe": "Importe",
    "estado": "Estado",
}

COLUMN_ALIASES = {
    "Nº presupuesto FactuSOL": "numero_presupuesto",
    "No presupuesto FactuSOL": "numero_presupuesto",
    "Numero presupuesto FactuSOL": "numero_presupuesto",
    "numero_presupuesto": "numero_presupuesto",
    "Cliente": "cliente",
    "cliente": "cliente",
    "Obra / referencia": "obra_referencia",
    "Obra": "obra_referencia",
    "obra_referencia": "obra_referencia",
    "Gestor": "gestor",
    "gestor": "gestor",
    "Fecha presupuesto": "fecha_presupuesto",
    "fecha_presupuesto": "fecha_presupuesto",
    "Importe": "importe",
    "importe": "importe",
    "Estado": "estado",
    "estado": "estado",
}

SERIALIZE_FIELDS = [
    "id", "numero_presupuesto", "cliente", "obra_referencia", "gestor", "fecha_presupuesto",
    "fecha_envio_cliente", "fecha_aceptacion", "importe", "estado", "proveedor",
    "pedido_proveedor_realizado", "numero_pedido_proveedor", "fecha_pedido_proveedor",
    "plazo_proveedor", "fecha_prevista_entrega", "responsable_actual", "siguiente_accion",
    "fecha_limite_siguiente_accion", "incidencia", "descripcion_incidencia", "observaciones",
    "motivo_cancelacion_rechazo", "fecha_cancelacion_rechazo", "archivado", "archivado_en",
    "archivado_por", "motivo_archivado", "prioridad_calculada", "dias_parado",
    "fecha_ultima_actualizacion", "creado_en", "actualizado_en", "version",
]

def serialize(obj: Presupuesto) -> dict[str, Any]:
    return {field: getattr(obj, field) for field in SERIALIZE_FIELDS}

def to_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)

def current_actor(request: Request | None = None, manual_name: str | None = None) -> dict[str, Any]:
    user = getattr(getattr(request, "state", None), "user", None) if request is not None else None
    return {
        "usuario_id": getattr(user, "id", None),
        "usuario_nombre": getattr(user, "nombre", None) or manual_name,
        "usuario_email": getattr(user, "email", None),
        "nombre_opcional": manual_name or getattr(user, "nombre", None),
    }

def actor_label(actor: dict[str, Any] | None) -> str | None:
    if not actor:
        return None
    return actor.get("usuario_nombre") or actor.get("usuario_email") or actor.get("nombre_opcional")

def add_history(db: Session, presupuesto_id: int, campo: str, before: Any, after: Any, nombre: str | None = None, actor: dict[str, Any] | None = None):
    if to_str(before) == to_str(after):
        return
    actor = actor or {}
    db.add(HistorialCambio(
        presupuesto_id=presupuesto_id,
        campo=campo,
        valor_anterior=to_str(before),
        valor_nuevo=to_str(after),
        descripcion=f"{campo} cambiado de '{to_str(before) or ''}' a '{to_str(after) or ''}'.",
        nombre_opcional=actor.get("nombre_opcional") or nombre,
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))

def check_expected_version(obj: Presupuesto, expected_version: int | None):
    if expected_version is None:
        raise HTTPException(status_code=422, detail="Falta expected_version. Recarga la ficha antes de modificar.")
    if expected_version != getattr(obj, "version", 1):
        raise HTTPException(
            status_code=409,
            detail=(
                "Este presupuesto ha sido actualizado por otra persona. "
                "Recarga la ficha antes de guardar para no sobrescribir cambios."
            ),
        )


def base_query(db: Session, include_archivados: bool = False):
    q = db.query(Presupuesto)
    if not include_archivados:
        q = q.filter(Presupuesto.archivado == False)  # noqa: E712
    return q

def apply_filters(
    query,
    search: str | None = None,
    estado: str | None = None,
    prioridad: str | None = None,
    gestor: str | None = None,
    proveedor: str | None = None,
    incidencia: bool | None = None,
):
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            Presupuesto.numero_presupuesto.ilike(like),
            Presupuesto.cliente.ilike(like),
            Presupuesto.obra_referencia.ilike(like),
            Presupuesto.gestor.ilike(like),
            Presupuesto.proveedor.ilike(like),
            Presupuesto.numero_pedido_proveedor.ilike(like),
            Presupuesto.estado.ilike(like),
            Presupuesto.observaciones.ilike(like),
        ))
    if estado:
        query = query.filter(Presupuesto.estado == estado)
    if prioridad:
        query = query.filter(Presupuesto.prioridad_calculada == prioridad)
    if gestor:
        query = query.filter(Presupuesto.gestor == gestor)
    if proveedor:
        query = query.filter(Presupuesto.proveedor == proveedor)
    if incidencia is not None:
        query = query.filter(Presupuesto.incidencia == incidencia)
    return query

def apply_sort(query, sort_by: str | None, sort_dir: str | None):
    mapping = {
        "fecha": Presupuesto.fecha_presupuesto,
        "fecha_presupuesto": Presupuesto.fecha_presupuesto,
        "importe": Presupuesto.importe,
        "prioridad": Presupuesto.prioridad_calculada,
        "dias_parado": Presupuesto.dias_parado,
        "ultima_actualizacion": Presupuesto.fecha_ultima_actualizacion,
    }
    column = mapping.get(sort_by or "ultima_actualizacion", Presupuesto.fecha_ultima_actualizacion)
    return query.order_by(asc(column) if sort_dir == "asc" else desc(column))

@app.get("/health")
def health():
    return {"status": "ok", "service": "PresuControl"}


# Debug endpoints - only available when DEBUG_MODE=true
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower() in {"1", "true", "yes", "on"}

if DEBUG_MODE:

    @app.get("/debug/ping")
    def debug_ping():
        return {"status": "ok", "message": "Backend is responding"}

    @app.get("/debug/verify-login")
    def debug_verify_login(request: Request, db: Session = Depends(get_db)):
        try:
            user = get_authenticated_user_from_request(request, db)
            return {"ok": True, "user": user.email if user else None}
        except HTTPException as e:
            return {"ok": False, "error": e.detail}


# Seed demo endpoint - only available when SEED_DEMO=true
SEED_DEMO_MODE = os.getenv("SEED_DEMO", "false").lower() in {"1", "true", "yes", "on"}

@app.get("/settings", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db)):
    settings = get_settings(db)
    return {
        **settings,
        "timezone": os.getenv("APP_TIMEZONE", "Europe/Madrid"),
        "public_url": os.getenv("APP_PUBLIC_URL", "http://localhost:8088"),
        "smtp_configured": bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM")),
        "smtp_host": os.getenv("SMTP_HOST") or None,
        "smtp_port": int(os.getenv("SMTP_PORT", "587")),
        "smtp_from": os.getenv("SMTP_FROM") or None,
        "smtp_tls": os.getenv("SMTP_TLS", "true").lower() in {"1", "true", "yes", "on"},
    }

@app.put("/settings", response_model=SettingsOut)
def save_settings(payload: SettingsUpdate, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return update_settings(db, payload.model_dump(exclude_unset=True))

@app.get("/presupuestos", response_model=list[PresupuestoOut])
def list_presupuestos(
    db: Session = Depends(get_db),
    search: str | None = None,
    estado: str | None = None,
    prioridad: str | None = None,
    gestor: str | None = None,
    proveedor: str | None = None,
    incidencia: bool | None = None,
    include_archivados: bool = False,
    ocultar_cerrados: bool = False,
    sort_by: str | None = "ultima_actualizacion",
    sort_dir: str | None = "desc",
    limit: int = Query(250, ge=1, le=2000),
):
    q = apply_filters(db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)), search, estado, prioridad, gestor, proveedor, incidencia)
    if not include_archivados:
        q = q.filter(Presupuesto.archivado == False)  # noqa: E712
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    q = apply_sort(q, sort_by, sort_dir)
    rows = q.limit(limit).all()
    # OPTIMIZACIÓN: Obtener settings UNA vez, no por cada fila
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [row.id for row in rows])
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings, pedido_counts)
    return rows


@app.get("/presupuestos-page", response_model=PaginatedPresupuestos)
def list_presupuestos_page(
    db: Session = Depends(get_db),
    search: str | None = None,
    estado: str | None = None,
    prioridad: str | None = None,
    gestor: str | None = None,
    proveedor: str | None = None,
    incidencia: bool | None = None,
    include_archivados: bool = False,
    ocultar_cerrados: bool = True,
    sort_by: str | None = "ultima_actualizacion",
    sort_dir: str | None = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
):
    q = apply_filters(base_query(db, include_archivados).options(selectinload(Presupuesto.pedidos)), search, estado, prioridad, gestor, proveedor, incidencia)
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    total = q.count()
    importe_total = float(q.with_entities(func.coalesce(func.sum(Presupuesto.importe), 0)).scalar() or 0)
    q = apply_sort(q, sort_by, sort_dir)
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    # OPTIMIZACIÓN: Obtener settings UNA vez, no por cada fila
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [row.id for row in rows])
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings, pedido_counts)
    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total + page_size - 1) // page_size, 1),
        "importe_total": round(importe_total, 2),
    }

@app.post("/presupuestos", response_model=PresupuestoOut, status_code=201)
def create_presupuesto(payload: PresupuestoCreate, request: Request, db: Session = Depends(get_db)):
    exists = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto == payload.numero_presupuesto.strip()).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe un presupuesto con ese nº FactuSOL.")
    data = payload.model_dump(exclude={"modificado_por"})
    for key, value in list(data.items()):
        if isinstance(value, str):
            data[key] = value.strip()
    obj = Presupuesto(**data)
    actor = current_actor(request, payload.modificado_por)
    if obj.estado in {"Bloqueado / incidencia"}:
        obj.incidencia = True
    validate_presupuesto(obj, db)
    apply_derived_fields(obj, db)
    db.add(obj)
    db.flush()
    db.add(HistorialCambio(
        presupuesto_id=obj.id,
        campo="creación",
        valor_anterior=None,
        valor_nuevo=obj.numero_presupuesto,
        descripcion=f"Presupuesto {obj.numero_presupuesto} creado.",
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))
    db.commit()
    db.refresh(obj)
    send_immediate_alerts_for_budget(db, obj)
    return obj

@app.get("/presupuestos/{presupuesto_id}", response_model=PresupuestoOut)
def read_presupuesto(presupuesto_id: int, db: Session = Depends(get_db)):
    obj = db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)).filter(Presupuesto.id == presupuesto_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    settings = get_settings(db)
    obj.prioridad_calculada, obj.dias_parado = calculate_risk(obj, db, settings)
    return obj

@app.patch("/presupuestos/{presupuesto_id}", response_model=PresupuestoOut)
def update_presupuesto(presupuesto_id: int, payload: PresupuestoUpdate, request: Request, db: Session = Depends(get_db)):
    obj = db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)).filter(Presupuesto.id == presupuesto_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")

    check_expected_version(obj, payload.expected_version)
    data = payload.model_dump(exclude_unset=True, exclude={"modificado_por", "expected_version"})
    if "numero_presupuesto" in data and data["numero_presupuesto"]:
        duplicated = db.query(Presupuesto).filter(
            Presupuesto.numero_presupuesto == data["numero_presupuesto"].strip(),
            Presupuesto.id != presupuesto_id,
        ).first()
        if duplicated:
            raise HTTPException(status_code=409, detail="Ya existe otro presupuesto con ese nº FactuSOL.")

    actor = current_actor(request, payload.modificado_por)
    before = serialize(obj)
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(obj, key, value)

    if obj.estado == "Bloqueado / incidencia":
        obj.incidencia = True
    validate_presupuesto(obj, db, existing_id=presupuesto_id)
    apply_derived_fields(obj, db)
    obj.version = (obj.version or 1) + 1
    db.flush()

    after = serialize(obj)
    for field, old_value in before.items():
        if field in {"actualizado_en", "fecha_ultima_actualizacion", "prioridad_calculada", "dias_parado", "version"}:
            continue
        new_value = after[field]
        add_history(db, presupuesto_id, field, old_value, new_value, payload.modificado_por, actor)

    db.commit()
    db.refresh(obj)
    send_immediate_alerts_for_budget(db, obj)
    return obj

@app.post("/presupuestos/{presupuesto_id}/quick-action", response_model=PresupuestoOut)
def quick_action(presupuesto_id: int, payload: QuickAction, request: Request, db: Session = Depends(get_db)):
    obj = db.get(Presupuesto, presupuesto_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    check_expected_version(obj, payload.expected_version)
    actor = current_actor(request, payload.modificado_por)
    before = serialize(obj)
    action = payload.action

    if action == "marcar_enviado":
        obj.estado = "Enviado al cliente"
        obj.fecha_envio_cliente = payload.fecha_envio_cliente or obj.fecha_envio_cliente or date.today()
        obj.siguiente_accion = payload.siguiente_accion or obj.siguiente_accion or "Hacer seguimiento comercial"
        obj.fecha_limite_siguiente_accion = payload.fecha_limite_siguiente_accion or obj.fecha_limite_siguiente_accion
    elif action == "marcar_aceptado":
        obj.estado = "Aceptado - pendiente pedido proveedor"
        obj.fecha_aceptacion = payload.fecha_aceptacion or obj.fecha_aceptacion or date.today()
        actor_name = actor_label(actor)
        if not payload.responsable_actual or payload.responsable_actual == "Compras":
            obj.responsable_actual = actor_name or "Compras"
        else:
            obj.responsable_actual = payload.responsable_actual
        obj.siguiente_accion = payload.siguiente_accion or obj.siguiente_accion or "Hacer pedido proveedor"
        obj.fecha_limite_siguiente_accion = payload.fecha_limite_siguiente_accion or obj.fecha_limite_siguiente_accion or date.today()
    elif action == "crear_pedido_proveedor":
        nuevo_pedido = PedidoProveedor(
            presupuesto_id=obj.id,
            proveedor=payload.proveedor or obj.proveedor or "Sin especificar",
            numero_pedido=payload.numero_pedido_proveedor,
            fecha_pedido=payload.fecha_pedido_proveedor or date.today(),
            estado_entrega="pendiente",
        )
        db.add(nuevo_pedido)
        db.add(HistorialCambio(
            presupuesto_id=obj.id,
            campo="pedido_proveedor",
            valor_anterior=None,
            valor_nuevo=f"{nuevo_pedido.proveedor} - {nuevo_pedido.numero_pedido or 'sin nº'}",
            descripcion=f"Pedido a proveedor '{nuevo_pedido.proveedor}' creado desde acción rápida.",
            nombre_opcional=actor.get("nombre_opcional"),
            usuario_id=actor.get("usuario_id"),
            usuario_nombre=actor.get("usuario_nombre"),
            usuario_email=actor.get("usuario_email"),
        ))
        actor_name = actor_label(actor)
        if not payload.responsable_actual or payload.responsable_actual == "Compras":
            obj.responsable_actual = actor_name or "Compras"
        else:
            obj.responsable_actual = payload.responsable_actual
        obj.siguiente_accion = payload.siguiente_accion or obj.siguiente_accion or "Confirmar plazo proveedor"
        obj.fecha_limite_siguiente_accion = payload.fecha_limite_siguiente_accion or obj.fecha_limite_siguiente_accion
    elif action == "confirmar_plazo":
        obj.estado = "Plazo proveedor confirmado"
        obj.plazo_proveedor = payload.plazo_proveedor or obj.plazo_proveedor
        obj.fecha_prevista_entrega = payload.fecha_prevista_entrega or obj.fecha_prevista_entrega
        obj.siguiente_accion = payload.siguiente_accion or obj.siguiente_accion or "Seguimiento de preparación/fabricación"
    elif action == "cerrar":
        obj.estado = "Entregado / cerrado"
        obj.siguiente_accion = payload.siguiente_accion or "Cerrado"
    elif action == "bloquear":
        obj.estado = "Bloqueado / incidencia"
        obj.incidencia = True
        obj.descripcion_incidencia = payload.descripcion_incidencia or obj.descripcion_incidencia or "Incidencia pendiente de detallar"
        obj.responsable_actual = payload.responsable_actual or obj.responsable_actual
        obj.siguiente_accion = payload.siguiente_accion or obj.siguiente_accion or "Resolver incidencia"
    elif action == "cancelar":
        obj.estado = "Cancelado / rechazado"
        obj.motivo_cancelacion_rechazo = payload.motivo_cancelacion_rechazo or obj.motivo_cancelacion_rechazo
        obj.fecha_cancelacion_rechazo = payload.fecha_cancelacion_rechazo or obj.fecha_cancelacion_rechazo or date.today()
        obj.siguiente_accion = "Cancelado / rechazado"
    else:
        raise HTTPException(status_code=422, detail="Acción rápida no válida.")

    validate_presupuesto(obj, db, existing_id=presupuesto_id)
    apply_derived_fields(obj, db)
    obj.version = (obj.version or 1) + 1
    db.flush()
    after = serialize(obj)
    for field, old_value in before.items():
        if field in {"actualizado_en", "fecha_ultima_actualizacion", "prioridad_calculada", "dias_parado", "version"}:
            continue
        add_history(db, presupuesto_id, field, old_value, after[field], payload.modificado_por, actor)
    db.commit()
    db.refresh(obj)
    send_immediate_alerts_for_budget(db, obj)
    return obj


@app.post("/presupuestos/{presupuesto_id}/archivar", response_model=PresupuestoOut)
def archivar_presupuesto(presupuesto_id: int, payload: ArchivePayload, request: Request, db: Session = Depends(get_db)):
    obj = db.get(Presupuesto, presupuesto_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    check_expected_version(obj, payload.expected_version)
    actor = current_actor(request)
    before = serialize(obj)
    obj.archivado = True
    obj.archivado_en = datetime.now(timezone.utc)
    obj.archivado_por = actor_label(actor)
    obj.motivo_archivado = payload.motivo_archivado
    obj.version = (obj.version or 1) + 1
    apply_derived_fields(obj, db)
    db.flush()
    after = serialize(obj)
    for field in ["archivado", "archivado_en", "archivado_por", "motivo_archivado"]:
        add_history(db, presupuesto_id, field, before.get(field), after.get(field), actor=actor)
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/presupuestos/{presupuesto_id}")
def delete_presupuesto(presupuesto_id: int, request: Request, db: Session = Depends(get_db)):
    raise HTTPException(status_code=405, detail="No hay borrado físico. Usa /archivar con expected_version y motivo.")

@app.get("/presupuestos/{presupuesto_id}/comentarios", response_model=list[ComentarioOut])
def list_comentarios(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(Comentario).filter(Comentario.presupuesto_id == presupuesto_id).order_by(desc(Comentario.creado_en)).all()

@app.post("/presupuestos/{presupuesto_id}/comentarios", response_model=ComentarioOut, status_code=201)
def add_comentario(presupuesto_id: int, payload: ComentarioCreate, request: Request, db: Session = Depends(get_db)):
    if not db.get(Presupuesto, presupuesto_id):
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    actor = current_actor(request, payload.nombre_opcional)
    obj = Comentario(
        presupuesto_id=presupuesto_id,
        comentario=payload.comentario,
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    )
    db.add(obj)
    db.add(HistorialCambio(
        presupuesto_id=presupuesto_id,
        campo="comentario",
        valor_anterior=None,
        valor_nuevo=payload.comentario,
        descripcion="Comentario interno añadido.",
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))
    db.commit()
    db.refresh(obj)
    return obj

@app.get("/presupuestos/{presupuesto_id}/historial", response_model=list[HistorialOut])
def list_historial(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(HistorialCambio).filter(HistorialCambio.presupuesto_id == presupuesto_id).order_by(desc(HistorialCambio.creado_en)).all()


@app.get("/presupuestos/{presupuesto_id}/pedidos", response_model=list[PedidoProveedorOut])
def list_pedidos(presupuesto_id: int, db: Session = Depends(get_db)):
    if not db.get(Presupuesto, presupuesto_id):
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    return db.query(PedidoProveedor).filter(PedidoProveedor.presupuesto_id == presupuesto_id).order_by(desc(PedidoProveedor.creado_en)).all()


@app.post("/presupuestos/{presupuesto_id}/pedidos", response_model=PedidoProveedorOut, status_code=201)
def create_pedido(presupuesto_id: int, payload: PedidoProveedorCreate, request: Request, db: Session = Depends(get_db)):
    presupuesto = db.get(Presupuesto, presupuesto_id)
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    actor = current_actor(request)
    obj = PedidoProveedor(
        presupuesto_id=presupuesto_id,
        proveedor=payload.proveedor,
        numero_pedido=payload.numero_pedido,
        fecha_pedido=payload.fecha_pedido,
        importe=payload.importe,
        estado_entrega=payload.estado_entrega or "pendiente",
        fecha_entrega_prevista=payload.fecha_entrega_prevista,
        fecha_entrega_real=payload.fecha_entrega_real,
        observaciones=payload.observaciones,
    )
    db.add(obj)
    db.add(HistorialCambio(
        presupuesto_id=presupuesto_id,
        campo="pedido_proveedor",
        valor_anterior=None,
        valor_nuevo=f"{obj.proveedor} - {obj.numero_pedido or 'sin nº'}",
        descripcion=f"Pedido a proveedor '{obj.proveedor}' creado.",
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))
    db.commit()
    db.refresh(obj)
    return obj


@app.patch("/pedidos/{pedido_id}", response_model=PedidoProveedorOut)
def update_pedido(pedido_id: int, payload: PedidoProveedorUpdate, request: Request, db: Session = Depends(get_db)):
    obj = db.get(PedidoProveedor, pedido_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    actor = current_actor(request)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(obj, key, value)
    db.flush()
    db.add(HistorialCambio(
        presupuesto_id=obj.presupuesto_id,
        campo="pedido_proveedor",
        valor_anterior=None,
        valor_nuevo=f"{obj.proveedor} - {obj.numero_pedido or 'sin nº'}",
        descripcion=f"Pedido a proveedor '{obj.proveedor}' actualizado.",
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/pedidos/{pedido_id}")
def delete_pedido(pedido_id: int, request: Request, db: Session = Depends(get_db)):
    obj = db.get(PedidoProveedor, pedido_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    actor = current_actor(request)
    db.add(HistorialCambio(
        presupuesto_id=obj.presupuesto_id,
        campo="pedido_proveedor",
        valor_anterior=f"{obj.proveedor} - {obj.numero_pedido or 'sin nº'}",
        valor_nuevo=None,
        descripcion=f"Pedido a proveedor '{obj.proveedor}' eliminado.",
        nombre_opcional=actor.get("nombre_opcional"),
        usuario_id=actor.get("usuario_id"),
        usuario_nombre=actor.get("usuario_nombre"),
        usuario_email=actor.get("usuario_email"),
    ))
    db.delete(obj)
    db.commit()
    return {"ok": True}


@app.post("/presupuestos/{presupuesto_id}/proveedores", response_model=PresupuestoProveedorOut, tags=["proveedores"])
def add_proveedor_presupuesto(
    presupuesto_id: int,
    payload: PresupuestoProveedorCreate,
    db: Session = Depends(get_db),
):
    pp = db.query(PresupuestoProveedor).filter(
        PresupuestoProveedor.presupuesto_id == presupuesto_id,
        PresupuestoProveedor.proveedor_id == payload.proveedor_id
    ).first()
    if pp:
        raise HTTPException(status_code=409, detail="Este proveedor ya está asociado")
    pp = PresupuestoProveedor(presupuesto_id=presupuesto_id, **payload.model_dump())
    db.add(pp)
    db.commit()
    db.refresh(pp)
    return pp


@app.get("/presupuestos/{presupuesto_id}/proveedores", response_model=list[PresupuestoProveedorOut], tags=["proveedores"])
def list_proveedores_presupuesto(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(PresupuestoProveedor).filter(PresupuestoProveedor.presupuesto_id == presupuesto_id).all()


@app.patch("/presupuestos/{presupuesto_id}/proveedores/{proveedor_id}", response_model=PresupuestoProveedorOut, tags=["proveedores"])
def update_proveedor_presupuesto(
    presupuesto_id: int,
    proveedor_id: int,
    payload: PresupuestoProveedorUpdate,
    db: Session = Depends(get_db),
):
    pp = db.query(PresupuestoProveedor).filter(
        PresupuestoProveedor.presupuesto_id == presupuesto_id,
        PresupuestoProveedor.proveedor_id == proveedor_id
    ).first()
    if not pp:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(pp, key, value)
    db.commit()
    db.refresh(pp)
    return pp


@app.delete("/presupuestos/{presupuesto_id}/proveedores/{proveedor_id}", tags=["proveedores"])
def remove_proveedor_presupuesto(presupuesto_id: int, proveedor_id: int, db: Session = Depends(get_db)):
    pp = db.query(PresupuestoProveedor).filter(
        PresupuestoProveedor.presupuesto_id == presupuesto_id,
        PresupuestoProveedor.proveedor_id == proveedor_id
    ).first()
    if not pp:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")
    db.delete(pp)
    db.commit()
    return {"ok": True}


@app.get("/mi-mesa")
def mi_mesa(request: Request, db: Session = Depends(get_db), responsable: str | None = None):
    user = getattr(request.state, "user", None)
    keys = [k for k in [responsable, getattr(user, "nombre", None), getattr(user, "email", None)] if k]
    q = base_query(db).filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    if keys:
        conds = []
        for key in keys:
            conds.append(Presupuesto.responsable_actual.ilike(f"%{key}%"))
            conds.append(Presupuesto.gestor.ilike(f"%{key}%"))
        q = q.filter(or_(*conds))
    rows = q.all()
    today = date.today()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    out = []
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)
        if (
            r.fecha_limite_siguiente_accion is None
            or r.fecha_limite_siguiente_accion <= today
            or r.prioridad_calculada in {"Naranja", "Rojo", "Crítico"}
            or r.incidencia
        ):
            out.append(r)
    rank = {"Crítico": 5, "Rojo": 4, "Naranja": 3, "Amarillo": 2, "Verde": 1}
    items = sorted([serialize(r) for r in out], key=lambda x: (rank.get(x["prioridad_calculada"], 0), x.get("dias_parado") or 0), reverse=True)
    return {
        "usuario": {"id": getattr(user, "id", None), "nombre": getattr(user, "nombre", None), "email": getattr(user, "email", None)},
        "items": items,
        "resumen": {
            "total": len(items),
            "vencidos": len([x for x in items if x.get("fecha_limite_siguiente_accion") and x["fecha_limite_siguiente_accion"][:10] <= today.isoformat()]),
            "criticos": len([x for x in items if x.get("prioridad_calculada") == "Crítico"]),
            "incidencias": len([x for x in items if x.get("incidencia")]),
            "aceptados_sin_pedido": len([x for x in items if x.get("fecha_aceptacion") and not x.get("pedido_proveedor_realizado")]),
        }
    }


@app.get("/sidebar-counters")
def sidebar_counters(request: Request, db: Session = Depends(get_db)):
    rows = base_query(db).all()
    today = date.today()
    riesgo_count = 0
    hoy_count = 0
    aceptados_sin_pedido = 0
    incidencias = 0
    unique_risk: dict[int, float] = {}
    settings = get_settings(db)
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings)
        accepted_no_order = bool(r.fecha_aceptacion and not r.pedido_proveedor_realizado)
        order_no_deadline = bool(r.pedido_proveedor_realizado and not r.plazo_proveedor and r.estado not in CLOSED_STATES)
        vencido = bool(r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion < today)
        stale = bool(r.dias_parado > 3 and r.estado not in CLOSED_STATES)
        risky = accepted_no_order or order_no_deadline or vencido or stale or r.incidencia
        if accepted_no_order:
            aceptados_sin_pedido += 1
        if r.incidencia:
            incidencias += 1
        if risky:
            riesgo_count += 1
            unique_risk[r.id] = r.importe
        if r.estado not in CLOSED_STATES and (vencido or r.prioridad_calculada in {"Rojo", "Crítico"} or accepted_no_order or r.incidencia):
            hoy_count += 1
    usuarios_pendientes = db.query(Usuario).filter(or_(Usuario.aprobado == False, Usuario.activo == False)).count()  # noqa: E712
    user = getattr(request.state, "user", None)
    user_id = user.id if user else None
    return {
        "hoy": hoy_count,
        "aceptados_sin_pedido": aceptados_sin_pedido,
        "riesgo": riesgo_count,
        "incidencias": incidencias,
        "usuarios_pendientes": usuarios_pendientes,
        "dinero_riesgo": round(sum(unique_risk.values()), 2),
        "notificaciones_sin_leer": contar_sin_leer(db, user_id),
    }


@app.get("/search")
def global_search(
    db: Session = Depends(get_db),
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    like = f"%{q.strip()}%"
    offset = (page - 1) * page_size
    presupuestos_q = base_query(db, include_archivados=True).filter(or_(
        Presupuesto.numero_presupuesto.ilike(like),
        Presupuesto.cliente.ilike(like),
        Presupuesto.obra_referencia.ilike(like),
        Presupuesto.gestor.ilike(like),
        Presupuesto.proveedor.ilike(like),
        Presupuesto.numero_pedido_proveedor.ilike(like),
        Presupuesto.estado.ilike(like),
        Presupuesto.observaciones.ilike(like),
        Presupuesto.descripcion_incidencia.ilike(like),
    ))
    total_presupuestos = presupuestos_q.count()
    presupuestos = presupuestos_q.order_by(desc(Presupuesto.fecha_ultima_actualizacion)).offset(offset).limit(page_size).all()
    total_comentarios = db.query(Comentario).filter(Comentario.comentario.ilike(like)).count()
    comentarios = db.query(Comentario).filter(Comentario.comentario.ilike(like)).order_by(desc(Comentario.creado_en)).offset(offset).limit(page_size).all()
    total_historial = db.query(HistorialCambio).filter(or_(HistorialCambio.descripcion.ilike(like), HistorialCambio.valor_anterior.ilike(like), HistorialCambio.valor_nuevo.ilike(like))).count()
    historial = db.query(HistorialCambio).filter(or_(HistorialCambio.descripcion.ilike(like), HistorialCambio.valor_anterior.ilike(like), HistorialCambio.valor_nuevo.ilike(like))).order_by(desc(HistorialCambio.creado_en)).offset(offset).limit(page_size).all()
    return {
        "presupuestos": presupuestos,
        "comentarios": [{"id": c.id, "presupuesto_id": c.presupuesto_id, "comentario": c.comentario, "creado_en": c.creado_en, "usuario_nombre": c.usuario_nombre} for c in comentarios],
        "historial": [{"id": h.id, "presupuesto_id": h.presupuesto_id, "descripcion": h.descripcion, "creado_en": h.creado_en, "usuario_nombre": h.usuario_nombre} for h in historial],
        "total_presupuestos": total_presupuestos,
        "total_comentarios": total_comentarios,
        "total_historial": total_historial,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total_presupuestos + page_size - 1) // page_size, 1),
    }


@app.get("/logs/emails", response_model=list[EmailLogOut])
def logs_emails(
    request: Request,
    db: Session = Depends(get_db),
    status: str | None = None,
    tipo: str | None = None,
    presupuesto_id: int | None = None,
    escalation_level: int | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    require_system_manager(request)
    query = db.query(EmailNotificationLog)
    if status:
        query = query.filter(EmailNotificationLog.status == status)
    if tipo:
        query = query.filter(EmailNotificationLog.tipo.ilike(f"%{tipo}%"))
    if presupuesto_id:
        query = query.filter(EmailNotificationLog.presupuesto_id == presupuesto_id)
    if escalation_level is not None:
        query = query.filter(EmailNotificationLog.escalation_level == escalation_level)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(EmailNotificationLog.sent_to.ilike(like), EmailNotificationLog.error.ilike(like), EmailNotificationLog.fingerprint.ilike(like)))
    if date_from:
        query = query.filter(EmailNotificationLog.creado_en >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        query = query.filter(EmailNotificationLog.creado_en < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    return query.order_by(desc(EmailNotificationLog.creado_en)).offset(offset).limit(limit).all()


@app.get("/logs/actividad", response_model=list[HistorialOut])
def logs_actividad(
    request: Request,
    db: Session = Depends(get_db),
    presupuesto_id: int | None = None,
    usuario: str | None = None,
    campo: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(150, ge=1, le=500),
):
    require_system_manager(request)
    query = db.query(HistorialCambio)
    if presupuesto_id:
        query = query.filter(HistorialCambio.presupuesto_id == presupuesto_id)
    if usuario:
        like_user = f"%{usuario.strip()}%"
        query = query.filter(or_(HistorialCambio.usuario_nombre.ilike(like_user), HistorialCambio.usuario_email.ilike(like_user), HistorialCambio.nombre_opcional.ilike(like_user)))
    if campo:
        query = query.filter(HistorialCambio.campo.ilike(f"%{campo.strip()}%"))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(HistorialCambio.descripcion.ilike(like), HistorialCambio.valor_anterior.ilike(like), HistorialCambio.valor_nuevo.ilike(like)))
    if date_from:
        query = query.filter(HistorialCambio.creado_en >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        query = query.filter(HistorialCambio.creado_en < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    return query.order_by(desc(HistorialCambio.creado_en)).limit(limit).all()


@app.get("/logs/emails/export")
def export_logs_emails(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    rows = db.query(EmailNotificationLog).order_by(desc(EmailNotificationLog.creado_en)).limit(5000).all()
    df = pd.DataFrame([{
        "Fecha": r.creado_en, "Presupuesto ID": r.presupuesto_id, "Tipo": r.tipo, "Estado": r.status,
        "Destinatarios": r.sent_to, "Nivel": r.escalation_level, "Error": r.error, "Fingerprint": r.fingerprint
    } for r in rows])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Emails")
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=presucontrol_logs_emails.xlsx"})


@app.get("/logs/actividad/export")
def export_logs_actividad(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    rows = db.query(HistorialCambio).order_by(desc(HistorialCambio.creado_en)).limit(10000).all()
    df = pd.DataFrame([{
        "Fecha": r.creado_en, "Presupuesto ID": r.presupuesto_id, "Campo": r.campo, "Descripción": r.descripcion,
        "Valor anterior": r.valor_anterior, "Valor nuevo": r.valor_nuevo, "Usuario": r.usuario_nombre or r.nombre_opcional, "Email": r.usuario_email
    } for r in rows])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Actividad")
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=presucontrol_logs_actividad.xlsx"})


@app.get("/notificaciones")
def get_notificaciones(only_unread: bool = False, limit: int = 50, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    notifications = obtener_notificaciones(db, user.id, unread_only=only_unread, limit=limit)
    unread_count = contar_sin_leer(db, user.id)
    return {
        "notificaciones": [
            {
                "id": n.id,
                "tipo": n.tipo,
                "titulo": n.titulo,
                "mensaje": n.mensaje,
                "leida": n.leida,
                "link": n.link,
                "metadata": json.loads(n.extra_data) if n.extra_data else None,
                "creado_en": n.creado_en.isoformat() if n.creado_en else None,
            }
            for n in notifications
        ],
        "sin_leer": unread_count,
    }

@app.post("/notificaciones/{notification_id}/leer")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    success = marcar_leida(db, notification_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"ok": True}

@app.post("/notificaciones/marcar-todas-leidas")
def mark_all_read(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    count = marcar_todas_leidas(db, user.id)
    return {"marcadas": count}

@app.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [row.id for row in rows])
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings, pedido_counts)

    current_month = date.today().replace(day=1)
    active = [r for r in rows if r.estado not in CLOSED_STATES]
    accepted_no_order = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    sent_no_response = [r for r in rows if r.estado == "Enviado al cliente"]
    order_no_deadline = [r for r in rows if r.pedido_proveedor_realizado and not r.plazo_proveedor and r.estado not in CLOSED_STATES]
    incidences = [r for r in rows if r.incidencia]
    closed_month = [r for r in rows if r.estado == "Entregado / cerrado" and r.actualizado_en.date() >= current_month]
    accepted_with_order = [r for r in rows if r.fecha_aceptacion and r.fecha_pedido_proveedor]
    avg_days = round(sum((r.fecha_pedido_proveedor - r.fecha_aceptacion).days for r in accepted_with_order) / len(accepted_with_order), 1) if accepted_with_order else 0

    def brief(items, n=8):
        ordered = sorted(items, key=lambda x: (x.prioridad_calculada != "Crítico", -x.dias_parado))[:n]
        return [serialize(i) for i in ordered]

    return {
        "cards": {
            "total_activos": len(active),
            "aceptados_sin_pedido": len(accepted_no_order),
            "enviados_sin_respuesta": len(sent_no_response),
            "pedidos_sin_plazo": len(order_no_deadline),
            "incidencias_abiertas": len(incidences),
            "cerrados_mes": len(closed_month),
            "importe_aceptado_pendiente_pedido": round(sum(r.importe for r in accepted_no_order), 2),
            "dias_medios_aceptacion_a_pedido": avg_days,
        },
        "sections": {
            "criticos_aceptados_sin_pedido": brief(accepted_no_order),
            "pendientes_respuesta_cliente": brief(sent_no_response),
            "pedidos_sin_plazo": brief(order_no_deadline),
            "incidencias_abiertas": brief(incidences),
            "proximas_fechas_limite": brief([r for r in rows if r.fecha_limite_siguiente_accion and r.estado not in CLOSED_STATES]),
        }
    }

@app.get("/riesgo")
def riesgo(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    risky = []
    today = date.today()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)
        conditions = [
            r.fecha_aceptacion and not r.pedido_proveedor_realizado,
            r.pedido_proveedor_realizado and not r.plazo_proveedor and r.estado not in CLOSED_STATES,
            r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion < today,
            r.dias_parado > 3 and r.estado not in CLOSED_STATES,
            r.incidencia,
        ]
        if any(conditions):
            risky.append(r)
    return sorted([serialize(r) for r in risky], key=lambda x: ["Verde", "Amarillo", "Naranja", "Rojo", "Crítico"].index(x["prioridad_calculada"]), reverse=True)

@app.get("/hoy")
def hoy(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    today = date.today()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    output = []
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)
        due_today = r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion <= today
        serious = r.prioridad_calculada in {"Rojo", "Crítico"}
        accepted_no_order = r.fecha_aceptacion and not r.pedido_proveedor_realizado
        if r.estado not in CLOSED_STATES and (due_today or serious or accepted_no_order or r.incidencia):
            output.append(serialize(r))
    rank = {"Crítico": 5, "Rojo": 4, "Naranja": 3, "Amarillo": 2, "Verde": 1}
    return sorted(output, key=lambda x: (rank.get(x["prioridad_calculada"], 0), x.get("dias_parado") or 0), reverse=True)


@app.get("/aceptados-sin-pedido")
def aceptados_sin_pedido(db: Session = Depends(get_db)):
    rows = base_query(db).filter(Presupuesto.fecha_aceptacion.isnot(None), Presupuesto.pedido_proveedor_realizado == False).all()  # noqa: E712
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)
    return sorted([serialize(r) for r in rows], key=lambda x: x.get("dias_parado") or 0, reverse=True)


@app.get("/avisos")
def avisos(db: Session = Depends(get_db)):
    return build_alerts(db)


@app.get("/avisos/historial")
def avisos_historial(db: Session = Depends(get_db)):
    rows = db.query(EmailNotificationLog).order_by(desc(EmailNotificationLog.creado_en)).limit(200).all()
    presupuesto_ids = [r.presupuesto_id for r in rows if r.presupuesto_id]
    presupuestos = {
        p.id: p
        for p in db.query(Presupuesto).filter(Presupuesto.id.in_(presupuesto_ids)).all()
    } if presupuesto_ids else {}
    return [{
        "id": r.id,
        "tipo": r.tipo,
        "presupuesto_id": r.presupuesto_id,
        "numero_presupuesto": presupuestos[r.presupuesto_id].numero_presupuesto if r.presupuesto_id in presupuestos else str(r.presupuesto_id or ""),
        "cliente": presupuestos[r.presupuesto_id].cliente if r.presupuesto_id in presupuestos else "",
        "prioridad_calculada": presupuestos[r.presupuesto_id].prioridad_calculada if r.presupuesto_id in presupuestos else "",
        "enviado_a": r.sent_to,
        "enviado_en": r.creado_en.isoformat() if r.creado_en else None,
        "status": r.status,
    } for r in rows]


@app.post("/avisos/email-digest")
def avisos_email_digest(db: Session = Depends(get_db), only_critical: bool = False):
    return send_alert_digest(db, only_critical=only_critical)


@app.post("/avisos/escalar-ahora")
def avisos_escalar_ahora(db: Session = Depends(get_db)):
    return send_escalation_alerts(db)


@app.post("/avisos/run-automatic")
def avisos_run_automatic(db: Session = Depends(get_db)):
    return run_automatic_alert_checks(db)


@app.get("/dinero-riesgo")
def dinero_riesgo(db: Session = Depends(get_db)):
    return money_at_risk(db)


@app.post("/email/test")
def email_test(payload: EmailTestPayload, db: Session = Depends(get_db)):
    settings = get_settings(db)
    recipients = payload.destinatarios or settings.get("emails_destino_avisos", [])
    text = "Email de prueba de PresuControl. Si recibes este correo, la configuración SMTP funciona."
    html = "<p>Email de prueba de <strong>PresuControl</strong>.</p><p>La configuración SMTP funciona.</p>"
    try:
        return send_email("PresuControl · email de prueba", parse_recipients(recipients), text, html)
    except Exception as exc:
        return {"sent": False, "reason": str(exc)}

@app.get("/reports")
def reports(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)

    def group_count(attr: str):
        data: dict[str, int] = {}
        for r in rows:
            key = getattr(r, attr) or "Sin definir"
            data[key] = data.get(key, 0) + 1
        return [{"name": k, "value": v} for k, v in sorted(data.items())]

    accepted_by_month: dict[str, int] = {}
    cancelled_by_month: dict[str, int] = {}
    for r in rows:
        if r.fecha_aceptacion:
            key = r.fecha_aceptacion.strftime("%Y-%m")
            accepted_by_month[key] = accepted_by_month.get(key, 0) + 1
        if r.estado == "Cancelado / rechazado" and r.actualizado_en:
            key = r.actualizado_en.strftime("%Y-%m")
            cancelled_by_month[key] = cancelled_by_month.get(key, 0) + 1

    accepted_no_order = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    accepted_with_order = [r for r in rows if r.fecha_aceptacion and r.fecha_pedido_proveedor]
    avg_days = round(sum((r.fecha_pedido_proveedor - r.fecha_aceptacion).days for r in accepted_with_order) / len(accepted_with_order), 1) if accepted_with_order else 0

    return {
        "presupuestos_por_estado": group_count("estado"),
        "prioridades": group_count("prioridad_calculada"),
        "aceptados_por_mes": [{"name": k, "value": v} for k, v in sorted(accepted_by_month.items())],
        "cancelados_por_mes": [{"name": k, "value": v} for k, v in sorted(cancelled_by_month.items())],
        "pendientes_por_gestor": group_count("gestor"),
        "pendientes_por_proveedor": group_count("proveedor"),
        "metricas": {
            "importe_aceptado_pendiente_pedido": round(sum(r.importe for r in accepted_no_order), 2),
            "dias_medios_aceptacion_a_pedido": avg_days,
            "bloqueados": len([r for r in rows if r.estado == "Bloqueado / incidencia" or r.incidencia]),
        }
    }


REPORT_LIST_TYPES = {
    "atrasados",
    "cancelados",
    "sin_pedido",
    "sin_aceptacion",
    "en_riesgo",
    "pedidos_pendientes",
    "pedidos_completados",
}


def get_report_rows(
    db: Session,
    report_type: str,
    gestor: str | None = None,
    fecha_from: date | None = None,
    fecha_to: date | None = None,
    dias: int = 7,
) -> list[Presupuesto]:
    if report_type not in REPORT_LIST_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de reporte no válido.")

    rows = base_query(db).options(selectinload(Presupuesto.pedidos)).all()
    today = date.today()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings, pedido_counts)

    if report_type == "atrasados":
        rows = [
            r for r in rows
            if r.estado not in CLOSED_STATES
            and r.fecha_limite_siguiente_accion
            and r.fecha_limite_siguiente_accion < today
        ]
    elif report_type == "cancelados":
        rows = [r for r in rows if r.estado == "Cancelado / rechazado"]
    elif report_type == "sin_pedido":
        rows = [r for r in rows if r.fecha_aceptacion and not pedido_counts.get(r.id, 0)]
    elif report_type == "sin_aceptacion":
        rows = [
            r for r in rows
            if r.estado == "Enviado al cliente"
            and r.fecha_envio_cliente
            and (today - r.fecha_envio_cliente).days >= dias
        ]
    elif report_type == "en_riesgo":
        rows = [r for r in rows if r.prioridad_calculada in {"Rojo", "Crítico"} or r.incidencia]
    elif report_type == "pedidos_pendientes":
        rows = [r for r in rows if any(p.estado_entrega != "completado" for p in (r.pedidos or []))]
    elif report_type == "pedidos_completados":
        rows = [r for r in rows if r.pedidos and all(p.estado_entrega == "completado" for p in r.pedidos)]

    if gestor:
        rows = [r for r in rows if r.gestor == gestor]
    if fecha_from:
        rows = [r for r in rows if r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion >= fecha_from]
    if fecha_to:
        rows = [r for r in rows if r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion <= fecha_to]
    return sorted(rows, key=lambda r: (r.fecha_limite_siguiente_accion or date.max, r.numero_presupuesto))


@app.get("/reports/list")
def reports_list(
    type: str = Query(..., pattern="^(atrasados|cancelados|sin_pedido|sin_aceptacion|en_riesgo|pedidos_pendientes|pedidos_completados)$"),
    db: Session = Depends(get_db),
    gestor: str | None = None,
    fecha_from: date | None = None,
    fecha_to: date | None = None,
    dias: int = Query(7, ge=1, le=365),
):
    return [serialize(row) for row in get_report_rows(db, type, gestor, fecha_from, fecha_to, dias)]


@app.post("/reports/export-list")
def export_report_list(payload: dict[str, Any]):
    rows = payload.get("items") or []
    filename = str(payload.get("filename") or "presucontrol_reporte.xlsx")
    safe_filename = "".join(ch for ch in filename if ch.isalnum() or ch in {"-", "_", "."}) or "presucontrol_reporte.xlsx"
    export_rows = [
        {
            "Nº Presupuesto": row.get("numero_presupuesto"),
            "Cliente": row.get("cliente"),
            "Obra/Referencia": row.get("obra_referencia"),
            "Gestor": row.get("gestor"),
            "Estado": row.get("estado"),
            "Importe": row.get("importe"),
            "Prioridad": row.get("prioridad_calculada"),
            "Fecha límite": row.get("fecha_limite_siguiente_accion"),
        }
        for row in rows
    ]
    df = pd.DataFrame(export_rows, columns=[
        "Nº Presupuesto",
        "Cliente",
        "Obra/Referencia",
        "Gestor",
        "Estado",
        "Importe",
        "Prioridad",
        "Fecha límite",
    ])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Reporte")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={safe_filename}"},
    )


@app.get("/reports/export")
def export_reports(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [r.id for r in rows])
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings, pedido_counts)

    accepted_no_order = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    accepted_with_order = [r for r in rows if r.fecha_aceptacion and r.fecha_pedido_proveedor]
    avg_days = round(sum((r.fecha_pedido_proveedor - r.fecha_aceptacion).days for r in accepted_with_order) / len(accepted_with_order), 1) if accepted_with_order else 0

    accepted_by_month: dict[str, int] = {}
    cancelled_by_month: dict[str, int] = {}
    for r in rows:
        if r.fecha_aceptacion:
            key = r.fecha_aceptacion.strftime("%Y-%m")
            accepted_by_month[key] = accepted_by_month.get(key, 0) + 1
        if r.estado == "Cancelado / rechazado" and r.actualizado_en:
            key = r.actualizado_en.strftime("%Y-%m")
            cancelled_by_month[key] = cancelled_by_month.get(key, 0) + 1

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_format = workbook.add_format({"bold": True, "bg_color": "#F3F4F6", "border": 1})
        money_format = workbook.add_format({"num_format": "#,##0.00€"})
        int_format = workbook.add_format({"num_format": "#,##0"})

        ws_summary = writer.sheets.get("Resumen", None)
        if ws_summary is None:
            ws_summary = workbook.add_worksheet("Resumen")

        ws_summary.write(0, 0, "Métrica", header_format)
        ws_summary.write(0, 1, "Valor", header_format)
        ws_summary.write(1, 0, "Importe aceptado pendiente pedido")
        ws_summary.write(1, 1, round(sum(r.importe for r in accepted_no_order), 2), money_format)
        ws_summary.write(2, 0, "Días medios aceptación a pedido")
        ws_summary.write(2, 1, avg_days, int_format)
        ws_summary.write(3, 0, "Presupuestos bloqueados")
        ws_summary.write(3, 1, len([r for r in rows if r.estado == "Bloqueado / incidencia" or r.incidencia]), int_format)
        ws_summary.set_column(0, 0, 40)
        ws_summary.set_column(1, 1, 20)

        df_estado = pd.DataFrame([{"Estado": k, "Cantidad": v} for k, v in {getattr(r, "estado", "Sin definir"): 1 for r in rows}.items()])
        df_estado.to_excel(writer, index=False, sheet_name="Por Estado", startrow=1)
        ws_estado = writer.sheets["Por Estado"]
        for idx, col in enumerate(df_estado.columns):
            ws_estado.write(0, idx, col, header_format)
        ws_estado.set_column(0, 0, 30)
        ws_estado.set_column(1, 1, 15)

        df_aceptados = pd.DataFrame([{"Mes": k, "Aceptados": v} for k, v in sorted(accepted_by_month.items())])
        df_aceptados.to_excel(writer, index=False, sheet_name="Aceptados por Mes", startrow=1)
        ws_aceptados = writer.sheets["Aceptados por Mes"]
        for idx, col in enumerate(df_aceptados.columns):
            ws_aceptados.write(0, idx, col, header_format)
        ws_aceptados.set_column(0, 0, 15)
        ws_aceptados.set_column(1, 1, 15)

        df_cancelados = pd.DataFrame([{"Mes": k, "Cancelados": v} for k, v in sorted(cancelled_by_month.items())])
        df_cancelados.to_excel(writer, index=False, sheet_name="Cancelados por Mes", startrow=1)
        ws_cancelados = writer.sheets["Cancelados por Mes"]
        for idx, col in enumerate(df_cancelados.columns):
            ws_cancelados.write(0, idx, col, header_format)
        ws_cancelados.set_column(0, 0, 15)
        ws_cancelados.set_column(1, 1, 15)

        df_gestor = pd.DataFrame([{"Gestor": getattr(r, "gestor", "Sin definir") or "Sin definir", "Cantidad": 1} for r in rows]).groupby("Gestor", as_index=False).sum()
        df_gestor.to_excel(writer, index=False, sheet_name="Por Gestor", startrow=1)
        ws_gestor = writer.sheets["Por Gestor"]
        for idx, col in enumerate(df_gestor.columns):
            ws_gestor.write(0, idx, col, header_format)
        ws_gestor.set_column(0, 0, 25)
        ws_gestor.set_column(1, 1, 15)

        df_proveedor = pd.DataFrame([{"Proveedor": getattr(r, "proveedor", "Sin definir") or "Sin definir", "Cantidad": 1} for r in rows]).groupby("Proveedor", as_index=False).sum()
        df_proveedor.to_excel(writer, index=False, sheet_name="Por Proveedor", startrow=1)
        ws_proveedor = writer.sheets["Por Proveedor"]
        for idx, col in enumerate(df_proveedor.columns):
            ws_proveedor.write(0, idx, col, header_format)
        ws_proveedor.set_column(0, 0, 25)
        ws_proveedor.set_column(1, 1, 15)

    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=presucontrol_informe.xlsx"})


def prepare_export_rows(rows: list[Presupuesto]) -> list[dict[str, Any]]:
    return [{
        "Nº presupuesto FactuSOL": r.numero_presupuesto,
        "Cliente": r.cliente,
        "Obra / referencia": r.obra_referencia,
        "Gestor": r.gestor,
        "Estado": r.estado,
        "Importe": r.importe,
        "Fecha presupuesto": r.fecha_presupuesto,
        "Fecha envío cliente": r.fecha_envio_cliente,
        "Fecha aceptación": r.fecha_aceptacion,
        "Proveedor": r.proveedor,
        "Pedido proveedor realizado": "Sí" if r.pedido_proveedor_realizado else "No",
        "Nº pedido proveedor": r.numero_pedido_proveedor,
        "Fecha pedido proveedor": r.fecha_pedido_proveedor,
        "Plazo proveedor": r.plazo_proveedor,
        "Responsable actual": r.responsable_actual,
        "Siguiente acción": r.siguiente_accion,
        "Fecha límite siguiente acción": r.fecha_limite_siguiente_accion,
        "Días parado": r.dias_parado,
        "Prioridad": r.prioridad_calculada,
        "Incidencia": "Sí" if r.incidencia else "No",
        "Última actualización": r.fecha_ultima_actualizacion,
        "version": r.version,
    } for r in rows]

@app.get("/export")
def export_presupuestos(
    db: Session = Depends(get_db),
    mode: str = "all",
    search: str | None = None,
    estado: str | None = None,
    prioridad: str | None = None,
    gestor: str | None = None,
    proveedor: str | None = None,
    incidencia: bool | None = None,
):
    q = apply_filters(base_query(db), search, estado, prioridad, gestor, proveedor, incidencia)
    rows = q.all()
    current_month = date.today().replace(day=1)
    if mode == "aceptados_sin_pedido":
        rows = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    elif mode == "incidencias":
        rows = [r for r in rows if r.incidencia]
    elif mode == "cerrados_mes":
        rows = [r for r in rows if r.estado == "Entregado / cerrado" and r.actualizado_en.date() >= current_month]
    elif mode == "por_gestor" and gestor:
        rows = [r for r in rows if r.gestor == gestor]
    elif mode == "por_proveedor" and proveedor:
        rows = [r for r in rows if r.proveedor == proveedor]

    settings = get_settings(db)
    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings)
    output = io.BytesIO()
    df = pd.DataFrame(prepare_export_rows(rows))
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Presupuestos")
        workbook = writer.book
        worksheet = writer.sheets["Presupuestos"]
        for idx, col in enumerate(df.columns):
            width = min(max(len(str(col)) + 2, 14), 38)
            worksheet.set_column(idx, idx, width)
        header_format = workbook.add_format({"bold": True, "bg_color": "#F3F4F6", "border": 1})
        for col_num, value in enumerate(df.columns):
            worksheet.write(0, col_num, value, header_format)
    output.seek(0)
    filename = f"presucontrol_{mode}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_IMPORT_EXTENSIONS = {".csv", ".xlsx", ".xls"}
ALLOWED_IMPORT_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}


def parse_upload(file: UploadFile) -> pd.DataFrame:
    filename = file.filename or ""
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_IMPORT_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV, XLSX o XLS.")
    content_type = getattr(file, "content_type", None) or ""
    if content_type and content_type not in ALLOWED_IMPORT_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de archivo no válido. Solo se permiten archivos CSV o Excel (.csv, .xlsx, .xls).")
    raw = file.file.read()
    if len(raw) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande. Máximo 10MB.")
    if ext == ".csv":
        return pd.read_csv(io.BytesIO(raw))
    if ext in {".xlsx", ".xls"}:
        return pd.read_excel(io.BytesIO(raw))
    raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV, XLSX o XLS.")

def normalize_import_df(df: pd.DataFrame) -> pd.DataFrame:
    rename = {col: COLUMN_ALIASES.get(str(col).strip(), str(col).strip()) for col in df.columns}
    df = df.rename(columns=rename)
    missing = [v for v in REQUIRED_IMPORT_COLUMNS if v not in df.columns]
    if missing:
        pretty = [REQUIRED_IMPORT_COLUMNS[m] for m in missing]
        raise HTTPException(status_code=422, detail=f"Faltan columnas obligatorias: {', '.join(pretty)}")
    return df

def row_to_payload(row: pd.Series) -> dict[str, Any]:
    def clean(v):
        if pd.isna(v):
            return None
        if isinstance(v, pd.Timestamp):
            return v.date()
        return v
    data = {k: clean(row.get(k)) for k in REQUIRED_IMPORT_COLUMNS.keys()}
    if isinstance(data["fecha_presupuesto"], str):
        data["fecha_presupuesto"] = pd.to_datetime(data["fecha_presupuesto"]).date()
    data["importe"] = float(str(data["importe"]).replace("€", "").replace(".", "").replace(",", ".")) if isinstance(data["importe"], str) else float(data["importe"])
    data["pedido_proveedor_realizado"] = False
    data["incidencia"] = False
    return data

@app.post("/import/preview", response_model=ImportPreview)
def import_preview(file: UploadFile = File(...), db: Session = Depends(get_db), mode: str = "create_only"):
    if mode not in {"create_only", "update_existing", "upsert"}:
        raise HTTPException(status_code=422, detail="Modo de importación no válido.")
    df = normalize_import_df(parse_upload(file))
    nums = [str(v).strip() for v in df["numero_presupuesto"].dropna().tolist()]
    seen = set()
    dup_file = sorted({n for n in nums if n in seen or seen.add(n)})
    existing_rows = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto.in_(nums)).all()
    existing = {r.numero_presupuesto: r for r in existing_rows}
    errores = []
    preview = []
    cambios_preview = []
    validos = 0
    nuevos = 0
    actualizables = 0
    for idx, row in df.iterrows():
        try:
            data = row_to_payload(row)
            num = str(data["numero_presupuesto"]).strip()
            obj_existing = existing.get(num)
            if obj_existing:
                if mode in {"update_existing", "upsert"}:
                    expected = row.get("expected_version", row.get("version", None))
                    if expected is None or pd.isna(expected):
                        errores.append({"fila": int(idx) + 2, "error": f"{num}: para actualizar existentes falta columna version/expected_version."})
                        continue
                    if int(expected) != int(obj_existing.version):
                        errores.append({"fila": int(idx) + 2, "error": f"{num}: versión antigua. Exporta de nuevo antes de actualizar."})
                        continue
                    cambios = []
                    for field, value in data.items():
                        if field in {"numero_presupuesto"}:
                            continue
                        before = getattr(obj_existing, field, None)
                        if to_str(before) != to_str(value):
                            cambios.append({"campo": field, "antes": to_str(before), "despues": to_str(value)})
                    actualizables += 1
                    validos += 1
                    if len(cambios_preview) < 20:
                        cambios_preview.append({"numero_presupuesto": num, "cambios": cambios[:10]})
                continue
            if num in dup_file:
                continue
            obj = Presupuesto(**data)
            validate_presupuesto(obj, db)
            nuevos += 1
            validos += 1
            if len(preview) < 20:
                preview.append({k: to_str(v) for k, v in data.items()})
        except Exception as e:
            errores.append({"fila": int(idx) + 2, "error": str(getattr(e, "detail", e))})
    return {
        "total_filas": len(df),
        "validos": validos,
        "duplicados_bd": sorted(existing.keys()),
        "duplicados_archivo": dup_file,
        "errores": errores,
        "preview": preview,
        "modo": mode,
        "nuevos": nuevos,
        "actualizables": actualizables,
        "cambios_preview": cambios_preview,
    }


@app.post("/import/confirm")
def import_confirm(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), mode: str = "create_only"):
    if mode not in {"create_only", "update_existing", "upsert"}:
        raise HTTPException(status_code=422, detail="Modo de importación no válido.")
    df = normalize_import_df(parse_upload(file))
    nums = [str(v).strip() for v in df["numero_presupuesto"].dropna().tolist()]
    existing_rows = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto.in_(nums)).all()
    existing = {r.numero_presupuesto: r for r in existing_rows}
    inserted = 0
    updated = 0
    skipped = []
    seen = set()
    actor = current_actor(request)
    for idx, row in df.iterrows():
        try:
            data = row_to_payload(row)
            num = str(data["numero_presupuesto"]).strip()
            if num in seen:
                skipped.append({"fila": int(idx) + 2, "numero_presupuesto": num, "motivo": "Duplicado en archivo"})
                continue
            seen.add(num)
            obj = existing.get(num)
            if obj:
                if mode not in {"update_existing", "upsert"}:
                    skipped.append({"fila": int(idx) + 2, "numero_presupuesto": num, "motivo": "Ya existe"})
                    continue
                expected = row.get("expected_version", row.get("version", None))
                if expected is None or pd.isna(expected) or int(expected) != int(obj.version):
                    skipped.append({"fila": int(idx) + 2, "numero_presupuesto": num, "motivo": "Versión no indicada o antigua"})
                    continue
                before = serialize(obj)
                for field, value in data.items():
                    if field == "numero_presupuesto":
                        continue
                    setattr(obj, field, value)
                validate_presupuesto(obj, db, existing_id=obj.id)
                apply_derived_fields(obj, db)
                obj.version = (obj.version or 1) + 1
                db.flush()
                after = serialize(obj)
                for field, old_value in before.items():
                    if field in {"actualizado_en", "fecha_ultima_actualizacion", "prioridad_calculada", "dias_parado", "version"}:
                        continue
                    add_history(db, obj.id, field, old_value, after[field], actor=actor)
                updated += 1
            else:
                if mode == "update_existing":
                    skipped.append({"fila": int(idx) + 2, "numero_presupuesto": num, "motivo": "No existe para actualizar"})
                    continue
                obj = Presupuesto(**data)
                validate_presupuesto(obj, db)
                apply_derived_fields(obj, db)
                db.add(obj)
                db.flush()
                db.add(HistorialCambio(
                    presupuesto_id=obj.id,
                    campo="importación",
                    valor_anterior=None,
                    valor_nuevo=obj.numero_presupuesto,
                    descripcion="Presupuesto importado desde Excel/CSV.",
                    usuario_id=actor.get("usuario_id"),
                    usuario_nombre=actor.get("usuario_nombre"),
                    usuario_email=actor.get("usuario_email"),
                ))
                inserted += 1
        except Exception as e:
            skipped.append({"fila": int(idx) + 2, "numero_presupuesto": str(row.get("numero_presupuesto", "")), "motivo": str(getattr(e, "detail", e))})
    db.commit()
    return {"insertados": inserted, "actualizados": updated, "omitidos": skipped}


@app.post("/seed-demo")
def seed_demo(db: Session = Depends(get_db)):
    if not SEED_DEMO_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    if db.query(Presupuesto).count() > 0:
        return {"ok": False, "message": "La base de datos ya contiene presupuestos."}
    today = date.today()
    samples = [
        Presupuesto(numero_presupuesto="P-24001", cliente="Hotel Mediterráneo", obra_referencia="Cortinas lobby", gestor="Comercial", fecha_presupuesto=today, fecha_envio_cliente=today, fecha_aceptacion=today, importe=4280, estado="Aceptado - pendiente pedido proveedor", responsable_actual="Compras", siguiente_accion="Hacer pedido proveedor", fecha_limite_siguiente_accion=today),
        Presupuesto(numero_presupuesto="P-24002", cliente="Villa Norte", obra_referencia="Tapicería salón", gestor="Administración", fecha_presupuesto=today, fecha_envio_cliente=today, importe=1750, estado="Enviado al cliente", responsable_actual="Comercial", siguiente_accion="Llamar al cliente", fecha_limite_siguiente_accion=today),
        Presupuesto(numero_presupuesto="P-24003", cliente="Restaurante Mar", obra_referencia="Estores terraza", gestor="Comercial", fecha_presupuesto=today, fecha_envio_cliente=today, fecha_aceptacion=today, importe=3120, estado="Pedido proveedor realizado", proveedor="Proveedor Demo", pedido_proveedor_realizado=True, numero_pedido_proveedor="PP-1001", fecha_pedido_proveedor=today, responsable_actual="Compras", siguiente_accion="Confirmar plazo proveedor", fecha_limite_siguiente_accion=today),
    ]
    for s in samples:
        apply_derived_fields(s, db)
        db.add(s)
    db.commit()
    return {"ok": True, "insertados": len(samples)}


# ==================== PROVEEDORES ====================

@app.get("/proveedores", response_model=list[ProveedorOut])
def list_proveedores(
    db: Session = Depends(get_db),
    search: str | None = None,
    activo: bool | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(Proveedor)
    if activo is not None:
        q = q.filter(Proveedor.activo == activo)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(
            Proveedor.nombre.ilike(like),
            Proveedor.contacto.ilike(like),
            Proveedor.email.ilike(like),
        ))
    return q.order_by(Proveedor.nombre).limit(limit).all()


@app.get("/proveedores/{proveedor_id}", response_model=ProveedorOut)
def get_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    return proveedor


@app.post("/proveedores", response_model=ProveedorOut, status_code=201)
def create_proveedor(payload: ProveedorCreate, request: Request, db: Session = Depends(get_db)):
    exists = db.query(Proveedor).filter(Proveedor.nombre == payload.nombre.strip()).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe un proveedor con ese nombre.")
    obj = Proveedor(
        nombre=payload.nombre.strip(),
        contacto=payload.contacto,
        email=payload.email,
        telefono=payload.telefono,
        direccion=payload.direccion,
        notas=payload.notas,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.patch("/proveedores/{proveedor_id}", response_model=ProveedorOut)
def update_proveedor(proveedor_id: int, payload: ProveedorUpdate, request: Request, db: Session = Depends(get_db)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(proveedor, key, value)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@app.delete("/proveedores/{proveedor_id}")
def delete_proveedor(proveedor_id: int, request: Request, db: Session = Depends(get_db)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    proveedor.activo = False
    db.commit()
    return {"ok": True}


@app.get("/proveedores/{proveedor_id}/evaluaciones", response_model=list[EvaluacionProveedorOut])
def list_evaluaciones_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    return db.query(EvaluacionProveedor).filter(
        EvaluacionProveedor.proveedor_id == proveedor_id
    ).order_by(desc(EvaluacionProveedor.creado_en)).all()


@app.post("/proveedores/{proveedor_id}/evaluaciones", response_model=EvaluacionProveedorOut, status_code=201)
def create_evaluacion_proveedor(
    proveedor_id: int,
    payload: EvaluacionProveedorCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

    evaluacion = EvaluacionProveedor(
        proveedor_id=proveedor_id,
        pedido_id=payload.pedido_id,
        puntualidad=payload.puntualidad,
        calidad=payload.calidad,
        comunicacion=payload.comunicacion,
        comentario=payload.comentario,
        evaluado_por=payload.evaluado_por,
    )
    db.add(evaluacion)

    # Calcular promedio usando SQL AVG (en lugar de cargar todas las filas)
    from sqlalchemy import func
    result = db.query(
        func.count(EvaluacionProveedor.id).label('count'),
        func.avg(EvaluacionProveedor.puntualidad + EvaluacionProveedor.calidad + EvaluacionProveedor.comunicacion).label('avg_sum')
    ).filter(EvaluacionProveedor.proveedor_id == proveedor_id).first()

    total = (result.count or 0) + 1
    avg_sum = (result.avg_sum or 0) + payload.puntualidad + payload.calidad + payload.comunicacion
    promedio = avg_sum / (total * 3) if total > 0 else 0

    proveedor.evaluacion_promedio = round(promedio, 2)
    proveedor.total_evaluaciones = total

    db.commit()
    db.refresh(evaluacion)
    return evaluacion


@app.get("/proveedores/{proveedor_id}/estadisticas")
def estadisticas_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    
    evaluaciones = db.query(EvaluacionProveedor).filter(
        EvaluacionProveedor.proveedor_id == proveedor_id
    ).all()
    
    if not evaluaciones:
        return {
            "proveedor_id": proveedor_id,
            "nombre": proveedor.nombre,
            "total_evaluaciones": 0,
            "promedios": {"puntualidad": 0, "calidad": 0, "comunicacion": 0},
            "distribucion": {"5_estrellas": 0, "4_estrellas": 0, "3_estrellas": 0, "2_estrellas": 0, "1_estrella": 0}
        }
    
    avg_punt = sum(e.puntualidad for e in evaluaciones) / len(evaluaciones)
    avg_cal = sum(e.calidad for e in evaluaciones) / len(evaluaciones)
    avg_com = sum(e.comunicacion for e in evaluaciones) / len(evaluaciones)
    
    dist = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    for e in evaluaciones:
        avg = (e.puntualidad + e.calidad + e.comunicacion) / 3
        if avg >= 4.5:
            dist[5] += 1
        elif avg >= 3.5:
            dist[4] += 1
        elif avg >= 2.5:
            dist[3] += 1
        elif avg >= 1.5:
            dist[2] += 1
        else:
            dist[1] += 1
    
    return {
        "proveedor_id": proveedor_id,
        "nombre": proveedor.nombre,
        "total_evaluaciones": len(evaluaciones),
        "promedios": {
            "puntualidad": round(avg_punt, 2),
            "calidad": round(avg_cal, 2),
            "comunicacion": round(avg_com, 2),
        },
        "distribucion": {
            "5_estrellas": dist[5],
            "4_estrellas": dist[4],
            "3_estrellas": dist[3],
            "2_estrellas": dist[2],
            "1_estrella": dist[1],
        }
    }


# ==================== EXPORTACIÓN AVANZADA ====================

@app.get("/presupuestos/export/excel")
def export_presupuestos_excel(
    db: Session = Depends(get_db),
    search: str | None = None,
    estado: str | None = None,
    prioridad: str | None = None,
    gestor: str | None = None,
    proveedor: str | None = None,
    incidencia: bool | None = None,
    include_archivados: bool = False,
    ocultar_cerrados: bool = True,
):
    q = apply_filters(base_query(db, include_archivados), search, estado, prioridad, gestor, proveedor, incidencia)
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    rows = q.order_by(desc(Presupuesto.fecha_ultima_actualizacion)).limit(5000).all()
    
    # OPTIMIZACIÓN: Obtener settings UNA vez
    settings = get_settings(db)
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings)
    
    df = pd.DataFrame([{
        "ID": r.id,
        "Nº Presupuesto": r.numero_presupuesto,
        "Cliente": r.cliente,
        "Obra/Referencia": r.obra_referencia,
        "Gestor": r.gestor,
        "Fecha Presupuesto": r.fecha_presupuesto,
        "Fecha Envío Cliente": r.fecha_envio_cliente,
        "Fecha Aceptación": r.fecha_aceptacion,
        "Importe (€)": r.importe,
        "Estado": r.estado,
        "Proveedor": r.proveedor,
        "Pedido Realizado": "Sí" if r.pedido_proveedor_realizado else "No",
        "Nº Pedido Proveedor": r.numero_pedido_proveedor,
        "Fecha Pedido Proveedor": r.fecha_pedido_proveedor,
        "Plazo Proveedor": r.plazo_proveedor,
        "Fecha Prevista Entrega": r.fecha_prevista_entrega,
        "Responsable Actual": r.responsable_actual,
        "Siguiente Acción": r.siguiente_accion,
        "Fecha Límite Acción": r.fecha_limite_siguiente_accion,
        "Incidencia": "Sí" if r.incidencia else "No",
        "Prioridad": r.prioridad_calculada,
        "Días Parado": r.dias_parado,
        "Observaciones": r.observaciones,
        "Archivado": "Sí" if r.archivado else "No",
        "Última Actualización": r.fecha_ultima_actualizacion,
    } for r in rows])
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Presupuestos")
        
        workbook = writer.book
        worksheet = writer.sheets["Presupuestos"]
        
        # Formatos
        header_format = workbook.add_format({"bold": True, "bg_color": "#4F46E5", "font_color": "white", "border": 1})
        money_format = workbook.add_format({"num_format": "#,##0.00€"})
        date_format = workbook.add_format({"num_format": "yyyy-mm-dd"})
        
        # Aplicar formatos
        for idx, col in enumerate(df.columns):
            worksheet.write(0, idx, col, header_format)
        
        for idx, row in enumerate(rows, start=1):
            worksheet.write(idx, 8, row.importe, money_format)
            if row.fecha_presupuesto:
                worksheet.write(idx, 5, row.fecha_presupuesto, date_format)
            if row.fecha_envio_cliente:
                worksheet.write(idx, 6, row.fecha_envio_cliente, date_format)
            if row.fecha_aceptacion:
                worksheet.write(idx, 7, row.fecha_aceptacion, date_format)
        
        # Ajustar anchos de columna
        worksheet.set_column(0, 0, 8)
        worksheet.set_column(1, 1, 20)
        worksheet.set_column(2, 3, 30)
        worksheet.set_column(8, 8, 12)
        worksheet.set_column(23, 23, 50)
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=presupuestos_{date.today().isoformat()}.xlsx"}
    )


# ==================== DASHBOARD EJECUTIVO ====================

@app.get("/dashboard/ejecutivo")
def dashboard_ejecutivo(db: Session = Depends(get_db)):
    rows = base_query(db).all()
    # OPTIMIZACIÓN: Obtener settings UNA vez
    settings = get_settings(db)
    
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings)
    
    today = date.today()
    current_month = today.replace(day=1)
    
    # KPIs principales
    active = [r for r in rows if r.estado not in CLOSED_STATES]
    accepted_no_order = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    money_at_risk_val = sum(r.importe for r in accepted_no_order)
    
    # Tendencias últimos 6 meses
    months_data = []
    for i in range(6):
        month_date = (today - timedelta(days=30*i)).replace(day=1)
        month_rows = [r for r in rows if r.creado_en.date() >= month_date and r.creado_en.date() < (month_date + timedelta(days=32)).replace(day=1)]
        months_data.append({
            "mes": month_date.strftime("%Y-%m"),
            "nuevos": len(month_rows),
            "importe": round(sum(r.importe for r in month_rows), 2),
        })
    months_data.reverse()
    
    # Top 10 presupuestos por importe
    top_importe = sorted([r for r in active], key=lambda x: x.importe, reverse=True)[:10]
    
    # Rendimiento por gestor
    gestores = {}
    for r in active:
        g = r.gestor or "Sin asignar"
        if g not in gestores:
            gestores[g] = {"total": 0, "importe": 0, "criticos": 0, "incidencias": 0}
        gestores[g]["total"] += 1
        gestores[g]["importe"] += r.importe
        if r.prioridad_calculada in {"Rojo", "Crítico"}:
            gestores[g]["criticos"] += 1
        if r.incidencia:
            gestores[g]["incidencias"] += 1
    
    gestores_list = [{"gestor": k, **v} for k, v in gestores.items()]
    gestores_list = sorted(gestores_list, key=lambda x: x["importe"], reverse=True)
    
    return {
        "kpis": {
            "presupuestos_activos": len(active),
            "dinero_en_riesgo": round(money_at_risk_val, 2),
            "criticos": len([r for r in rows if r.prioridad_calculada == "Crítico"]),
            "incidencias_abiertas": len([r for r in rows if r.incidencia]),
            "aceptados_sin_pedido": len(accepted_no_order),
            "cerrados_mes": len([r for r in rows if r.estado == "Entregado / cerrado" and r.actualizado_en.date() >= current_month]),
        },
        "tendencias": months_data,
        "top_presupuestos": [{
            "id": r.id,
            "numero": r.numero_presupuesto,
            "cliente": r.cliente,
            "importe": r.importe,
            "estado": r.estado,
            "prioridad": r.prioridad_calculada,
        } for r in top_importe],
        "rendimiento_gestores": [{
            "gestor": g["gestor"],
            "total": g["total"],
            "importe_total": round(g["importe"], 2),
            "criticos": g["criticos"],
            "incidencias": g["incidencias"],
        } for g in gestores_list[:10]],
        "distribucion_estados": [
            {"estado": estado, "total": len([r for r in rows if r.estado == estado])}
            for estado in ESTADOS
        ],
    }
