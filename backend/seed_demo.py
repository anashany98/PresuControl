#!/usr/bin/env python3
import random
from datetime import date, datetime, timedelta
from pathlib import Path

def seed_demo():
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from app.database import SessionLocal
    from app.models import Presupuesto, Comentario, HistorialCambio
    from app import models

    db = SessionLocal()
    try:
        existing = db.query(Presupuesto).count()
        if existing > 0:
            print(f'Ya hay {existing} presupuestos. Borro y creo demo...')
            db.query(HistorialCambio).delete()
            db.query(Comentario).delete()
            db.query(Presupuesto).delete()
            db.commit()

        hoy = date.today()
        CLIENTES = [
            ('Construcciones del Norte','Reforma nave industrial - Madrid'),
            ('Hosteleria Costa Brava','Equipamiento cocina - Barcelona'),
            ('Inmobiliaria del Valle','Acondicionamiento oficinas - Valencia'),
            ('Oficina Tecnica Mediterraneo','Proyecto estructura - Sevilla'),
            ('Automatizaciones Industriales','Instalacion machinery - Bilbao'),
            ('Construcciones Metalicas del Norte','Nave logistica - Zaragoza'),
            ('Reformas Integrales del Sur','Remodelacion local comercial'),
            ('Ingenieria y Servicios Levante','Proyecto climatizacion - Murcia'),
            ('Techos y Estructuras del Norte','Cubierta nave - Asturias'),
            ('Gestion de Obras Galicia','Rehabilitacion edificio - Coruna'),
        ]
        ACCIONES = [
            'Llamar al cliente para confirmar pedido',
            'Enviar presupuesto revisado',
            'Confirmar plazo con proveedor',
            'Recoger firmas de aprobacion',
        ]
        PROVEEDORES = ['Suministros del Norte SL', 'Materiales Lopez SA', 'Ferreteria Central']
        GESTORES = ['Ana Garcia', 'Carlos Lopez', 'Maria Rodriguez', 'Pedro Sanchez']
        rows = [
            ('PRE-2024-001',CLIENTES[0][0],CLIENTES[0][1],'Enviado','Rojo',-15,'Ana Garcia','Compras',ACCIONES[0]),
            ('PRE-2024-002',CLIENTES[1][0],CLIENTES[1][1],'Enviado','Rojo',-8,'Carlos Lopez','Comercial',ACCIONES[1]),
            ('PRE-2024-003',CLIENTES[2][0],CLIENTES[2][1],'Aceptado','Amarillo',-3,'Maria Rodriguez','Administracion',ACCIONES[2]),
            ('PRE-2024-004',CLIENTES[3][0],CLIENTES[3][1],'Enviado','Rojo',0,'Pedro Sanchez','Comercial',ACCIONES[3]),
            ('PRE-2024-005',CLIENTES[4][0],CLIENTES[4][1],'Enviado','Amarillo',0,'Ana Garcia','Compras',ACCIONES[4]),
            ('PRE-2024-006',CLIENTES[5][0],CLIENTES[5][1],'Aceptado','Verde',0,'Carlos Lopez',None,None),
            ('PRE-2024-007',CLIENTES[6][0],CLIENTES[6][1],'Enviado','Amarillo',1,'Maria Rodriguez','Comercial',ACCIONES[0]),
            ('PRE-2024-008',CLIENTES[7][0],CLIENTES[7][1],'Enviado','Verde',1,'Pedro Sanchez','Almacen',ACCIONES[1]),
            ('PRE-2024-009',CLIENTES[8][0],CLIENTES[8][1],'Enviado','Verde',2,'Ana Garcia','Comercial',ACCIONES[2]),
            ('PRE-2024-010',CLIENTES[9][0],CLIENTES[9][1],'Enviado','Amarillo',2,'Carlos Lopez','Compras',ACCIONES[3]),
            ('PRE-2024-011','Construcciones del Norte','Obra concluida','Cerrado','Verde',-30,'Ana Garcia',None,None),
            ('PRE-2024-012','Hosteleria Costa Brava','Esperando materiales','Aceptado','Amarillo',-45,'Maria Rodriguez','Almacen',ACCIONES[1]),
            ('PRE-2024-013','Inmobiliaria del Valle','Proyecto en pausa','Bloqueado','Rojo',-60,'Pedro Sanchez','Compras',ACCIONES[2]),
            ('PRE-2024-014','Oficina Tecnica Mediterraneo','Pendiente de cliente','Enviado','Verde',-90,'Carlos Lopez',None,None),
            ('PRE-2024-015','Automatizaciones Industriales','Aceptado hace 2 semanas','Aceptado','Verde',-14,'Ana Garcia',None,None),
        ]
        for numero, cliente, obra, estado, prioridad, dias_offset, gestor, responsable, accion in rows:
            fecha_presupuesto = hoy - timedelta(days=random.randint(30,120))
            fecha_limite = hoy + timedelta(days=dias_offset)
            fecha_envio = fecha_presupuesto + timedelta(days=random.randint(3,15))
            fecha_aceptacion = None
            if estado in ('Aceptado','Cerrado'):
                fecha_aceptacion = fecha_envio + timedelta(days=random.randint(5,20))
            dias_parado = abs(dias_offset) if dias_offset < 0 else 0
            p = Presupuesto(numero_presupuesto=numero, cliente=cliente, obra_referencia=obra,
                gestor=gestor, fecha_presupuesto=fecha_presupuesto, fecha_envio_cliente=fecha_envio,
                fecha_aceptacion=fecha_aceptacion, importe=round(random.uniform(5000,150000),2),
                estado=estado, prioridad_calculada=prioridad, dias_parado=dias_parado,
                responsable_actual=responsable, siguiente_accion=accion,
                fecha_limite_siguiente_accion=fecha_limite if accion else None)
            db.add(p)
            db.flush()
        db.commit()
        print(f'Demo: {len(rows)} presupuestos creados')
    finally:
        db.close()

if __name__ == '__main__':
    seed_demo()
