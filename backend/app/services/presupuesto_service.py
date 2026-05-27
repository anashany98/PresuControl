from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Presupuesto, HistorialCambio
from ..schemas import PresupuestoCreate, PresupuestoUpdate
from ..serializers import serialize


class PresupuestoService:
    def __init__(self, db: Session):
        self.db = db

    def list(self, skip: int = 0, limit: int = 100, **filters) -> list[dict]:
        query = self.db.query(Presupuesto)
        for field, value in filters.items():
            if value is not None and hasattr(Presupuesto, field):
                query = query.filter(getattr(Presupuesto, field) == value)
        rows = query.offset(skip).limit(limit).all()
        return [serialize(r) for r in rows]

    def get(self, presupuesto_id: int) -> Presupuesto:
        obj = self.db.query(Presupuesto).filter(Presupuesto.id == presupuesto_id).first()
        if not obj:
            raise ValueError("Presupuesto no encontrado")
        return obj

    def create(self, data: PresupuestoCreate, usuario_id: int) -> dict:
        obj = Presupuesto(**data.model_dump(), creado_por=usuario_id)
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return serialize(obj)

    def update(self, presupuesto_id: int, data: PresupuestoUpdate, usuario_id: int) -> dict:
        obj = self.get(presupuesto_id)
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(obj, key, value)
        obj.version = getattr(obj, "version", 0) + 1
        self.db.commit()
        self.db.refresh(obj)
        return serialize(obj)

    def delete(self, presupuesto_id: int):
        obj = self.get(presupuesto_id)
        self.db.delete(obj)
        self.db.commit()
