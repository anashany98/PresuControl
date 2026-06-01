from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc

from ..database import get_db, SessionLocal
from ..models import (
    Comentario, HistorialCambio, PedidoProveedor, Presupuesto,
    PresupuestoProveedor, Proveedor, Usuario,
)
from ..domain.constants import CLOSED_STATES
from ..rules import apply_derived_fields, calculate_risk, get_pedido_counts, validate_presupuesto
from ..schemas import (
    ComentarioCreate, ComentarioOut, HistorialOut,
    PedidoProveedorCreate, PedidoProveedorOut, PedidoProveedorUpdate,
    PresupuestoCreate, PresupuestoOut, PresupuestoProveedorCreate,
    PresupuestoProveedorOut, PresupuestoProveedorUpdate, PresupuestoUpdate,
)
from ..auth import get_current_user
from ..access_control import ADMIN_ROLE, require_gestion_or_admin, user_role
from ..analytics import get_settings
from ..sse_manager import sse
from ..serializers import serialize
from ..notifications import send_immediate_alerts_for_budget

router = APIRouter(prefix="/presupuestos", tags=["presupuestos"])

logger = logging.getLogger(__name__)


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
    from sqlalchemy import or_
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
    from sqlalchemy import asc, desc
    from sqlalchemy import case
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


@router.get("", response_model=list[PresupuestoOut])
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
    etiqueta: str | None = None,
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
    if user and user_role(user) != ADMIN_ROLE and not gestor:
        gestor = user.nombre
    from sqlalchemy import case
    q = apply_filters(db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)), search, estado, prioridad, gestor, proveedor, incidencia, etiqueta)
    if not include_archivados:
        q = q.filter(Presupuesto.archivado == False)  # noqa: E712
    if ocultar_cerrados:
        q = q.filter(Presupuesto.estado.notin_(list(CLOSED_STATES)))

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

    is_paginated = page != 1 or page_size != 50
    if is_paginated:
        from sqlalchemy import func
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


@router.post("", response_model=PresupuestoOut, status_code=201)
def create_presupuesto(payload: PresupuestoCreate, request: Request, db: Session = Depends(get_db)):
    require_gestion_or_admin(request)
    exists = db.query(Presupuesto).filter(Presupuesto.numero_presupuesto == payload.numero_presupuesto.strip()).first()
    if exists:
        raise HTTPException(status_code=409, detail="Ya existe un presupuesto con ese nº FactuSOL.")
    data = payload.model_dump(exclude={"modificado_por"})
    for key, value in list(data.items()):
        if isinstance(value, str):
            data[key] = value.strip()
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


@router.get("/{presupuesto_id}", response_model=PresupuestoOut)
def read_presupuesto(presupuesto_id: int, db: Session = Depends(get_db)):
    obj = db.query(Presupuesto).options(selectinload(Presupuesto.pedidos)).filter(Presupuesto.id == presupuesto_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    settings = get_settings(db)
    obj.prioridad_calculada, obj.dias_parado = calculate_risk(obj, db, settings)
    return obj


@router.patch("/{presupuesto_id}", response_model=PresupuestoOut)
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


@router.delete("/{presupuesto_id}")
def delete_presupuesto(presupuesto_id: int, request: Request, db: Session = Depends(get_db)):
    raise HTTPException(status_code=405, detail="No hay borrado físico. Usa /archivar con expected_version y motivo.")


@router.get("/{presupuesto_id}/comentarios", response_model=list[ComentarioOut])
def list_comentarios(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(Comentario).filter(Comentario.presupuesto_id == presupuesto_id).order_by(desc(Comentario.creado_en)).all()


@router.post("/{presupuesto_id}/comentarios", response_model=ComentarioOut, status_code=201)
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


@router.get("/{presupuesto_id}/historial", response_model=list[HistorialOut])
def list_historial(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(HistorialCambio).filter(HistorialCambio.presupuesto_id == presupuesto_id).order_by(desc(HistorialCambio.creado_en)).all()


@router.get("/{presupuesto_id}/pedidos", response_model=list[PedidoProveedorOut])
def list_pedidos(presupuesto_id: int, db: Session = Depends(get_db)):
    if not db.get(Presupuesto, presupuesto_id):
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado.")
    return db.query(PedidoProveedor).filter(PedidoProveedor.presupuesto_id == presupuesto_id).order_by(desc(PedidoProveedor.creado_en)).all()


@router.post("/{presupuesto_id}/pedidos", response_model=PedidoProveedorOut, status_code=201)
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


@router.get("/{presupuesto_id}/proveedores", response_model=list[PresupuestoProveedorOut], tags=["proveedores"])
def list_proveedores_presupuesto(presupuesto_id: int, db: Session = Depends(get_db)):
    return db.query(PresupuestoProveedor).filter(PresupuestoProveedor.presupuesto_id == presupuesto_id).all()


@router.post("/{presupuesto_id}/proveedores", response_model=PresupuestoProveedorOut, tags=["proveedores"])
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


@router.patch("/{presupuesto_id}/proveedores/{proveedor_id}", response_model=PresupuestoProveedorOut, tags=["proveedores"])
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


@router.delete("/{presupuesto_id}/proveedores/{proveedor_id}", tags=["proveedores"])
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


# Standalone pedidos router - included at app level with no prefix
pedidos_router = APIRouter(tags=["pedidos"])


@pedidos_router.patch("/{pedido_id}", response_model=PedidoProveedorOut)
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


@pedidos_router.delete("/{pedido_id}")
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


# Export this router to be registered at app level (not nested under /presupuestos)
__all__ = ["router", "pedidos_router"]