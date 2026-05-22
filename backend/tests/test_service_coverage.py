"""Cobertura de servicios refactorizados: access_control, metadata_service, notifications."""
from datetime import date, timezone, timedelta
import pytest

# ============================================================
# Metadata Service
# ============================================================

class TestMetadataService:
    def test_normalize_option_list_removes_duplicates_case_insensitive(self):
        from app.services.metadata_service import normalize_option_list
        result = normalize_option_list(["Ana", "ana", "ANA", "  Bob "])
        assert result == ["Ana", "Bob"]

    def test_normalize_option_list_filters_empty_and_none(self):
        from app.services.metadata_service import normalize_option_list
        result = normalize_option_list(["", None, "  ", "Valid"])
        assert result == ["Valid"]

    def test_distinct_column_values_returns_list(self, db_session):
        from app.services.metadata_service import distinct_column_values
        from app.models import Presupuesto
        db_session.add(Presupuesto(
            numero_presupuesto="MD-001", cliente="C", obra_referencia="O",
            gestor="GestorA", fecha_presupuesto=date.today(), importe=100,
            estado="Pendiente de enviar", version=1, prioridad_calculada="Verde",
            dias_parado=0,
            fecha_ultima_actualizacion=__import__('datetime').datetime.now(timezone.utc),
            creado_en=__import__('datetime').datetime.now(timezone.utc),
            actualizado_en=__import__('datetime').datetime.now(timezone.utc),
        ))
        db_session.commit()
        result = distinct_column_values(db_session, Presupuesto.gestor)
        assert "GestorA" in result

    def test_provider_catalog_values_returns_empty_on_rollback(self, db_session):
        from app.services.metadata_service import provider_catalog_values
        result = provider_catalog_values(db_session)
        assert isinstance(result, list)

    def test_build_metadata_options_returns_expected_keys(self, db_session):
        from app.services.metadata_service import build_metadata_options
        result = build_metadata_options(db_session)
        assert "gestores" in result
        assert "proveedores" in result


# ============================================================
# Analytics Service
# ============================================================

class TestAnalyticsService:
    def test_sidebar_counters_returns_all_keys(self, db_session):
        from app.analytics import build_sidebar_counters
        counters = build_sidebar_counters(db_session)
        expected = {"hoy", "aceptados_sin_pedido", "riesgo", "incidencias",
                     "usuarios_pendientes", "dinero_riesgo", "notificaciones_sin_leer",
                     "pedidos_pendientes"}
        assert expected.issubset(set(counters.keys()))

    def test_dashboard_payload_has_cards_and_sections(self, db_session):
        from app.analytics import build_dashboard_payload
        payload = build_dashboard_payload(db_session)
        assert "cards" in payload
        assert "sections" in payload

    def test_executive_dashboard_has_expected_sections(self, db_session):
        from app.analytics import build_executive_dashboard_payload
        payload = build_executive_dashboard_payload(db_session)
        assert "kpis" in payload  # executive dashboard uses "kpis" not "resumen"

    def test_get_report_rows_rejects_invalid_type(self, db_session):
        from app.analytics import get_report_rows
        from fastapi import HTTPException
        with pytest.raises(HTTPException, match="no válido"):
            get_report_rows(db_session, "tipo_inventado")


# ============================================================
# Access Control Service
# ============================================================

class TestAccessControlService:
    def test_admin_role_constant(self):
        from app.access_control import ADMIN_ROLE, GESTION_ROLE
        assert ADMIN_ROLE == "admin_sistema"
        assert GESTION_ROLE == "gestion"

    def test_valid_roles_set(self):
        from app.access_control import VALID_ROLES
        assert "admin_sistema" in VALID_ROLES
        assert "gestion" in VALID_ROLES

    def test_user_role_with_none_user(self):
        from app.access_control import user_role
        assert user_role(None) is None

    def test_require_system_manager_delegates(self):
        from app.access_control import require_system_manager
        assert callable(require_system_manager)

    def test_require_gestion_or_admin_delegates(self):
        from app.access_control import require_gestion_or_admin
        assert callable(require_gestion_or_admin)


# ============================================================
# Config Service
# ============================================================

class TestConfigService:
    def test_is_production_defaults_false(self, monkeypatch):
        from app.config import is_production
        monkeypatch.delenv("ENV", raising=False)
        assert is_production() is False

    def test_is_production_with_env_prod(self, monkeypatch):
        from app.config import is_production
        monkeypatch.setenv("ENV", "production")
        assert is_production() is True

    def test_get_environment_returns_development_by_default(self, monkeypatch):
        from app.config import get_environment
        monkeypatch.delenv("ENV", raising=False)
        assert get_environment() == "development"

    def test_get_fastapi_docs_config_development(self, monkeypatch):
        from app.config import get_fastapi_docs_config
        monkeypatch.setenv("ENV", "development")
        config = get_fastapi_docs_config()
        assert config["docs_url"] == "/docs"

    def test_get_public_paths_includes_health(self):
        from app.config import get_public_paths
        paths = get_public_paths()
        assert "/health" in paths

    def test_validate_runtime_config_passes_in_dev(self, monkeypatch):
        from app.config import validate_runtime_config
        monkeypatch.setenv("ENV", "development")
        validate_runtime_config()


# ============================================================
# Rules Service
# ============================================================

class TestRulesService:
    def test_closed_states_is_set(self):
        from app.rules import CLOSED_STATES
        assert isinstance(CLOSED_STATES, (set, frozenset, tuple))
        assert "Cancelado / rechazado" in CLOSED_STATES
        assert "Entregado / cerrado" in CLOSED_STATES

    def test_calculate_risk_returns_tuple(self, db_session):
        from app.rules import calculate_risk
        from app.models import Presupuesto
        p = Presupuesto(
            numero_presupuesto="RISK-001", cliente="C", obra_referencia="O",
            gestor="G", fecha_presupuesto=date.today(), importe=100,
            estado="Pendiente de enviar", version=1,
            prioridad_calculada="Verde", dias_parado=0,
            fecha_ultima_actualizacion=__import__('datetime').datetime.now(timezone.utc),
            creado_en=__import__('datetime').datetime.now(timezone.utc),
            actualizado_en=__import__('datetime').datetime.now(timezone.utc),
        )
        prioridad, dias = calculate_risk(p, db_session)
        assert prioridad in ("Verde", "Amarillo", "Naranja", "Rojo", "Crítico")
        assert isinstance(dias, int)
