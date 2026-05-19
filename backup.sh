#!/bin/bash
# Backup script for PostgreSQL - PresuControl V5
# Usage: ./backup.sh
# Recommended: Run daily via cron: 0 3 * * * /path/to/backup.sh >> /var/log/presucontrol_backup.log 2>&1

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="${CONTAINER_NAME:-presucontrol-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_NAME="${DB_NAME:-presucontrol}"
DB_USER="${DB_USER:-presucontrol}"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..."

# Perform backup with gzip compression
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_DIR/presucontrol_${DATE}.sql.gz"

# Verify backup is not empty
if [ ! -s "$BACKUP_DIR/presucontrol_${DATE}.sql.gz" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Backup file is empty!"
    exit 1
fi

# Get file size for logging
BACKUP_SIZE=$(du -h "$BACKUP_DIR/presucontrol_${DATE}.sql.gz" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: presucontrol_${DATE}.sql.gz ($BACKUP_SIZE)"

# Clean old backups
OLD_COUNT=$(find "$BACKUP_DIR" -name "presucontrol_*.sql.gz" -mtime +$RETENTION_DAYS | wc -l)
if [ "$OLD_COUNT" -gt 0 ]; then
    find "$BACKUP_DIR" -name "presucontrol_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned up $OLD_COUNT old backup(s)"
fi

# List remaining backups
REMAINING_COUNT=$(find "$BACKUP_DIR" -name "presucontrol_*.sql.gz" | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed successfully. $REMAINING_COUNT backup(s) retained."

# Optional: Upload to S3 (uncomment and configure)
# if [ -n "$AWS_S3_BUCKET" ]; then
#     aws s3 cp "$BACKUP_DIR/presucontrol_${DATE}.sql.gz" "s3://$AWS_S3_BUCKET/backups/"
#     echo "[$(date)] Uploaded to S3: s3://$AWS_S3_BUCKET/backups/presucontrol_${DATE}.sql.gz"
# fi

exit 0
