#!/usr/bin/env bash
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
DB_NAME="${DB_NAME:-presucontrol}"
DB_USER="${DB_USER:-presucontrol}"
# Container name: use BACKUP_CONTAINER env var, then presucontrol-postgres, then auto-detect
CONTAINER="${BACKUP_CONTAINER:-}"
ENCRYPT=false
[[ "${1:-}" == "--encrypt" ]] && ENCRYPT=true

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/presucontrol_backup_${TIMESTAMP}.sql.gz"
echo "[$(date -Iseconds)] Starting backup to: $BACKUP_FILE"

# Detect container if not explicitly set
if [[ -z "$CONTAINER" ]]; then
    CONTAINER=$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -1)
    if [[ -z "$CONTAINER" ]]; then
        CONTAINER="presucontrol-postgres"
    fi
fi

# Verify container is running
if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "ERROR: PostgreSQL container '$CONTAINER' is not running." >&2
    exit 1
fi
echo "[$(date -Iseconds)] Using container: $CONTAINER"

# Run pg_dump inside the container
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_FILE"
echo "[$(date -Iseconds)] Backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"

# Verify backup integrity: must contain at least 5 tables
TABLE_COUNT=$(gunzip -c "$BACKUP_FILE" | grep -c "CREATE TABLE")
if [ "$TABLE_COUNT" -lt 5 ]; then
    echo "ERROR: Backup parece incompleto (solo $TABLE_COUNT tablas)" >&2
    exit 1
fi
echo "Backup verificado: $TABLE_COUNT tablas"

if $ENCRYPT; then
    [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]] && echo "ERROR: BACKUP_ENCRYPTION_PASSWORD not set." && exit 1
    ENCRYPTED_FILE="${BACKUP_FILE}.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_PASSWORD" -in "$BACKUP_FILE" -out "$ENCRYPTED_FILE"
    rm "$BACKUP_FILE"
    echo "[$(date -Iseconds)] Encrypted: $ENCRYPTED_FILE"
fi

DELETED=$(find "$BACKUP_DIR" -name "presucontrol_backup_*" -mtime +"$RETENTION" -delete -print | wc -l)
[[ $DELETED -gt 0 ]] && echo "[$(date -Iseconds)] Cleaned $DELETED old backup(s)"

echo "[$(date -Iseconds)] Backup job finished."
