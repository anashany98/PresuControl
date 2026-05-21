"""Shared conftest.py for all tests - MUST be used by all test files."""
import os
import pytest

# Set env vars BEFORE any app imports
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["AUTH_ENABLED"] = "false"
os.environ["APP_SECRET_KEY"] = "test-secret-key-for-testing"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# SHARED engine for all tests
test_engine = create_engine(
    "sqlite://",
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, expire_on_commit=False)

# Import app after env vars
from app.database import Base, get_db
from app.main import app
import app.database as database_module
import app.main as main_module


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def install_test_db_overrides():
    app.dependency_overrides[get_db] = override_get_db
    database_module.SessionLocal = TestingSessionLocal
    main_module.SessionLocal = TestingSessionLocal


# Override DB dependency at module level
install_test_db_overrides()

@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    """Provide a database session for each test."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    from app import models
    assert models.Presupuesto
    install_test_db_overrides()
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    install_test_db_overrides()
