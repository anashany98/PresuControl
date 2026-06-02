#!/usr/bin/env bash
# Container entrypoint: materialize the crontab from BACKUP_SCHEDULE,
# log a "ready" line so Coolify/operators can see the boot succeeded,
# then exec crond in foreground so the container stays up.
set -euo pipefail

CRONTAB_FILE="/opt/backup/crontab"
RUNTIME_CRONTAB="/opt/backup/crontab.runtime"
SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"

# Substitute the placeholder with the user-provided cron expression.
sed "s|__BACKUP_SCHEDULE__|${SCHEDULE}|g" "$CRONTAB_FILE" > "$RUNTIME_CRONTAB"

# Install the crontab for the current user (backup).
crontab "$RUNTIME_CRONTAB"

# Boot log — visible in `docker logs`.
echo "[entrypoint $(date -Iseconds)] crond installed; schedule='${SCHEDULE}'"
echo "[entrypoint $(date -Iseconds)] backup dir=${BACKUP_DIR:-/backups} retention=${BACKUP_RETENTION_DAYS:-30}d"
echo "[entrypoint $(date -Iseconds)] postgres=${PGHOST:-unset}:${PGPORT:-5432}/${POSTGRES_DB:-presucontrol}"

# Touch the heartbeat file at boot so the first healthcheck doesn't fail
# before the first scheduled run.
mkdir -p "${BACKUP_DIR:-/backups}"
date +%s > "${BACKUP_DIR:-/backups}/.last_backup_at"

# Exec the cron daemon. -f = foreground, -d 0 = log to stderr (we already
# pipe the cron command's stdout/stderr to fd 1/2 via /proc/1/fd/1).
exec crond -f -d 0
