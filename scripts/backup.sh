#!/usr/bin/env bash
set -euo pipefail
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
DB_NAME="${DB_NAME:-presucontrol}"
ENCRYPT=false
[[ "${1:-}" == "--encrypt" ]] && ENCRYPT=true

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/presucontrol_backup_${TIMESTAMP}.sql.gz"
echo "[$(date -Iseconds)] Starting backup to: $BACKUP_FILE"

if [[ -f .env ]]; then set -a; source .env; set +a; fi

if [[ -n "${DATABASE_URL:-}" ]]; then
    export PGHOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*//p')
    export PGPORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*//p')
    export PGUSER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*//p')
    export PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*//p')
fi

pg_dump -d "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_FILE"
echo "[$(date -Iseconds)] Backup completed: $(du -h "$BACKUP_FILE" | cut -f1)"

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
