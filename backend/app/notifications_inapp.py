from __future__ import annotations
from datetime import datetime, timezone
import json
from sqlalchemy.orm import Session
from .models import InAppNotification

def crear_notificacion(
    db: Session,
    *,
    user_id: int | None,
    tipo: str,
    titulo: str,
    mensaje: str,
    fingerprint: str | None = None,
    link: str | None = None,
    metadata: dict | None = None,
) -> InAppNotification:
    fp = fingerprint or f"{tipo}:{user_id}:{datetime.now(timezone.utc).isoformat()}"
    existing = db.query(InAppNotification).filter(InAppNotification.fingerprint == fp).first()
    if existing:
        return existing
    notif = InAppNotification(
        user_id=user_id,
        tipo=tipo,
        titulo=titulo,
        mensaje=mensaje,
        fingerprint=fp,
        link=link,
        extra_data=json.dumps(metadata) if metadata else None,
        leida=False,
    )
    db.add(notif)
    db.commit()
    return notif

def obtener_notificaciones(db: Session, user_id: int | None, unread_only: bool = False, limit: int = 50) -> list[InAppNotification]:
    q = db.query(InAppNotification).filter(InAppNotification.user_id == user_id)
    if unread_only:
        q = q.filter(InAppNotification.leida == False)
    return q.order_by(InAppNotification.creado_en.desc()).limit(limit).all()

def contar_sin_leer(db: Session, user_id: int | None) -> int:
    return db.query(InAppNotification).filter(
        InAppNotification.user_id == user_id,
        InAppNotification.leida == False,
    ).count()

def marcar_leida(db: Session, notification_id: int, user_id: int | None) -> bool:
    notif = db.query(InAppNotification).filter(
        InAppNotification.id == notification_id,
        InAppNotification.user_id == user_id,
    ).first()
    if not notif:
        return False
    notif.leida = True
    db.commit()
    return True

def marcar_todas_leidas(db: Session, user_id: int | None) -> int:
    count = db.query(InAppNotification).filter(
        InAppNotification.user_id == user_id,
        InAppNotification.leida == False,
    ).count()
    db.query(InAppNotification).filter(
        InAppNotification.user_id == user_id,
        InAppNotification.leida == False,
    ).update({InAppNotification.leida: True})
    db.commit()
    return count