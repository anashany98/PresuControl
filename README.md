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
- Recuperación de contraseña por email y reset manual desde panel de usuarios.
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

API docs vía proxy interno:

```text
http://localhost:8088/api/docs
```

El backend ya no se publica en `localhost:8000` por defecto. Si necesitas depurar, añade temporalmente un `ports` al servicio `backend`.

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

## Recuperación de contraseña

Configura SMTP y `APP_PUBLIC_URL` en `.env`:

```env
APP_PUBLIC_URL=https://presucontrol.tuempresa.com
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=avisos@tuempresa.com
SMTP_PASSWORD=tu_password_o_app_password
SMTP_FROM=avisos@tuempresa.com
SMTP_TLS=true
```

El usuario puede entrar en:

```text
/login → He olvidado mi contraseña
```

También se puede resetear manualmente desde:

```text
Usuarios → Reset clave
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

## Endpoints nuevos relevantes

```text
GET  /sidebar-counters
GET  /search?q=texto
POST /auth/password/request
POST /auth/password/reset
POST /usuarios/{id}/toggle-gestion
POST /usuarios/{id}/reset-password
GET  /logs/emails/export
GET  /logs/actividad/export
```
