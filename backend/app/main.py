from __future__ import annotations

import asyncio
import io
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
import re

logger = logging.getLogger(__name__)

import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import func, or_, desc, asc, text, case
from sqlalchemy.orm import Session, selectinload
from slowapi import Limiter
from slowapi.util import get_remote_address

from .database import Base, engine, get_db, SessionLocal
from .models import Comentario, EmailNotificationLog, EvaluacionProveedor, HistorialCambio, LoginAttempt, PedidoProveedor, Presupuesto, PresupuestoProveedor, Proveedor, RegistrationAttempt, Usuario
from .rules import CLOSED_STATES, FLOW, apply_derived_fields, calculate_risk, get_pedido_counts, validate_presupuesto
from .schemas import (
    ComentarioCreate,
    ComentarioOut,
    ESTADOS,
    EvaluacionProveedorCreate,
    EvaluacionProveedorOut,
    HistorialOut,
    ImportPreview,
    KanbanBoardOut,
    KanbanColumnOut,
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
    QuickAction,
    SearchResult,
    EmailTestPayload,
    ArchivePayload,
    EmailLogOut,
    PaginatedPresupuestos,
    SidebarCounters,
)
from .settings import get_settings, update_settings
from .sse_manager import sse
from .config import get_fastapi_docs_config, get_public_paths, is_production, validate_runtime_config
from .auth import get_authenticated_user_from_request, is_auth_enabled
from .access_control import ADMIN_ROLE, require_gestion_or_admin, require_system_manager, user_role
from .analytics import (
    active_rows_with_risk,
    build_dashboard_payload,
    build_executive_dashboard_payload,
    build_reports_payload,
    build_sidebar_counters,
    enrich_risk,
    get_accepted_without_order_rows,
    get_report_rows as analytics_get_report_rows,
    get_risky_rows,
    get_today_rows,
    money,
    sidebar_candidate_rows,
)
from .emailer import parse_recipients, send_email
from .notifications import build_alerts, money_at_risk, run_automatic_alert_checks, send_alert_digest, send_escalation_alerts, send_immediate_alerts_for_budget, send_weekly_summary
from .notifications_inapp import limpiar_notificaciones_antiguas, obtener_notificaciones, contar_sin_leer, marcar_leida, marcar_todas_leidas
from .routers.health import router as health_router
from .routers.auth import router as auth_router
from .routers.presupuestos import router as presupuestos_router
from .routers.presupuestos_full import router as presupuestos_full_router, pedidos_router
from .routers.dashboard import router as dashboard_router
from .logging_middleware import StructuredLoggingMiddleware
from .services.metadata_service import build_metadata_options, distinct_column_values, normalize_option_list, provider_catalog_values
from .cache import cache

ActionDict = dict[str, str]

# Configure logging for production
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Set library log levels to reduce noise
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(os.getenv("SQLALCHEMY_LOG_LEVEL", "WARNING"))


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


async def cleanup_old_rate_limits():
    """Periodically purge old login/registration attempt records."""
    while True:
        db = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            db.query(LoginAttempt).filter(LoginAttempt.window_start < cutoff).delete()
            db.query(RegistrationAttempt).filter(RegistrationAttempt.window_start < cutoff).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
        await asyncio.sleep(86400)  # Run once per day


@asynccontextmanager
async def lifespan(app: FastAPI):
    task: asyncio.Task | None = None
    cleanup_task: asyncio.Task | None = None
    if os.getenv("SCHEDULER_ENABLED", "true").lower() in {"1", "true", "yes", "on"}:
        task = asyncio.create_task(automatic_alert_loop())
        cleanup_task = asyncio.create_task(cleanup_old_rate_limits())
    try:
        yield
    finally:
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass


