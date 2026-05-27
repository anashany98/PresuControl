from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import Presupuesto
from ..auth import get_current_user
from ..access_control import ADMIN_ROLE, user_role
from ..analytics import build_dashboard_payload, build_sidebar_counters, enrich_risk
from ..rules import CLOSED_STATES
from ..cache import cache
from ..services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(request: Request, db: Session = Depends(get_db)):
    cached = cache.get("dashboard", ttl=60)
    if cached is not None:
        return cached
    user = getattr(request.state, "user", None)
    gestor = None
    if user and user_role(user) != ADMIN_ROLE:
        gestor = user.nombre
    service = DashboardService(db)
    result = service.get_dashboard(gestor=gestor)
    cache.set("dashboard", result, ttl=60)
    return result


@router.get("/sidebar-counters")
def sidebar_counters(request: Request, db: Session = Depends(get_db)):
    cached = cache.get("sidebar", ttl=60)
    if cached is not None:
        return cached
    user = getattr(request.state, "user", None)
    user_id = user.id if user else None
    service = DashboardService(db)
    counters = service.get_sidebar_counters(user_id)
    if user:
        keys = [k for k in [getattr(user, "nombre", None), getattr(user, "email", None)] if k]
        if keys:
            conds = []
            for key in keys:
                conds.append(Presupuesto.responsable_actual.ilike(f"%{key}%"))
                conds.append(Presupuesto.gestor.ilike(f"%{key}%"))
            own = db.query(Presupuesto).filter(
                or_(*conds),
                Presupuesto.archivado == False,
                Presupuesto.estado.notin_(list(CLOSED_STATES))
            ).all()
            pedido_counts = enrich_risk(db, own)
            today = date.today()
            counters["hoy"] = sum(1 for r in own if (
                (r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion <= today) or
                r.prioridad_calculada in {"Rojo", "Crítico"} or
                (r.fecha_aceptacion and not pedido_counts.get(r.id, 0)) or r.incidencia))
    cache.set("sidebar", counters, ttl=60)
    return counters
