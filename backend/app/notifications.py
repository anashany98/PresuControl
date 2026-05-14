from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo
import os
from html import escape
from sqlalchemy.orm import Session

from .emailer import alert_email_body, parse_recipients, send_email
from .models import EmailNotificationLog, Presupuesto
from .rules import CLOSED_STATES, calculate_risk, days_between
from .settings import get_settings


def serialize_alert_presupuesto(r: Presupuesto) -> dict:
    return {
        "id": r.id,
        "numero_presupuesto": r.numero_presupuesto,
        "cliente": r.cliente,
        "obra_referencia": r.obra_referencia,
        "gestor": r.gestor,
        "estado": r.estado,
        "importe": r.importe,
        "fecha_aceptacion": r.fecha_aceptacion,
        "proveedor": r.proveedor,
        "pedido_proveedor_realizado": r.pedido_proveedor_realizado,
        "fecha_pedido_proveedor": r.fecha_pedido_proveedor,
        "plazo_proveedor": r.plazo_proveedor,
        "responsable_actual": r.responsable_actual,
        "siguiente_accion": r.siguiente_accion,
        "fecha_limite_siguiente_accion": r.fecha_limite_siguiente_accion,
        "incidencia": r.incidencia,
        "prioridad_calculada": r.prioridad_calculada,
        "dias_parado": r.dias_parado,
        "fecha_ultima_actualizacion": r.fecha_ultima_actualizacion,
        "version": getattr(r, "version", 1),
    }


def build_alerts(db: Session) -> list[dict]:
    rows = db.query(Presupuesto).filter(Presupuesto.archivado == False).all()  # noqa: E712
    output: list[dict] = []
    today = date.today()
    settings = get_settings(db)
    stale_days = int(settings.get("dias_sin_actualizar_aviso", 3) or 3)

    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings)
        p = serialize_alert_presupuesto(r)
        if r.fecha_aceptacion and not r.pedido_proveedor_realizado:
            output.append({"tipo": "Presupuesto aceptado sin pedido proveedor", "presupuesto": p})
        if r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion < today:
            output.append({"tipo": "Fecha límite vencida", "presupuesto": p})
        if r.pedido_proveedor_realizado and not r.plazo_proveedor and r.estado not in CLOSED_STATES:
            output.append({"tipo": "Pedido proveedor sin plazo confirmado", "presupuesto": p})
        if r.incidencia:
            output.append({"tipo": "Incidencia abierta", "presupuesto": p})
        if r.estado == "Enviado al cliente":
            output.append({"tipo": "Presupuesto enviado sin respuesta", "presupuesto": p})
        if r.estado not in CLOSED_STATES and r.dias_parado >= stale_days:
            output.append({"tipo": "Presupuesto sin actualizar", "presupuesto": p})
    db.commit()
    return output


def build_fingerprints_set(db: Session, fingerprints: list[str]) -> set[str]:
    if not fingerprints:
        return set()
    return set(row[0] for row in db.query(EmailNotificationLog.fingerprint).filter(EmailNotificationLog.fingerprint.in_(fingerprints)).all())


def log_exists_batch(db: Session, fingerprint: str, existing: set[str]) -> bool:
    return fingerprint in existing


def _log_exists(db: Session, fingerprint: str) -> bool:
    return db.query(EmailNotificationLog).filter(EmailNotificationLog.fingerprint == fingerprint).first() is not None


def _add_log(db: Session, *, tipo: str, fingerprint: str, sent_to: str, result: dict, presupuesto_id: int | None = None, escalation_level: int = 0, _existing: set[str] | None = None):
    if _existing is not None:
        if fingerprint in _existing:
            return
    elif _log_exists(db, fingerprint):
        return
    db.add(EmailNotificationLog(
        presupuesto_id=presupuesto_id,
        tipo=tipo,
        fingerprint=fingerprint,
        sent_to=sent_to,
        status="sent" if result.get("sent") else "skipped",
        error=result.get("reason"),
        escalation_level=escalation_level,
    ))


