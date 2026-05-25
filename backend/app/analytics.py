from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from .models import PedidoProveedor, Presupuesto, Usuario
from .notifications_inapp import contar_sin_leer
from .rules import CLOSED_STATES, calculate_risk, get_pedido_counts
from .schemas import ESTADOS
from .settings import get_settings


SERIALIZE_FIELDS = [
    "id", "numero_presupuesto", "cliente", "obra_referencia", "gestor", "fecha_presupuesto",
    "fecha_envio_cliente", "fecha_aceptacion", "importe", "estado", "proveedor",
    "pedido_proveedor_realizado", "numero_pedido_proveedor", "fecha_pedido_proveedor",
    "plazo_proveedor", "fecha_prevista_entrega", "responsable_actual", "siguiente_accion",
    "fecha_limite_siguiente_accion", "incidencia", "descripcion_incidencia", "observaciones",
    "motivo_cancelacion_rechazo", "fecha_cancelacion_rechazo", "archivado", "archivado_en",
    "archivado_por", "motivo_archivado", "prioridad_calculada", "dias_parado",
    "fecha_ultima_actualizacion", "creado_en", "actualizado_en", "version",
]

RISK_RANK = {"Crítico": 5, "Rojo": 4, "Naranja": 3, "Amarillo": 2, "Verde": 1}

REPORT_LIST_TYPES = {
    "atrasados",
    "cancelados",
    "sin_pedido",
    "aceptados_sin_pedido",
    "sin_aceptacion",
    "en_riesgo",
    "pedidos_pendientes",
    "pedidos_completados",
}


def serialize(obj: Presupuesto) -> dict[str, Any]:
    return {field: getattr(obj, field) for field in SERIALIZE_FIELDS}


def base_budget_query(db: Session, include_archivados: bool = False):
    query = db.query(Presupuesto)
    if not include_archivados:
        query = query.filter(Presupuesto.archivado == False)  # noqa: E712
    return query


def money(value: Any) -> float:
    return float(value or 0)


def enrich_risk(db: Session, rows: list[Presupuesto]) -> dict[int, int]:
    settings = get_settings(db)
    pedido_counts = get_pedido_counts(db, [row.id for row in rows])
    for row in rows:
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings, pedido_counts)
    return pedido_counts


def accepted_without_order_query(db: Session):
    return base_budget_query(db).filter(
        Presupuesto.fecha_aceptacion.isnot(None),
        ~Presupuesto.pedidos.any(),
    )


def sidebar_candidate_rows(db: Session) -> list[Presupuesto]:
    today = date.today()
    stale_before = datetime.combine(today - timedelta(days=3), datetime.min.time(), tzinfo=timezone.utc)
    return base_budget_query(db).options(selectinload(Presupuesto.pedidos)).filter(or_(
        Presupuesto.fecha_aceptacion.isnot(None),
        Presupuesto.estado == "Aceptado - pendiente pedido proveedor",
        and_(
            Presupuesto.pedido_proveedor_realizado == True,  # noqa: E712
            Presupuesto.plazo_proveedor.is_(None),
            Presupuesto.estado.notin_(list(CLOSED_STATES)),
        ),
        Presupuesto.fecha_limite_siguiente_accion.isnot(None),
        Presupuesto.incidencia == True,  # noqa: E712
        and_(
            Presupuesto.fecha_ultima_actualizacion < stale_before,
            Presupuesto.estado.notin_(list(CLOSED_STATES)),
        ),
    )).all()


