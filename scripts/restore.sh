#!/usr/bin/env bash
set -euo pipefail
BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz> [--encrypted]}"
echo "WARNING: This will overwrite existing data."
read -p "Continue? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && echo "Cancelled." && exit 0

if [[ -f .env ]]; then set -a; source .env; set +a; fi

if [[ -n "${DATABASE_URL:-}" ]]; then
    export PGHOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:/]*\).*//p')
    export PGPORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*//p')
    export PGUSER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*//p')
    export PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*//p')
fi

DB_NAME="${DB_NAME:-presucontrol}"
RESTORE_FILE="$BACKUP_FILE"

if [[ "${2:-}" == "--encrypted" ]]; then
    [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]] && echo "ERROR: BACKUP_ENCRYPTION_PASSWORD required." && exit 1
    RESTORE_FILE="${BACKUP_FILE}.decrypted"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_PASSWORD" -in "$BACKUP_FILE" -out "$RESTORE_FILE"
fi

dropdb --if-exists "$DB_NAME" 2>/dev/null || true
createdb "$DB_NAME" 2>/dev/null || true
gunzip -c "$RESTORE_FILE" | psql -d "$DB_NAME"
echo "[$(date -Iseconds)] Restore completed."

cd "$(dirname "$0")/../backend"
python -m alembic upgrade head
echo "[$(date -Iseconds)] Migrations applied."

[[ "$RESTORE_FILE" != "$BACKUP_FILE" ]] && rm -f "$RESTORE_FILE"
echo "[$(date -Iseconds)] Full restore completed."
