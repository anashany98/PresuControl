from app.database import SessionLocal
from app.models import Usuario
from app.auth import hash_password

db = SessionLocal()

existing = db.query(Usuario).filter(Usuario.email == "admin@admin.com").first()
if existing:
    print(f"Usuario admin@admin.com ya existe")
else:
    user = Usuario(
        email="admin@admin.com",
        nombre="Administrador",
        hashed_password=hash_password("123123"),
        activo=True,
        aprobado=True,
        puede_gestionar_sistema=True,
    )
    db.add(user)
    db.commit()
    print(f"✓ Usuario admin@admin.com creado correctamente")

db.close()