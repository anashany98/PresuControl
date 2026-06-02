from __future__ import annotations

import smtplib
from email.message import EmailMessage
from html import escape
from typing import Iterable

from loguru import logger
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .config import settings


def _get_smtp_settings(db: Session | None = None) -> dict:
    """Return merged SMTP settings: env vars override DB settings."""
    from .settings import get_settings

    host = settings.smtp_host
    port = settings.smtp_port
    user = settings.smtp_user
    password = settings.smtp_password
    sender = settings.smtp_from or (user or "")
    use_tls = settings.smtp_tls

    if not host or not user or not sender:
        from .database import SessionLocal
        owns_session = db is None
        if db is None:
            db = SessionLocal()
        try:
            s = get_settings(db)
            host = host or s.get("smtp_host", "")
            port = int(s.get("smtp_port", port))
            user = user or s.get("smtp_user")
            password = password or s.get("smtp_password")
            sender = sender or s.get("smtp_from", "")
            if not settings.smtp_host:
                use_tls = bool(s.get("smtp_tls", True))
        finally:
            if owns_session:
                db.close()

    return {"host": host, "port": port, "user": user, "password": password, "sender": sender, "use_tls": use_tls}


def smtp_configured(db: Session | None = None) -> bool:
    s = _get_smtp_settings(db)
    return bool(s["host"] and s["sender"])


