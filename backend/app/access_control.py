from __future__ import annotations

from fastapi import HTTPException, Request

from .auth import is_auth_enabled
from .models import Usuario

ADMIN_ROLE = "admin_sistema"
GESTION_ROLE = "gestion"
VALID_ROLES = {ADMIN_ROLE, GESTION_ROLE}


def user_role(user: Usuario | None) -> str | None:
    if not user:
        return None
    if getattr(user, "puede_gestionar_sistema", False):
        return ADMIN_ROLE
    role = getattr(user, "rol", None)
    if role in VALID_ROLES:
        return role
    return GESTION_ROLE


def sync_legacy_system_flag(user: Usuario) -> None:
    user.puede_gestionar_sistema = user_role(user) == ADMIN_ROLE


def require_role(request: Request, *roles: str) -> Usuario | None:
    user = getattr(request.state, "user", None)
    if not is_auth_enabled():
        return user
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    if user_role(user) not in set(roles):
        allowed = ", ".join(roles)
        raise HTTPException(status_code=403, detail=f"Permiso insuficiente. Rol requerido: {allowed}.")
    return user


def require_system_manager(request: Request) -> Usuario | None:
    return require_role(request, ADMIN_ROLE)


def require_gestion_or_admin(request: Request) -> Usuario | None:
    return require_role(request, ADMIN_ROLE, GESTION_ROLE)
