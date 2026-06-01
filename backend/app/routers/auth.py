"""Auth router: register, login, me, user management."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from ..access_control import ADMIN_ROLE, GESTION_ROLE, require_system_manager, sync_legacy_system_flag, user_role
from ..auth import (
    create_access_token,
    get_authenticated_user_from_request,
    hash_password,
    normalize_email,
    verify_password,
    set_auth_cookie,
    clear_auth_cookie,
)
from ..auth_rate_limit import clear_failed_logins, enforce_login_rate_limit, register_failed_login
from ..database import get_db

from ..models import Usuario
from ..schemas import (
    PasswordAdminReset,
    TokenOut,
    UserAdminCreate,
    UserApprovalPayload,
    UserLogin,
    UserOut,
    UserRegister,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _enforce_registration_rate_limit(request: Request, db: Session) -> None:
    from ..models import RegistrationAttempt
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=10)
    attempt = db.query(RegistrationAttempt).filter(
        RegistrationAttempt.ip == ip
    ).first()
    if attempt:
        stored = attempt.window_start
        if stored.tzinfo is None:
            stored = stored.replace(tzinfo=timezone.utc)
        if stored > window and attempt.attempts >= 5:
            raise HTTPException(status_code=429, detail="Demasiados registros. Intenta en 10 minutos.")
        attempt.attempts += 1
    else:
        db.add(RegistrationAttempt(ip=ip, attempts=1, window_start=now))
    db.commit()


def _actor_label(request: Request) -> str | None:
    user = getattr(request.state, "user", None)
    return getattr(user, "nombre", None) or getattr(user, "email", None)


def _current_db_user(request: Request, db: Session) -> Usuario:
    state_user = getattr(request.state, "user", None)
    user_id = getattr(state_user, "id", None)
    user = db.get(Usuario, user_id) if user_id is not None else None
    if not user and getattr(state_user, "email", None):
        user = db.query(Usuario).filter(Usuario.email == state_user.email).first()
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado.")
    return user


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: UserRegister, request: Request, response: Response, db: Session = Depends(get_db)):
    _enforce_registration_rate_limit(request, db)
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
        rol=ADMIN_ROLE if first_user else GESTION_ROLE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if not approved:
        raise HTTPException(status_code=202, detail="Registro recibido. Tu cuenta queda pendiente de aceptacion desde el panel.")
    sync_legacy_system_flag(user)
    token = create_access_token(user.email, {"name": user.nombre, "role": user_role(user)})
    set_auth_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    enforce_login_rate_limit(email, request, db)
    user = db.query(Usuario).filter(Usuario.email == email).first()

    generic_error = HTTPException(status_code=401, detail="Email o contraseña incorrectos.")

    if not user:
        register_failed_login(email, request, db)
        raise generic_error

    if not verify_password(payload.password, user.hashed_password):
        register_failed_login(email, request, db)
        raise generic_error

    if not user.activo or not user.aprobado:
        raise generic_error

    clear_failed_logins(email, request, db)
    user.ultimo_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    sync_legacy_system_flag(user)
    token = create_access_token(user.email, {"name": user.nombre, "role": user_role(user)})
    set_auth_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/auth/me", response_model=UserOut)
def me(request: Request, db: Session = Depends(get_db)):
    try:
        user = get_authenticated_user_from_request(request, db)
        if user:
            sync_legacy_system_flag(user)
            return user
    except HTTPException:
        pass
    return JSONResponse(status_code=401, content={"detail": "No autenticado. Haz logout y login de nuevo."})


@router.post("/auth/logout")
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


# ---------------------------------------------------------------------------
# User management endpoints (admin only)
# ---------------------------------------------------------------------------

@router.get("/usuarios", response_model=list[UserOut])
def list_usuarios(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    from sqlalchemy import func
    from ..models import Presupuesto

    usuarios = db.query(Usuario).order_by(desc(Usuario.creado_en)).all()
    # Single aggregated query to avoid N+1: count presupuestos by both gestor and responsable_actual
    from ..models import Presupuesto
    gestor_counts = dict(
        db.query(
            Presupuesto.gestor,
            func.count(Presupuesto.id)
        ).group_by(Presupuesto.gestor).all()
    )
    responsable_counts = dict(
        db.query(
            Presupuesto.responsable_actual,
            func.count(Presupuesto.id)
        ).group_by(Presupuesto.responsable_actual).all()
    )

    result = []
    for user in usuarios:
        count = (gestor_counts.get(user.nombre, 0) + responsable_counts.get(user.nombre, 0))
        user_dict = {
            "id": user.id,
            "nombre": user.nombre,
            "email": user.email,
            "activo": user.activo,
            "aprobado": user.aprobado,
            "aprobado_en": user.aprobado_en,
            "aprobado_por": user.aprobado_por,
            "creado_en": user.creado_en,
            "puede_gestionar_sistema": user.puede_gestionar_sistema,
            "rol": user.rol,
            "ultimo_login": user.ultimo_login,
            "presupuestos_count": count,
        }
        result.append(UserOut(**user_dict))
    return result


@router.post("/usuarios", response_model=UserOut)
def create_usuario(payload: UserAdminCreate, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    email = normalize_email(payload.email)
    existing = db.query(Usuario).filter(Usuario.email == email).first()
    if existing:
        raise HTTPException(status_code=422, detail="Ya existe un usuario con ese email.")
    user = Usuario(
        nombre=payload.nombre.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        activo=True,
        aprobado=True,
        aprobado_en=datetime.now(timezone.utc),
        aprobado_por=_actor_label(request),
        puede_gestionar_sistema=payload.rol == ADMIN_ROLE,
        rol=payload.rol,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/usuarios/pendientes", response_model=list[UserOut])
def list_usuarios_pendientes(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return db.query(Usuario).filter(or_(Usuario.aprobado == False, Usuario.activo == False)).order_by(desc(Usuario.creado_en)).all()  # noqa: E712


@router.post("/usuarios/{usuario_id}/aceptar", response_model=UserOut)
def aceptar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.aprobado = True
    user.activo = True
    user.aprobado_en = datetime.now(timezone.utc)
    user.aprobado_por = _actor_label(request)
    if user_role(user) is None:
        user.rol = GESTION_ROLE
    sync_legacy_system_flag(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/usuarios/{usuario_id}/desactivar", response_model=UserOut)
def desactivar_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    current = getattr(request.state, "user", None)
    if current and current.id == usuario_id:
        raise HTTPException(status_code=422, detail="No puedes desactivarte a ti mismo.")
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.activo = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/usuarios/{usuario_id}/toggle-gestion", response_model=UserOut)
def toggle_gestion_usuario(usuario_id: int, payload: UserApprovalPayload, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if payload.rol is not None:
        target_role = payload.rol
    elif payload.puede_gestionar_sistema is not None:
        target_role = ADMIN_ROLE if payload.puede_gestionar_sistema else GESTION_ROLE
    else:
        raise HTTPException(status_code=422, detail="Falta rol o puede_gestionar_sistema.")
    user.rol = target_role
    user.puede_gestionar_sistema = target_role == ADMIN_ROLE
    db.commit()
    db.refresh(user)
    return user


@router.post("/usuarios/{usuario_id}/reset-password", response_model=UserOut)
def admin_reset_password(usuario_id: int, payload: PasswordAdminReset, request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.hashed_password = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


@router.get("/usuarios/me/preferencias")
def get_my_preferencias(request: Request, db: Session = Depends(get_db)):
    user = _current_db_user(request, db)
    return user.preferencias or {}


@router.patch("/usuarios/me/preferencias")
def update_my_preferencias(payload: dict, request: Request, db: Session = Depends(get_db)):
    user = _current_db_user(request, db)
    current = dict(user.preferencias or {})
    current.update(payload)
    user.preferencias = current
    db.commit()
    db.refresh(user)
    return user.preferencias or {}
