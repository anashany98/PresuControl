from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session
import bcrypt

from .config import settings
from .models import Usuario

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if not EMAIL_RE.match(value):
        raise HTTPException(status_code=422, detail="Email no válido.")
    return value


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Sesión no válida o caducada.")


def is_auth_enabled() -> bool:
    return settings.auth_enabled


def get_authenticated_user_from_request(request: Request, db: Session) -> Usuario | None:
    if not settings.auth_enabled:
        return None
    raw_token = get_token_from_request(request)
    if not raw_token:
        raise HTTPException(status_code=401, detail="No autenticado: falta token de acceso.")
    try:
        payload = decode_token(raw_token)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Sesión inválida o caducada. Haz logout y login de nuevo.")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token sin usuario válido.")
    user = db.query(Usuario).filter(Usuario.email == email, Usuario.activo == True, Usuario.aprobado == True).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado, desactivado o pendiente de aceptación.")
    return user


def get_current_user(request: Request) -> Usuario | None:
    if not settings.auth_enabled:
        return getattr(request.state, "user", None)
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


def set_auth_cookie(response: Response, token: str) -> None:
    """Set HttpOnly; Secure; SameSite=Strict cookie with the JWT token."""
    secure = settings.is_production
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """Delete the access_token cookie."""
    response.delete_cookie(key="access_token", path="/")


def get_token_from_request(request: Request) -> str | None:
    """Extract JWT token from Authorization header or access_token cookie."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip()
    return request.cookies.get("access_token")
