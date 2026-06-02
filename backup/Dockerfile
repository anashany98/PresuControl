# Backup sidecar for PresuControl V5.
#
# Runs a daily cron job inside the same Docker network as the postgres service,
# executes pg_dump into a gzip-compressed file, optionally encrypts it, and prunes
# old backups based on BACKUP_RETENTION_DAYS. The backup files land in a shared
# named volume (presucontrol_backups) so the host (or Coolify) can snapshot /
# offload them.
#
# Image: alpine + bash + postgresql16-client + openssl + dcron (BusyBox crond).
# Final size: ~25 MB.
FROM alpine:3.20

ARG POSTGRES_VERSION=16

# Build deps for tzdata + bash + postgresql client.
# postgresql${POSTGRES_VERSION}-client ships only the binaries we need
# (pg_dump, psql, dropdb, etc.) — no server.
RUN apk add --no-cache \
        bash \
        coreutils \
        dcron \
        openssl \
        postgresql${POSTGRES_VERSION}-client \
        tzdata \
    && addgroup -S backup && adduser -S -G backup backup

# Cron schedule. The `0 3 * * *` default means 03:00 every day in the container's
# timezone (set via TZ env var, default Europe/Madrid).
ENV BACKUP_SCHEDULE="0 3 * * *" \
    BACKUP_DIR=/backups \
    BACKUP_RETENTION_DAYS=30 \
    TZ=Europe/Madrid \
    PGHOST=postgres \
    PGPORT=5432

WORKDIR /opt/backup

COPY backup.sh        /opt/backup/backup.sh
COPY entrypoint.sh    /opt/backup/entrypoint.sh
COPY healthcheck.sh   /opt/backup/healthcheck.sh
COPY crontab          /opt/backup/crontab

RUN chmod +x /opt/backup/backup.sh /opt/backup/entrypoint.sh /opt/backup/healthcheck.sh \
    && mkdir -p /backups \
    && chown -R backup:backup /opt/backup /backups

USER backup
VOLUME ["/backups"]

ENTRYPOINT ["/opt/backup/entrypoint.sh"]
CMD ["crond", "-f", "-d", "0"]
