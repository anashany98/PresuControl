"""Tests de importación robusta: preview, confirm, edge cases."""
import io
import pytest
from datetime import date, datetime, timezone
from app.models import Presupuesto, Usuario
from app.auth import hash_password


def _auth_header(email: str) -> dict:
    from app.auth import create_access_token
    token = create_access_token(email, {"name": "Test", "role": "admin_sistema"})
    return {"Authorization": f"Bearer {token}"}


def _create_admin(db_session, email: str = "admin@test.com"):
    user = Usuario(
        email=email, nombre="Admin", hashed_password=hash_password("password123456"),
        activo=True, aprobado=True, puede_gestionar_sistema=True, rol="admin_sistema",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_presupuesto(db_session, numero: str, version: int = 1, **kwargs):
    defaults = {
        "numero_presupuesto": numero, "cliente": "Cliente", "obra_referencia": "Obra",
        "gestor": "Gestor", "fecha_presupuesto": date.today(), "importe": 1000,
        "estado": "Pendiente de enviar", "version": version,
        "prioridad_calculada": "Verde", "dias_parado": 0,
        "fecha_ultima_actualizacion": datetime.now(timezone.utc),
        "creado_en": datetime.now(timezone.utc), "actualizado_en": datetime.now(timezone.utc),
    }
    defaults.update(kwargs)
    p = Presupuesto(**defaults)
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)
    return p


def _excel_bytes(rows: list[dict]) -> bytes:
    """Create an in-memory Excel file from list of dicts."""
    try:
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        if rows:
            ws.append(list(rows[0].keys()))
            for row in rows:
                ws.append([str(v) if v is not None else "" for v in row.values()])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.read()
    except ImportError:
        # Fallback to CSV
        import csv
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()) if rows else [])
        writer.writeheader()
        for row in rows:
            writer.writerow({k: str(v) if v is not None else "" for k, v in row.items()})
        return buf.getvalue().encode("utf-8")


def _upload_file(client, rows: list[dict], mode: str = "create_only", headers: dict | None = None):
    content = _excel_bytes(rows)
    files = {"file": ("test.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    return client.post(f"/import/preview?mode={mode}", files=files, headers=headers or {})


def _valid_row(numero: str = "IMP-001", **overrides) -> dict:
    row = {
        "numero_presupuesto": numero, "cliente": "Cliente Test",
        "obra_referencia": "Obra Test", "gestor": "Gestor Test",
        "fecha_presupuesto": "2026-05-01", "importe": "1000",
        "estado": "Pendiente de enviar",
    }
    row.update(overrides)
    return row


class TestImportPreviewBasics:
    """Tests básicos de preview de importación."""

    def test_preview_valid_excel_returns_200(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        rows = [_valid_row("IMP-VAL-001"), _valid_row("IMP-VAL-002")]
        response = _upload_file(client, rows, headers=_auth_header("admin@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert data["total_filas"] == 2
        assert data["validos"] == 2
        assert data["nuevos"] == 2

    def test_preview_empty_file(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        content = _excel_bytes([])
        response = client.post(
            "/import/preview?mode=create_only",
            files={"file": ("empty.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            headers=_auth_header("admin@test.com"),
        )
        assert response.status_code in (200, 422)

    def test_preview_requires_auth(self, monkeypatch, client):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        rows = [_valid_row("IMP-AUTH-001")]
        response = _upload_file(client, rows)
        assert response.status_code == 401


class TestImportDuplicateDetection:
    """Detección de duplicados en importación."""

    def test_preview_detects_existing_in_db(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        _create_presupuesto(db_session, "IMP-DUP-001")
        rows = [_valid_row("IMP-DUP-001")]
        response = _upload_file(client, rows, headers=_auth_header("admin@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert len(data["duplicados_bd"]) >= 1

    def test_preview_detects_duplicates_in_file(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        rows = [_valid_row("IMP-DUPF-001"), _valid_row("IMP-DUPF-001")]
        response = _upload_file(client, rows, headers=_auth_header("admin@test.com"))
        assert response.status_code == 200
        data = response.json()
        assert len(data["duplicados_archivo"]) >= 1


class TestImportEdgeCases:
    """Casos límite de importación."""

    def test_preview_rejects_invalid_estado(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        rows = [_valid_row("IMP-BAD-001", estado="Estado inventado")]
        response = _upload_file(client, rows, headers=_auth_header("admin@test.com"))
        data = response.json()
        assert len(data["errores"]) >= 1

    def test_preview_rejects_negative_importe(self, monkeypatch, client, db_session):
        monkeypatch.setattr("app.auth.AUTH_ENABLED", True)
        _create_admin(db_session)
        rows = [_valid_row("IMP-NEG-001", importe="-100")]
        response = _upload_file(client, rows, headers=_auth_header("admin@test.com"))
        assert response.status_code == 200
        data = response.json()
        # Importes negativos deben ser rechazados
        assert len(data["errores"]) >= 1
        assert any("negativo" in str(e.get("error","")).lower() for e in data["errores"])
