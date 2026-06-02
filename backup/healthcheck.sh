#!/bin/sh
# Docker HEALTHCHECK for the backup sidecar.
#
# Verifies three things in order:
#   1. crond is running (the cron daemon is alive)
#   2. the heartbeat file exists (at least one backup has completed since
#      container start, OR the entrypoint just touched the file)
#   3. the heartbeat is recent (last successful backup finished within the
#      last BACKUP_HEALTHCHECK_MAX_AGE seconds, default 25h)
#
# Exit code:
#   0  healthy
#   1  unhealthy
set -eu

HEARTBEAT="/backups/.last_backup_at"
# 25h = 90000s. Allows for daily schedule + 1h of slack (cron drift, slow pg_dump).
# Override with BACKUP_HEALTHCHECK_MAX_AGE for non-default schedules.
MAX_AGE="${BACKUP_HEALTHCHECK_MAX_AGE:-90000}"

# 1. Is the cron daemon alive?
if ! pgrep -x crond >/dev/null 2>&1; then
    echo "HEALTHCHECK FAIL: crond is not running" >&2
    exit 1
fi

# 2. Does the heartbeat exist?
if [ ! -f "$HEARTBEAT" ]; then
    echo "HEALTHCHECK FAIL: $HEARTBEAT does not exist" >&2
    exit 1
fi

# 3. Is the heartbeat recent?
now="$(date +%s)"
last="$(cat "$HEARTBEAT")"
# Defensive: if the file is empty or non-numeric, treat as stale.
case "$last" in
    ''|*[!0-9]*) echo "HEALTHCHECK FAIL: heartbeat is not a unix timestamp: '$last'" >&2; exit 1 ;;
esac
age=$((now - last))
if [ "$age" -gt "$MAX_AGE" ]; then
    echo "HEALTHCHECK FAIL: last backup was $age seconds ago (threshold: $MAX_AGE)" >&2
    exit 1
fi

exit 0