def send_alert_digest(db: Session, only_critical: bool = False, fingerprint_prefix: str | None = None) -> dict:
    settings = get_settings(db)
    if not settings.get("email_avisos_activo"):
        return {"sent": False, "reason": "Avisos por email desactivados."}
    recipients = parse_recipients(settings.get("emails_destino_avisos"))
    alerts = build_alerts(db)
    if only_critical:
        alerts = [a for a in alerts if a["presupuesto"].get("prioridad_calculada") in {"Rojo", "Crítico"}]
    if not alerts:
        return {"sent": False, "reason": "No hay avisos activos.", "alerts": 0}

    prefix = fingerprint_prefix or date.today().isoformat()
    fingerprint = f"{prefix}:digest:{'critical' if only_critical else 'all'}"
    existing = build_fingerprints_set(db, [fingerprint])
    if fingerprint in existing:
        return {"sent": False, "reason": "El resumen ya se ha enviado para este periodo.", "alerts": len(alerts)}

    text, html = alert_email_body(alerts)
    subject = settings.get("asunto_email_avisos") or "PresuControl · Avisos activos"
    try:
        result = send_email(subject, recipients, text, html)
    except Exception as exc:
        result = {"sent": False, "reason": str(exc)}
    _add_log(
        db,
        tipo="digest_critico" if only_critical else "digest",
        fingerprint=fingerprint,
        sent_to=", ".join(recipients),
        result=result,
        _existing=existing,
    )
    db.commit()
    result["alerts"] = len(alerts)
    return result


def send_immediate_alerts_for_budget(db: Session, presupuesto: Presupuesto) -> dict:
    settings = get_settings(db)
    if not settings.get("email_avisos_activo") or not settings.get("enviar_email_criticos_inmediato"):
        return {"sent": False, "reason": "Avisos inmediatos desactivados."}
    presupuesto.prioridad_calculada, presupuesto.dias_parado = calculate_risk(presupuesto, db, settings)
    alerts = []
    if presupuesto.prioridad_calculada not in {"Rojo", "Crítico"}:
        return {"sent": False, "reason": "No es rojo/crítico."}
    if presupuesto.fecha_aceptacion and not presupuesto.pedido_proveedor_realizado:
        alerts.append({"tipo": "Presupuesto aceptado sin pedido proveedor", "presupuesto": serialize_alert_presupuesto(presupuesto)})
    if presupuesto.pedido_proveedor_realizado and not presupuesto.plazo_proveedor and presupuesto.estado not in CLOSED_STATES:
        alerts.append({"tipo": "Pedido proveedor sin plazo confirmado", "presupuesto": serialize_alert_presupuesto(presupuesto)})
    if presupuesto.incidencia:
        alerts.append({"tipo": "Incidencia abierta", "presupuesto": serialize_alert_presupuesto(presupuesto)})
    if not alerts:
        return {"sent": False, "reason": "Sin alerta inmediata."}

    fingerprints = [f"{date.today().isoformat()}:{alert['tipo']}:{presupuesto.id}" for alert in alerts]
    existing = build_fingerprints_set(db, fingerprints)

    sent = []
    recipients = parse_recipients(settings.get("emails_destino_avisos"))
    for alert in alerts:
        fingerprint = f"{date.today().isoformat()}:{alert['tipo']}:{presupuesto.id}"
        if log_exists_batch(db, fingerprint, existing):
            continue
        text, html = alert_email_body([alert])
        try:
            result = send_email(f"PresuControl · {alert['tipo']}", recipients, text, html)
        except Exception as exc:
            result = {"sent": False, "reason": str(exc)}
        _add_log(
            db,
            presupuesto_id=presupuesto.id,
            tipo=alert["tipo"],
            fingerprint=fingerprint,
            sent_to=", ".join(recipients),
            result=result,
            _existing=existing,
        )
        sent.append(result)
    db.commit()
    return {"results": sent, "count": len(sent)}


