import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base

@pytest.fixture
def test_db():
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
        username="testuser",
        email="test@test.com",
        hashed_password="$2b$12$test",
        nombre="Test",
        apellidos="User",
        activo=True,
        aprobado=True,
    )
    test_db.add(user)
    test_db.commit()
    return user

@pytest.fixture
def sample_presupuesto(test_db, sample_user):
    from app.models import Presupuesto
    p = Presupuesto(
        numero_presupuesto="TEST-001",
        estado="Pendiente de enviar",
        cliente="Test Client",
        importe=1000.0,
        gestor=sample_user.username,
    )
    test_db.add(p)
    test_db.commit()
    return p