def build_sidebar_counters(db: Session, user_id: int | None = None) -> dict[str, int | float]:
    rows = sidebar_candidate_rows(db)
    today = date.today()
    pedido_counts = enrich_risk(db, rows)
    riesgo_count = 0
    hoy_count = 0
    unique_risk: dict[int, float] = {}

    for row in rows:
        pedido_count = pedido_counts.get(row.id, 0)
        accepted_no_order = bool(row.fecha_aceptacion and pedido_count == 0)
        order_no_deadline = bool(pedido_count > 0 and not row.plazo_proveedor and row.estado not in CLOSED_STATES)
        vencido = bool(row.fecha_limite_siguiente_accion and row.fecha_limite_siguiente_accion < today)
        stale = bool(row.dias_parado > 3 and row.estado not in CLOSED_STATES)
        risky = accepted_no_order or order_no_deadline or vencido or stale or row.incidencia
        if risky:
            riesgo_count += 1
            unique_risk[row.id] = money(row.importe)
        if row.estado not in CLOSED_STATES and (
            vencido or row.prioridad_calculada in {"Rojo", "Crítico"} or accepted_no_order or row.incidencia
        ):
            hoy_count += 1

    aceptados_sin_pedido = accepted_without_order_query(db).count()
    incidencias = base_budget_query(db).filter(Presupuesto.incidencia == True).count()  # noqa: E712
    usuarios_pendientes = db.query(Usuario).filter(or_(Usuario.aprobado == False, Usuario.activo == False)).count()  # noqa: E712
    pedidos_pendientes = db.query(func.count(func.distinct(PedidoProveedor.presupuesto_id))).join(
        Presupuesto,
        Presupuesto.id == PedidoProveedor.presupuesto_id,
    ).filter(
        Presupuesto.archivado == False,  # noqa: E712
        PedidoProveedor.estado_entrega != "completado",
    ).scalar() or 0

    return {
        "hoy": hoy_count,
        "aceptados_sin_pedido": aceptados_sin_pedido,
        "riesgo": riesgo_count,
        "incidencias": incidencias,
        "usuarios_pendientes": usuarios_pendientes,
        "dinero_riesgo": round(sum(unique_risk.values()), 2),
        "notificaciones_sin_leer": contar_sin_leer(db, user_id),
        "pedidos_pendientes": int(pedidos_pendientes),
    }


def sort_by_risk(rows: list[Presupuesto]) -> list[dict[str, Any]]:
    return sorted(
        [serialize(row) for row in rows],
        key=lambda item: (RISK_RANK.get(item["prioridad_calculada"], 0), item.get("dias_parado") or 0),
        reverse=True,
    )


def brief(rows: list[Presupuesto], n: int = 8) -> list[dict[str, Any]]:
    ordered = sorted(rows, key=lambda row: (row.prioridad_calculada != "Crítico", -row.dias_parado))[:n]
    return [serialize(row) for row in ordered]


def active_rows_with_risk(db: Session, include_pedidos: bool = False) -> tuple[list[Presupuesto], dict[int, int]]:
    query = base_budget_query(db)
    if include_pedidos:
        query = query.options(selectinload(Presupuesto.pedidos))
    rows = query.all()
    pedido_counts = enrich_risk(db, rows)
    return rows, pedido_counts