validate_runtime_config()
app = FastAPI(title="PresuControl API", version="1.3.1", lifespan=lifespan, **get_fastapi_docs_config())
app.include_router(health_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api")
app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api")
app.include_router(auth_router)
# BUG-10 fix: presupuestos_router (legacy dummy que retorna {}) eliminado.
# Solo presupuestos_full_router (canónico) maneja /presupuestos con prefijo /api/v1 y /api.
# Endpoints inline en main.py manejan las rutas en root (/presupuestos, /presupuestos/{id}, etc).
app.include_router(presupuestos_full_router, prefix="/api/v1")
app.include_router(presupuestos_full_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api")
app.include_router(pedidos_router, prefix="/api/v1")
app.include_router(pedidos_router, prefix="/api")

def validate_origin(origin: str, is_prod: bool) -> bool:
    if not origin:
        return False
    if not is_prod and origin.startswith("http://localhost"):
        return True
    if is_prod:
        return bool(re.match(r"^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", origin))
    return True


origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
valid_origins = [o.strip() for o in origins if validate_origin(o.strip(), is_production())]

if not valid_origins:
    raise RuntimeError("No valid CORS origins configured")

if "*" in valid_origins:
    raise RuntimeError("CORS_ORIGINS contains '*' which is not allowed when allow_credentials=True. Specify explicit origins.")
# Structured JSON logging (add before CORS for accurate timing)
app.add_middleware(StructuredLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=valid_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("RUN_CREATE_ALL", "false").lower() in {"1", "true", "yes", "on"}:
    Base.metadata.create_all(bind=engine)


def ensure_schema_compatibility():
    """Defensive migration: ensure all tables exist (idempotent via create_all checkfirst).
    Also add columns that may be missing from pre-Alembic installs."""
    # Create any missing tables (idempotent - only creates if not exists)
    Base.metadata.create_all(bind=engine, checkfirst=True)
    # Add columns that may be missing from older installs
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
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(40) NOT NULL DEFAULT 'gestion'"))
        conn.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preferencias JSON"))
        conn.execute(text("UPDATE usuarios SET rol = CASE WHEN puede_gestionar_sistema THEN 'admin_sistema' ELSE 'gestion' END WHERE rol IS NULL OR rol NOT IN ('admin_sistema', 'gestion')"))
        conn.execute(text("ALTER TABLE email_notification_logs ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0"))


if os.getenv("RUN_DEFENSIVE_MIGRATIONS", "false").lower() in {"1", "true", "yes", "on"}:
    ensure_schema_compatibility()


PUBLIC_PATHS = get_public_paths()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.middleware("http")
async def require_auth_middleware(request: Request, call_next):
    if not is_auth_enabled() or request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path.rstrip("/") or "/"
    if path in PUBLIC_PATHS or path.startswith("/static"):
        return await call_next(request)
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


def get_current_user(request: Request) -> Usuario | None:
    if not is_auth_enabled():
        return getattr(request.state, "user", None)
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
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
    "Nº PRESUPUESTO": "numero_presupuesto",
    "Nº Presupuesto": "numero_presupuesto",
    "numero_presupuesto": "numero_presupuesto",
    "Cliente": "cliente",
    "cliente": "cliente",
    "NOMBRE": "cliente",
    "Nombre": "cliente",
    "Obra / referencia": "obra_referencia",
    "Obra": "obra_referencia",
    "OBRA": "obra_referencia",
    "obra_referencia": "obra_referencia",
    "Gestor": "gestor",
    "gestor": "gestor",
    "Fecha presupuesto": "fecha_presupuesto",
    "fecha_presupuesto": "fecha_presupuesto",
    "FECHA SOLICITUD PRE.": "fecha_presupuesto",
    "Fecha solicitud pre.": "fecha_presupuesto",
    "Importe": "importe",
    "importe": "importe",
    "Estado": "estado",
    "estado": "estado",
    # Pedido cliente
    "nO": "numero_pedido_cliente",
    "no": "numero_pedido_cliente",
    "Unnamed: 1": "",
    "Nª PEDIDO CLIENTE": "numero_pedido_cliente",
    "Nº PEDIDO CLIENTE": "numero_pedido_cliente",
    "Nª pedido cliente": "numero_pedido_cliente",
    "numero_pedido_cliente": "numero_pedido_cliente",
    # Cliente FactuSOL
    "CLIENTE": "codigo_cliente_factusol",
    "Código cliente FactuSOL": "codigo_cliente_factusol",
    "codigo_cliente_factusol": "codigo_cliente_factusol",
    # Fechas nuevas
    "FECHA MEDICIÓN": "fecha_medicion",
    "fecha_medicion": "fecha_medicion",
    "Fecha medición": "fecha_medicion",
    "FECHA RECEPCION MER.": "fecha_recepcion_mercancia",
    "FECHA RECEPCIÓN MERCANCÍA": "fecha_recepcion_mercancia",
    "fecha_recepcion_mercancia": "fecha_recepcion_mercancia",
    "PLAZO CONFECCIÓN EGEA": "plazo_confeccion",
    "plazo_confeccion": "plazo_confeccion",
    "Plazo confección": "plazo_confeccion",
    "ENTREGA CLIENTE": "fecha_entrega_cliente",
    "fecha_entrega_cliente": "fecha_entrega_cliente",
    "Entrega cliente": "fecha_entrega_cliente",
    # Existing optional fields
    "FECHA ENVÍO PRE.": "fecha_envio_cliente",
    "Fecha envío cliente": "fecha_envio_cliente",
    "fecha_envio_cliente": "fecha_envio_cliente",
    "FEHCA ACEPTACIÓN PRE.": "fecha_aceptacion",
    "Fecha aceptación": "fecha_aceptacion",
    "fecha_aceptacion": "fecha_aceptacion",
    "PROVEEDOR": "proveedor",
    "proveedor": "proveedor",
    "PEDIDO PROVEEDOR": "numero_pedido_proveedor",
    "Nº pedido proveedor": "numero_pedido_proveedor",
    "numero_pedido_proveedor": "numero_pedido_proveedor",
    "ENVÍO PROVEEDOR": "fecha_pedido_proveedor",
    "fecha_pedido_proveedor": "fecha_pedido_proveedor",
    "PLAZO FABRICACIÓN": "plazo_proveedor",
    "plazo_proveedor": "plazo_proveedor",
    "FECHA PREVISTA ENTREGA": "fecha_prevista_entrega",
    "fecha_prevista_entrega": "fecha_prevista_entrega",
    "NOTAS": "observaciones",
    "observaciones": "observaciones",
    "RESPONSABLE": "responsable_actual",
    "responsable_actual": "responsable_actual",
    "GESTOR": "gestor",
    "INCIDENCIA": "incidencia",
    "incidencia": "incidencia",
    "DESCRIPCIÓN INCIDENCIA": "descripcion_incidencia",
    "descripcion_incidencia": "descripcion_incidencia",
    "MOTIVO CANCELACIÓN": "motivo_cancelacion_rechazo",
    "motivo_cancelacion_rechazo": "motivo_cancelacion_rechazo",
    "FECHA CANCELACIÓN": "fecha_cancelacion_rechazo",
    "fecha_cancelacion_rechazo": "fecha_cancelacion_rechazo",
    "SIGUIENTE ACCIÓN": "siguiente_accion",
    "siguiente_accion": "siguiente_accion",
    "FECHA LÍMITE": "fecha_limite_siguiente_accion",
    "fecha_limite_siguiente_accion": "fecha_limite_siguiente_accion",
}

OPTIONAL_IMPORT_FIELDS = [
    "fecha_envio_cliente", "fecha_aceptacion", "codigo_cliente_factusol",
    "numero_pedido_cliente", "proveedor", "numero_pedido_proveedor",
    "fecha_pedido_proveedor", "plazo_proveedor", "fecha_prevista_entrega",
    "fecha_medicion", "fecha_recepcion_mercancia", "plazo_confeccion",
    "fecha_entrega_cliente", "responsable_actual", "siguiente_accion",
    "fecha_limite_siguiente_accion", "incidencia", "descripcion_incidencia",
    "observaciones", "motivo_cancelacion_rechazo", "fecha_cancelacion_rechazo",
]

from .serializers import SERIALIZE_FIELDS, serialize

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

def resolve_pedido_proveedor(db: Session, proveedor_id: int | None, proveedor: str | None) -> tuple[int | None, str, str | None]:
    proveedor_text = (proveedor or "").strip()
    if proveedor_id is None:
        if not proveedor_text:
            raise HTTPException(status_code=422, detail="Proveedor obligatorio.")
        return None, proveedor_text, proveedor_text
    catalog_provider = db.get(Proveedor, proveedor_id)
    if not catalog_provider or not catalog_provider.activo:
        raise HTTPException(status_code=422, detail="Proveedor no encontrado o inactivo.")
    snapshot = catalog_provider.nombre
    return proveedor_id, proveedor_text or snapshot, snapshot


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
    etiqueta: str | None = None,
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
    if etiqueta:
        query = query.filter(Presupuesto.etiquetas.ilike(f"%{etiqueta.strip()}%"))
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


@app.get("/sse/subscribe")
async def sse_subscribe(request: Request):
    """Server-Sent Events endpoint for real-time notifications.
    Authenticated via require_auth_middleware (cookie or Authorization header).
    """
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"detail": "Token requerido"})

    queue = await sse.subscribe()

    async def event_stream():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            await sse.unsubscribe(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/settings", response_model=SettingsOut)
def read_settings(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    settings = get_settings(db)
    return {
        **settings,
        "timezone": os.getenv("APP_TIMEZONE", "Europe/Madrid"),
        "public_url": os.getenv("APP_PUBLIC_URL", "http://localhost:8088"),
        # SMTP: env vars > DB settings
        "smtp_host": os.getenv("SMTP_HOST") or settings.get("smtp_host") or "",
        "smtp_port": int(os.getenv("SMTP_PORT") or settings.get("smtp_port", 587)),
        "smtp_user": os.getenv("SMTP_USER") or settings.get("smtp_user") or "",
        "smtp_from": os.getenv("SMTP_FROM") or settings.get("smtp_from") or "",
        "smtp_tls": (bool(os.getenv("SMTP_HOST")) and os.getenv("SMTP_TLS", "true").lower() in {"1", "true", "yes", "on"})
                     or (not os.getenv("SMTP_HOST") and bool(settings.get("smtp_tls", True))),
        "smtp_configured": bool(
            (os.getenv("SMTP_HOST") or settings.get("smtp_host")) 
            and (os.getenv("SMTP_FROM") or settings.get("smtp_from"))
        ),
    }

@app.put("/settings", response_model=SettingsOut)
def save_settings(payload: SettingsUpdate, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    logger = logging.getLogger("presucontrol.settings")
    try:
        update_data = payload.model_dump(exclude_unset=True)
        logger.info("guardando settings: %s", list(update_data.keys()))
        return update_settings(db, update_data)
    except ValueError as exc:
        logger.warning("error validacion settings: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("error inesperado guardando settings")
        raise HTTPException(status_code=500, detail=f"Error interno: {exc}") from exc


@app.get("/metadata/options")
def metadata_options(db: Session = Depends(get_db)):
    return build_metadata_options(db)


@app.get("/metadata/autocomplete")
@limiter.limit("60/minute")
def metadata_autocomplete(request: Request, field: str = Query(...), q: str = Query("", min_length=2), db: Session = Depends(get_db)):
    """Return matching values for autocomplete fields."""
    allowed = {"cliente": Presupuesto.cliente, "obra_referencia": Presupuesto.obra_referencia, "proveedor": Presupuesto.proveedor}
    if field not in allowed:
        raise HTTPException(status_code=422, detail=f"Campo no válido: {field}. Usa: {', '.join(allowed.keys())}")
    col = allowed[field]
    like = f"%{q.strip()}%"
    results = db.query(col).filter(col.ilike(like), col.isnot(None), col != "").distinct().order_by(col).limit(10).all()
    return [r[0] for r in results if r[0]]


@app.get("/presupuestos")
def list_presupuestos(
    request: Request,
    db: Session = Depends(get_db),
    user: Usuario | None = Depends(get_current_user),
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
    sort: str | None = Query(None, pattern="^(prioridad)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    require_gestion_or_admin(request)
    # Auto-filter by gestor for non-admin users (unless explicit gestor filter is set)
    if user and user_role(user) != ADMIN_ROLE and not gestor:
        gestor = user.nombre
    q = apply_filters(db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)), search, estado, prioridad, gestor, proveedor, incidencia)
    if not include_archivados:
        q = q.filter(Presupuesto.archivado == False)  # noqa: E712
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))

    # Apply priority sorting when requested
    if sort == "prioridad":
        prioridad_order = case(
            (Presupuesto.prioridad_calculada == 'Crítico', 5),
            (Presupuesto.prioridad_calculada == 'Rojo', 4),
            (Presupuesto.prioridad_calculada == 'Naranja', 3),
            (Presupuesto.prioridad_calculada == 'Amarillo', 2),
            (Presupuesto.prioridad_calculada == 'Verde', 1),
            else_=0
        )
        q = q.order_by(prioridad_order.desc(), Presupuesto.dias_parado.desc())
    else:
        q = apply_sort(q, sort_by, sort_dir)

    # Determine if pagination is requested (any non-default pagination params)
    is_paginated = page != 1 or page_size != 50

    if is_paginated:
        total = q.count()
        importe_total = float(q.with_entities(func.coalesce(func.sum(Presupuesto.importe), 0)).order_by(None).scalar() or 0)
        rows = q.offset((page - 1) * page_size).limit(page_size).all()
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

    rows = q.limit(limit).all()
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
    filtro_rapido: str | None = Query(None, pattern="^(sin_pedido|pedidos_vencidos|sin_proxima_accion)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
):
    q = apply_filters(base_query(db, include_archivados).options(selectinload(Presupuesto.pedidos)), search, estado, prioridad, gestor, proveedor, incidencia)
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    if filtro_rapido == "sin_pedido":
        q = q.filter(
            Presupuesto.estado == "Aceptado - pendiente pedido proveedor",
            ~Presupuesto.pedidos.any(),
        )
    elif filtro_rapido == "pedidos_vencidos":
        q = q.join(PedidoProveedor).filter(
            PedidoProveedor.estado_entrega != "completado",
            PedidoProveedor.fecha_entrega_prevista < date.today(),
        ).distinct()
    elif filtro_rapido == "sin_proxima_accion":
        q = q.filter(or_(
            Presupuesto.siguiente_accion.is_(None),
            Presupuesto.siguiente_accion == "",
            Presupuesto.fecha_limite_siguiente_accion.is_(None),
        ))
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


@app.get("/presupuestos/kanban", response_model=KanbanBoardOut)
def kanban_board(
    request: Request,
    db: Session = Depends(get_db),
    user: Usuario | None = Depends(get_current_user),
    gestor: str | None = None,
):
    require_gestion_or_admin(request)
    if user and user_role(user) != ADMIN_ROLE and not gestor:
        gestor = user.nombre

    kanban_columns = [s for s in ESTADOS if s != "Pendiente de enviar"]
    settings = get_settings(db)

    # 1. Single query: all non-archived presupuestos with prefetch
    all_query = db.query(Presupuesto).options(
        selectinload(Presupuesto.pedidos),
    ).filter(Presupuesto.archivado == False)

    if gestor:
        all_query = all_query.filter(Presupuesto.gestor == gestor)

    all_presupuestos = all_query.all()
    all_ids = [p.id for p in all_presupuestos]

    # 2. Single batch query for all pedido_counts
    pedido_counts = get_pedido_counts(db, all_ids)

    # 3. Sort all by priority (in memory, same order as before)
    prioridad_order_map = {
        "Crítico": 5, "Rojo": 4, "Naranja": 3, "Amarillo": 2, "Verde": 1,
    }
    all_presupuestos.sort(
        key=lambda p: (
            prioridad_order_map.get(p.prioridad_calculada, 0),
            getattr(p, "dias_parado", 0) or 0,
        ),
        reverse=True,
    )

    # 4. Calculate risk with pre-loaded data
    for p in all_presupuestos:
        p.prioridad_calculada, p.dias_parado = calculate_risk(
            p, db, settings, pedido_counts
        )

    # 5. Filter in Python by column state
    result: dict[str, dict] = {}
    for col in kanban_columns:
        filtered = [p for p in all_presupuestos if p.estado == col]
        result[col] = {"items": filtered[:8], "total": len(filtered)}

    return {
        "columns": result,
        "flow": FLOW,
        "wip_limits": settings.get("wip_limits", {}),
    }


@app.post("/presupuestos", response_model=PresupuestoOut, status_code=201)
def create_presupuesto(payload: PresupuestoCreate, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    exists = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto == payload.numero_presupuesto.strip()).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe un presupuesto con ese nº FactuSOL.")
    data = payload.model_dump(exclude={"modificado_por"})
    for key, value in list(data.items()):
        if isinstance(value, str):
            data[key] = value.strip()
    # Auto-assign gestor to current user if not provided or user is not admin
    user = getattr(request.state, "user", None)
    if user and (not data.get("gestor") or data.get("gestor", "").strip() == ""):
        data["gestor"] = user.nombre
    elif user and user_role(user) != ADMIN_ROLE:
        data["gestor"] = user.nombre
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
    sse.safe_broadcast("presupuesto_actualizado", {
        "id": obj.id, "numero": obj.numero_presupuesto,
        "estado": obj.estado, "cliente": obj.cliente,
    })
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
    require_gestion_or_admin(request)
    obj = db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)).filter(Presupuesto.id == presupuesto_id).with_for_update().first()
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
    validate_presupuesto(obj, db, existing_id=presupuesto_id, previous_estado=before.get("estado"))
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
    require_gestion_or_admin(request)
    obj = db.query(Presupuesto).filter(Presupuesto.id == presupuesto_id).with_for_update().first()
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
        obj.numero_pedido_cliente = payload.numero_pedido_cliente or obj.numero_pedido_cliente
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

    validate_presupuesto(obj, db, existing_id=presupuesto_id, previous_estado=before.get("estado"))
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
    sse.safe_broadcast("presupuesto_actualizado", {
        "id": obj.id, "numero": obj.numero_presupuesto,
        "estado": obj.estado, "cliente": obj.cliente,
    })
    return obj


