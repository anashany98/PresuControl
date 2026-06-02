# Backup sidecar

A self-contained Docker image that runs `pg_dump` against the postgres
service on a cron schedule, gzips the result, optionally encrypts it with
AES-256, and prunes old backups. Drop it into a Compose stack and forget
about it.

## What runs when

The default cron schedule is **03:00 every day** (`0 3 * * *` in the
container's timezone — `Europe/Madrid` by default). Override with the
`BACKUP_SCHEDULE` env var (a standard 5-field cron expression).

## Files

```
backup/
├── Dockerfile       # alpine + postgresql16-client + dcron + openssl
├── backup.sh        # the actual pg_dump + rotate + encrypt
├── entrypoint.sh    # installs the crontab and execs crond in foreground
└── crontab          # template; BACKUP_SCHEDULE is substituted at runtime
```

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `BACKUP_SCHEDULE` | `0 3 * * *` | 5-field cron expression |
| `BACKUP_DIR` | `/backups` | Where dumps land (mounted volume) |
| `BACKUP_RETENTION_DAYS` | `30` | Days to keep on disk |
| `BACKUP_ENCRYPTION_PASSWORD` | _(empty)_ | If set, dumps are AES-256 encrypted |
| `PGHOST` | `postgres` | Set automatically by Compose |
| `PGPORT` | `5432` | |
| `POSTGRES_DB` | `presucontrol` | |
| `POSTGRES_USER` | `presucontrol` | |
| `PGPASSWORD` | _(from compose env)_ | Required |
| `TZ` | `Europe/Madrid` | Affects cron trigger time and dump filename timestamp |

## Where the files live

`presucontrol_backups` is a **named Docker volume**. On the host it shows up
under `/var/lib/docker/volumes/<project>_presucontrol_backups/_data/`. To
inspect it from the host:

```bash
docker exec presucontrol-backup ls -lh /backups
```

To copy a backup out of the volume to the host (e.g. before triggering a
restore):

```bash
docker cp presucontrol-backup:/backups/presucontrol_backup_20260602_030000.sql.gz ./
```

## Running an out-of-band backup

The container is a regular Alpine image with `pg_dump` installed. To trigger
a backup without waiting for the cron tick:

```bash
docker exec -u backup presucontrol-backup /opt/backup/backup.sh
```

## Restoring

`scripts/restore.sh` at the repo root knows how to:
1. Decrypt the file (if `--encrypted` is passed).
2. Drop + recreate the database inside the postgres container.
3. Stream the dump into `psql` inside the postgres container.
4. Run `alembic upgrade head` against the backend container.

See `scripts/restore.sh` for the full contract.

## Why a sidecar and not a host-level cron

- **Self-contained**: the backup config is part of the Compose stack — no
  manual `crontab -e` on the host.
- **Network-local**: it talks to postgres via the internal `internal`
  bridge, not over a published port.
- **Reproducible**: deploying the stack on a new VPS recreates the same
  backup schedule without operator intervention.
- **Inspectable**: `docker logs presucontrol-backup` shows every run.
