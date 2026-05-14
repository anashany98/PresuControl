import random
from datetime import date, timedelta
from alembic import command
from alembic.config import Config
from app.database import Base, engine, SessionLocal
from app.models import Usuario, Presupuesto, Comentario, HistorialCambio

ESTADOS = [
    "Pendiente de enviar",
    "Enviado al cliente",
    "Aceptado - pendiente pedido proveedor",
    "Pedido proveedor realizado",
    "Plazo proveedor confirmado",
    "En preparación / fabricación",
    "Entregado / cerrado",
    "Cancelado / rechazado",
    "Bloqueado / incidencia",
]

GESTORES = ["María García", "Carlos Rodríguez", "Ana Martínez", "Pedro Sánchez", "Laura López"]
PROVEEDORES = ["Suministros Pérez S.L.", "Materiales López", "Ferretería Central", "Distribuciones García", "Herramientas Díaz"]
CLIENTES = [
    "Construcciones Inmobilaria Sur", "Reformas Integrales Domínguez", "Obras y Reformas Costa",
    "Rehabilitaciones El Pilar", "Construcciones Vega Alta", "Fontanería y Calefacción Martínez",
    "Electricidad Jiménez", "Obras Civiles Norte", "Reformas Express 24h", "Construcciones Díaz Gómez",
    "Albañilería Rodríguez", "Techumbre y Estructuras SL", "Pinturas y Acabados López",
    "Cristales y Vidrios Pérez", "Ascensores y Elevadores García"
]
ACCIONES = [
    "Llamar al cliente para confirmar recepción",
    "Enviar presupuesto revisado",
    "Confirmar fecha de medición",
    "Solicitar presupuesto a proveedor",
    "Revisar plano con el arquitecto",
    "Coordinar con el jefe de obra",
    "Enviar muestras de material",
    "Confirmar plazos de entrega",
    "Solicitar visita de técnico",
    "Revisar presupuesto con contabilidad",
]
INCIDENCIAS_TIPOS = ["Falta información", "Proveedor pendiente", "Cliente pendiente", "Precio pendiente", "Plazo pendiente"]

db = SessionLocal()

# Create additional users
users_data = [
    {"email": "carlos@presucontrol.com", "nombre": "Carlos Rodríguez", "aprobado": True, "puede_gestionar_sistema": False},
    {"email": "ana@presucontrol.com", "nombre": "Ana Martínez", "aprobado": True, "puede_gestionar_sistema": False},
    {"email": "pedro@presucontrol.com", "nombre": "Pedro Sánchez", "aprobado": True, "puede_gestionar_sistema": False},
    {"email": "laura@presucontrol.com", "nombre": "Laura López", "aprobado": False, "puede_gestionar_sistema": False},
]
existing_emails = {u.email for u in db.query(Usuario).all()}
for ud in users_data:
    if ud["email"] not in existing_emails:
        from app.auth import hash_password
        user = Usuario(
            email=ud["email"],
            nombre=ud["nombre"],
            hashed_password=hash_password("demo1234"),
            aprobado=ud["aprobado"],
            puede_gestionar_sistema=ud["puede_gestionar_sistema"],
            activo=True,
        )
        db.add(user)
db.commit()

# Get users and gestores
users = db.query(Usuario).all()
gestores = GESTORES

def rand_date(start_days=-90, end_days=0):
    return date.today() + timedelta(days=random.randint(start_days, end_days))

def rand_gestor():
    return random.choice(gestores)

def rand_proveedor():
    return random.choice(PROVEEDORES) if random.random() > 0.3 else None

def rand_cliente():
    return random.choice(CLIENTES)

