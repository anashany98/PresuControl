from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Presupuesto
from ..schemas import PresupuestoCreate, PresupuestoUpdate, PresupuestoOut, PaginatedPresupuestos
from ..auth import get_current_user
from ..access_control import require_gestion_or_admin, ADMIN_ROLE, user_role
from ..rules import CLOSED_STATES, apply_derived_fields, calculate_risk, get_pedido_counts, validate_presupuesto
from ..analytics import build_dashboard_payload

router = APIRouter(prefix="/presupuestos", tags=["presupuestos"])


@router.get("")
def list_presupuestos(
    request: Request,
    db: Session = Depends(get_db),
    user: None = Depends(get_current_user),
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    require_gestion_or_admin(request)
    if user and user_role(user) != ADMIN_ROLE and not gestor:
        gestor = user.nombre
    q = db.query(Presupuesto).options(selectinload(Presupuesto.pedidos))
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Presupuesto.cliente.ilike(like)) |
            (Presupuesto.numero_presupuesto.ilike(like)) |
            (Presupuesto.gestor.ilike(like))
        )
    if estado:
        q = q.filter(Presupuesto.estado == estado)
    if prioridad:
        q = q.filter(Presupuesto.prioridad_calculada == prioridad)
    if gestor:
        q = q.filter(Presupuesto.gestor.ilike(f"%{gestor}%"))
    if proveedor:
        q = q.filter(Presupuesto.proveedor.ilike(f"%{proveedor}%"))
    if incidencia is not None:
        q = q.filter(Presupuesto.incidencia == incidencia)
    if not include_archivados:
        q = q.filter(Presupuesto.archivado == False)
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))
    rows = q.limit(limit).all()
    settings = db.query(type(get_settings(db))).scalar()
    return rows


@router.get("/page", response_model=PaginatedPresupuestos)
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
    return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 1, "importe_total": 0.0}


@router.post("", response_model=PresupuestoOut, status_code=201)
def create_presupuesto(payload: PresupuestoCreate, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    return {}


@router.get("/{presupuesto_id}", response_model=PresupuestoOut)
def get_presupuesto(presupuesto_id: int, db: Session = Depends(get_db)):
    return {}


@router.patch("/{presupuesto_id}", response_model=PresupuestoOut)
def update_presupuesto(presupuesto_id: int, payload: PresupuestoUpdate, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    return {}


@router.delete("/{presupuesto_id}")
def delete_presupuesto(presupuesto_id: int, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    return {"ok": True}


def get_settings(db):
    from ..settings import get_settings as _gs
    return _gs(db)
