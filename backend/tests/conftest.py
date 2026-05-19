import pytest
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base

# Set environment variables before importing app modules
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["AUTH_ENABLED"] = "true"
os.environ["APP_SECRET_KEY"] = "test-secret-key-for-testing"


@pytest.fixture
def test_db():
    from app import models

    assert models.Presupuesto
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    yield db
    db.close()

@pytest.fixture
def sample_user(test_db):
    from app.models import Usuario
    user = Usuario(
        email="test@test.com",
        hashed_password="$2b$12$test",
        nombre="Test User",
        activo=True,
        aprobado=True,
    )
    test_db.add(user)
    test_db.commit()
    return user

@pytest.fixture
def sample_presupuesto(test_db, sample_user):
    from app.models import Presupuesto
    from datetime import date
    p = Presupuesto(
        numero_presupuesto="TEST-001",
        estado="Pendiente de enviar",
        cliente="Test Client",
        importe=1000.0,
        fecha_presupuesto=date.today(),
        gestor=sample_user.nombre,
    )
    test_db.add(p)
    test_db.commit()
    return p
