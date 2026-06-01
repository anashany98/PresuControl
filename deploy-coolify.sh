#!/usr/bin/env bash
# ==============================================================================
# PresuControl V5 - Coolify Deployment Preparation Script
# ==============================================================================
# Generates strong random secrets and a ready-to-paste env block for Coolify UI.
# Run once before deploying. Re-run to rotate secrets (backs up old .env.production).
#
# Usage:
#   ./deploy-coolify.sh                       # generate + show Coolify block
#   ./deploy-coolify.sh --env-only            # only write .env.production
#   ./deploy-coolify.sh --coolify-block-only  # only print the env block for UI
#   ./deploy-coolify.sh --validate            # validate config without deploying
#   ./deploy-coolify.sh --domain DOMAIN       # set your production domain
#
# Requirements: bash, openssl, python3 (for validation)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
DOMAIN="presucontrol.tuempresa.com"
COOLIFY_BLOCK_ONLY=false
ENV_ONLY=false
VALIDATE_ONLY=false

# ---- Parse args ----
while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --coolify-block-only) COOLIFY_BLOCK_ONLY=true; shift ;;
        --env-only) ENV_ONLY=true; shift ;;
        --validate) VALIDATE_ONLY=true; shift ;;
        -h|--help)
            awk '/^[^#]/{exit} {sub(/^# ?/,""); print}' "$0"
            exit 0
            ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

# ---- Helpers ----
gen_secret() {
    # 48 bytes -> ~64 chars base64
    openssl rand -base64 48 | tr -d '\n'
}

gen_password() {
    # 24 bytes -> ~32 chars base64, URL-safe
    openssl rand -base64 24 | tr -d '\n=+/' | cut -c1-24
}

# ---- Validate-only mode ----
if $VALIDATE_ONLY; then
    echo "==> Validating docker-compose.prod.yml..."
    if ! command -v docker >/dev/null 2>&1; then
        echo "ERROR: docker not installed" >&2; exit 1
    fi
    docker compose -f docker-compose.prod.yml config --quiet && echo "OK: compose valid"
    echo "==> Validating .env.production..."
    if [[ ! -f .env.production ]]; then
        echo "ERROR: .env.production not found. Run without --validate first." >&2; exit 1
    fi
    cd backend
    set -a; source ../.env.production; set +a
    python3 -c "from app.config import validate_runtime_config; validate_runtime_config()" \
        && echo "OK: runtime config valid for production"
    exit 0
fi

# ---- Generate secrets ----
echo "==> Generating strong random secrets..."
JWT_SECRET=$(gen_secret)
DB_PASSWORD=$(gen_password)

# ---- Backup existing .env.production if present ----
if [[ -f .env.production ]]; then
    BACKUP=".env.production.backup.$(date +%Y%m%d_%H%M%S)"
    echo "==> Backing up existing .env.production -> $BACKUP"
    mv .env.production "$BACKUP"
fi

# ---- Write .env.production ----
cat > .env.production <<EOF
# PresuControl V5 - Production Environment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT COMMIT. Add to .gitignore if not already.

# Environment
ENV=production

# Database
POSTGRES_DB=presucontrol
POSTGRES_USER=presucontrol
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://presucontrol:${DB_PASSWORD}@postgres:5432/presucontrol
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=30
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600

# Auth (BUG-05: rate limit per email + IP)
AUTH_ENABLED=true
JWT_SECRET_KEY=${JWT_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=720
LOGIN_RATE_LIMIT_ATTEMPTS=5
LOGIN_RATE_LIMIT_WINDOW_MINUTES=10
REGISTRATION_REQUIRES_APPROVAL=true

# CORS + public URL (REQUIRED: HTTPS)
CORS_ORIGINS=https://${DOMAIN}
APP_PUBLIC_URL=https://${DOMAIN}
APP_TIMEZONE=Europe/Madrid

# SMTP (Office365 example - replace with your provider)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=avisos@${DOMAIN#*.}
SMTP_PASSWORD=REPLACE_WITH_YOUR_APP_PASSWORD
SMTP_FROM=avisos@${DOMAIN#*.}
SMTP_TLS=true

# Scheduler + migrations
SCHEDULER_ENABLED=true
RUN_CREATE_ALL=false
RUN_DEFENSIVE_MIGRATIONS=false
EOF

echo "==> Wrote .env.production (POSTGRES_PASSWORD + JWT_SECRET_KEY are real secrets)"

# ---- Print Coolify UI block ----
print_coolify_block() {
    cat <<EOF

============================================================
COOLIFY UI: Environment Variables (copy-paste this block)
============================================================

ENV=production
POSTGRES_DB=presucontrol
POSTGRES_USER=presucontrol
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://presucontrol:${DB_PASSWORD}@postgres:5432/presucontrol
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=30
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600
AUTH_ENABLED=true
JWT_SECRET_KEY=${JWT_SECRET}
ACCESS_TOKEN_EXPIRE_MINUTES=720
CORS_ORIGINS=https://${DOMAIN}
APP_PUBLIC_URL=https://${DOMAIN}
APP_TIMEZONE=Europe/Madrid
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=avisos@${DOMAIN#*.}
SMTP_PASSWORD=REPLACE_WITH_YOUR_APP_PASSWORD
SMTP_FROM=avisos@${DOMAIN#*.}
SMTP_TLS=true
SCHEDULER_ENABLED=true
REGISTRATION_REQUIRES_APPROVAL=true
LOGIN_RATE_LIMIT_ATTEMPTS=5
LOGIN_RATE_LIMIT_WINDOW_MINUTES=10
RUN_CREATE_ALL=false
RUN_DEFENSIVE_MIGRATIONS=false

============================================================
SECRETS TO SAVE OUTSIDE COOLIFY (in your password manager):
============================================================
POSTGRES_PASSWORD: ${DB_PASSWORD}
JWT_SECRET_KEY:    ${JWT_SECRET}

============================================================
NEXT STEPS:
============================================================
1. Coolify UI: New Resource -> Docker Compose
2. Point to: docker-compose.prod.yml
3. Paste the env block above (replace SMTP_PASSWORD)
4. Domain: ${DOMAIN} (auto-SSL via Traefik)
5. Deploy
6. Verify: curl -I https://${DOMAIN}/api/health  (expect 200)
7. Backend terminal in Coolify: ADMIN_PASSWORD=<choose> ADMIN_EMAIL=admin@${DOMAIN#*.} python seed_admin.py
8. Configure scheduled backup (postgres service -> 0 3 * * *)
EOF
}

if ! $ENV_ONLY; then
    print_coolify_block
fi

echo
echo "Done. .env.production is gitignored."
