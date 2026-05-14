from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .models import Usuario

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "presucontrol-change-this-secret")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() in {"1", "true", "yes", "on"}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if not EMAIL_RE.match(value):
        raise HTTPException(status_code=422, detail="Email no válido.")
    return value


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return pwd_context.verify(password, hashed_password)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Sesión no válida o caducada.")


def get_authenticated_user_from_request(request: Request, db: Session) -> Usuario | None:
    if not AUTH_ENABLED:
        return None
    auth = request.headers.get("Authorization", "")
    raw_token = None
    if auth.startswith("Bearer "):
        raw_token = auth.removeprefix("Bearer ").strip()
    elif request.query_params.get("access_token"):
        raw_token = request.query_params.get("access_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="No autenticado.")
    payload = decode_token(raw_token)
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Token sin usuario.")
    user = db.query(Usuario).filter(Usuario.email == email, Usuario.activo == True, Usuario.aprobado == True).first()  # noqa: E712
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado, desactivado o pendiente de aceptación.")
    return user
