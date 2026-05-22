# Checklist de Despliegue - PresuControl V5

## Antes del despliegue

- [ ] Backup completo de PostgreSQL ejecutado y verificado
  ```bash
  ./scripts/backup.sh --encrypt
  ```
- [ ] Migraciones Alembic probadas contra staging
  ```bash
  cd backend && python -m alembic upgrade head
  ```
- [ ] Tests pasando en local
  ```bash
  python -m pytest backend/tests/ -q
  ```
- [ ] Frontend compila sin errores
  ```bash
  cd frontend && npm run build
  ```
- [ ] Docker images construyen correctamente
  ```bash
  docker compose build
  ```
- [ ] `.env` de producción revisado: sin placeholders
  - `JWT_SECRET_KEY` >= 32 chars
  - `POSTGRES_PASSWORD` >= 16 chars
  - `CORS_ORIGINS` sin `*`
  - `APP_PUBLIC_URL` con HTTPS

## Despliegue

- [ ] Pull de última versión
  ```bash
  git pull origin main
  ```
- [ ] Detener servicios
  ```bash
  docker compose down
  ```
- [ ] Reconstruir imágenes
  ```bash
  docker compose build --no-cache
  ```
- [ ] Ejecutar migraciones
  ```bash
  docker compose run --rm backend python -m alembic upgrade head
  ```
- [ ] Levantar servicios
  ```bash
  docker compose up -d
  ```
- [ ] Verificar salud
  ```bash
  curl -f http://localhost:8000/health
  curl -f http://localhost:8000/health/db
  ```

## Smoke tests post-despliegue

- [ ] Login funcional
- [ ] Listado de presupuestos carga
- [ ] Dashboard muestra datos
- [ ] Crear presupuesto de prueba
- [ ] Kanban funciona (arrastrar entre estados)
- [ ] Búsqueda global devuelve resultados
- [ ] Importación/exportación no crashea

## Rollback (si algo falla)

- [ ] Detener servicios
  ```bash
  docker compose down
  ```
- [ ] Restaurar backup
  ```bash
  ./scripts/restore.sh backups/presucontrol_backup_YYYYMMDD_HHMMSS.sql.gz
  ```
- [ ] Volver a versión anterior
  ```bash
  git checkout <commit_anterior>
  docker compose build
  docker compose up -d
  ```
- [ ] Verificar salud nuevamente
