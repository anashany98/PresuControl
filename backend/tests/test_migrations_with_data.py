"""Tests de migraciones con datos existentes."""
import pytest
from datetime import date, datetime, timezone
from app.models import Presupuesto, Usuario, PedidoProveedor, Proveedor, Comentario
from app.auth import hash_password


def test_alembic_head_applies_on_fresh_db():
    """Verifica que la revision head de Alembic se aplica."""
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "current"],
        capture_output=True, text=True, cwd="backend",
    )
    assert result.returncode == 0


def test_models_match_alembic_schema(db_session):
    """Verifica que SQLAlchemy puede crear todas las tablas desde modelos."""
    from app.database import Base
    inspector_data = Base.metadata.tables.keys()
    expected_tables = {
        "presupuestos", "pedidos_proveedor", "comentarios", "historial_cambios",
        "app_settings", "usuarios", "email_notification_logs", "login_attempts",
        "registration_attempts", "password_reset_attempts", "in_app_notifications",
        "proveedores", "evaluaciones_proveedor", "presupuestos_proveedores",
    }
    missing = expected_tables - set(inspector_data)
    assert not missing, f"Missing tables: {missing}"


def test_presupuesto_constraints_enforced(db_session):
    """Crear presupuesto con importe negativo levanta error de integridad."""
    from sqlalchemy.exc import IntegrityError
    p = Presupuesto(
        numero_presupuesto="NEG-001", cliente="C", obra_referencia="O",
        gestor="G", fecha_presupuesto=date.today(), importe=-100,
        estado="Pendiente de enviar", version=1,
        prioridad_calculada="Verde", dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc), actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_usuario_rol_constraint_enforced(db_session):
    """Rol inválido en usuario levanta error de integridad."""
    from sqlalchemy.exc import IntegrityError
    u = Usuario(
        email="badrol@test.com", nombre="Bad", hashed_password=hash_password("password123456"),
        rol="rol_inventado",
    )
    db_session.add(u)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_pedido_estado_entrega_constraint(db_session):
    """Estado entrega inválido en pedido levanta error."""
    from sqlalchemy.exc import IntegrityError
    p = PedidoProveedor(
        presupuesto_id=1, proveedor="Test", estado_entrega="estado_inventado",
    )
    db_session.add(p)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_foreign_key_cascade_on_presupuesto_delete(db_session):
    """Eliminar presupuesto hace cascade a pedidos y comentarios."""
    p = Presupuesto(
        numero_presupuesto="CASC-001", cliente="C", obra_referencia="O",
        gestor="G", fecha_presupuesto=date.today(), importe=100,
        estado="Pendiente de enviar", version=1,
        prioridad_calculada="Verde", dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc), actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p)
    db_session.commit()
    presupuesto_id = p.id

    pedido = PedidoProveedor(presupuesto_id=presupuesto_id, proveedor="Test")
    comentario = Comentario(presupuesto_id=presupuesto_id, comentario="Test")
    db_session.add_all([pedido, comentario])
    db_session.commit()

    db_session.delete(p)
    db_session.commit()

    assert db_session.get(PedidoProveedor, pedido.id) is None
    assert db_session.get(Comentario, comentario.id) is None


def test_unique_constraint_numero_presupuesto(db_session):
    """Número de presupuesto duplicado levanta error."""
    from sqlalchemy.exc import IntegrityError
    p1 = Presupuesto(
        numero_presupuesto="UNIQ-001", cliente="C", obra_referencia="O",
        gestor="G", fecha_presupuesto=date.today(), importe=100,
        estado="Pendiente de enviar", version=1,
        prioridad_calculada="Verde", dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc), actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p1)
    db_session.commit()

    p2 = Presupuesto(
        numero_presupuesto="UNIQ-001", cliente="C", obra_referencia="O",
        gestor="G", fecha_presupuesto=date.today(), importe=100,
        estado="Pendiente de enviar", version=1,
        prioridad_calculada="Verde", dias_parado=0,
        fecha_ultima_actualizacion=datetime.now(timezone.utc),
        creado_en=datetime.now(timezone.utc), actualizado_en=datetime.now(timezone.utc),
    )
    db_session.add(p2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_unique_constraint_usuario_email(db_session):
    """Email duplicado en usuario levanta error."""
    from sqlalchemy.exc import IntegrityError
    u1 = Usuario(email="dup@test.com", nombre="U1", hashed_password=hash_password("password123456"))
    db_session.add(u1)
    db_session.commit()
    u2 = Usuario(email="dup@test.com", nombre="U2", hashed_password=hash_password("password123456"))
    db_session.add(u2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
