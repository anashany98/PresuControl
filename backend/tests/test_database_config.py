import pytest

from app.database import build_engine_kwargs


def test_build_engine_kwargs_uses_pool_env_for_postgres(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "7")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "8")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "9")
    monkeypatch.setenv("DB_POOL_RECYCLE", "10")

    kwargs = build_engine_kwargs("postgresql://user:pass@db/app")

    assert kwargs == {
        "pool_pre_ping": True,
        "pool_size": 7,
        "max_overflow": 8,
        "pool_timeout": 9,
        "pool_recycle": 10,
    }


def test_build_engine_kwargs_omits_queue_pool_options_for_sqlite(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "7")

    assert build_engine_kwargs("sqlite:///test.db") == {"pool_pre_ping": True}


def test_build_engine_kwargs_rejects_invalid_pool_env(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "not-a-number")

    with pytest.raises(RuntimeError, match="DB_POOL_SIZE"):
        build_engine_kwargs("postgresql://user:pass@db/app")