def build_dashboard_payload(db: Session) -> dict[str, Any]:
    rows, _pedido_counts = active_rows_with_risk(db)
    current_month = date.today().replace(day=1)
    active = [row for row in rows if row.estado not in CLOSED_STATES]
    accepted_no_order = [row for row in rows if row.fecha_aceptacion and not row.pedido_proveedor_realizado]
    sent_no_response = [row for row in rows if row.estado == "Enviado al cliente"]
    order_no_deadline = [
        row for row in rows
        if row.pedido_proveedor_realizado and not row.plazo_proveedor and row.estado not in CLOSED_STATES
    ]
    incidences = [row for row in rows if row.incidencia]
    closed_month = [
        row for row in rows
        if row.estado == "Entregado / cerrado" and row.actualizado_en.date() >= current_month
    ]
    accepted_with_order = [row for row in rows if row.fecha_aceptacion and row.fecha_pedido_proveedor]
    avg_days = round(
        sum((row.fecha_pedido_proveedor - row.fecha_aceptacion).days for row in accepted_with_order) / len(accepted_with_order),
        1,
    ) if accepted_with_order else 0

    # New fields for Phase 1.1 dashboard redesign
    total_money_at_risk = sum(money(row.importe) for row in accepted_no_order) + sum(money(row.importe) for row in incidences)

    # alerta
    if len(accepted_no_order) > 0:
        alerta_tipo = "critico"
        alerta_mensaje = f"{len(accepted_no_order)} presupuestos críticos sin pedido — {total_money_at_risk:,.0f} €".replace(",", ".")
        alerta_count = len(accepted_no_order)
    elif len(incidences) > 0:
        alerta_tipo = "warning"
        alerta_mensaje = f"{len(incidences)} incidencias abiertas"
        alerta_count = len(incidences)
    else:
        alerta_tipo = None
        alerta_mensaje = ""
        alerta_count = 0

    # kpis
    pedidos_pendientes_count = len([
        row for row in rows
        if row.pedido_proveedor_realizado and row.estado not in CLOSED_STATES
    ])
    kpis = [
        {"key": "total_activos", "value": len(active), "trend": 5, "trendUp": True},
        {
            "key": "en_riesgo",
            "value": len(accepted_no_order) + len(incidences) + len(order_no_deadline),
            "sublabel": f"{total_money_at_risk:,.0f} €".replace(",", "."),
            "trend": -12,
            "trendUp": False,
            "tone": "danger",
        },
        {"key": "cerrados_mes", "value": len(closed_month), "trend": 15, "trendUp": True, "tone": "success"},
        {"key": "pedidos_pendientes", "value": pedidos_pendientes_count, "tone": "purple"},
    ]

    # tendencias (6 months with cerrados count)
    today = date.today()
    tendencias = []
    for i in range(6):
        month_date = (today - timedelta(days=30 * i)).replace(day=1)
        next_month = (month_date + timedelta(days=32)).replace(day=1)
        month_rows = [row for row in rows if row.creado_en.date() >= month_date and row.creado_en.date() < next_month]
        month_cerrados = [
            row for row in rows
            if row.estado == "Entregado / cerrado"
            and row.actualizado_en.date() >= month_date
            and row.actualizado_en.date() < next_month
        ]
        tendencias.append({
            "mes": month_date.strftime("%Y-%m"),
            "nuevos": len(month_rows),
            "cerrados": len(month_cerrados),
            "importe": round(sum(money(row.importe) for row in month_rows), 2),
        })
    tendencias.reverse()

    # resumen_texto
    prev_month_date = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    prev_next_month = (prev_month_date + timedelta(days=32)).replace(day=1)
    prev_month_cerrados = [
        row for row in rows
        if row.estado == "Entregado / cerrado"
        and row.actualizado_en.date() >= prev_month_date
        and row.actualizado_en.date() < prev_next_month
    ]
    if prev_month_cerrados:
        trend_pct = round((len(closed_month) - len(prev_month_cerrados)) / max(1, len(prev_month_cerrados)) * 100)
        if trend_pct > 0:
            trend_text = f"un {trend_pct}% más"
        elif trend_pct < 0:
            trend_text = f"un {abs(trend_pct)}% menos"
        else:
            trend_text = "similar al mes pasado"
    else:
        trend_text = "similar al mes pasado"
    criticos_count = len(accepted_no_order)
    resumen_texto = f"Tienes {len(active)} presupuestos activos. {criticos_count} requieren atención urgente. Este mes has cerrado {len(closed_month)}, {trend_text}."

    # excepciones_pedidos
    excepciones_rows = [
        row for row in rows
        if row.pedido_proveedor_realizado and row.estado not in CLOSED_STATES
    ]
    excepciones_rows_sorted = sorted(excepciones_rows, key=lambda row: row.dias_parado or 0, reverse=True)[:6]
    excepciones_pedidos = []
    for row in excepciones_rows_sorted:
        serialized = serialize(row)
        serialized["pedidos_count"] = sum(1 for p in (row.pedidos or []) if p.estado_entrega != "completado")
        excepciones_pedidos.append(serialized)

    # kpi_riesgo
    kpi_riesgo = len(accepted_no_order) + len(sent_no_response) + len(order_no_deadline) + len(incidences)

    return {
        "cards": {
            "total_activos": len(active),
            "aceptados_sin_pedido": len(accepted_no_order),
            "enviados_sin_respuesta": len(sent_no_response),
            "pedidos_sin_plazo": len(order_no_deadline),
            "incidencias_abiertas": len(incidences),
            "cerrados_mes": len(closed_month),
            "importe_aceptado_pendiente_pedido": round(sum(money(row.importe) for row in accepted_no_order), 2),
            "dias_medios_aceptacion_a_pedido": avg_days,
        },
        "sections": {
            "criticos_aceptados_sin_pedido": brief(accepted_no_order),
            "pendientes_respuesta_cliente": brief(sent_no_response),
            "pedidos_sin_plazo": brief(order_no_deadline),
            "incidencias_abiertas": brief(incidences),
            "proximas_fechas_limite": brief([
                row for row in rows if row.fecha_limite_siguiente_accion and row.estado not in CLOSED_STATES
            ]),
        },
        "alerta": {
            "tipo": alerta_tipo,
            "mensaje": alerta_mensaje,
            "count": alerta_count,
        },
        "kpis": kpis,
        "tendencias": tendencias,
        "resumen_texto": resumen_texto,
        "excepciones_pedidos": excepciones_pedidos,
        "kpi_riesgo": kpi_riesgo,
    }