def money_at_risk(db: Session) -> dict:
    settings = get_settings(db)
    rows = db.query(Presupuesto).filter(Presupuesto.archivado == False).all()  # noqa: E712
    today = date.today()
    stale_days = int(settings.get("dias_sin_actualizar_aviso", 3) or 3)

    buckets = {
        "aceptados_sin_pedido": {"label": "Aceptados sin pedido proveedor", "count": 0, "importe": 0.0, "items": []},
        "pedidos_sin_plazo": {"label": "Pedidos proveedor sin plazo", "count": 0, "importe": 0.0, "items": []},
        "fechas_vencidas": {"label": "Fechas límite vencidas", "count": 0, "importe": 0.0, "items": []},
        "incidencias": {"label": "Incidencias abiertas", "count": 0, "importe": 0.0, "items": []},
        "sin_actualizar": {"label": "Sin actualizar", "count": 0, "importe": 0.0, "items": []},
    }
    unique: dict[int, Presupuesto] = {}

    def add(bucket: str, row: Presupuesto):
        row.prioridad_calculada, row.dias_parado = calculate_risk(row, db, settings)
        buckets[bucket]["count"] += 1
        buckets[bucket]["importe"] += float(row.importe or 0)
        buckets[bucket]["items"].append(serialize_alert_presupuesto(row))
        unique[row.id] = row

    for r in rows:
        r.prioridad_calculada, r.dias_parado = calculate_risk(r, db, settings)
        if r.estado in CLOSED_STATES:
            continue
        if r.fecha_aceptacion and not r.pedido_proveedor_realizado:
            add("aceptados_sin_pedido", r)
        if r.pedido_proveedor_realizado and not r.plazo_proveedor:
            add("pedidos_sin_plazo", r)
        if r.fecha_limite_siguiente_accion and r.fecha_limite_siguiente_accion < today:
            add("fechas_vencidas", r)
        if r.incidencia:
            add("incidencias", r)
        if r.dias_parado >= stale_days:
            add("sin_actualizar", r)

    total_importe = round(sum(float(r.importe or 0) for r in unique.values()), 2)
    for b in buckets.values():
        b["importe"] = round(b["importe"], 2)
        b["items"] = sorted(b["items"], key=lambda x: (x.get("prioridad_calculada") != "Crítico", -(x.get("importe") or 0)))[:12]
    return {
        "total_presupuestos_en_riesgo": len(unique),
        "importe_total_en_riesgo": total_importe,
        "buckets": buckets,
    }


def _alert_age_hours(presupuesto: dict) -> float:
    raw = presupuesto.get("fecha_ultima_actualizacion")
    if not raw:
        return 0.0
    if isinstance(raw, datetime):
        dt = raw
    else:
        text = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max((datetime.now(timezone.utc) - dt).total_seconds() / 3600, 0)


def _escalation_level(age_hours: float, settings: dict) -> int:
    if age_hours >= float(settings.get("horas_escalado_nivel_3", 72) or 72):
        return 3
    if age_hours >= float(settings.get("horas_escalado_nivel_2", 48) or 48):
        return 2
    if age_hours >= float(settings.get("horas_escalado_nivel_1", 24) or 24):
        return 1
    return 0


