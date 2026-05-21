#!/bin/bash
# Script de backup automatico para PresuControl
# Ejecutar como cron job: 0 2 * * * /app/scripts/backup.sh
#
# REQUISITOS:
# - Crear archivo .pgpass en /app con formato: hostname:port:database:username:password
#   Ejemplo: postgres:5432:presucontrol:presucontrol:your_password
#   Permisos: chmod 600 /app/.pgpass
# - Definir BACKUP_ENCRYPTION_PASSWORD como variable de entorno o en .pgpass
#
# Generar password seguro: openssl rand -base64 32

set -e

# Configuracion
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-presucontrol}"
DB_USER="${POSTGRES_USER:-presucontrol}"
BACKUP_ENCRYPTION_PASSWORD="${BACKUP_ENCRYPTION_PASSWORD:-}"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Fecha y hora
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/presucontrol_$DATE.sql"
BACKUP_ENC_FILE="$BACKUP_DIR/presucontrol_${DATE}.sql.gz.enc"
CHECKSUM_FILE="$BACKUP_DIR/presucontrol_${DATE}.sha256"

# Log
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Iniciando backup de base de datos..."

# Verificar que BACKUP_ENCRYPTION_PASSWORD esta configurado
if [ -z "$BACKUP_ENCRYPTION_PASSWORD" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: BACKUP_ENCRYPTION_PASSWORD no esta configurado"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Ejemplo: export BACKUP_ENCRYPTION_PASSWORD=\$(openssl rand -base64 32)"
    exit 1
fi

# Configurar pgpass para evitar credenciales en CLI
export PGPASSFILE=/app/.pgpass

# Ejecutar backup (usa PGPASSFILE para credenciales)
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$BACKUP_FILE"

# Generar checksum del backup sin comprimir
sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"

# Comprimir y cifrar
gzip -c "$BACKUP_FILE" | openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSWORD -out "$BACKUP_ENC_FILE"

# Verificar que el archivo cifrado se creo correctamente
if [ ! -f "$BACKUP_ENC_FILE" ] || [ ! -s "$BACKUP_ENC_FILE" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: No se pudo crear el backup cifrado"
    exit 1
fi

# Eliminar archivos temporales
rm -f "$BACKUP_FILE" "$CHECKSUM_FILE"

# Log
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup completado: $BACKUP_ENC_FILE"

# Eliminar backups antiguos (mas de 30 dias)
find "$BACKUP_DIR" -name "presucontrol_*.sql.gz.enc" -mtime +30 -delete

# Contar backups restantes
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/presucontrol_*.sql.gz.enc 2>/dev/null | wc -l)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Total de backups disponibles: $BACKUP_COUNT"

# Verificar tamanho del backup
SIZE=$(du -h "$BACKUP_ENC_FILE" | cut -f1)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Tamanho del backup: $SIZE"

exit 0