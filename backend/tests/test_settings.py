import pytest

from app.settings import SettingsCache, get_settings, update_settings


def test_update_settings_normalizes_editable_lists(db_session):
    SettingsCache.invalidate()

    update_settings(db_session, {
        "gestores": [" Ana ", "ana", "", "Compras "],
        "proveedores": [" Textiles Norte ", "textiles norte", "Herrajes Sur"],
        "emails_destino_avisos": [" compras@example.com ", "", "compras@example.com"],
    })

    settings = get_settings(db_session)
    assert settings["gestores"] == ["Ana", "Compras"]
    assert settings["proveedores"] == ["Textiles Norte", "Herrajes Sur"]
    assert settings["emails_destino_avisos"] == ["compras@example.com"]


def test_update_settings_rejects_invalid_email_and_time(db_session):
    SettingsCache.invalidate()

    with pytest.raises(ValueError, match="emails_destino_avisos"):
        update_settings(db_session, {"emails_destino_avisos": ["sin-arroba"]})

    with pytest.raises(ValueError, match="hora_resumen_diario"):
        update_settings(db_session, {"hora_resumen_diario": "25:99"})
