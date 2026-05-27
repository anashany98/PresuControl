from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import LoginAttempt


def enforce_login_rate_limit(email: str, request: Request, db: Session) -> None:
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


def register_failed_login(email: str, request: Request, db: Session) -> None:
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    attempt = db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).first()
    if attempt:
        attempt.attempts += 1
        attempt.window_start = now
    else:
        db.add(LoginAttempt(ip=ip, email=email, attempts=1, window_start=now))
    db.commit()


def clear_failed_logins(email: str, request: Request, db: Session) -> None:
    ip = request.client.host if request.client else "unknown"
    db.query(LoginAttempt).filter(LoginAttempt.ip == ip, LoginAttempt.email == email).delete()
    db.commit()
