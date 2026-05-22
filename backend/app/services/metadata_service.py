from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..models import PedidoProveedor, Presupuesto, Proveedor
from ..settings import get_settings

logger = logging.getLogger(__name__)


def normalize_option_list(values: list[Any]) -> list[str]:
    seen: dict[str, str] = {}
    for value in values:
        text_value = str(value).strip() if value is not None else ""
        if not text_value:
            continue
        key = text_value.casefold()
        if key not in seen:
            seen[key] = text_value
    return sorted(seen.values(), key=str.casefold)


def distinct_column_values(db: Session, column: Any) -> list[str]:
    return [row[0] for row in db.query(column).filter(column.isnot(None)).distinct().all()]


def provider_catalog_values(db: Session) -> list[str]:
    try:
        return [
            row[0]
            for row in db.query(Proveedor.nombre)
            .filter(Proveedor.activo == True)  # noqa: E712
            .distinct()
            .all()
        ]
    except SQLAlchemyError:
        db.rollback()
        logger.warning("No se pudieron cargar proveedores del maestro; usando valores existentes en presupuestos/pedidos.", exc_info=True)
        return []


def build_metadata_options(db: Session) -> dict[str, list[str]]:
    settings = get_settings(db)
    gestores = normalize_option_list([
        *(settings.get("gestores") or []),
        *distinct_column_values(db, Presupuesto.gestor),
    ])
    proveedores = normalize_option_list([
        *(settings.get("proveedores") or []),
        *distinct_column_values(db, Presupuesto.proveedor),
        *distinct_column_values(db, PedidoProveedor.proveedor),
        *provider_catalog_values(db),
    ])
    return {"gestores": gestores, "proveedores": proveedores}
