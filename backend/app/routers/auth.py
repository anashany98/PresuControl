"""Auth router: register, login, me, user management."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
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
)
from ..database import get_db

from ..models import LoginAttempt, Usuario
from ..notifications_inapp import contar_sin_leer, marcar_leida, marcar_todas_leidas, obtener_notificaciones
from ..schemas import (
    TokenOut,
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
    elif attempt:
        attempt.attempts = 1
        attempt.window_start = now
    else:
        db.add(RegistrationAttempt(ip=ip, attempts=1, window_start=now))
    db.commit()


def _clear_failed_logins(email: str, request: Request, db: Session) -> None:
    ip = request.client.host if request.client else "unknown"
    db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).delete()
    db.commit()


def _enforce_login_rate_limit(email: str, request: Request, db: Session) -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "10")))
    max_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5"))
    attempt = db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).first()
    if not attempt:
        return
    stored = attempt.window_start
    if stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    if stored > window and attempt.attempts >= max_attempts:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta en unos minutos.")


def _register_failed_login(email: str, request: Request, db: Session) -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    attempt = db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).first()
    if attempt:
        attempt.attempts += 1
        attempt.window_start = now
    else:
        db.add(LoginAttempt(ip=ip, email=email, attempts=1, window_start=now))
    db.commit()


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@router.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
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
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    _enforce_login_rate_limit(email, request, db)
    user = db.query(Usuario).filter(Usuario.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        _register_failed_login(email, request, db)
        raise HTTPException(status_code=401, detail="Email o contrasena incorrectos.")
    if not user.activo or not user.aprobado:
        raise HTTPException(status_code=403, detail="Cuenta pendiente de aceptacion o desactivada.")
    _clear_failed_logins(email, request, db)
    user.ultimo_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    sync_legacy_system_flag(user)
    token = create_access_token(user.email, {"name": user.nombre, "role": user_role(user)})
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


# ---------------------------------------------------------------------------
# User management endpoints (admin only)
# ---------------------------------------------------------------------------

@router.get("/usuarios", response_model=list[UserOut])
def list_usuarios(request: Request, db: Session = Depends(get_db)):
    require_system_manager(request)
    return db.query(Usuario).order_by(desc(Usuario.creado_en)).all()


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
    user.aprobado_por = getattr(getattr(request.state, "user", None), "email", None)
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
    if payload.puede_gestionar_sistema is None:
        raise HTTPException(status_code=422, detail="puede_gestionar_sistema es obligatorio.")
    user = db.get(Usuario, usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    user.puede_gestionar_sistema = payload.puede_gestionar_sistema
    user.rol = ADMIN_ROLE if payload.puede_gestionar_sistema else GESTION_ROLE
    db.commit()
    db.refresh(user)
    sync_legacy_system_flag(user)
    return user


from ..schemas import PasswordAdminReset

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