def _escalation_email_body(alert: dict, level: int, age_hours: float) -> tuple[str, str]:
    p = alert["presupuesto"]
    text = (
        f"Escalado nivel {level} · PresuControl\n\n"
        f"{alert['tipo']}\n"
        f"Presupuesto: {p.get('numero_presupuesto')}\n"
        f"Cliente: {p.get('cliente')}\n"
        f"Importe: {p.get('importe')} €\n"
        f"Responsable: {p.get('responsable_actual') or 'Sin responsable'}\n"
        f"Acción: {p.get('siguiente_accion') or 'Sin acción'}\n"
        f"Horas sin actualización: {round(age_hours, 1)}\n"
    )
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
      <h2>PresuControl · Escalado nivel {level}</h2>
      <p><strong>{escape(str(alert['tipo']))}</strong></p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
        <tbody>
          <tr><td><strong>Presupuesto</strong></td><td>{escape(str(p.get('numero_presupuesto')))}</td></tr>
          <tr><td><strong>Cliente</strong></td><td>{escape(str(p.get('cliente')))}</td></tr>
          <tr><td><strong>Importe</strong></td><td>{escape(str(p.get('importe')))} €</td></tr>
          <tr><td><strong>Estado</strong></td><td>{escape(str(p.get('estado')))}</td></tr>
          <tr><td><strong>Responsable</strong></td><td>{escape(str(p.get('responsable_actual') or 'Sin responsable'))}</td></tr>
          <tr><td><strong>Siguiente acción</strong></td><td>{escape(str(p.get('siguiente_accion') or 'Sin acción'))}</td></tr>
          <tr><td><strong>Horas sin actualización</strong></td><td>{round(age_hours, 1)}</td></tr>
        </tbody>
      </table>
      <p>Este aviso se escala porque nadie ha actualizado el presupuesto dentro del plazo configurado.</p>
    </div>
    """
    return text, html


def send_escalation_alerts(db: Session) -> dict:
    settings = get_settings(db)
    if not settings.get("email_avisos_activo"):
        return {"sent": False, "reason": "Avisos por email desactivados.", "count": 0}
    if not settings.get("escalado_automatico_activo"):
        return {"sent": False, "reason": "Escalado automático desactivado.", "count": 0}

    base_recipients = parse_recipients(settings.get("emails_destino_avisos"))
    escalation_recipients = parse_recipients(settings.get("emails_escalado_avisos"))
    sent = []

    alerts = build_alerts(db)
    seen_budget_ids: set[int] = set()
    escalation_fingerprints: list[str] = []
    for alert in alerts:
        p = alert["presupuesto"]
        if p.get("prioridad_calculada") not in {"Rojo", "Crítico"}:
            continue
        if p["id"] in seen_budget_ids:
            continue
        seen_budget_ids.add(p["id"])
        age_hours = _alert_age_hours(p)
        level = _escalation_level(age_hours, settings)
        if level == 0:
            continue
        escalation_fingerprints.append(f"{date.today().isoformat()}:escalado:{level}:{p['id']}")

    existing = build_fingerprints_set(db, escalation_fingerprints)

    seen_budget_ids.clear()
    for alert in alerts:
        p = alert["presupuesto"]
        if p.get("prioridad_calculada") not in {"Rojo", "Crítico"}:
            continue
        if p["id"] in seen_budget_ids:
            continue
        seen_budget_ids.add(p["id"])
        age_hours = _alert_age_hours(p)
        level = _escalation_level(age_hours, settings)
        if level == 0:
            continue
        recipients = base_recipients + (escalation_recipients if level >= 2 else [])
        recipients = list(dict.fromkeys(recipients))
        fingerprint = f"{date.today().isoformat()}:escalado:{level}:{p['id']}"
        if log_exists_batch(db, fingerprint, existing):
            continue
        text, html = _escalation_email_body(alert, level, age_hours)
        try:
            result = send_email(f"PresuControl · Escalado nivel {level} · {p.get('numero_presupuesto')}", recipients, text, html)
        except Exception as exc:
            result = {"sent": False, "reason": str(exc)}
        _add_log(
            db,
            presupuesto_id=p["id"],
            tipo="escalado",
            fingerprint=fingerprint,
            sent_to=", ".join(recipients),
            result=result,
            escalation_level=level,
            _existing=existing,
        )
        sent.append(result)
    db.commit()
    return {"sent": bool(sent), "count": len(sent), "results": sent}


def _parse_hora(value: str | None) -> time:
    try:
        h, m = (value or "08:30").split(":")[:2]
        return time(hour=int(h), minute=int(m))
    except Exception:
        return time(hour=8, minute=30)


def run_automatic_alert_checks(db: Session) -> dict:
    settings = get_settings(db)
    if not settings.get("avisos_automaticos_activos"):
        return {"active": False, "reason": "Avisos automáticos desactivados."}

    result: dict = {"active": True, "daily_digest": None, "escalations": None}
    tz = ZoneInfo(os.getenv("APP_TIMEZONE", "Europe/Madrid"))
    now = datetime.now(tz)
    if settings.get("resumen_diario_automatico_activo") and now.time() >= _parse_hora(settings.get("hora_resumen_diario")):
        result["daily_digest"] = send_alert_digest(db, only_critical=False, fingerprint_prefix=f"automatic:{date.today().isoformat()}")
    if settings.get("escalado_automatico_activo"):
        result["escalations"] = send_escalation_alerts(db)
    return result