def parse_recipients(raw: str | Iterable[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = raw.replace(";", ",").split(",")
    else:
        parts = list(raw)
    return [p.strip() for p in parts if p and p.strip()]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((smtplib.SMTPException, OSError, TimeoutError)),
    reraise=True,
)
def _send_email_smtp(msg: EmailMessage, smtp_settings: dict) -> None:
    """Send email via SMTP with automatic retry on transient failures."""
    with smtplib.SMTP(smtp_settings["host"], smtp_settings["port"], timeout=20) as smtp:
        if smtp_settings["use_tls"]:
            smtp.starttls()
        if smtp_settings["user"] and smtp_settings["password"]:
            smtp.login(smtp_settings["user"], smtp_settings["password"])
        smtp.send_message(msg)


def send_email(subject: str, recipients: list[str], text: str, html: str | None = None, db: Session | None = None) -> dict:
    if not recipients:
        return {"sent": False, "reason": "No hay destinatarios configurados."}
    if not smtp_configured(db):
        return {"sent": False, "reason": "SMTP no configurado."}

    s = _get_smtp_settings(db)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = s["sender"]
    msg["To"] = ", ".join(recipients)
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        _send_email_smtp(msg, s)
        logger.info("Email sent to {} recipients", len(recipients))
        return {"sent": True, "recipients": recipients}
    except Exception as exc:
        logger.error("Failed to send email after retries: {}", exc)
        return {"sent": False, "reason": str(exc)}


def alert_email_body(alerts: list[dict], base_url: str = "") -> tuple[str, str]:
    from datetime import datetime

    if not base_url:
        base_url = settings.app_public_url

    # --- KPIs ---------------------------------------------------------------
    critical_count = sum(1 for a in alerts if a.get("presupuesto", {}).get("prioridad_calculada") == "Crítico")
    total_count = len(alerts)
    total_importe = sum(float(a.get("presupuesto", {}).get("importe_total", 0) or 0) for a in alerts)
    importe_str = f"{total_importe:,.2f}" if total_importe else "0,00"

    priority_colors = {
        "Crítico": "#dc2626",
        "Rojo":    "#ef4444",
        "Naranja": "#f97316",
        "Amarillo":"#eab308",
        "Verde":   "#22c55e",
    }

    def badge(p: str) -> str:
        color = priority_colors.get(p, "#6b7280")
        return f'<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;color:#fff;background:{color}">{escape(p)}</span>'

    # --- Table rows ---------------------------------------------------------
    rows_html = ""
    for a in alerts:
        p = a.get("presupuesto", {})
        pres_id = p.get("id", "")
        num = escape(str(p.get("numero_presupuesto", "")))
        cliente = escape(str(p.get("cliente", "")))
        estado = escape(str(p.get("estado", "")))
        responsable = escape(str(p.get("responsable_actual") or "—"))
        tipo = escape(str(a.get("tipo", "")))
        prioridad = p.get("prioridad_calculada", "")

        if base_url and pres_id:
            pres_link = f'<a href="{base_url}/presupuestos/{pres_id}" style="color:#2563eb;text-decoration:none;font-weight:600">{num}</a>'
        else:
            pres_link = f'<span style="font-weight:600">{num}</span>'

        rows_html += (
            f'<tr style="border-bottom:1px solid #e5e7eb">'
            f'<td style="padding:12px 8px">{pres_link}</td>'
            f'<td style="padding:12px 8px"><span style="color:#111827">{cliente}</span><br><span style="color:#6b7280;font-size:12px">{estado}</span></td>'
            f'<td style="padding:12px 8px"><span style="color:#374151">{responsable}</span><br><span style="color:#9ca3af;font-size:12px">{tipo}</span></td>'
            f'<td style="padding:12px 8px">{badge(prioridad)}</td>'
            f'</tr>'
        )

    footer_cta = ""
    if base_url:
        footer_cta = (
            f'<p style="text-align:center;margin:28px 0 0">'
            f'<a href="{base_url}/presupuestos" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">'
            f'Ver todos en PresuControl'
            f'</a></p>'
        )

    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")

    text_lines = ["Avisos activos de PresuControl", ""]
    for a in alerts:
        p = a.get("presupuesto", {})
        text_lines.append(f"- {a.get('tipo')}: {p.get('numero_presupuesto')} · {p.get('cliente')} · {p.get('estado')} · prioridad {p.get('prioridad_calculada')}")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avisos PresuControl</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

<div style="background:#1c1917;padding:24px 32px;text-align:center">
  <div style="display:inline-block;background:#fff;border-radius:6px;padding:6px 16px;margin-bottom:12px">
    <span style="font-size:18px;font-weight:800;color:#1c1917;letter-spacing:-0.5px">Presu</span><span style="font-size:18px;font-weight:800;color:#dc2626">Control</span>
  </div>
  <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff">Avisos activos</h1>
  <p style="margin:6px 0 0;font-size:13px;color:#a8a29e">{now_str}</p>
</div>

<table width="100%" style="max-width:560px;margin:24px auto;border-collapse:collapse">
  <tr>
    <td style="padding:16px;background:#fff;border-radius:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:12px">
      <div style="font-size:28px;font-weight:800;color:#dc2626">{critical_count}</div>
      <div style="font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Críticos</div>
    </td>
    <td style="padding:16px;background:#fff;border-radius:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:12px">
      <div style="font-size:28px;font-weight:800;color:#1c1917">{total_count}</div>
      <div style="font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Total alertas</div>
    </td>
    <td style="padding:16px;background:#fff;border-radius:10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:12px">
      <div style="font-size:28px;font-weight:800;color:#1c1917">{importe_str} €</div>
      <div style="font-size:12px;color:#6b7280;font-weight:500;text-transform:uppercase;letter-spacing:.5px">Importe en riesgo</div>
    </td>
  </tr>
</table>

<div style="max-width:560px;margin:0 auto 24px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb">Presupuesto</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb">Cliente / Estado</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb">Responsable / Tipo</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb">Prioridad</th>
      </tr>
    </thead>
    <tbody>{rows_html}</tbody>
  </table>
</div>

{footer_cta}

<p style="text-align:center;font-size:11px;color:#9ca3af;max-width:560px;margin:0 auto 24px">
  No respondas a este email · PresuControl · Automatizado
</p>

</body>
</html>"""

    return "\n".join(text_lines), html
