from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.main import enforce_login_rate_limit, register_failed_login, clear_failed_logins


def fake_request(ip="127.0.0.1"):
    return SimpleNamespace(client=SimpleNamespace(host=ip))


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    yield db
    db.close()


def test_login_rate_limit_blocks_after_failures(test_db):
    import os
    original = os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS")
    os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = "2"
    try:
        req = fake_request()
        email = "test@example.com"
        register_failed_login(email, req, test_db)
        register_failed_login(email, req, test_db)
        register_failed_login(email, req, test_db)
        with pytest.raises(HTTPException) as exc:
            enforce_login_rate_limit(email, req, test_db)
        assert exc.value.status_code == 429
    finally:
        if original is not None:
            os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = original
        elif "LOGIN_RATE_LIMIT_ATTEMPTS" in os.environ:
            del os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"]


def test_clear_failed_logins_resets_counter(test_db):
    req = fake_request()
    email = "test@example.com"
    register_failed_login(email, req, test_db)
    register_failed_login(email, req, test_db)
    clear_failed_logins(email, req, test_db)
    enforce_login_rate_limit(email, req, test_db)


def test_rate_limit_per_ip(test_db):
    import os
    original = os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS")
    os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = "2"
    try:
        req1 = fake_request("192.168.1.1")
        req2 = fake_request("192.168.1.2")
        email = "test@example.com"
        for _ in range(3):
            register_failed_login(email, req1, test_db)
        with pytest.raises(HTTPException):
            enforce_login_rate_limit(email, req1, test_db)
        enforce_login_rate_limit(email, req2, test_db)
    finally:
        if original is not None:
            os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"] = original
        elif "LOGIN_RATE_LIMIT_ATTEMPTS" in os.environ:
            del os.environ["LOGIN_RATE_LIMIT_ATTEMPTS"]