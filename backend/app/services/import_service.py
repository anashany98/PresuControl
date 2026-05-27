from __future__ import annotations
from sqlalchemy.orm import Session
from typing import Any
import pandas as pd

CHUNK_SIZE = 500
MAX_ROWS = 50000


def validate_max_rows(df: pd.DataFrame) -> None:
    if len(df) > MAX_ROWS:
        raise ValueError(f"El archivo excede el maximo de {MAX_ROWS} filas (tiene {len(df)})")


def row_to_payload(row: pd.Series) -> dict[str, Any]:
    from datetime import date, datetime as dt

    DATE_FIELDS = {
        "fecha_envio_cliente", "fecha_aceptacion", "fecha_pedido_proveedor",
        "plazo_proveedor", "fecha_prevista_entrega", "fecha_medicion",
        "fecha_recepcion_mercancia", "plazo_confeccion", "fecha_entrega_cliente",
        "fecha_limite_siguiente_accion", "fecha_cancelacion_rechazo",
    }
    OPTIONAL_IMPORT_FIELDS = [
        "codigo_cliente_factusol", "numero_pedido_cliente", "fecha_envio_cliente",
        "fecha_aceptacion", "proveedor", "numero_pedido_proveedor",
        "fecha_pedido_proveedor", "plazo_proveedor", "fecha_prevista_entrega",
        "fecha_medicion", "fecha_recepcion_mercancia", "plazo_confeccion",
        "fecha_entrega_cliente", "responsable_actual", "siguiente_accion",
        "fecha_limite_siguiente_accion", "incidencia", "descripcion_incidencia",
        "observaciones", "motivo_cancelacion_rechazo", "fecha_cancelacion_rechazo",
    ]
    REQUIRED_IMPORT_COLUMNS = {
        "numero_presupuesto": str, "cliente": str, "obra_referencia": str,
        "gestor": str, "fecha_presupuesto": date, "importe": float, "estado": str,
    }

    def clean(v):
        if pd.isna(v):
            return None
        if isinstance(v, pd.Timestamp):
            return v.date()
        return v

    data = {k: clean(row.get(k)) for k in REQUIRED_IMPORT_COLUMNS.keys()}
    for k in ['cliente', 'obra_referencia', 'gestor', 'estado']:
        if not data.get(k):
            data[k] = k.replace('_', ' ').title()
    if data.get('importe') is None:
        data['importe'] = 0
    if data.get('fecha_presupuesto') is None:
        data['fecha_presupuesto'] = date.today()
    for field in OPTIONAL_IMPORT_FIELDS:
        if field in row.index:
            val = clean(row.get(field))
            if val is not None:
                data[field] = val
    if not data.get('numero_presupuesto'):
        fallback = str(data.get('numero_pedido_cliente', '') or '')
        data['numero_presupuesto'] = fallback if fallback else 'Sin numero'
    for df_field in DATE_FIELDS:
        val = data.get(df_field)
        if val is not None and not isinstance(val, date):
            try:
                if isinstance(val, (int, float)):
                    data[df_field] = dt(1899, 12, 30) + pd.Timedelta(days=int(val))
                else:
                    data[df_field] = pd.to_datetime(str(val), dayfirst=True).date()
            except Exception:
                data[df_field] = None
    STRING_FIELDS = {'numero_presupuesto', 'codigo_cliente_factusol', 'numero_pedido_cliente',
                     'numero_pedido_proveedor', 'proveedor', 'responsable_actual',
                     'siguiente_accion', 'descripcion_incidencia', 'observaciones',
                     'motivo_cancelacion_rechazo', 'cliente', 'obra_referencia', 'gestor'}
    for sf in STRING_FIELDS:
        val = data.get(sf)
        if isinstance(val, float):
            data[sf] = str(int(val)) if val == int(val) else str(val)
        elif val is not None and not isinstance(val, str):
            data[sf] = str(val)
    if isinstance(data["fecha_presupuesto"], str):
        data["fecha_presupuesto"] = pd.to_datetime(data["fecha_presupuesto"], dayfirst=True).date()
    data["importe"] = float(str(data["importe"]).replace("€", "").replace(".", "").replace(",", ".")) if isinstance(data["importe"], str) else float(data["importe"])
    data["pedido_proveedor_realizado"] = False
    data["incidencia"] = data.get("incidencia", False)
    if isinstance(data.get("incidencia"), str):
        data["incidencia"] = data["incidencia"].lower() in {"true", "1", "si", "sí", "yes"}
    return data


def process_import_chunked(df: pd.DataFrame, db: Session, mode: str, existing: dict[str, Any]):
    from ..models import Presupuesto, HistorialCambio
    from datetime import date

    if len(df) > MAX_ROWS:
        raise ValueError(f"El archivo excede el maximo de {MAX_ROWS} filas (tiene {len(df)})")

    results = {"created": 0, "updated": 0, "errors": []}
    seen = set()
    actor = None

    for start in range(0, len(df), CHUNK_SIZE):
        chunk = df.iloc[start:start + CHUNK_SIZE]
        for _, row in chunk.iterrows():
            row_idx = int(_)
            try:
                data = row_to_payload(row)
                if isinstance(data.get("importe"), (int, float)) and data["importe"] < 0:
                    raise ValueError("El importe no puede ser negativo.")
                num = str(data["numero_presupuesto"]).strip()
                if num in seen:
                    continue
                seen.add(num)
                obj_existing = existing.get(num)
                if obj_existing:
                    if mode in {"update_existing", "upsert"}:
                        expected = row.get("expected_version", row.get("version", None))
                        if expected is None or pd.isna(expected):
                            results["errors"].append({"row": row_idx + 2, "error": f"{num}: para actualizar existentes falta columna version/expected_version."})
                            continue
                        if int(expected) != int(obj_existing.version):
                            results["errors"].append({"row": row_idx + 2, "error": f"{num}: versión antigua."})
                            continue
                        for field, value in data.items():
                            if field == "numero_presupuesto":
                                continue
                            setattr(obj_existing, field, value)
                        obj_existing.version = (obj_existing.version or 1) + 1
                        db.flush()
                        results["updated"] += 1
                else:
                    if mode == "update_existing":
                        continue
                    obj = Presupuesto(**data)
                    db.add(obj)
                    db.flush()
                    results["created"] += 1
            except Exception as e:
                results["errors"].append({"row": row_idx + 2, "error": str(getattr(e, "detail", e))})
        db.flush()
    db.commit()
    return results