def get_risky_rows(db: Session) -> list[dict[str, Any]]:
    rows, pedido_counts = active_rows_with_risk(db)
    today = date.today()
    risky: list[Presupuesto] = []
    for row in rows:
        conditions = [
            row.fecha_aceptacion and not pedido_counts.get(row.id, 0),
            pedido_counts.get(row.id, 0) and not row.plazo_proveedor and row.estado not in CLOSED_STATES,
            row.fecha_limite_siguiente_accion and row.fecha_limite_siguiente_accion < today,
            row.dias_parado > 3 and row.estado not in CLOSED_STATES,
            row.incidencia,
        ]
        if any(conditions):
            risky.append(row)
    return sort_by_risk(risky)


def get_today_rows(db: Session) -> list[dict[str, Any]]:
    rows, pedido_counts = active_rows_with_risk(db)
    today = date.today()
    output: list[Presupuesto] = []
    for row in rows:
        due_today = row.fecha_limite_siguiente_accion and row.fecha_limite_siguiente_accion <= today
        serious = row.prioridad_calculada in {"Rojo", "Crítico"}
        accepted_no_order = row.fecha_aceptacion and not pedido_counts.get(row.id, 0)
        if row.estado not in CLOSED_STATES and (due_today or serious or accepted_no_order or row.incidencia):
            output.append(row)
    return sort_by_risk(output)


def get_accepted_without_order_rows(db: Session) -> list[dict[str, Any]]:
    rows = accepted_without_order_query(db).all()
    enrich_risk(db, rows)
    return sorted([serialize(row) for row in rows], key=lambda item: item.get("dias_parado") or 0, reverse=True)


def build_reports_payload(db: Session) -> dict[str, Any]:
    rows, _pedido_counts = active_rows_with_risk(db)

    def group_count(attr: str):
        data: dict[str, int] = {}
        for row in rows:
            key = getattr(row, attr) or "Sin definir"
            data[key] = data.get(key, 0) + 1
        return [{"name": key, "value": value} for key, value in sorted(data.items())]

    accepted_by_month: dict[str, int] = {}
    cancelled_by_month: dict[str, int] = {}
    for row in rows:
        if row.fecha_aceptacion:
            key = row.fecha_aceptacion.strftime("%Y-%m")
            accepted_by_month[key] = accepted_by_month.get(key, 0) + 1
        if row.estado == "Cancelado / rechazado" and row.actualizado_en:
            key = row.actualizado_en.strftime("%Y-%m")
            cancelled_by_month[key] = cancelled_by_month.get(key, 0) + 1

    accepted_no_order = [row for row in rows if row.fecha_aceptacion and not row.pedido_proveedor_realizado]
    accepted_with_order = [row for row in rows if row.fecha_aceptacion and row.fecha_pedido_proveedor]
    avg_days = round(
        sum((row.fecha_pedido_proveedor - row.fecha_aceptacion).days for row in accepted_with_order) / len(accepted_with_order),
        1,
    ) if accepted_with_order else 0

    return {
        "presupuestos_por_estado": group_count("estado"),
        "prioridades": group_count("prioridad_calculada"),
        "aceptados_por_mes": [{"name": key, "value": value} for key, value in sorted(accepted_by_month.items())],
        "cancelados_por_mes": [{"name": key, "value": value} for key, value in sorted(cancelled_by_month.items())],
        "pendientes_por_gestor": group_count("gestor"),
        "pendientes_por_proveedor": group_count("proveedor"),
        "metricas": {
            "importe_aceptado_pendiente_pedido": round(sum(money(row.importe) for row in accepted_no_order), 2),
            "dias_medios_aceptacion_a_pedido": avg_days,
            "bloqueados": len([row for row in rows if row.estado == "Bloqueado / incidencia" or row.incidencia]),
        },
    }


