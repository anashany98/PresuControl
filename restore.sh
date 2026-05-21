#!/bin/bash
# Restore script for PostgreSQL - PresuControl V5
# Usage: ./restore.sh ./backups/presucontrol_YYYYmmdd_HHMMSS.sql.gz

set -e

BACKUP_FILE="$1"
CONTAINER_NAME="${CONTAINER_NAME:-presucontrol-postgres}"
DB_NAME="${DB_NAME:-presucontrol}"
DB_USER="${DB_USER:-presucontrol}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "Usage: $0 /path/to/presucontrol_backup.sql.gz"
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restoring $BACKUP_FILE into $DB_NAME..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"

# Verify restore was successful
if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore completed successfully."
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Restore failed!"
    exit 1
fi
