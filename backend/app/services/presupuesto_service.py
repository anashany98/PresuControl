from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Presupuesto, HistorialCambio
from ..schemas import PresupuestoCreate, PresupuestoUpdate
from ..serializers import serialize
from ..rules import apply_derived_fields, validate_presupuesto


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

    def create(self, data: PresupuestoCreate, usuario_id: int, current_user=None) -> dict:
        data_dict = data.model_dump(exclude={"modificado_por"})
        for k, v in data_dict.items():
            if isinstance(v, str):
                data_dict[k] = v.strip()

        duplicated = self.db.query(Presupuesto).filter(
            Presupuesto.numero_presupuesto == data_dict["numero_presupuesto"].strip()
        ).first()
        if duplicated:
            raise HTTPException(status_code=409, detail="Ya existe un presupuesto con ese nº FactuSOL.")

        if current_user is not None:
            from ..access_control import ADMIN_ROLE, user_role
            if not data_dict.get("gestor") or data_dict.get("gestor", "").strip() == "":
                data_dict["gestor"] = getattr(current_user, "nombre", None) or ""
            elif user_role(current_user) != ADMIN_ROLE:
                data_dict["gestor"] = getattr(current_user, "nombre", None) or ""
        elif not data_dict.get("gestor"):
            data_dict["gestor"] = ""

        obj = Presupuesto(**data_dict)
        if obj.estado == "Bloqueado / incidencia":
            obj.incidencia = True
        validate_presupuesto(obj, self.db)
        apply_derived_fields(obj, self.db)
        self.db.add(obj)
        self.db.flush()
        self.db.add(HistorialCambio(
            presupuesto_id=obj.id,
            campo="creación",
            valor_anterior=None,
            valor_nuevo=obj.numero_presupuesto,
            descripcion=f"Presupuesto {obj.numero_presupuesto} creado.",
            usuario_id=usuario_id,
        ))
        self.db.commit()
        self.db.refresh(obj)
        return serialize(obj)

    def update(self, presupuesto_id: int, data: PresupuestoUpdate, usuario_id: int, current_user=None) -> dict:
        obj = self.db.query(Presupuesto).filter(Presupuesto.id == presupuesto_id).first()
        if not obj:
            raise ValueError("Presupuesto no encontrado")

        expected_version = data.expected_version
        check_expected_version(obj, expected_version)

        update_data = data.model_dump(exclude_unset=True, exclude={"modificado_por", "expected_version"})
        if "numero_presupuesto" in update_data and update_data["numero_presupuesto"]:
            duplicated = self.db.query(Presupuesto).filter(
                Presupuesto.numero_presupuesto == update_data["numero_presupuesto"].strip(),
                Presupuesto.id != presupuesto_id,
            ).first()
            if duplicated:
                raise HTTPException(status_code=409, detail="Ya existe otro presupuesto con ese nº FactuSOL.")

        before = serialize(obj)
        for key, value in update_data.items():
            if isinstance(value, str):
                value = value.strip()
            setattr(obj, key, value)

        if obj.estado == "Bloqueado / incidencia":
            obj.incidencia = True
        validate_presupuesto(obj, self.db, existing_id=presupuesto_id, previous_estado=before.get("estado"))
        apply_derived_fields(obj, self.db)
        self.db.flush()
        obj.version = (obj.version or 1) + 1
        self.db.commit()
        self.db.refresh(obj)
        return serialize(obj)

    def delete(self, presupuesto_id: int):
        obj = self.get(presupuesto_id)
        self.db.delete(obj)
        self.db.commit()
