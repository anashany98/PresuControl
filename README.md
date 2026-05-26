# PresuControl V5

Aplicación web interna para controlar presupuestos creados en FactuSOL y evitar que un presupuesto aceptado por cliente quede sin pedido al proveedor.

## Novedades V5

- Aprobación de usuarios protegida por permiso técnico `puede_gestionar_sistema`.
- Primer usuario existente/creado queda como gestor del sistema.
- Control de edición simultánea estricto: toda modificación exige `expected_version`.
- Kanban guiado: al mover tarjetas se abre modal cuando faltan datos obligatorios.
- Alembic integrado en el arranque Docker (`alembic upgrade head`).
- Tests automáticos de reglas críticas y rate limit.
- Rate limit en login por IP/email.
- Reset manual de contraseña desde panel de usuarios.
- Mi mesa de trabajo usa el usuario real autenticado.
- Importación Excel/CSV avanzada: simular, crear nuevos, actualizar existentes y upsert seguro por versión.
- Logs filtrables por estado, tipo, usuario, presupuesto y fechas.
- Exportación Excel de logs de emails y actividad.
- Contadores en menú lateral.
- Búsqueda global real por presupuesto, comentarios e historial.
- Vista compacta en tabla.
- Backend no se expone directamente: el frontend publica `/api` y el backend queda interno en Docker.

## Arranque rápido

```bash
cp .env.example .env
docker compose up -d --build
```

Abrir:

```text
http://localhost:8088
```

API docs vía proxy interno en desarrollo:

```text
http://localhost:8088/api/docs
```

En producción las API docs están desactivadas. El backend ya no se publica en `localhost:8000` por defecto. Si necesitas depurar, añade temporalmente un `ports` al servicio `backend`.

## Primer usuario

- El primer usuario registrado se aprueba automáticamente.
- También recibe `puede_gestionar_sistema=true`.
- Los siguientes usuarios quedan pendientes de aprobación.
- Solo un usuario con gestión del sistema puede:
  - aceptar/desactivar usuarios;
  - cambiar configuración;
  - ver/exportar logs;
  - resetear contraseñas;
  - conceder/quitar gestión del sistema.

## Reset de contraseña

El reset de contraseña lo realiza un usuario con gestión del sistema desde:

```text
Usuarios → Reset clave
```

Si usas avisos por email, configura SMTP y `APP_PUBLIC_URL` en `.env`:

```env
APP_PUBLIC_URL=https://presucontrol.tuempresa.com
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=avisos@tuempresa.com
SMTP_PASSWORD=tu_password_o_app_password
SMTP_FROM=avisos@tuempresa.com
SMTP_TLS=true
```

## Migraciones

Docker ejecuta automáticamente:

```bash
alembic upgrade head
```

Manual:

```bash
cd backend
alembic upgrade head
```

En producción se recomienda mantener:

```env
RUN_CREATE_ALL=false
RUN_DEFENSIVE_MIGRATIONS=false
```

## Tests

```bash
cd backend
pip install -r requirements.txt
pytest -q
```

Incluye pruebas para:

- aceptación sin fecha de aceptación;
- pedido proveedor sin datos obligatorios;
- cancelación sin motivo;
- `expected_version` obligatorio;
- bloqueo por versión antigua;
- rate limit de login.

## Importación Excel/CSV

Modos disponibles:

- `Crear solo nuevos`
- `Actualizar existentes`
- `Crear nuevos y actualizar existentes`

Para actualizar presupuestos existentes, el archivo debe incluir una columna:

```text
version
```

o:

```text
expected_version
```

Esa versión debe coincidir con la versión actual del presupuesto. Así se evita sobrescribir cambios de otra persona.

## Seguridad de despliegue

Antes de usar datos reales:

- Cambiar `POSTGRES_PASSWORD`.
- Cambiar `JWT_SECRET_KEY` por una cadena larga y aleatoria.
- Usar HTTPS.
- No exponer PostgreSQL.
- No exponer backend directo.
- Configurar backups de PostgreSQL.
- Revisar SMTP.

## Producción interna en VPS

Objetivo recomendado: un VPS único con Docker Compose, PostgreSQL 16 en contenedor y Nginx/HTTPS en el host. El backend queda interno en la red de Compose y el frontend solo publica `127.0.0.1:8088` para que Nginx sea el único punto de entrada.

Preparación inicial:

```bash
cp .env.production.example .env
nano .env
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

En Coolify usa un recurso **Docker Compose** apuntando a `docker-compose.prod.yml`. No uses un despliegue de aplicación con Dockerfile raíz: este proyecto tiene frontend, backend y PostgreSQL como servicios separados.

Comprueba que la app responde por el proxy local:

```bash
curl -I http://127.0.0.1:8088
curl -I http://127.0.0.1:8088/api/health
```

Variables obligatorias en producción:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `CORS_ORIGINS`
- `APP_PUBLIC_URL`

Usa valores largos y únicos para `POSTGRES_PASSWORD` y `JWT_SECRET_KEY`. No subas `.env` al repositorio.

### Nginx y HTTPS

Ejemplo de bloque Nginx delante del frontend publicado en loopback:

```nginx
server {
    listen 80;
    server_name presucontrol.tuempresa.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name presucontrol.tuempresa.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

Gestiona el certificado con Certbot, acme.sh o el mecanismo estándar del VPS.

### Backups y restore

Backup diario recomendado por cron:

```bash
mkdir -p /var/backups/presucontrol
crontab -e
```

Entrada cron:

```cron
0 3 * * * cd /opt/presucontrol && BACKUP_DIR=/var/backups/presucontrol ./backup.sh >> /var/log/presucontrol_backup.log 2>&1
```

El script usa por defecto el contenedor `presucontrol-postgres`, conserva 30 días y falla si el fichero generado queda vacío.

Restauración:

```bash
cd /opt/presucontrol
docker compose up -d postgres
./restore.sh /var/backups/presucontrol/presucontrol_YYYYmmdd_HHMMSS.sql.gz
docker compose up -d
```

Antes de restaurar sobre producción real, para la app y confirma que el fichero pertenece al entorno correcto.

### Actualización y rollback

Actualización normal:

```bash
git pull
docker compose build
docker compose up -d
docker compose logs -f --tail=100 backend frontend
```

Docker ejecuta `alembic upgrade head` al arrancar el backend. Si una actualización falla, vuelve al commit anterior y reconstruye:

```bash
git log --oneline -5
git checkout <commit_anterior>
docker compose build
docker compose up -d
```

Si la migración ya modificó datos, restaura el último backup verificado antes de levantar de nuevo la aplicación.

## Endpoints nuevos relevantes

```text
GET  /sidebar-counters
GET  /search?q=texto
POST /usuarios/{id}/toggle-gestion
POST /usuarios/{id}/reset-password
GET  /logs/emails/export
GET  /logs/actividad/export
GET  /reports/list?type=atrasados
POST /reports/export-list
```
