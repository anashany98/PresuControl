# Plan por fases para estabilizar PresuControl V5

Este documento convierte la auditoría técnica del proyecto en un plan de ejecución por fases. El objetivo es llevar el proyecto desde su estado actual de MVP/beta interna hacia una base más segura, mantenible y preparada para producción.

Criterio general:

- No añadir nuevas funcionalidades grandes hasta cerrar las fases críticas.
- Cada fase debe terminar con tests/build pasando.
- Priorizar seguridad, higiene del repositorio e integridad de datos.
- Evitar cambios de API pública salvo que estén explícitamente indicados y coordinados con frontend.

---

## Fase 0 — Preparación y control de riesgo

**Objetivo:** crear una línea base segura antes de tocar estructura o lógica.

### Tareas

- [ ] Crear una rama dedicada para saneamiento técnico.
  - Motivo: aislar cambios grandes de limpieza y seguridad.
  - Resultado esperado: rama tipo `hardening/production-readiness` o similar.

- [ ] Guardar estado actual de despliegue y base de datos si existe entorno real.
  - Motivo: poder volver atrás si una limpieza afecta ejecución.
  - Resultado esperado: backup verificable antes de modificar repo o migraciones.

- [ ] Ejecutar baseline de calidad.
  - Comandos sugeridos:
    - Backend: `pytest backend/tests/ -v --tb=short`
    - Frontend: `cd frontend && npm run build`
    - Docker: `docker compose build`
  - Resultado esperado: saber qué falla antes de empezar.

### Criterio de salida

- Estado inicial documentado.
- Tests/build actuales conocidos.
- Backup realizado si hay datos reales.

---

## Fase 1 — Higiene crítica del repositorio

**Objetivo:** eliminar del control de versiones secretos, dependencias instaladas y artefactos generados.

### Tareas

- [ ] Sacar `.env` del repositorio.
  - Motivo: contiene valores sensibles o placeholders que no deben versionarse.
  - Archivos afectados: `.env`, `.gitignore`.
  - Acción sugerida: `git rm --cached .env`.
  - Resultado esperado: `.env` queda local, solo se versionan `.env.example` y `.env.production.example`.

