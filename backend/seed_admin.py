import os

from app.database import SessionLocal
from app.models import Usuario
from app.auth import hash_password

email = os.getenv("ADMIN_EMAIL", "admin@admin.com").strip().lower()
password = os.getenv("ADMIN_PASSWORD")

if not password or len(password) < 12:
    raise SystemExit("Set ADMIN_PASSWORD with at least 12 characters before running this script.")

db = SessionLocal()

existing = db.query(Usuario).filter(Usuario.email == email).first()
if existing:
    print(f"Usuario {email} ya existe")
else:
    user = Usuario(
        email=email,
        nombre="Administrador",
        hashed_password=hash_password(password),
        activo=True,
        aprobado=True,
        puede_gestionar_sistema=True,
        rol="admin_sistema",
    )
    db.add(user)
    db.commit()
    print(f"Usuario {email} creado correctamente")

db.close()
