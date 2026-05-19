#!/bin/bash
# Script de backup automático para PresuControl
# Ejecutar como cron job: 0 2 * * * /app/scripts/backup.sh

set -e

# Configuración
BACKUP_DIR="/app/backups"
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-presucontrol}"
DB_USER="${POSTGRES_USER:-presucontrol}"
DB_PASSWORD="${POSTGRES_PASSWORD:-presucontrol}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Fecha y hora
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/presucontrol_$DATE.sql"

# Log
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Iniciando backup de base de datos..."

# Ejecutar backup
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$BACKUP_FILE"

# Comprimir
gzip "$BACKUP_FILE"

# Log
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup completado: ${BACKUP_FILE}.gz"

# Eliminar backups antiguos (más de 30 días)
find "$BACKUP_DIR" -name "presucontrol_*.sql.gz" -mtime +30 -delete

# Contar backups restantes
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/presucontrol_*.sql.gz 2>/dev/null | wc -l)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Total de backups disponibles: $BACKUP_COUNT"

# Verificar que el backup se creó correctamente
if [ -f "${BACKUP_FILE}.gz" ]; then
    SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Tamaño del backup: $SIZE"
    exit 0
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: No se pudo crear el backup"
    exit 1
fi
