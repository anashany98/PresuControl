from datetime import date
import pytest
from fastapi import HTTPException

from app.models import Presupuesto
from app.rules import validate_presupuesto
from app.main import check_expected_version


def base_budget(**kw):
    data = dict(
        numero_presupuesto="P-1",
        cliente="Cliente",
        obra_referencia="Obra",
        gestor="Gestor",
        fecha_presupuesto=date(2026, 5, 1),
        importe=100.0,
        estado="Pendiente de enviar",
        pedido_proveedor_realizado=False,
        incidencia=False,
        version=3,
    )
    data.update(kw)
    return Presupuesto(**data)


def test_accepted_requires_acceptance_date():
    obj = base_budget(estado="Aceptado - pendiente pedido proveedor", responsable_actual="Compras", siguiente_accion="Hacer pedido")
    with pytest.raises(HTTPException):
        validate_presupuesto(obj, None)


def test_order_requires_provider_number_and_date():
    obj = base_budget(
        estado="Pedido proveedor realizado",
        fecha_aceptacion=date(2026, 5, 2),
        pedido_proveedor_realizado=True,
        proveedor="Proveedor",
        responsable_actual="Compras",
        siguiente_accion="Confirmar plazo",
    )
    with pytest.raises(HTTPException):
        validate_presupuesto(obj, None)


def test_cancel_requires_reason():
    obj = base_budget(estado="Cancelado / rechazado")
    with pytest.raises(HTTPException):
        validate_presupuesto(obj, None)


def test_expected_version_is_mandatory():
    obj = base_budget()
    with pytest.raises(HTTPException) as exc:
        check_expected_version(obj, None)
    assert exc.value.status_code == 422


def test_expected_version_blocks_stale_save():
    obj = base_budget()
    with pytest.raises(HTTPException) as exc:
        check_expected_version(obj, 2)
    assert exc.value.status_code == 409


def test_expected_version_accepts_current_version():
    obj = base_budget()
    check_expected_version(obj, 3)
