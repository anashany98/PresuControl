from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from html import escape
from typing import Iterable


def smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def parse_recipients(raw: str | Iterable[str] | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = raw.replace(";", ",").split(",")
    else:
        parts = list(raw)
    return [p.strip() for p in parts if p and p.strip()]


def send_email(subject: str, recipients: list[str], text: str, html: str | None = None) -> dict:
    if not recipients:
        return {"sent": False, "reason": "No hay destinatarios configurados."}
    if not smtp_configured():
        return {"sent": False, "reason": "SMTP no configurado."}

    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM", user or "")
    use_tls = os.getenv("SMTP_TLS", "true").lower() in {"1", "true", "yes", "on"}

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        if use_tls:
            smtp.starttls()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(msg)
    return {"sent": True, "recipients": recipients}


def alert_email_body(alerts: list[dict]) -> tuple[str, str]:
    lines = ["Avisos activos de PresuControl", ""]
    rows = []
    for a in alerts:
        p = a.get("presupuesto", {})
        line = f"- {a.get('tipo')}: {p.get('numero_presupuesto')} · {p.get('cliente')} · {p.get('estado')} · prioridad {p.get('prioridad_calculada')}"
        lines.append(line)
        rows.append(
            "<tr>"
            f"<td>{escape(str(a.get('tipo', '')))}</td>"
            f"<td>{escape(str(p.get('numero_presupuesto', '')))}</td>"
            f"<td>{escape(str(p.get('cliente', '')))}</td>"
            f"<td>{escape(str(p.get('estado', '')))}</td>"
            f"<td>{escape(str(p.get('responsable_actual') or ''))}</td>"
            f"<td>{escape(str(p.get('siguiente_accion') or ''))}</td>"
            f"<td>{escape(str(p.get('fecha_limite_siguiente_accion') or ''))}</td>"
            f"<td>{escape(str(p.get('prioridad_calculada', '')))}</td>"
            "</tr>"
        )
    html = """
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
      <h2>PresuControl · Avisos activos</h2>
      <p>Estos presupuestos requieren revisión interna.</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
        <thead><tr style="background:#f3f4f6"><th align="left">Aviso</th><th align="left">Presupuesto</th><th align="left">Cliente</th><th align="left">Estado</th><th align="left">Responsable</th><th align="left">Acción</th><th align="left">Vence</th><th align="left">Prioridad</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    """.replace("{rows}", "".join(rows))
    return "\n".join(lines), html
