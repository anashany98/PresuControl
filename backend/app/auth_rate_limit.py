# =============================================================================
# Authentication Rate Limiting
# =============================================================================
#
# Trust model for X-Forwarded-For:
#   The X-Forwarded-For header is only trusted when the immediate connection
#   comes from a known/trusted proxy. The trusted-proxy list is configured via
#   the TRUSTED_PROXIES env var (comma-separated IPs/CIDRs, e.g. "127.0.0.1,::1").
#   Requests from untrusted clients have their X-Forwarded-For header IGNORED.
#   This prevents attackers from spoofing X-Forwarded-For to evade rate limits.
#
#   When trusted: the FIRST IP in X-Forwarded-For is used (the original client).
#   When not trusted: request.client.host is used directly.
#
#   Additionally, private/reserved IPs from X-Forwarded-For are rejected even
#   from trusted proxies (via ipaddress.ip_address().is_global). If validation
#   fails, we fall back to request.client.host.
#
# Dual-check strategy:
#   Every login attempt is subject to TWO independent rate-limit checks:
#     1. Per-(IP, email) — prevents abuse from a single source targeting one account
#     2. Per-email     — prevents abuse from many sources targeting one account
#   Both must pass for the attempt to proceed. Either one firing blocks the attempt.
#
# Env vars used:
#   LOGIN_RATE_LIMIT_ATTEMPTS      — max attempts before block (default 5)
#   LOGIN_RATE_LIMIT_WINDOW_MINUTES — rolling window in minutes (default 10)
#   TRUSTED_PROXIES                — comma-separated IPs/CIDRs that are known proxies
# =============================================================================

from __future__ import annotations

import ipaddress
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import LoginAttempt


def _get_real_ip(request: Request) -> tuple[str, bool]:
    """
    Returns (ip, is_trusted) where is_trusted is True only when the immediate
    client connection comes from a known/trusted proxy.

    Trust model:
      - If request.client.host is in TRUSTED_PROXIES, X-Forwarded-For is consulted.
      - Only the FIRST X-Forwarded-For entry is used (original client).
      - Private/reserved IPs in X-Forwarded-For are rejected; falls back to
        request.client.host on validation failure.
      - If request.client.host is NOT trusted, X-Forwarded-For is completely ignored.
    """
    client_host = request.client.host if request.client else None
    trusted_raw = os.getenv("TRUSTED_PROXIES", "")
    trusted_proxies: list[str] = [p.strip() for p in trusted_raw.split(",") if p.strip()]

    def _is_trusted_client() -> bool:
        if not client_host:
            return False
        if not trusted_proxies:
            return False
        for proxy in trusted_proxies:
            try:
                # CIDR support (e.g. "10.0.0.0/8")
                if "/" in proxy:
                    network = ipaddress.ip_network(proxy, strict=False)
                    if ipaddress.ip_address(client_host) in network:
                        return True
                elif proxy == client_host:
                    return True
            except Exception:
                continue
        return False

    is_trusted = _is_trusted_client()

    if is_trusted:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            candidate = forwarded.split(",")[0].strip()
            try:
                ip = ipaddress.ip_address(candidate)
                if ip.is_global:
                    return candidate, True
                # Private/reserved IP in X-Forwarded-For — reject it
            except Exception:
                pass

    # Not trusted, or X-Forwarded-For was absent/invalid
    return client_host if client_host else "unknown", False


def enforce_email_rate_limit(email: str, db: Session) -> None:
    """
    Per-email rate limit: blocks when the total number of failed attempts for
    this email (across ANY IP) within the rolling window exceeds the limit.
    """
    window_minutes = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "10"))
    max_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5"))
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=window_minutes)

    total = db.query(LoginAttempt).filter(
        LoginAttempt.email == email,
        LoginAttempt.window_start >= window,
    ).count()

    if total >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Intenta en unos minutos.",
        )


def enforce_login_rate_limit(email: str, request: Request, db: Session) -> None:
    """
    Enforces two independent rate-limit checks:
      1. Per-(IP, email): same IP + email combo within the window
      2. Per-email:     any IP + same email within the window
    Both must pass. Either firing a 429 blocks the attempt.
    """
    ip, _ = _get_real_ip(request)
    now = datetime.now(timezone.utc)
    window_minutes = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "10"))
    max_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5"))
    window = now - timedelta(minutes=window_minutes)

    # Check 1: per-email (defense-in-depth)
    enforce_email_rate_limit(email, db)

    # Check 2: per-(IP, email)
    attempt = db.query(LoginAttempt).filter(
        LoginAttempt.ip == ip, LoginAttempt.email == email
    ).first()
    if not attempt:
        return
    stored = attempt.window_start
    if stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    if stored > window and attempt.attempts >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Intenta en unos minutos.",
        )


def register_failed_login(email: str, request: Request, db: Session) -> None:
    """Records a failed login attempt for (IP, email)."""
    ip, _ = _get_real_ip(request)
    now = datetime.now(timezone.utc)
    attempt = db.query(LoginAttempt).filter(
        LoginAttempt.ip == ip, LoginAttempt.email == email
    ).first()
    if attempt:
        attempt.attempts += 1
        attempt.window_start = now
    else:
        db.add(LoginAttempt(ip=ip, email=email, attempts=1, window_start=now))
    db.commit()


def clear_failed_logins(email: str, request: Request, db: Session) -> None:
    """
    Clears ALL failed login attempts for this email (across every IP) on
    successful login. This matches the semantics that a successful login
    proves the attacker has the correct password, so all previous failure
    records for this email are invalidated.
    """
    db.query(LoginAttempt).filter(LoginAttempt.email == email).delete()
    db.commit()