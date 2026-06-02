#!/usr/bin/env bash
# List backups in the shared volume (presucontrol_backups).
#
# Use this to find the file to pass to scripts/restore.sh.
set -euo pipefail

# Container name: use env var, then default name, then auto-detect
CONTAINER="${BACKUP_CONTAINER:-}"
if [[ -z "$CONTAINER" ]]; then
    CONTAINER=$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -1)
    if [[ -z "$CONTAINER" ]]; then
        CONTAINER="presucontrol-postgres"
    fi
fi

echo "Inspecting backup volume (mounted at /backups in the backup sidecar)..."
docker run --rm \
    --volumes-from "$CONTAINER" \
    alpine:3.20 \
    sh -c '
        echo "--- volume mount ---"
        mount | grep -E "backups|/backups" || echo "(no mount info)"
        echo
        echo "--- /backups contents ---"
        ls -lh /backups 2>/dev/null || echo "(/backups not visible from this container — run from host: docker exec presucontrol-backup ls -lh /backups)"
        echo
        echo "--- last backup heartbeat ---"
        cat /backups/.last_backup_at 2>/dev/null || echo "(no heartbeat yet)"
    '