@app.post("/presupuestos/{presupuesto_id}/archivar", response_model=PresupuestoOut)
def archivar_presupuesto(presupuesto_id: int, payload: ArchivePayload, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
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
    require_gestion_or_admin(request)
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
    require_gestion_or_admin(request)
    presupuesto = db.get(Presupuesto, presupuesto_id)
    if not presupuesto:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    actor = current_actor(request)
    proveedor_id, proveedor_nombre, proveedor_snapshot = resolve_pedido_proveedor(db, payload.proveedor_id, payload.proveedor)
    obj = PedidoProveedor(
        presupuesto_id=presupuesto_id,
        proveedor_id=proveedor_id,
        proveedor=proveedor_nombre,
        proveedor_nombre_snapshot=proveedor_snapshot,
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
    require_gestion_or_admin(request)
    obj = db.get(PedidoProveedor, pedido_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")
    actor = current_actor(request)
    data = payload.model_dump(exclude_unset=True)
    if "proveedor_id" in data or "proveedor" in data:
        proveedor_id, proveedor_nombre, proveedor_snapshot = resolve_pedido_proveedor(
            db,
            data.get("proveedor_id", obj.proveedor_id),
            data.get("proveedor", obj.proveedor),
        )
        data["proveedor_id"] = proveedor_id
        data["proveedor"] = proveedor_nombre
        data["proveedor_nombre_snapshot"] = proveedor_snapshot
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
    require_gestion_or_admin(request)
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
    request: Request,
    db: Session = Depends(get_db),
):
    require_gestion_or_admin(request)
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
    request: Request,
    db: Session = Depends(get_db),
):
    require_gestion_or_admin(request)
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
def remove_proveedor_presupuesto(presupuesto_id: int, proveedor_id: int, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    pp = db.query(PresupuestoProveedor).filter(
        PresupuestoProveedor.presupuesto_id == presupuesto_id,
        PresupuestoProveedor.proveedor_id == proveedor_id
    ).first()
    if not pp:
        raise HTTPException(status_code=404, detail="Asociación no encontrada")
    db.delete(pp)
    db.commit()
    return {"ok": True}


def _as_date(value: date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _append_unique(values: list[str], value: str) -> None:
    if value and value not in values:
        values.append(value)


def _serialize_pedido_minimo(pedido: PedidoProveedor) -> dict[str, Any]:
    return {
        "id": pedido.id,
        "presupuesto_id": pedido.presupuesto_id,
        "proveedor_id": pedido.proveedor_id,
        "proveedor": pedido.proveedor,
        "proveedor_nombre_snapshot": pedido.proveedor_nombre_snapshot,
        "numero_pedido": pedido.numero_pedido,
        "fecha_pedido": pedido.fecha_pedido,
        "importe": float(pedido.importe) if pedido.importe is not None else None,
        "estado_entrega": pedido.estado_entrega,
        "fecha_entrega_prevista": pedido.fecha_entrega_prevista,
        "fecha_entrega_real": pedido.fecha_entrega_real,
        "observaciones": pedido.observaciones,
        "creado_en": pedido.creado_en,
        "actualizado_en": pedido.actualizado_en,
    }


def _presupuesto_tiene_pedido(obj: Presupuesto, pedido_count: int) -> bool:
    return bool(
        pedido_count
        or obj.pedido_proveedor_realizado
        or obj.proveedor
        or obj.numero_pedido_proveedor
        or obj.fecha_pedido_proveedor
        or obj.fecha_prevista_entrega
        or obj.plazo_proveedor
    )


def _build_operational_context(obj: Presupuesto, pedido_count: int, today: date) -> dict[str, Any]:
    motivos: list[str] = []
    faltantes: list[str] = []
    accion: ActionDict = {"tipo": "abrir_detalle", "label": "Abrir detalle", "target_tab": "datos"}
    has_order = _presupuesto_tiene_pedido(obj, pedido_count)
    deadline = _as_date(obj.fecha_limite_siguiente_accion)

    def set_action(tipo: str, label: str, target_tab: str, *, force: bool = False) -> None:
        nonlocal accion
        if force or accion["tipo"] == "abrir_detalle":
            accion = {"tipo": tipo, "label": label, "target_tab": target_tab}

    if obj.incidencia:
        _append_unique(motivos, "Incidencia abierta")
        set_action("resolver_incidencia", "Resolver incidencia", "datos", force=True)

    accepted_without_order = bool(
        (obj.fecha_aceptacion and not has_order)
        or obj.estado == "Aceptado - pendiente pedido proveedor"
    )
    if accepted_without_order:
        _append_unique(motivos, "Aceptado sin pedido proveedor")
        _append_unique(faltantes, "pedido proveedor")
        set_action("crear_pedido", "Crear pedido", "pedidos", force=True)

    pedidos = list(getattr(obj, "pedidos", []) or [])
    pedido_vencido = False
    pedido_sin_fecha = False
    pedido_sin_importe = False

    for pedido in pedidos:
        if pedido.estado_entrega == "completado":
            continue
        fecha_entrega = _as_date(pedido.fecha_entrega_prevista)
        if not fecha_entrega:
            pedido_sin_fecha = True
        elif fecha_entrega < today:
            pedido_vencido = True
        if pedido.importe is None:
            pedido_sin_importe = True

    legacy_fecha_entrega = _as_date(obj.fecha_prevista_entrega or obj.plazo_proveedor)
    if has_order and not pedidos and obj.estado != "Entregado / cerrado":
        if not legacy_fecha_entrega:
            pedido_sin_fecha = True
        elif legacy_fecha_entrega < today:
            pedido_vencido = True

    if has_order and not obj.plazo_proveedor and obj.estado not in CLOSED_STATES:
        _append_unique(motivos, "Plazo proveedor sin confirmar")
        _append_unique(faltantes, "plazo proveedor")
        set_action("confirmar_plazo", "Confirmar plazo", "pedidos")

    if pedido_vencido:
        _append_unique(motivos, "Pedido proveedor vencido")
        set_action("confirmar_plazo" if not obj.plazo_proveedor else "actualizar_fecha", "Confirmar plazo" if not obj.plazo_proveedor else "Actualizar fecha", "pedidos")
    if pedido_sin_fecha:
        _append_unique(motivos, "Pedido sin fecha prevista")
        _append_unique(faltantes, "pedido sin fecha")
        set_action("actualizar_fecha", "Actualizar fecha", "pedidos")
    if pedido_sin_importe:
        _append_unique(faltantes, "pedido sin importe")

    if deadline is None:
        _append_unique(motivos, "Sin fecha de siguiente acción")
        _append_unique(faltantes, "fecha límite siguiente acción")
        if accion["tipo"] not in {"crear_pedido", "resolver_incidencia"}:
            set_action("actualizar_fecha", "Actualizar fecha", "datos", force=True)
    elif deadline < today:
        _append_unique(motivos, "Fecha límite vencida")
        set_action("actualizar_fecha", "Actualizar fecha", "datos")
    elif deadline == today:
        _append_unique(motivos, "Vence hoy")
        set_action("abrir_detalle", "Abrir detalle", "datos")

    if not (obj.siguiente_accion or "").strip():
        _append_unique(motivos, "Sin siguiente acción")
        _append_unique(faltantes, "siguiente acción")
        if accion["tipo"] not in {"crear_pedido", "resolver_incidencia"}:
            set_action("actualizar_fecha", "Actualizar fecha", "datos", force=True)

    if obj.prioridad_calculada in {"Rojo", "Crítico"} or obj.incidencia or accepted_without_order or pedido_vencido:
        prioridad_operativa = "urgente"
    elif deadline == today or obj.prioridad_calculada == "Naranja":
        prioridad_operativa = "hoy"
    elif deadline and today < deadline <= today + timedelta(days=7):
        prioridad_operativa = "semana"
    elif deadline is None or faltantes:
        prioridad_operativa = "sin_fecha"
    else:
        prioridad_operativa = "semana"

    return {
        "prioridad_operativa": prioridad_operativa,
        "motivos": motivos or ["Seguimiento pendiente"],
        "accion_recomendada": accion,
        "faltantes": faltantes,
    }


@app.get("/mi-mesa")
def mi_mesa(request: Request, db: Session = Depends(get_db), responsable: str | None = None):
    user = getattr(request.state, "user", None)
    keys = [k for k in [responsable, getattr(user, "nombre", None), getattr(user, "email", None)] if k]
    q = base_query(db).options(selectinload(Presupuesto.pedidos)).filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    if keys:
        conds = []
        for key in keys:
            conds.append(Presupuesto.responsable_actual.ilike(f"%{key}%"))
            conds.append(Presupuesto.gestor.ilike(f"%{key}%"))
        q = q.filter(or_(*conds))
    rows = q.limit(500).all()
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
    items = []
    for r in out:
        item = serialize(r)
        item["pedidos"] = [_serialize_pedido_minimo(pedido) for pedido in getattr(r, "pedidos", []) or []]
        item.update(_build_operational_context(r, pedido_counts.get(r.id, 0), today))
        items.append(item)

    risk_rank = {"Crítico": 5, "Rojo": 4, "Naranja": 3, "Amarillo": 2, "Verde": 1}
    operational_rank = {"urgente": 4, "hoy": 3, "semana": 2, "sin_fecha": 1}
    items = sorted(
        items,
        key=lambda x: (
            operational_rank.get(x.get("prioridad_operativa"), 0),
            risk_rank.get(x["prioridad_calculada"], 0),
            x.get("dias_parado") or 0,
        ),
        reverse=True,
    )
    return {
        "usuario": {"id": getattr(user, "id", None), "nombre": getattr(user, "nombre", None), "email": getattr(user, "email", None)},
        "items": items,
        "resumen": {
            "total": len(items),
            "vencidos": len([x for x in items if x.get("fecha_limite_siguiente_accion") and str(x["fecha_limite_siguiente_accion"])[:10] <= today.isoformat()]),
            "criticos": len([x for x in items if x.get("prioridad_calculada") == "Crítico"]),
            "incidencias": len([x for x in items if x.get("incidencia")]),
            "aceptados_sin_pedido": len([x for x in items if x.get("fecha_aceptacion") and not x.get("pedido_proveedor_realizado")]),
            "urgentes": len([x for x in items if x.get("prioridad_operativa") == "urgente"]),
            "hoy": len([x for x in items if x.get("prioridad_operativa") == "hoy"]),
            "semana": len([x for x in items if x.get("prioridad_operativa") == "semana"]),
            "sin_fecha": len([x for x in items if x.get("prioridad_operativa") == "sin_fecha"]),
        }
    }


@app.get("/sidebar-counters", response_model=SidebarCounters)
def sidebar_counters(request: Request, db: Session = Depends(get_db)):
    user = getattr(request.state, "user", None)
    user_id = user.id if user else None
    counters = build_sidebar_counters(db, user_id)
    # Always calculate personal counters (for the "Mi trabajo" menu item)
    if user:
        keys = [k for k in [getattr(user, "nombre", None), getattr(user, "email", None)] if k]
        if keys:
            conds = []
            for key in keys:
                conds.append(Presupuesto.responsable_actual.ilike(f"%{key}%"))
                conds.append(Presupuesto.gestor.ilike(f"%{key}%"))
            own = base_query(db).filter(or_(*conds), Presupuesto.estado.notin_(list(CLOSED_STATES))).all()
            pedido_counts = enrich_risk(db, own)
            today = date.today()
            counters["hoy"] = sum(1 for r in own if (
                (r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion <= today) or
                r.prioridad_calculada in {"Rojo", "Crítico"} or
                (r.fecha_aceptacion and not pedido_counts.get(r.id, 0)) or r.incidencia))
    return counters


@app.get("/search", response_model=SearchResult)
@limiter.limit("60/minute")
def global_search(
    request: Request,
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

@app.post("/notificaciones/limpiar-antiguas")
def limpiar_notificaciones(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    count = limpiar_notificaciones_antiguas(db, dias=30)
    return {"eliminadas": count}

@app.get("/dashboard")
def dashboard(request: Request, db: Session = Depends(get_db)):
    user = getattr(request.state, "user", None)
    gestor = None
    if user and user_role(user) != ADMIN_ROLE:
        gestor = user.nombre
    return build_dashboard_payload(db, gestor=gestor)

@app.get("/riesgo")
def riesgo(request: Request, db: Session = Depends(get_db)):
    rows = get_risky_rows(db)
    user = getattr(request.state, "user", None)
    if user and user_role(user) != ADMIN_ROLE:
        rows = [r for r in rows if r.get("gestor") == user.nombre]
    return rows

@app.get("/hoy")
def hoy(request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    rows = get_today_rows(db)
    user = getattr(request.state, "user", None)
    if user and user_role(user) != ADMIN_ROLE:
        rows = [r for r in rows if r.get("gestor") == user.nombre]
    return rows


@app.get("/aceptados-sin-pedido")
def aceptados_sin_pedido(request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    rows = get_accepted_without_order_rows(db)
    user = getattr(request.state, "user", None)
    if user and user_role(user) != ADMIN_ROLE:
        rows = [r for r in rows if r.get("gestor") == user.nombre]
    return rows


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
def avisos_email_digest(request: Request, db: Session = Depends(get_db), only_critical: bool = False):
    require_system_manager(request)
    return send_alert_digest(db, only_critical=only_critical)


@app.post("/avisos/escalar-ahora")
def avisos_escalar_ahora(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return send_escalation_alerts(db)


@app.post("/avisos/run-automatic")
def avisos_run_automatic(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return run_automatic_alert_checks(db)


@app.post("/avisos/resumen-semanal")
def trigger_weekly_summary(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return send_weekly_summary(db)


@app.get("/dinero-riesgo")
def dinero_riesgo(request: Request, db: Session = Depends(get_db)):
    data = money_at_risk(db)
    user = getattr(request.state, "user", None)
    if user and user_role(user) != ADMIN_ROLE:
        for bucket in data.get("buckets", {}).values():
            bucket["items"] = [p for p in bucket.get("items", []) if p.get("gestor") == user.nombre]
            bucket["count"] = len(bucket["items"])
            bucket["importe"] = round(sum(float(p.get("importe", 0) or 0) for p in bucket["items"]), 2)
    return data


@app.post("/email/test")
def email_test(payload: EmailTestPayload, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    settings = get_settings(db)
    recipients = payload.destinatarios or settings.get("emails_destino_avisos", [])
    text = "Email de prueba de PresuControl. Si recibes este correo, la configuración SMTP funciona."
    html = "<p>Email de prueba de <strong>PresuControl</strong>.</p><p>La configuración SMTP funciona.</p>"
    try:
        return send_email("PresuControl · email de prueba", parse_recipients(recipients), text, html, db=db)
    except Exception as exc:
        return {"sent": False, "reason": str(exc)}

@app.get("/reports")
def reports(db: Session = Depends(get_db)):
    return build_reports_payload(db)


@app.get("/reports/list")
def reports_list(
    type: str = Query(..., pattern="^(atrasados|cancelados|sin_pedido|aceptados_sin_pedido|sin_aceptacion|en_riesgo|pedidos_pendientes|pedidos_completados)$"),
    db: Session = Depends(get_db),
    gestor: str | None = None,
    fecha_from: date | None = None,
    fecha_to: date | None = None,
    dias: int = Query(7, ge=1, le=365),
):
    return [serialize(row) for row in analytics_get_report_rows(db, type, gestor, fecha_from, fecha_to, dias)]


@app.post("/reports/export-list")
def export_report_list(payload: dict[str, Any], request: Request):
    require_system_manager(request)
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
def export_reports(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    payload = build_reports_payload(db)
    metrics = payload["metricas"]
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")

    # Get all presupuestos with risk data for detailed sheets
    rows, _pedido_counts = active_rows_with_risk(db)
    current_month = date.today().replace(day=1)

    # Categorize presupuestos
    sin_aceptar = [r for r in rows if r.estado == "Enviado al cliente"]
    sin_pedido = [r for r in rows if r.fecha_aceptacion and not r.pedido_proveedor_realizado]
    sin_plazo = [r for r in rows if r.pedido_proveedor_realizado and not r.plazo_proveedor and r.estado not in CLOSED_STATES]
    en_fabricacion = [r for r in rows if r.estado == "En preparación / fabricación"]
    cancelados = [r for r in rows if r.estado == "Cancelado / rechazado"]
    bloqueados = [r for r in rows if r.incidencia or r.estado == "Bloqueado / incidencia"]
    cerrados_mes = [r for r in rows if r.estado == "Entregado / cerrado" and r.actualizado_en and r.actualizado_en.date() >= current_month]
    active = [r for r in rows if r.estado not in CLOSED_STATES]

    COLUMNS = ["Nº Presupuesto", "Cliente", "Obra", "Gestor", "Importe", "Estado", "Prioridad", "Días Parado",
               "Proveedor", "Nº Pedido", "Fecha Límite", "Siguiente Acción", "Incidencia"]

    def budget_row(r: Presupuesto):
        return [
            r.numero_presupuesto, r.cliente, r.obra_referencia or "", r.gestor or "",
            float(r.importe or 0), r.estado, r.prioridad_calculada or "", r.dias_parado or 0,
            r.proveedor or "", r.numero_pedido_proveedor or "",
            r.fecha_limite_siguiente_accion.strftime("%d/%m/%Y") if r.fecha_limite_siguiente_accion else "",
            r.siguiente_accion or "", "Sí" if r.incidencia else "No"
        ]

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book
        header_format = workbook.add_format({"bold": True, "bg_color": "#1c1917", "font_color": "#ffffff", "border": 1, "text_wrap": True})
        money_format = workbook.add_format({"num_format": "#,##0.00 €", "border": 1})
        int_format = workbook.add_format({"num_format": "#,##0", "border": 1, "align": "center"})
        cell_format = workbook.add_format({"border": 1, "text_wrap": True})
        title_format = workbook.add_format({"bold": True, "font_size": 16, "font_color": "#1c1917"})
        subtitle_format = workbook.add_format({"font_size": 10, "font_color": "#78716c", "italic": True})
        chart_colors = ["#d47043", "#3b82f6", "#22c55e", "#ef4444", "#f97316", "#8b5cf6", "#eab308", "#06b6d4"]

        # ── Resumen ──
        ws = workbook.add_worksheet("Resumen")
        ws.merge_range(0, 0, 0, 1, "PresuControl — Informe ejecutivo", title_format)
        ws.merge_range(1, 0, 1, 1, f"Generado el {now}", subtitle_format)
        ws.write(3, 0, "Indicador", header_format)
        ws.write(3, 1, "Valor", header_format)
        items = [
            ("Total presupuestos activos", len(active), int_format),
            ("Sin aceptar (enviados sin respuesta)", len(sin_aceptar), int_format),
            ("Sin pedido (aceptados sin pedido proveedor)", len(sin_pedido), int_format),
            ("Sin plazo (pedido sin plazo confirmado)", len(sin_plazo), int_format),
            ("En fabricación", len(en_fabricacion), int_format),
            ("Bloqueados / incidencias", len(bloqueados), int_format),
            ("Cancelados / rechazados", len(cancelados), int_format),
            ("Cerrados este mes", len(cerrados_mes), int_format),
            ("", "", None),
            ("Importe aceptado pendiente de pedido", metrics["importe_aceptado_pendiente_pedido"], money_format),
            ("Días medios aceptación → pedido", metrics["dias_medios_aceptacion_a_pedido"], int_format),
            ("Presupuestos bloqueados", metrics["bloqueados"], int_format),
        ]
        for i, (label, val, fmt) in enumerate(items):
            ws.write(4 + i, 0, label, cell_format)
            if fmt: ws.write(4 + i, 1, val, fmt)
        ws.set_column(0, 0, 50)
        ws.set_column(1, 1, 20)
        ws.freeze_panes(4, 0)

        # Helper for detail sheets
        def write_detail_sheet(sheet_name, data_list, chart_title=None):
            ws_sheet = workbook.add_worksheet(sheet_name)
            ws_sheet.merge_range(0, 0, 0, len(COLUMNS) - 1, f"PresuControl — {sheet_name} ({len(data_list)} presupuestos)", title_format)
            for idx, col in enumerate(COLUMNS):
                ws_sheet.write(1, idx, col, header_format)
            for row_idx, r in enumerate(data_list):
                for col_idx, val in enumerate(budget_row(r)):
                    fmt = money_format if col_idx == 4 else cell_format
                    ws_sheet.write(2 + row_idx, col_idx, val, fmt)
            ws_sheet.set_column(0, 0, 16)
            ws_sheet.set_column(1, 1, 30)
            ws_sheet.set_column(2, 2, 25)
            ws_sheet.set_column(3, 3, 20)
            ws_sheet.set_column(4, 4, 14)
            ws_sheet.set_column(5, 5, 28)
            ws_sheet.set_column(6, 6, 12)
            ws_sheet.set_column(7, 7, 12)
            ws_sheet.set_column(8, 12, 20)
            ws_sheet.freeze_panes(2, 0)
            ws_sheet.autofilter(1, 0, len(data_list) + 1, len(COLUMNS) - 1)

        # Summary charts helper
        def write_chart_sheet(sheet_name, data, col1, col2, chart_title=None):
            df = pd.DataFrame([{col1: item["name"], col2: item["value"]} for item in data])
            df.to_excel(writer, index=False, sheet_name=sheet_name, startrow=1)
            ws_chart = writer.sheets[sheet_name]
            ws_chart.merge_range(0, 0, 0, 1, f"PresuControl — {sheet_name}", title_format)
            for idx, col in enumerate(df.columns):
                ws_chart.write(1, idx, col, header_format)
            ws_chart.set_column(0, 0, 35)
            ws_chart.set_column(1, 1, 15)
            ws_chart.freeze_panes(2, 0)
            ws_chart.autofilter(1, 0, len(df) + 1, 1)
            if len(df) > 0:
                chart = workbook.add_chart({"type": "bar"})
                chart.add_series({"name": col2, "categories": f"='{sheet_name}'!$A$3:$A${len(df)+2}", "values": f"='{sheet_name}'!$B$3:$B${len(df)+2}", "fill": {"color": chart_colors[0]}})
                chart.set_title({"name": chart_title or sheet_name})
                chart.set_legend({"none": True})
                chart.set_size({"width": 500, "height": max(200, len(df) * 20)})
                ws_chart.insert_chart("D2", chart)

        # ── Charts ──
        write_chart_sheet("01- Gráfico Estados", payload["presupuestos_por_estado"], "Estado", "Cantidad", "Presupuestos por estado")
        write_chart_sheet("02- Gráfico Prioridades", payload["prioridades"], "Prioridad", "Cantidad", "Distribución de prioridades")
        write_chart_sheet("03- Gráfico Aceptados", payload["aceptados_por_mes"], "Mes", "Aceptados", "Aceptados por mes")
        write_chart_sheet("04- Gráfico Cancelados", payload["cancelados_por_mes"], "Mes", "Cancelados", "Cancelados por mes")
        write_chart_sheet("05- Gráfico Gestores", payload["pendientes_por_gestor"], "Gestor", "Pendientes", "Pendientes por gestor")
        write_chart_sheet("06- Gráfico Proveedores", payload["pendientes_por_proveedor"], "Proveedor", "Pendientes", "Pendientes por proveedor")

        # ── Detailed lists ──
        write_detail_sheet("07- Sin aceptar", sin_aceptar)
        write_detail_sheet("08- Sin pedido", sin_pedido)
        write_detail_sheet("09- Sin plazo", sin_plazo)
        write_detail_sheet("10- En fabricación", en_fabricacion)
        write_detail_sheet("11- Bloqueados", bloqueados)
        write_detail_sheet("12- Cancelados", cancelados)
        write_detail_sheet("13- Cerrados este mes", cerrados_mes)
        write_detail_sheet("14- Todos activos", active)

    output.seek(0)
    filename = f"presucontrol_informe_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})


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
        "Nº pedido cliente": getattr(r, 'numero_pedido_cliente', None) or None,
        "Código Cliente FactuSOL": getattr(r, 'codigo_cliente_factusol', None) or None,
        "Fecha Medición": getattr(r, 'fecha_medicion', None) or None,
        "Fecha Recepción Mercancía": getattr(r, 'fecha_recepcion_mercancia', None) or None,
        "Plazo Confección": getattr(r, 'plazo_confeccion', None) or None,
        "Fecha Entrega Cliente": getattr(r, 'fecha_entrega_cliente', None) or None,
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
MAX_ROWS = 50000
CHUNK_SIZE = 500
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
        try:
            return pd.read_csv(io.BytesIO(raw), encoding="utf-8")
        except UnicodeDecodeError:
            return pd.read_csv(io.BytesIO(raw), encoding="latin-1")
    if ext in {".xlsx", ".xls"}:
        return pd.read_excel(io.BytesIO(raw))
    raise HTTPException(status_code=400, detail="Formato no soportado. Usa CSV, XLSX o XLS.")

def normalize_import_df(df: pd.DataFrame, column_mapping: dict[str, str] | None = None) -> pd.DataFrame:
    if column_mapping:
        # Filter out empty values
        active = {k: v for k, v in column_mapping.items() if v}
        if active:
            # User-provided custom mapping
            rename = {col: active.get(col, col) for col in df.columns}
            drop_cols = [col for col, target in column_mapping.items() if target == "" and col in df.columns]
        else:
            rename = {col: COLUMN_ALIASES.get(str(col).strip(), str(col).strip()) for col in df.columns}
            drop_cols = []
    else:
        rename = {col: COLUMN_ALIASES.get(str(col).strip(), str(col).strip()) for col in df.columns}
        # Drop columns that map to empty string (before renaming)
        drop_cols = [col for col, target in list(rename.items()) if target == ""]
        for dc in drop_cols:
            del rename[dc]
    df = df.rename(columns=rename)
    if drop_cols:
        df = df.drop(columns=drop_cols)
    missing = [v for v in REQUIRED_IMPORT_COLUMNS if v not in df.columns]
    if missing:
        # Add missing required columns with default values
        for m in missing:
            if m == "importe":
                df[m] = 0
            elif m == "estado":
                df[m] = "Pendiente de enviar"
            elif m == "gestor":
                df[m] = "Importado"
            else:
                df[m] = ""
    return df

DATE_FIELDS = {
    "fecha_envio_cliente", "fecha_aceptacion", "fecha_pedido_proveedor",
    "plazo_proveedor", "fecha_prevista_entrega", "fecha_medicion",
    "fecha_recepcion_mercancia", "plazo_confeccion", "fecha_entrega_cliente",
    "fecha_limite_siguiente_accion", "fecha_cancelacion_rechazo",
}

def row_to_payload(row: pd.Series) -> dict[str, Any]:
    def clean_identifier(value: Any) -> str:
        if value is None:
            return ""
        try:
            if isinstance(value, float):
                if value != value or value == float('inf') or value == float('-inf'):
                    return ""
                return str(int(value)).strip()
            return str(value).strip()
        except (ValueError, OverflowError):
            return ""

    def clean(v):
        if pd.isna(v):
            return None
        if isinstance(v, pd.Timestamp):
            return v.date()
        if isinstance(v, datetime):
            return v.date()
        return v
    data = {k: clean(row.get(k)) for k in REQUIRED_IMPORT_COLUMNS.keys()}
    # Ensure required string fields are not None
    for k in ['cliente', 'obra_referencia', 'gestor', 'estado']:
        if not data.get(k):
            data[k] = 'Borrador' if k == 'estado' else k.replace('_', ' ').title()
    if data.get('importe') is None:
        data['importe'] = 0
    if data.get('fecha_presupuesto') is None:
        data['fecha_presupuesto'] = date.today()
    # Optional fields
    for field in OPTIONAL_IMPORT_FIELDS:
        if field in row.index:
            val = clean(row.get(field))
            if val is not None:
                data[field] = val
    # Fallback for numero_presupuesto (after optional fields are loaded)
    if not clean_identifier(data.get('numero_presupuesto')):
        fallback = clean_identifier(data.get('numero_pedido_cliente'))
        if not fallback:
            raise ValueError("numero_presupuesto es obligatorio si no hay numero_pedido_cliente.")
        data['numero_presupuesto'] = fallback
    # Validate date fields: non-date strings → None
    for df_field in DATE_FIELDS:
        val = data.get(df_field)
        if isinstance(val, datetime):
            data[df_field] = val.date()
        elif val is not None and not isinstance(val, date):
            try:
                if isinstance(val, (int, float)):
                    # Excel serial date number
                    from datetime import datetime as dt
                    data[df_field] = (dt(1899, 12, 30) + pd.Timedelta(days=int(val))).date()
                else:
                    data[df_field] = pd.to_datetime(str(val), dayfirst=True).date()
            except Exception:
                data[df_field] = None
    # Clean numeric values in string fields (Excel reads ints as floats)
    STRING_FIELDS = {'numero_presupuesto', 'codigo_cliente_factusol', 'numero_pedido_cliente',
                     'numero_pedido_proveedor', 'proveedor', 'responsable_actual',
                     'siguiente_accion', 'descripcion_incidencia', 'observaciones',
                     'motivo_cancelacion_rechazo', 'cliente', 'obra_referencia', 'gestor'}
    for sf in STRING_FIELDS:
        val = data.get(sf)
        if isinstance(val, float):
            if val == int(val):
                data[sf] = str(int(val))
            else:
                data[sf] = str(val)
        elif val is not None and not isinstance(val, str):
            data[sf] = str(val)
    if isinstance(data["fecha_presupuesto"], str):
        data["fecha_presupuesto"] = pd.to_datetime(data["fecha_presupuesto"], dayfirst=True).date()
    data["importe"] = float(str(data["importe"]).replace("€", "").replace(".", "").replace(",", ".")) if isinstance(data["importe"], str) else float(data["importe"])
    data["pedido_proveedor_realizado"] = False
    data["incidencia"] = data.get("incidencia", False)
    if isinstance(data.get("incidencia"), str):
        data["incidencia"] = data["incidencia"].lower() in {"true", "1", "si", "sí", "yes"}
    return data


def prepare_import_payloads(df: pd.DataFrame) -> tuple[list[tuple[int, pd.Series, dict[str, Any]]], list[dict[str, Any]]]:
    prepared: list[tuple[int, pd.Series, dict[str, Any]]] = []
    errors: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        try:
            data = row_to_payload(row)
            if isinstance(data.get("importe"), (int, float)) and data["importe"] < 0:
                raise ValueError("El importe no puede ser negativo.")
            prepared.append((int(idx), row, data))
        except Exception as e:
            errors.append({
                "fila": int(idx) + 2,
                "numero_presupuesto": str(row.get("numero_presupuesto", "")),
                "error": str(getattr(e, "detail", e)),
            })
    return prepared, errors


IMPORT_FIELD_LABELS: dict[str, str] = {
    "numero_presupuesto": "Nº Presupuesto (requerido)",
    "cliente": "Cliente / Nombre (requerido)",
    "obra_referencia": "Obra / Referencia (requerido)",
    "gestor": "Gestor (requerido)",
    "fecha_presupuesto": "Fecha Presupuesto (requerido)",
    "importe": "Importe (requerido)",
    "estado": "Estado (requerido)",
    "codigo_cliente_factusol": "Código Cliente FactuSOL",
    "numero_pedido_cliente": "Nº Pedido Cliente",
    "fecha_envio_cliente": "Fecha Envío Cliente",
    "fecha_aceptacion": "Fecha Aceptación",
    "proveedor": "Proveedor",
    "numero_pedido_proveedor": "Nº Pedido Proveedor",
    "fecha_pedido_proveedor": "Fecha Pedido Proveedor",
    "plazo_proveedor": "Plazo Proveedor",
    "fecha_prevista_entrega": "Fecha Prevista Entrega",
    "fecha_medicion": "Fecha Medición",
    "fecha_recepcion_mercancia": "Fecha Recepción Mercancía",
    "plazo_confeccion": "Plazo Confección",
    "fecha_entrega_cliente": "Fecha Entrega Cliente",
    "responsable_actual": "Responsable Actual",
    "siguiente_accion": "Siguiente Acción",
    "fecha_limite_siguiente_accion": "Fecha Límite",
    "incidencia": "Incidencia",
    "descripcion_incidencia": "Descripción Incidencia",
    "observaciones": "Observaciones / Notas",
    "motivo_cancelacion_rechazo": "Motivo Cancelación",
    "fecha_cancelacion_rechazo": "Fecha Cancelación",
    "version": "Versión (para actualizar)",
    "expected_version": "Versión Esperada (para actualizar)",
}


@app.get("/import/fields")
def import_fields(request: Request):
    require_system_manager(request)
    return {"fields": IMPORT_FIELD_LABELS, "aliases": COLUMN_ALIASES}


@app.post("/import/preview", response_model=ImportPreview)
def import_preview(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), mode: str = "create_only", column_mapping: str = "{}"):
    require_system_manager(request)
    if mode not in {"create_only", "update_existing", "upsert"}:
        raise HTTPException(status_code=422, detail="Modo de importación no válido.")
    try:
        mapping = json.loads(column_mapping) if column_mapping and column_mapping != "{}" else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="column_mapping no es JSON válido")
    raw_df = parse_upload(file)
    columnas_originales = [str(c) for c in raw_df.columns.tolist()]
    mapeo_auto = {str(c): COLUMN_ALIASES.get(str(c).strip(), str(c).strip()) for c in raw_df.columns}
    try:
        df = normalize_import_df(raw_df, column_mapping=mapping)
    except HTTPException as e:
        return {
            "total_filas": len(raw_df),
            "validos": 0,
            "duplicados_bd": [],
            "duplicados_archivo": [],
            "errores": [{"fila": 0, "error": e.detail}],
            "preview": [],
            "modo": mode,
            "nuevos": 0,
            "actualizables": 0,
            "cambios_preview": [],
            "columnas": columnas_originales,
            "mapeo": mapeo_auto,
        }
    prepared_rows, errores = prepare_import_payloads(df)
    nums = [str(data["numero_presupuesto"]).strip() for _, _, data in prepared_rows]
    seen = set()
    dup_file = []
    for n in nums:
        if n in seen:
            dup_file.append(n)
        else:
            seen.add(n)
    dup_file = sorted(dup_file)
    existing_rows = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto.in_(nums)).all()
    existing = {r.numero_presupuesto: r for r in existing_rows}
    preview = []
    cambios_preview = []
    validos = 0
    nuevos = 0
    actualizables = 0
    for idx, row, data in prepared_rows:
        try:
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
        "columnas": columnas_originales,
        "mapeo": mapeo_auto,
    }


@app.post("/import/confirm")
def import_confirm(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), mode: str = "create_only", column_mapping: str = "{}"):
    require_system_manager(request)
    if mode not in {"create_only", "update_existing", "upsert"}:
        raise HTTPException(status_code=422, detail="Modo de importación no válido.")
    try:
        mapping = json.loads(column_mapping) if column_mapping and column_mapping != "{}" else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="column_mapping no es JSON válido")
    raw_df = parse_upload(file)
    try:
        df = normalize_import_df(raw_df, column_mapping=mapping)
    except HTTPException as e:
        raise HTTPException(
            status_code=422,
            detail=f"{e.detail} Usa 'Simular y comparar' primero para ajustar el mapeo de columnas."
        )
    prepared_rows, payload_errors = prepare_import_payloads(df)
    nums = [str(data["numero_presupuesto"]).strip() for _, _, data in prepared_rows]
    existing_rows = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto.in_(nums)).all()
    existing = {r.numero_presupuesto: r for r in existing_rows}
    inserted = 0
    updated = 0
    skipped = [
        {
            "fila": error["fila"],
            "numero_presupuesto": error.get("numero_presupuesto", ""),
            "motivo": error["error"],
        }
        for error in payload_errors
    ]
    seen = set()
    actor = current_actor(request)
    # Validate ALL rows before any database modifications
    for idx, row, data in prepared_rows:
        try:
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
            else:
                if mode == "update_existing":
                    skipped.append({"fila": int(idx) + 2, "numero_presupuesto": num, "motivo": "No existe para actualizar"})
                    continue
                obj = Presupuesto(**data)
                validate_presupuesto(obj, db)
        except Exception as e:
            skipped.append({"fila": int(idx) + 2, "numero_presupuesto": str(row.get("numero_presupuesto", "")), "motivo": str(getattr(e, "detail", e))})
    if skipped:
        db.rollback()
        return {"insertados": 0, "actualizados": 0, "omitidos": skipped}
    # All valid: apply changes atomically
    with db.begin():
        for idx, row, data in prepared_rows:
            num = str(data["numero_presupuesto"]).strip()
            obj = existing.get(num)
            if obj:
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
    cache.invalidate("dashboard")
    cache.invalidate("sidebar")
    return {"insertados": inserted, "actualizados": updated, "omitidos": skipped}


@app.post("/seed-demo")
def seed_demo(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
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
    require_gestion_or_admin(request)
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
    require_gestion_or_admin(request)
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
    require_gestion_or_admin(request)
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    proveedor.activo = False
    db.commit()
    return {"ok": True}


@app.get("/proveedores/{proveedor_id}/evaluaciones", response_model=list[EvaluacionProveedorOut])
def list_evaluaciones_proveedor(proveedor_id: int, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
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
    require_gestion_or_admin(request)
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
    request: Request,
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
def dashboard_ejecutivo(request: Request, db: Session = Depends(get_db)):
    user = getattr(request.state, "user", None)
    gestor = None
    if user and user_role(user) != ADMIN_ROLE:
        gestor = user.nombre
    return build_executive_dashboard_payload(db, gestor=gestor)
