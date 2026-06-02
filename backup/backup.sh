#!/usr/bin/env bash
# In-container backup script for the backup sidecar.
#
# Connects directly to the postgres service via PGHOST (set in docker-compose)
# and produces a gzipped SQL dump, optionally encrypted with AES-256.
#
# Required env:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, POSTGRES_DB (passed from compose env)
# Optional env:
#   BACKUP_DIR              (default: /backups)
#   BACKUP_RETENTION_DAYS   (default: 30)
#   BACKUP_ENCRYPTION_PASSWORD  (if set, dump is encrypted with openssl)
#
# Exit code:
#   0  on success
#   1  on any failure (with a non-zero exit, the cron entry will log an error)
set -euo pipefail

# ── Inputs ────────────────────────────────────────────────────────
DB_NAME="${POSTGRES_DB:-presucontrol}"
DB_USER="${POSTGRES_USER:-presucontrol}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/presucontrol_backup_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[backup $(date -Iseconds)]"

log() { printf '%s %s\n' "$LOG_PREFIX" "$*"; }
err() { printf '%s ERROR: %s\n' "$LOG_PREFIX" "$*" >&2; }

# ── Preflight ─────────────────────────────────────────────────────
if [[ -z "${PGPASSWORD:-}" ]]; then
    err "PGPASSWORD is empty — cannot connect to postgres"
    exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
    err "pg_dump not found in PATH"
    exit 1
fi
mkdir -p "$BACKUP_DIR"

# Wait for postgres to be reachable (cheap retry loop, no psql ping required)
attempt=0
max_attempts=10
until pg_dump --version >/dev/null 2>&1 && {
    timeout 5 bash -c "echo > /dev/tcp/${PGHOST}/${PGPORT}" 2>/dev/null
}; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $max_attempts ]]; then
        err "postgres at ${PGHOST}:${PGPORT} not reachable after ${max_attempts} attempts"
        exit 1
    fi
    log "Waiting for postgres (attempt $attempt/$max_attempts)..."
    sleep 5
done

# ── Dump ──────────────────────────────────────────────────────────
log "Starting backup to: $BACKUP_FILE"
if ! pg_dump -h "$PGHOST" -p "${PGPORT:-5432}" -U "$DB_USER" -d "$DB_NAME" \
        --no-owner --no-acl --no-password \
        | gzip > "$BACKUP_FILE"; then
    err "pg_dump failed"
    rm -f "$BACKUP_FILE"
    exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup completed: $SIZE"

# ── Integrity check ───────────────────────────────────────────────
# Decompress and count CREATE TABLE statements.
TABLE_COUNT=$(gunzip -c "$BACKUP_FILE" | grep -c "CREATE TABLE" || true)
if [[ "$TABLE_COUNT" -lt 5 ]]; then
    err "Backup looks incomplete (only $TABLE_COUNT CREATE TABLE statements)"
    exit 1
fi
log "Verified: $TABLE_COUNT tables in dump"

# ── Optional encryption ───────────────────────────────────────────
if [[ -n "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
    ENCRYPTED_FILE="${BACKUP_FILE}.enc"
    openssl enc -aes-256-cbc -salt -pbkdf2 \
        -pass pass:"$BACKUP_ENCRYPTION_PASSWORD" \
        -in "$BACKUP_FILE" -out "$ENCRYPTED_FILE"
    rm -f "$BACKUP_FILE"
    log "Encrypted → $ENCRYPTED_FILE"
fi

# ── Retention ─────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "presucontrol_backup_*" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
    log "Pruned $DELETED backup(s) older than $RETENTION_DAYS days"
fi

# ── Heartbeat ─────────────────────────────────────────────────────
# Touch a marker file so external healthchecks can verify the sidecar is alive
# and that backups are recent enough.
date +%s > "${BACKUP_DIR}/.last_backup_at"
log "Backup job finished."
