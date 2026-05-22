from datetime import date

from app.models import AppSetting, PedidoProveedor, Presupuesto, Proveedor
from app.settings import SettingsCache
from app.main import provider_catalog_values
from sqlalchemy.exc import SQLAlchemyError


def test_metadata_options_merges_settings_and_existing_values(client, db_session):
    db_session.add(AppSetting(key="gestores", value='["Comercial", "Compras"]'))
    db_session.add(AppSetting(key="proveedores", value='["Proveedor Config"]'))
    db_session.add(
        Presupuesto(
            numero_presupuesto="P-OPT-1",
            cliente="Cliente",
            obra_referencia="Obra",
            gestor="Ana Ventas",
            fecha_presupuesto=date.today(),
            importe=100,
            estado="Pendiente de enviar",
            proveedor="Proveedor Presupuesto",
        )
    )
    db_session.add(
        Presupuesto(
            numero_presupuesto="P-OPT-2",
            cliente="Cliente 2",
            obra_referencia="Obra 2",
            gestor="  ",
            fecha_presupuesto=date.today(),
            importe=200,
            estado="Pendiente de enviar",
            proveedor="Proveedor Presupuesto",
        )
    )
    db_session.add(
        PedidoProveedor(
            presupuesto_id=1,
            proveedor="Proveedor Pedido",
            numero_pedido="PP-1",
        )
    )
    db_session.add(Proveedor(nombre="Proveedor Maestro"))
    db_session.commit()
    SettingsCache.invalidate()

    response = client.get("/metadata/options")

    assert response.status_code == 200
    data = response.json()
    assert data["gestores"] == ["Ana Ventas", "Comercial", "Compras"]
    assert data["proveedores"] == [
        "Proveedor Config",
        "Proveedor Maestro",
        "Proveedor Pedido",
        "Proveedor Presupuesto",
    ]


def test_provider_catalog_values_tolerates_missing_catalog_table():
    class BrokenQuery:
        def filter(self, *args, **kwargs):
            return self

        def distinct(self):
            return self

        def all(self):
            raise SQLAlchemyError("missing table")

    class BrokenDb:
        rolled_back = False

        def query(self, *args, **kwargs):
            return BrokenQuery()

        def rollback(self):
            self.rolled_back = True

    db = BrokenDb()

    assert provider_catalog_values(db) == []
    assert db.rolled_back is True
