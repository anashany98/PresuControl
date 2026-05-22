# Runbook de Incidencias - PresuControl V5

## Índice
1. [Base de datos caída / no responde](#1-base-de-datos-caída--no-responde)
2. [Envío de correos SMTP falla](#2-envío-de-correos-smtp-falla)
3. [Importación bloqueada](#3-importación-bloqueada)
4. [Migración fallida](#4-migración-fallida)
5. [Usuario admin perdido / bloqueado](#5-usuario-admin-perdido--bloqueado)
6. [Alto uso de CPU / memoria](#6-alto-uso-de-cpu--memoria)

---

## 1. Base de datos caída / no responde

### Síntomas
- `/health` responde OK pero `/health/db` devuelve error.
- Errores `OperationalError` o `connection refused` en logs.

### Diagnóstico
```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U presucontrol -d presucontrol
```

### Solución
```bash
# Reiniciar PostgreSQL
docker compose restart postgres
# Esperar 10s y verificar
sleep 10
docker compose exec postgres pg_isready -U presucontrol -d presucontrol

# Si no arranca, restaurar desde backup
./scripts/restore.sh backups/presucontrol_backup_*.sql.gz
```

### Prevención
- Asegurar que el volumen `presucontrol_pgdata` tiene espacio suficiente.
- Configurar alertas si `pg_isready` falla.

---

## 2. Envío de correos SMTP falla

### Síntomas
- Registro de usuario no recibe email de verificación.
- Reset de contraseña no envía email.
- Avisos automáticos no llegan.

### Diagnóstico
```bash
# Verificar variables SMTP
docker compose exec backend env | grep SMTP

# Verificar logs de email
curl http://localhost:8000/logs/emails?status=error
```

### Solución
1. Verificar credenciales SMTP en `.env` (especialmente `SMTP_PASSWORD`).
2. Si usas Office365, verificar que la contraseña es un "App Password".
3. Probar envío de test desde Configuración > Email > "Enviar test".

### Prevención
- Programar envío de test semanal automático.
- Monitorizar ratio de errores en `email_notification_logs`.

---

## 3. Importación bloqueada

### Síntomas
- La importación queda en "Simulando..." indefinidamente.
- Timeout en `/import/preview` o `/import/confirm`.

### Diagnóstico
```bash
# Ver si el backend está saturado
docker compose logs backend --tail 50

# Ver procesos activos de PostgreSQL
docker compose exec postgres psql -U presucontrol -d presucontrol   -c "SELECT pid, state, query FROM pg_stat_activity WHERE state = 'active';"
```

### Solución
```bash
# Cancelar queries bloqueantes
docker compose exec postgres psql -U presucontrol -d presucontrol   -c "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%INSERT%';"

# Reiniciar backend
docker compose restart backend
```

### Prevención
- Limitar archivos de importación a 10MB (ya configurado).
- Considerar mover import a jobs asíncronos (Fase 6 pendiente).

---

## 4. Migración fallida

### Síntomas
- `alembic upgrade head` falla con error.
- La aplicación no arranca después de desplegar.

### Diagnóstico
```bash
# Ver revisión actual
cd backend && python -m alembic current

# Ver historial
python -m alembic history

# Intentar upgrade con más detalle
python -m alembic upgrade head 2>&1
```

### Solución
1. **Si la migración falla en producción pero pasó en staging**, revisar diferencias de datos.
2. Restaurar backup previo:
   ```bash
   ./scripts/restore.sh backups/presucontrol_backup_YYYYMMDD_HHMMSS.sql.gz
   ```
3. Volver a versión anterior de código.
4. Corregir migración en rama separada y probar contra copia de datos reales.

### Prevención
- Probar migraciones contra copia de producción en staging antes de desplegar.
- No desplegar sin backup previo.

---

## 5. Usuario admin perdido / bloqueado

### Síntomas
- Ningún usuario puede acceder a `/usuarios`, `/configuracion`, `/logs`.
- El único admin se desactivó o perdió `puede_gestionar_sistema`.

### Solución (intervención directa en BD)
```bash
# Conectarse a PostgreSQL
docker compose exec postgres psql -U presucontrol -d presucontrol

# Listar usuarios
SELECT id, email, activo, aprobado, puede_gestionar_sistema, rol FROM usuarios;

# Restaurar admin (reemplazar ID o email según corresponda)
UPDATE usuarios SET activo = true, aprobado = true, puede_gestionar_sistema = true, rol = 'admin_sistema' WHERE email = 'admin@tuempresa.com';

# O crear nuevo admin si no existe ninguno
INSERT INTO usuarios (nombre, email, hashed_password, activo, aprobado, puede_gestionar_sistema, rol)
VALUES ('Admin Emergencia', 'admin@tuempresa.com', '<hash_generado>', true, true, true, 'admin_sistema');
```

Para generar un hash válido, ejecutar localmente:
```bash
# Script auxiliar (crear en backend/seed_admin.py)
python -c "from app.auth import hash_password; print(hash_password('NuevaClave123456'))"
```

### Prevención
- Mantener al menos 2 usuarios con `admin_sistema`.
- No desactivar todos los admins.
- Documentar contraseña de emergencia en lugar seguro.

---

## 6. Alto uso de CPU / memoria

### Síntomas
- Respuesta lenta en todas las páginas.
- Timeouts frecuentes.
- Alertas del servidor.

### Diagnóstico
```bash
# Ver uso de recursos
docker stats --no-stream

# Ver requests lentos en logs
docker compose logs backend | grep '"duration_ms":'
```

### Solución
1. Ajustar límites en `docker-compose.yml`:
   - Backend: aumentar `cpus` y `memory` si es necesario.
2. Revisar queries lentas:
   ```bash
   docker compose exec postgres psql -U presucontrol -d presucontrol      -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```
3. Ajustar pool de conexiones (`.env`):
   ```env
   DB_POOL_SIZE=10
   DB_MAX_OVERFLOW=20
   ```

### Prevención
- Monitorizar uso de recursos con herramienta externa (Prometheus, Grafana, etc.).
- Revisar `DB_POOL_SIZE` según número de usuarios concurrentes.