# Create 25 presupuestos with realistic data
presupuestos_data = []
for i in range(25):
    estado = random.choice(ESTADOS)
    cliente = rand_cliente()
    gestor = rand_gestor()

    fecha_presupuesto = rand_date(-120, -30)
    fecha_envio_cliente = fecha_presupuesto + timedelta(days=random.randint(1, 15))

    aceptado = estado in ["Aceptado - pendiente pedido proveedor", "Pedido proveedor realizado", "Plazo proveedor confirmado", "En preparación / fabricación", "Entregado / cerrado"]
    fecha_aceptacion = (fecha_envio_cliente + timedelta(days=random.randint(1, 10))) if aceptado else None

    tiene_pedido = estado in ["Pedido proveedor realizado", "Plazo proveedor confirmado", "En preparación / fabricación", "Entregado / cerrado"]
    fecha_pedido = (fecha_aceptacion + timedelta(days=random.randint(1, 7))) if tiene_pedido else None
    proveedor = rand_proveedor() if tiene_pedido else None

    dias_parado = random.randint(0, 45) if random.random() > 0.3 else 0
    fecha_ultima = date.today() - timedelta(days=dias_parado)

    importe = round(random.uniform(1200, 45000), 2)

    p = Presupuesto(
        numero_presupuesto=f"PRESU-{2024}{random.randint(1000, 9999)}",
        cliente=cliente,
        obra_referencia=f"Obra {random.choice(['A', 'B', 'C'])} - {random.choice(['C/ Mayor 12', 'Avda. España 45', 'C/ Barcelona 8', 'Plaza del Sol 3', 'C/ Gran Vía 22'])}",
        gestor=gestor,
        fecha_presupuesto=fecha_presupuesto.isoformat(),
        fecha_envio_cliente=fecha_envio_cliente.isoformat(),
        fecha_aceptacion=fecha_aceptacion.isoformat() if fecha_aceptacion else None,
        importe=importe,
        estado=estado,
        proveedor=proveedor,
        numero_pedido_proveedor=f"PP-{random.randint(100, 999)}" if tiene_pedido else None,
        fecha_pedido_proveedor=fecha_pedido.isoformat() if fecha_pedido else None,
        plazo_proveedor=(fecha_pedido + timedelta(days=random.randint(7, 45))).isoformat() if estado in ["Plazo proveedor confirmado", "En preparación / fabricación", "Entregado / cerrado"] else None,
        fecha_prevista_entrega=(fecha_pedido + timedelta(days=random.randint(14, 60))).isoformat() if estado in ["Plazo proveedor confirmado", "En preparación / fabricación"] else None,
        responsable_actual=rand_gestor() if aceptado else None,
        siguiente_accion=random.choice(ACCIONES) if random.random() > 0.4 else None,
        fecha_limite_siguiente_accion=(date.today() + timedelta(days=random.randint(-15, 30))).isoformat() if random.random() > 0.5 else None,
        incidencia=True if estado == "Bloqueado / incidencia" else False,
        descripcion_incidencia=random.choice(INCIDENCIAS_TIPOS) if estado == "Bloqueado / incidencia" and random.random() > 0.5 else None,
        prioridad_calculada=random.choice(["Verde", "Amarillo", "Naranja", "Rojo", "Crítico"]),
        dias_parado=dias_parado,
        fecha_ultima_actualizacion=fecha_ultima.isoformat(),
        archivado=random.random() > 0.9,
        version=1,
    )
    db.add(p)
    presupuestos_data.append(p)

db.commit()

# Add comments to some presupuestos
for p in random.sample(presupuestos_data, min(15, len(presupuestos_data))):
    for _ in range(random.randint(1, 4)):
        c = Comentario(
            presupuesto_id=p.id,
            comentario=random.choice([
                "Cliente interesado, pide descuento del 5%",
                "He llamado 3 veces, no contesta",
                "Hay que enviar presupuesto revisado con nuevos plazos",
                "Confirmado: empiezan el lunes que viene",
                "El cliente quiere cambiar el color del suelo",
                "Pendiente de respuesta del proveedor",
                "Buena señal, están comparando con nuestra competencia",
                "Ha solicitado visita del técnico",
                "Les hemos enviado muestras de cerámica",
                "El arquitecto ha aprobado el presupuesto",
            ]),
            nombre_opcional=random.choice(["María", "Carlos", "Ana", "Pedro"]),
            usuario_nombre=rand_gestor(),
            usuario_email=random.choice(["maria@empresa.com", "carlos@empresa.com"]),
            creado_en=(date.today() - timedelta(days=random.randint(0, 30))).isoformat(),
        )
        db.add(c)

# Add history entries
for p in random.sample(presupuestos_data, min(12, len(presupuestos_data))):
    for field, old, new in random.sample([
        ("estado", "Pendiente de enviar", "Enviado al cliente"),
        ("estado", "Enviado al cliente", "Aceptado - pendiente pedido proveedor"),
        ("importe", "15000", "14500"),
        ("proveedor", None, "Suministros Pérez S.L."),
        ("fecha_aceptacion", None, "2024-03-15"),
    ], random.randint(1, 3)):
        h = HistorialCambio(
            presupuesto_id=p.id,
            campo=field,
            valor_anterior=old,
            valor_nuevo=new,
            descripcion=f"Cambio en {field}: {old} → {new}",
            nombre_opcional=None,
            usuario_nombre=rand_gestor(),
            usuario_email=random.choice(["maria@empresa.com", "carlos@empresa.com"]),
            creado_en=(date.today() - timedelta(days=random.randint(0, 20))).isoformat(),
        )
        db.add(c)

db.commit()

print(f"✓ Created {len(presupuestos_data)} presupuestos")
print(f"✓ Added comments and history")
print(f"✓ Users in DB: {db.query(Usuario).count()}")
db.close()