- [ ] Rotar secretos si `.env` se usó en algún entorno real.
  - Motivo: una vez versionado, el secreto debe considerarse expuesto.
  - Afecta: `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `SMTP_PASSWORD`.
  - Resultado esperado: secretos nuevos, largos y únicos.

- [ ] Eliminar `frontend/node_modules` del repositorio.
  - Motivo: hay miles de archivos de dependencias trackeados.
  - Acción sugerida: `git rm -r --cached frontend/node_modules`.
  - Resultado esperado: dependencias se restauran con `npm ci` desde `package-lock.json`.

- [ ] Eliminar artefactos generados trackeados.
  - Motivo: no deben versionarse binarios/cache/build outputs.
  - Zonas afectadas:
    - `backend/**/__pycache__`
    - `backend/**/*.pyc`
    - `frontend/dist`
    - `backend/test.db` si está trackeado
    - `.playwright-mcp/` si no se considera evidencia necesaria
  - Resultado esperado: repo limpio y reproducible.

- [ ] Revisar `.gitignore`.
  - Motivo: impedir que vuelvan a entrar artefactos.
  - Añadir/verificar:
    - `.env`
    - `.env.*`
    - `!/.env.example`
    - `!/.env.production.example`
    - `node_modules/`
    - `dist/`
    - `__pycache__/`
    - `*.pyc`
    - `*.db`
    - `.playwright-mcp/`
    - `frontend/test-results/`

### Criterio de salida

- `git status` no muestra dependencias ni caches.
- `.env` ya no está trackeado.
- El proyecto se puede reconstruir desde cero con lockfiles.

---

## Fase 2 — Hardening mínimo de producción

**Objetivo:** impedir despliegues inseguros por configuración débil.

### Tareas

- [ ] Añadir validación de configuración al arranque.
  - Motivo: evitar producción con secretos placeholder.
  - Validar:
    - `JWT_SECRET_KEY` obligatorio, largo y no placeholder.
    - `POSTGRES_PASSWORD` no placeholder.
    - `DATABASE_URL` obligatorio.
    - `CORS_ORIGINS` explícito, sin `*`.
    - `APP_PUBLIC_URL` correcto.
  - Archivos afectados: nuevo módulo tipo `backend/app/config.py` o `settings_runtime.py`.
  - Resultado esperado: la app falla rápido si la configuración es insegura.

- [ ] Proteger o desactivar `/docs`, `/redoc` y `/openapi.json` en producción.
  - Motivo: exponen superficie completa de API.
  - Opciones:
    - Desactivarlos si `ENV=production`.
    - Protegerlos por usuario gestor.
    - Restringirlos a red interna.
  - Resultado esperado: documentación pública solo en desarrollo.

- [ ] Endurecer política de contraseñas.
  - Motivo: actualmente el mínimo visible es 6 caracteres.
  - Recomendación mínima:
    - 12 caracteres.
    - Validación frontend y backend.
    - Mensaje claro al usuario.
  - Archivos afectados: `backend/app/schemas.py`, páginas de registro/reset.

- [ ] Revisar CSP de Nginx.
  - Motivo: `unsafe-inline` reduce protección contra XSS.
  - Resultado esperado: CSP ajustada o documentado por qué se mantiene temporalmente.

### Criterio de salida

- No se puede arrancar producción con placeholders.
- Secrets reales fuera del repo.
- Password policy reforzada.
- Docs públicas controladas.

---

## Fase 3 — Permisos y autorización de negocio

**Objetivo:** evitar que cualquier usuario autenticado pueda hacer operaciones sensibles.

### Tareas

- [ ] Definir matriz de roles y permisos.
  - Roles sugeridos:
    - `admin_sistema`
    - `comercial`
    - `compras`
    - `gestion`
    - `lectura`
    - `auditor`
  - Resultado esperado: tabla clara de qué puede hacer cada rol.

- [ ] Añadir modelo de permisos/roles.
  - Opción simple: columna `rol` en `usuarios`.
  - Opción flexible: tablas `roles`, `permissions`, `usuario_roles`.
  - Recomendación inicial: columna `rol` si el producto sigue siendo interno y pequeño.

- [ ] Proteger endpoints por permiso.
  - Prioridad alta:
    - crear/editar presupuestos;
    - crear/editar/eliminar pedidos;
    - importar;
    - exportar;
    - proveedores;
    - configuración;
    - usuarios;
    - logs.
  - Resultado esperado: autorización explícita por endpoint.

- [ ] Ocultar enlaces de UI según permisos reales.
  - Motivo: el frontend no debe mostrar acciones que el usuario no puede ejecutar.
  - Archivo afectado: `frontend/src/components/Layout.tsx` y páginas con acciones.

- [ ] Añadir tests de autorización.
  - Motivo: evitar regresiones.
  - Casos mínimos:
    - usuario lectura no puede modificar;
    - comercial no puede gestionar usuarios;
    - compras puede gestionar pedidos si así se decide;
    - admin puede todo.

### Criterio de salida

- Matriz de permisos documentada.
- Endpoints críticos protegidos.
- Tests de autorización pasando.
- UI no muestra acciones prohibidas.

---

## Fase 4 — Refactor arquitectónico del backend

**Objetivo:** dividir el backend monolítico para hacerlo mantenible y testeable.

### Tareas

- [ ] Separar routers FastAPI.
  - Propuesta:
    - `routers/auth.py`
    - `routers/usuarios.py`
    - `routers/presupuestos.py`
    - `routers/pedidos.py`
    - `routers/proveedores.py`
    - `routers/importacion.py`
    - `routers/exportacion.py`
    - `routers/reportes.py`
    - `routers/avisos.py`
    - `routers/notificaciones.py`
    - `routers/settings.py`

- [ ] Extraer servicios de dominio.
  - Propuesta:
    - `services/presupuesto_service.py`
    - `services/import_service.py`
    - `services/export_service.py`
    - `services/notification_service.py`
    - `services/user_service.py`

- [ ] Mantener contratos API durante el refactor.
  - Motivo: no romper frontend.
  - Resultado esperado: mismas rutas y respuestas salvo cambios explícitos.

- [ ] Reducir `main.py` a composición de app.
  - Debe contener:
    - creación FastAPI;
    - middleware;
    - inclusión de routers;
    - lifespan.

- [ ] Añadir tests de regresión por routers críticos.
  - Prioridad:
    - auth;
    - presupuestos;
    - pedidos;
    - importación;
    - permisos.

### Criterio de salida

- `backend/app/main.py` deja de ser monolítico.
- Rutas existentes siguen funcionando.
- Tests pasan.
- El código queda organizado por dominio.

---

## Fase 5 — Integridad de datos y modelo

**Objetivo:** corregir inconsistencias del modelo y mejorar fiabilidad de datos.

### Tareas

- [ ] Unificar estados de presupuesto.
  - Motivo: DB permite `Borrador`, schemas no lo listan.
  - Archivos afectados: `backend/app/models.py`, `backend/app/schemas.py`, frontend `api.ts`, migraciones.
  - Resultado esperado: una única lista de estados válida en DB/API/UI.

- [ ] Corregir relación de proveedores asociados.
  - Motivo: modelo usa `presupuestos_asociados`, schema usa `proveedores_asociados`.
  - Resultado esperado: respuesta API consistente y testeada.

- [ ] Normalizar proveedor en pedidos.
  - Paso 1: añadir `proveedor_id` nullable a `pedidos_proveedor`.
  - Paso 2: migrar texto libre a tabla `proveedores`.
  - Paso 3: mantener `proveedor_nombre_snapshot` si hace falta histórico.
  - Paso 4: hacer `proveedor_id` obligatorio cuando los datos estén limpios.

- [ ] Revisar constraints de integridad.
  - Casos:
    - importes no negativos en todas las tablas económicas;
    - fechas coherentes;
    - estados válidos;
    - emails normalizados.

- [ ] Añadir migraciones Alembic verificadas.
  - Motivo: todo cambio estructural debe ser reproducible.
  - Resultado esperado: `alembic upgrade head` funciona desde cero y sobre datos existentes.

### Criterio de salida

- Modelo consistente.
- Migraciones probadas.
- Datos críticos con integridad reforzada.

---

## Fase 6 — Rendimiento, búsqueda y trabajos pesados

**Objetivo:** reducir bloqueos y preparar el sistema para más usuarios/documentos.

### Tareas

- [ ] Mover importaciones/exportaciones pesadas a jobs.
  - Opción mínima: tabla `jobs` y worker interno separado.
  - Opción avanzada: Redis + RQ/Celery.
  - Recomendación inicial: tabla `jobs` + worker Docker separado.

- [ ] Añadir límites funcionales a importación.
  - Validar:
    - número máximo de filas;
    - columnas máximas;
    - tamaño ya limitado a 10MB;
    - timeout operativo;
    - errores exportables.

- [ ] Optimizar búsqueda global.
  - Opción A: `pg_trgm` + índices GIN para `ILIKE`.
  - Opción B: full-text search PostgreSQL.
  - Recomendación: empezar con `pg_trgm` si se mantiene búsqueda parcial.

- [ ] Convertir cálculos agregados a SQL.
  - Prioridad:
    - estadísticas de proveedor;
    - dinero en riesgo;
    - dashboard ejecutivo;
    - alertas masivas.

- [ ] Parametrizar pool de base de datos.
  - Variables sugeridas:
    - `DB_POOL_SIZE`
    - `DB_MAX_OVERFLOW`
    - `DB_POOL_TIMEOUT`
  - Resultado esperado: ajuste por entorno.

- [ ] Separar scheduler de avisos.
  - Opciones:
    - servicio worker en Docker Compose;
    - cron externo;
    - advisory lock PostgreSQL si queda dentro del backend.

### Criterio de salida

- Import/export no bloquean requests principales.
- Búsqueda escala mejor.
- Agregados principales no cargan todo en memoria.
- Scheduler no se duplica al escalar.

---

## Fase 7 — UX/UI y calidad frontend

**Objetivo:** corregir fricciones visibles y asegurar una experiencia interna fiable.

### Tareas

- [ ] Corregir textos mojibake.
  - Ejemplos actuales:
    - `GestiÃ³n`
    - `ConfiguraciÃ³n`
    - `Ã—`
  - Resultado esperado: todo el frontend en UTF-8 correcto.

- [ ] Reorganizar navegación.
  - Motivo: topnav tiene demasiados accesos.
  - Opciones:
    - sidebar persistente en desktop;
    - menú agrupado por módulos;
    - topnav solo para acciones frecuentes.

- [ ] Mejorar importación.
  - Forzar simulación antes de confirmar.
  - Mostrar errores en tabla.
  - Permitir descargar errores.
  - Mostrar resumen claro de cambios.

- [ ] Mejorar estados de carga/error.
  - Prioridad:
    - presupuestos;
    - detalle;
    - kanban;
    - importación;
    - reportes.

- [ ] Añadir accesibilidad básica.
  - Botones icon-only con `aria-label`.
  - Foco visible.
  - Navegación por teclado.
  - Contraste de colores.

- [ ] Revisar responsive real.
  - Probar:
    - 375px móvil;
    - tablet;
    - desktop pequeño;
    - tablas con muchas columnas.

### Criterio de salida

- UI sin textos corruptos.
- Acciones prohibidas ocultas.
- Importación más segura para usuarios.
- Navegación y responsive validados.

---

## Fase 8 — Testing y CI/CD

**Objetivo:** convertir la calidad en algo verificable automáticamente.

### Tareas

- [ ] Añadir Playwright al CI.
  - Motivo: existen tests E2E pero no se confirma ejecución en GitHub Actions.
  - Resultado esperado: smoke tests corren en PR.

- [ ] Añadir tests de permisos.
  - Motivo: RBAC será crítico.
  - Resultado esperado: cada rol tiene pruebas positivas y negativas.

- [ ] Añadir tests de importación robusta.
  - Casos:
    - archivo válido;
    - columnas faltantes;
    - versiones antiguas;
    - duplicados;
    - límite de filas/tamaño;
    - fechas/importes inválidos.

- [ ] Añadir tests de migración con datos existentes.
  - Motivo: evitar romper bases reales.
  - Resultado esperado: migraciones pasan sobre fixture representativo.

- [ ] Añadir cobertura mínima para servicios tras refactor.
  - Objetivo sugerido inicial: 70% en servicios críticos, sin obsesionarse con cobertura total.

- [ ] Añadir auditoría frontend/backend periódica.
  - Ya existen `pip-audit` y `npm audit` en CI.
  - Mantener y documentar política de resolución.

### Criterio de salida

- CI cubre backend, frontend build, migraciones y E2E smoke.
- Permisos e importación tienen tests sólidos.
- Refactors futuros son menos arriesgados.

---

## Fase 9 — Operación de producción

**Objetivo:** dejar el sistema operable y recuperable en un entorno real.

### Tareas

- [ ] Formalizar backups.
  - Backup diario PostgreSQL.
  - Retención definida.
  - Cifrado si contiene datos sensibles.
  - Log y alerta si falla.

- [ ] Probar restore.
  - Motivo: un backup no probado no es garantía.
  - Resultado esperado: procedimiento de restauración validado.

- [ ] Añadir healthchecks más completos.
  - `/health`: proceso vivo.
  - `/health/db`: conectividad DB.
  - `/health/smtp` opcional y protegido.

- [ ] Añadir logs estructurados.
  - Motivo: facilitar diagnóstico.
  - Resultado esperado: logs JSON con request id, usuario si aplica, endpoint, duración y status.

- [ ] Definir checklist de despliegue.
  - Migraciones.
  - Backup previo.
  - Build.
  - Smoke test.
  - Rollback.

- [ ] Documentar runbook de incidencias.
  - Casos:
    - DB caída;
    - SMTP falla;
    - importación bloqueada;
    - migración fallida;
    - usuario admin perdido.

### Criterio de salida

- Producción tiene backup/restore probado.
- Hay diagnóstico básico.
- Existe procedimiento de despliegue y rollback.

---

# Orden recomendado de ejecución

1. Fase 1 — Higiene crítica del repositorio.
2. Fase 2 — Hardening mínimo de producción.
3. Fase 3 — Permisos y autorización.
4. Fase 4 — Refactor backend.
5. Fase 5 — Integridad de datos.
6. Fase 6 — Rendimiento y jobs.
7. Fase 7 — UX/UI.
8. Fase 8 — Testing y CI/CD.
9. Fase 9 — Operación producción.

---

# Primer bloque de trabajo recomendado

Si se quiere empezar de forma segura, el primer bloque debería ser:

```markdown
- [ ] Sacar `.env` del repo.
- [ ] Eliminar `frontend/node_modules` del repo.
- [ ] Eliminar `__pycache__`, `dist` y bases locales del repo.
- [ ] Reforzar `.gitignore`.
- [ ] Ejecutar build/tests para confirmar que el proyecto sigue funcionando.
- [ ] Commit de limpieza.
```

Este bloque no cambia comportamiento funcional, pero reduce de forma inmediata el riesgo técnico y de seguridad.