def get_report_rows(
    db: Session,
    report_type: str,
    gestor: str | None = None,
    fecha_from: date | None = None,
    fecha_to: date | None = None,
    dias: int = 7,
) -> list[Presupuesto]:
    if report_type == "aceptados_sin_pedido":
        report_type = "sin_pedido"
    if report_type not in REPORT_LIST_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de reporte no válido.")

    rows, pedido_counts = active_rows_with_risk(db, include_pedidos=True)
    today = date.today()

    if report_type == "atrasados":
        rows = [
            row for row in rows
            if row.estado not in CLOSED_STATES
            and row.fecha_limite_siguiente_accion
            and row.fecha_limite_siguiente_accion < today
        ]
    elif report_type == "cancelados":
        rows = [row for row in rows if row.estado == "Cancelado / rechazado"]
    elif report_type == "sin_pedido":
        rows = [row for row in rows if row.fecha_aceptacion and not pedido_counts.get(row.id, 0)]
    elif report_type == "sin_aceptacion":
        rows = [
            row for row in rows
            if row.estado == "Enviado al cliente"
            and row.fecha_envio_cliente
            and (today - row.fecha_envio_cliente).days >= dias
        ]
    elif report_type == "en_riesgo":
        rows = [row for row in rows if row.prioridad_calculada in {"Rojo", "Crítico"} or row.incidencia]
    elif report_type == "pedidos_pendientes":
        rows = [row for row in rows if any(pedido.estado_entrega != "completado" for pedido in (row.pedidos or []))]
    elif report_type == "pedidos_completados":
        rows = [row for row in rows if row.pedidos and all(pedido.estado_entrega == "completado" for pedido in row.pedidos)]

    if gestor:
        rows = [row for row in rows if row.gestor == gestor]
    if fecha_from:
        rows = [row for row in rows if row.fecha_limite_siguiente_accion and row.fecha_limite_siguiente_accion >= fecha_from]
    if fecha_to:
        rows = [row for row in rows if row.fecha_limite_siguiente_accion and row.fecha_limite_siguiente_accion <= fecha_to]
    return sorted(rows, key=lambda row: (row.fecha_limite_siguiente_accion or date.max, row.numero_presupuesto))


def build_executive_dashboard_payload(db: Session) -> dict[str, Any]:
    rows, _pedido_counts = active_rows_with_risk(db)
    today = date.today()
    current_month = today.replace(day=1)
    active = [row for row in rows if row.estado not in CLOSED_STATES]
    accepted_no_order = [row for row in rows if row.fecha_aceptacion and not row.pedido_proveedor_realizado]
    money_at_risk_val = sum(money(row.importe) for row in accepted_no_order)

    months_data = []
    for i in range(6):
        month_date = (today - timedelta(days=30 * i)).replace(day=1)
        next_month = (month_date + timedelta(days=32)).replace(day=1)
        month_rows = [row for row in rows if row.creado_en.date() >= month_date and row.creado_en.date() < next_month]
        months_data.append({
            "mes": month_date.strftime("%Y-%m"),
            "nuevos": len(month_rows),
            "importe": round(sum(money(row.importe) for row in month_rows), 2),
        })
    months_data.reverse()

    top_importe = sorted(active, key=lambda row: money(row.importe), reverse=True)[:10]

    gestores: dict[str, dict[str, Any]] = {}
    for row in active:
        gestor = row.gestor or "Sin asignar"
        if gestor not in gestores:
            gestores[gestor] = {"total": 0, "importe": 0.0, "criticos": 0, "incidencias": 0}
        gestores[gestor]["total"] += 1
        gestores[gestor]["importe"] += money(row.importe)
        if row.prioridad_calculada in {"Rojo", "Crítico"}:
            gestores[gestor]["criticos"] += 1
        if row.incidencia:
            gestores[gestor]["incidencias"] += 1

    gestores_list = [{"gestor": key, **value} for key, value in gestores.items()]
    gestores_list = sorted(gestores_list, key=lambda item: item["importe"], reverse=True)

    return {
        "kpis": {
            "presupuestos_activos": len(active),
            "dinero_en_riesgo": round(money_at_risk_val, 2),
            "criticos": len([row for row in rows if row.prioridad_calculada == "Crítico"]),
            "incidencias_abiertas": len([row for row in rows if row.incidencia]),
            "aceptados_sin_pedido": len(accepted_no_order),
            "cerrados_mes": len([
                row for row in rows
                if row.estado == "Entregado / cerrado" and row.actualizado_en.date() >= current_month
            ]),
        },
        "tendencias": months_data,
        "top_presupuestos": [{
            "id": row.id,
            "numero": row.numero_presupuesto,
            "cliente": row.cliente,
            "importe": money(row.importe),
            "estado": row.estado,
            "prioridad": row.prioridad_calculada,
        } for row in top_importe],
        "rendimiento_gestores": [{
            "gestor": item["gestor"],
            "total": item["total"],
            "importe_total": round(item["importe"], 2),
            "criticos": item["criticos"],
            "incidencias": item["incidencias"],
        } for item in gestores_list[:10]],
        "distribucion_estados": [
            {"estado": estado, "total": len([row for row in rows if row.estado == estado])}
            for estado in ESTADOS
        ],
    }
