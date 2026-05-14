# Plan de remediación de problemas - PresuControl V5

## Progreso: 0/18 tareas completadas

---

## Resumen de problemas por categoría

| Área | Score | Problemas críticos |
|------|-------|-------------------|
| Backend Auth | 78 | LOGIN_ATTEMPTS en memoria, sin límite de intentos de registro |
| Backend API | 72 | N+1 queries, commits en getters, sin paginación en search |
| Backend Tests | 65 | Solo 2 archivos, sin tests de API, db sin mock |
| Backend Notifications | 82 | _log_exists N+1 dentro de loops |
| Frontend API | 80 | 401 redirect para endpoints públicos, tipos incompletos |
| Docker/Deploy | 78 | Sin healthcheck backend, imagen pesada, sin usuario no-root |
| global | 79 | Problemas transversales de rendimiento y seguridad |

---

## Tareas

### AUTORIZACIÓN Y SEGURIDAD

- [ ] **1. Mover LOGIN_ATTEMPTS a Redis o DB**
  - Archivo: `backend/app/main.py`
  - Crear tabla `login_attempts` con campos: ip, email, attempts, window_start
  - Reemplazar dict global por queries a la DB
  - Implementar limpieza periódica de intentos vencidos
  - Verificar: rate limit persiste entre reinicios del contenedor

- [ ] **2. Añadir rate limit en registro**
  - Archivo: `backend/app/main.py`
  - Añadir `REGISTRATION_RATE_LIMIT_ATTEMPTS=5` y `REGISTRATION_RATE_LIMIT_WINDOW_MINUTES=60`
  - Crear función `enforce_registration_rate_limit()` similar a `enforce_login_rate_limit()`
  - Aplicar en `/auth/register`
  - Verificar: registro devuelve 429 tras múltiples intentos

- [ ] **3. Corregir redirect 401 en auth/me público**
  - Archivo: `frontend/src/utils/api.ts`
  - Modificar función `request()` para no redirigir a login cuando `path.startsWith('/auth/')`
  - Verificar: `/auth/me` no hace redirect infinito

### RENDIMIENTO BACKEND

- [ ] **4. Eliminar N+1 en calculate_risk (get_settings chamado N veces)**
  - Archivo: `backend/app/rules.py`
  - `calculate_risk` recibe settings como parámetro en vez de llamar `get_settings(db)` por cada fila
  - Modificar todos los callers para pasar settings una vez
  - Verificar: profiler muestra reducción de queries

- [ ] **5. Corregir commits en getters (base_query)**
  - Archivos: `backend/app/main.py` - endpoints `/presupuestos`, `/presupuestos-page`, `/dashboard`, `/riesgo`, `/hoy`, `/aceptados-sin-pedido`, `/sidebar-counters`, `/mi-mesa`, `/search`
  - Eliminar `db.commit()` innecesario tras `q.all()` o cálculos
  - Verificar: endpoints funcionan igual pero sin commit extra

- [ ] **6. Paginar endpoint /search**
  - Archivo: `backend/app/main.py`
  - Añadir `page` y `page_size` como Query params con defaults (page=1, page_size=20)
  - Aplicar offset/limit en las 3 queries (presupuestos, comentarios, historial)
  - Actualizar schema de respuesta para incluir `total` y `total_pages`
  - Verificar: `/search?q=test&page=1&page_size=20` retorna paginado

- [ ] **7. Corregir N+1 en notifications.py (_log_exists)**
  - Archivos: `backend/app/notifications.py`
  - `build_alerts` ya itera sobre presupuestos -> calcular todos los fingerprints y hacer UNA query EXISTS
  - `send_immediate_alerts_for_budget` -> misma estrategia
  - `send_escalation_alerts` -> misma estrategia
  - Verificar: logs de debug muestran < 5 queries por cada función

- [ ] **8. Añadir índice compuesto para búsqueda rápida**
  - Archivo: `backend/alembic/versions/0003_add_performance_indexes.py`
  - Crear índice compuesto en `presupuestos(estado, archivado, fecha_ultima_actualizacion)`
  - Crear índice compuesto en `presupuestos(numero_presupuesto, cliente, gestor)` para ILIKE
  - Verificar: `EXPLAIN` muestra index scan en vez de seq scan

### TESTS

