"""Tests for sidebar counters, search, and reports."""
import pytest


class TestSidebarCounters:

    def test_sidebar_counters_returns_expected_keys(self, client, db_session):
        """GET /sidebar-counters devuelve todas las claves esperadas."""
        response = client.get("/sidebar-counters")
        assert response.status_code == 200
        data = response.json()
        assert "hoy" in data
        assert "aceptados_sin_pedido" in data

    def test_sidebar_counters_returns_all_expected_fields(self, client, db_session):
        """GET /sidebar-counters devuelve todos los campos documentados."""
        response = client.get("/sidebar-counters")
        assert response.status_code == 200
        data = response.json()
        expected_keys = {
            "hoy", "aceptados_sin_pedido", "riesgo", "incidencias",
            "usuarios_pendientes", "dinero_riesgo"
        }
        assert expected_keys.issubset(data.keys()), f"Missing keys: {expected_keys - set(data.keys())}"

    def test_sidebar_counters_values_are_integers_or_float(self, client, db_session):
        """Los contadores son enteros (o float para dinero_riesgo)."""
        response = client.get("/sidebar-counters")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["hoy"], int)
        assert isinstance(data["aceptados_sin_pedido"], int)
        assert isinstance(data["riesgo"], int)
        assert isinstance(data["incidencias"], int)
        assert isinstance(data["usuarios_pendientes"], int)
        assert isinstance(data["dinero_riesgo"], (int, float))


class TestSearch:

    def test_search_returns_results(self, client, db_session):
        """GET /search?q=... devuelve presupuestos, comentarios, historial."""
        response = client.get("/search?q=test&page=1&page_size=20")
        assert response.status_code == 200
        data = response.json()
        assert "presupuestos" in data
        assert "comentarios" in data
        assert "historial" in data

    def test_search_pagination_fields_present(self, client, db_session):
        """Search devuelve campos de paginación completos."""
        response = client.get("/search?q=texto&page=2&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert "total_presupuestos" in data
        assert "total_pages" in data
        assert "total_comentarios" in data
        assert "total_historial" in data
        assert "page" in data
        assert "page_size" in data

    def test_search_page_size_max_enforced(self, client, db_session):
        """page_size > 200 devuelve 422."""
        response = client.get("/search?q=test&page=1&page_size=201")
        assert response.status_code == 422

    def test_search_page_size_100_is_valid(self, client, db_session):
        """page_size=100 es válido."""
        response = client.get("/search?q=test&page=1&page_size=100")
        assert response.status_code == 200

    def test_search_page_minimum_is_1(self, client, db_session):
        """page=0 devuelve 422."""
        response = client.get("/search?q=test&page=0&page_size=20")
        assert response.status_code == 422

    def test_search_pagination_page_and_page_size(self, client, db_session):
        """Pagination info se devuelve correctamente."""
        response = client.get("/search?q=test&page=2&page_size=10")
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 2
        assert data["page_size"] == 10

    def test_search_response_has_total_presupuestos(self, client, db_session):
        """total_presupuestos es un entero."""
        response = client.get("/search?q=test&page=1&page_size=20")
        assert response.status_code == 200
        data = response.json()
        assert "total_presupuestos" in data
        assert isinstance(data["total_presupuestos"], int)

    def test_search_response_has_total_pages(self, client, db_session):
        """total_pages es un entero."""
        response = client.get("/search?q=test&page=1&page_size=20")
        assert response.status_code == 200
        data = response.json()
        assert "total_pages" in data
        assert isinstance(data["total_pages"], int)


class TestReportsList:

    def test_reports_list_type_sin_pedido(self, client, db_session):
        """GET /reports/list?type=sin_pedido devuelve array."""
        response = client.get("/reports/list?type=sin_pedido")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_reports_list_type_atrasados(self, client, db_session):
        """GET /reports/list?type=atrasados devuelve array."""
        response = client.get("/reports/list?type=atrasados")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_reports_list_type_aceptados_sin_pedido(self, client, db_session):
        """GET /reports/list?type=aceptados_sin_pedido devuelve array."""
        response = client.get("/reports/list?type=aceptados_sin_pedido")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestReportsExport:

    def test_reports_export_list_returns_excel(self, client, db_session):
        """POST /reports/export-list devuelve Excel file."""
        response = client.post(
            "/reports/export-list",
            json={"filename": "test.xlsx", "items": []},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")

    def test_reports_export_list_with_items(self, client, db_session):
        """POST /reports/export-list con items devuelve Excel."""
        response = client.post(
            "/reports/export-list",
            json={
                "filename": "reporte.xlsx",
                "items": [
                    {"numero": "TEST-001", "cliente": "Cliente 1", "estado": "Pendiente"},
                    {"numero": "TEST-002", "cliente": "Cliente 2", "estado": "Enviado"},
                ],
            },
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats" in response.headers["content-type"]