#!/usr/bin/env bash
set -euo pipefail
BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz> [--encrypted]}"
echo "WARNING: This will overwrite existing data."
read -p "Continue? (yes/no): " CONFIRM
[[ "$CONFIRM" != "yes" ]] && echo "Cancelled." && exit 0

DB_NAME="${DB_NAME:-presucontrol}"
DB_USER="${DB_USER:-presucontrol}"

# Container names: use env vars, then defaults, then auto-detect
PG_CONTAINER="${BACKUP_PG_CONTAINER:-}"
BACKEND_CONTAINER="${BACKUP_BACKEND_CONTAINER:-}"

if [[ -z "$PG_CONTAINER" ]]; then
    PG_CONTAINER=$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -1)
    if [[ -z "$PG_CONTAINER" ]]; then
        PG_CONTAINER="presucontrol-postgres"
    fi
fi

# Verify PostgreSQL container is running
if ! docker inspect "$PG_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "ERROR: PostgreSQL container '$PG_CONTAINER' is not running." >&2
    exit 1
fi
echo "Using PostgreSQL container: $PG_CONTAINER"

RESTORE_FILE="$BACKUP_FILE"

if [[ "${2:-}" == "--encrypted" ]]; then
    [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]] && echo "ERROR: BACKUP_ENCRYPTION_PASSWORD required." && exit 1
    RESTORE_FILE="${BACKUP_FILE}.decrypted"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_PASSWORD" -in "$BACKUP_FILE" -out "$RESTORE_FILE"
fi

# Drop and recreate database inside the container
docker exec "$PG_CONTAINER" dropdb -U "$DB_USER" --if-exists "$DB_NAME" 2>/dev/null || true
docker exec "$PG_CONTAINER" createdb -U "$DB_USER" "$DB_NAME" 2>/dev/null || true

# Restore: pipe decompressed SQL into psql inside the container
gunzip -c "$RESTORE_FILE" | docker exec -i "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
echo "[$(date -Iseconds)] Restore completed."

# Run Alembic migrations via the backend container
if [[ -z "$BACKEND_CONTAINER" ]]; then
    BACKEND_CONTAINER=$(docker ps --filter "ancestor=presucontrol_v5_app-backend" --format '{{.Names}}' | head -1)
    if [[ -z "$BACKEND_CONTAINER" ]]; then
        BACKEND_CONTAINER=$(docker ps --filter "name=backend" --format '{{.Names}}' | head -1)
    fi
    if [[ -z "$BACKEND_CONTAINER" ]]; then
        BACKEND_CONTAINER="presucontrol-backend"
    fi
fi

if docker inspect "$BACKEND_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "Using backend container: $BACKEND_CONTAINER"
    docker exec "$BACKEND_CONTAINER" alembic upgrade head
    echo "[$(date -Iseconds)] Migrations applied."
else
    echo "WARNING: Backend container '$BACKEND_CONTAINER' not running. Skipping migrations." >&2
fi

[[ "$RESTORE_FILE" != "$BACKUP_FILE" ]] && rm -f "$RESTORE_FILE"
echo "[$(date -Iseconds)] Full restore completed."