- [ ] **9. Crear fixtures y setup de test con DB em memoria**
  - Archivo: `backend/tests/conftest.py` (nuevo)
  - Crear engine SQLite en memoria para tests
  - Crear función `test_db()` con SessionLocal
  - Crear fixture `test_presupuesto()` que genera Presupuesto válido
  - Verificar: `pytest tests/` corre sin errores

- [ ] **10. Tests de API endpoints (auth, presupuestos, import)**
  - Archivo: `backend/tests/test_api_auth.py` (nuevo)
  - Test registro: success, email duplicado, rate limit
  - Test login: success, wrong password, rate limit, user pendiente
  - Test password reset: request, confirm, token expirado
  - Archivo: `backend/tests/test_api_presupuestos.py` (nuevo)
  - Test CRUD presupuesto con expected_version
  - Test quick-actions con validation errors
  - Test import preview y confirm
  - Verificar: todos los tests pasan

- [ ] **11. Tests de concurrencia (expected_version)**
  - Archivo: `backend/tests/test_concurrency.py` (nuevo)
  - Simular dos sesiones actualizando el mismo presupuesto con misma version
  - Verificar: segunda запрос devuelve 409 Conflict
  - Verificar: con version correcta, ambas actualizaciones succeeden si son secuenciales

### DOCKER

- [ ] **12. Añadir healthcheck al backend**
  - Archivo: `backend/Dockerfile`
  - Crear endpoint `/health` interno ya existe, añadir `--interval=30s --timeout=10s --retries=3` al docker-compose
  - Verificar: `docker inspect` muestra health status

- [ ] **13. Multi-stage build para imagen ligera**
  - Archivo: `backend/Dockerfile`
  - Stage 1: `python:3.12-slim` con requirements.txt y pip install
  - Stage 2: `python:3.12-slim` sin dev tools, solo lo necesario
  - Copiar solo `/app` y requirements instaladas
  - Verificar: imagen < 250MB

- [ ] **14. Crear usuario no-root en imagen**
  - Archivo: `backend/Dockerfile`
  - Añadir `RUN useradd -m appuser && chown -R appuser /app`
  - Cambiar `USER appuser` al final
  - Verificar: `docker run` no muestra warning de root

### FRONTEND

- [ ] **15. Completar tipos TypeScript faltantes**
  - Archivo: `frontend/src/utils/api.ts`
  - Añadir tipo `QuickAction` completo
  - Añadir tipo `SearchResult` con campos correctos
  - Añadir tipo `KanbanPayload` exportado
  - Verificar: `npm run build` sin errores de tipado

- [ ] **16. Mejorar manejo de errores en Layout (contadores)**
  - Archivo: `frontend/src/components/Layout.tsx`
  - Reemplazar `counters.data as any` por tipado correcto usando `SidebarCounters`
  - Añadir retry automático si falla la carga de contadores (max 3 intentos con backoff)
  - Verificar: console sin warnings de tipado

### CONFIG

- [ ] **17. Validación de rangos en settings**
  - Archivo: `backend/app/settings.py`
  - Añadir validación: `horas_escalado_nivel_X > 0`, `dias_critico_aceptado_sin_pedido > 0`, `intervalo_revision_avisos_minutos >= 5`
  - Rechazar settings con valores inválidos en `/settings` PUT
  - Verificar: PUT con valores negativos devuelve 422

### ALERTA

- [ ] **18. Evitar crecimiento ilimitado de LOGIN_ATTEMPTS**
  - Archivo: `backend/app/main.py`
  - Implementar limpieza automática: cada vez que se llama `enforce_login_rate_limit`, limpiar entradas con `window_start < now - timedelta(minutes=minutes)`
  - Alternativa: usar TTL en Redis si se migra a Redis
  - Verificar: dict no crece > 1000 entradas incluso bajo ataque

---

## Notas de implementación

- Tareas 1 y 2 pueden hacerse en paralelo (son independientes)
- Tareas 4 y 5 deben hacerse antes de 6 (mejoran base para paginación)
- Tareas 9, 10, 11 dependen de 9 (conftest) para la DB de test
- Tareas 12, 13, 14 son independientes entre sí
- Tareas 15 y 16 son independientes
- Tarea 1 puede eliminarse si se implementa tarea 18 con Redis (futuro)

## Criterio de completado

- [ ] Todas las tareas marcadas como completadas
- [ ] `npm run build` pasa en frontend
- [ ] `pytest -q` pasa en backend
- [ ] `docker compose up -d --build` levanta sin errores
- [ ] Tests de concurrencia verifican 409 en race condition