#!/bin/bash
# PresuControl V5 - Pre-Production Validation Script
# Run this before deploying to production

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo "============================================"
echo "PresuControl V5 - Pre-Production Validation"
echo "============================================"
echo ""

# Function to print status
check() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        ERRORS=$((ERRORS + 1))
    fi
}

# 1. Check .env exists and has real values
echo "=== 1. Environment Configuration ==="
if [ -f .env ]; then
    check 0 ".env exists"

    # Check for placeholder values
    if grep -q "CHANGE_THIS" .env 2>/dev/null; then
        check 1 ".env contains placeholder values (CHANGE_THIS)"
    else
        check 0 ".env has production values"
    fi

    if grep -q "generar_" .env 2>/dev/null; then
        check 1 ".env contains 'generar_' placeholders"
    else
        check 0 ".env secrets appear to be set"
    fi
else
    check 1 ".env not found (copy .env.production.example)"
fi

# 2. Check JWT_SECRET_KEY length
echo ""
echo "=== 2. Security Secrets ==="
JWT_KEY=$(grep "^JWT_SECRET_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d ' ')
if [ ${#JWT_KEY} -ge 64 ]; then
    check 0 "JWT_SECRET_KEY is sufficiently long (${#JWT_KEY} chars)"
else
    check 1 "JWT_SECRET_KEY too short (${#JWT_KEY} chars, need >=64)"
fi

PG_PASS=$(grep "^POSTGRES_PASSWORD=" .env 2>/dev/null | cut -d'=' -f2- | tr -d ' ')
if [ ${#PG_PASS} -ge 32 ]; then
    check 0 "POSTGRES_PASSWORD is sufficiently long (${#PG_PASS} chars)"
else
    check 1 "POSTGRES_PASSWORD too short (${#PG_PASS} chars, need >=32)"
fi

# 3. Check CORS_ORIGINS
echo ""
echo "=== 3. CORS Configuration ==="
CORS=$(grep "^CORS_ORIGINS=" .env 2>/dev/null | cut -d'=' -f2-)
if echo "$CORS" | grep -q "localhost"; then
    check 1 "CORS_ORIGINS contains localhost (should be production domain)"
else
    check 0 "CORS_ORIGINS is production-ready"
fi

# 4. Check AUTH_ENABLED
echo ""
echo "=== 4. Authentication ==="
AUTH=$(grep "^AUTH_ENABLED=" .env 2>/dev/null | cut -d'=' -f2-)
if [ "$AUTH" = "true" ]; then
    check 0 "AUTH_ENABLED=true"
else
    check 1 "AUTH_ENABLED is not true (currently: $AUTH)"
fi

# 5. Check Docker is running
echo ""
echo "=== 5. Docker Environment ==="
if docker info >/dev/null 2>&1; then
    check 0 "Docker is running"
else
    check 1 "Docker is not running"
fi

# 6. Check PostgreSQL port not exposed
echo ""
echo "=== 6. Network Security ==="
if grep -q "5432" docker-compose.yml 2>/dev/null; then
    check 1 "PostgreSQL port (5432) found in docker-compose.yml"
else
    check 0 "PostgreSQL port not exposed publicly"
fi

# 7. Check SSL-related settings for APP_PUBLIC_URL
echo ""
echo "=== 7. SSL/HTTPS Readiness ==="
PUBLIC_URL=$(grep "^APP_PUBLIC_URL=" .env 2>/dev/null | cut -d'=' -f2-)
if echo "$PUBLIC_URL" | grep -q "^https://"; then
    check 0 "APP_PUBLIC_URL uses HTTPS"
else
    check 1 "APP_PUBLIC_URL should use HTTPS (currently: $PUBLIC_URL)"
fi

# 8. Check backup script exists
echo ""
echo "=== 8. Backup System ==="
if [ -f scripts/backup.sh ]; then
    check 0 "scripts/backup.sh exists"
    if [ -x scripts/backup.sh ] || [ -f scripts/backup.sh ]; then
        check 0 "scripts/backup.sh is accessible"
    fi
else
    check 1 "scripts/backup.sh not found"
fi

# 8b. Check backup sidecar (in-container, cron-driven)
if [ -f backup/Dockerfile ] && [ -f backup/backup.sh ] && [ -f backup/entrypoint.sh ] && [ -f backup/crontab ]; then
    check 0 "Backup sidecar (backup/) is configured"
else
    check 1 "Backup sidecar is incomplete — expected backup/{Dockerfile,backup.sh,entrypoint.sh,crontab}"
fi

# 8c. Check BACKUP_SCHEDULE is sane (5-field cron expression)
BACKUP_SCHEDULE_VAL=$(grep "^BACKUP_SCHEDULE=" .env 2>/dev/null | cut -d'=' -f2- | tr -d ' ')
if [ ${#BACKUP_SCHEDULE_VAL} -ge 9 ] && [ ${#BACKUP_SCHEDULE_VAL} -le 30 ]; then
    check 0 "BACKUP_SCHEDULE looks like a cron expression (${BACKUP_SCHEDULE_VAL})"
else
    check 1 "BACKUP_SCHEDULE is missing or invalid (got: '${BACKUP_SCHEDULE_VAL}')"
fi

# 9. Check restore script exists
if [ -f scripts/restore.sh ]; then
    check 0 "scripts/restore.sh exists"
else
    check 1 "scripts/restore.sh not found"
fi

# 10. Run tests if possible
echo ""
echo "=== 9. Test Suite ==="
if [ -d backend ] && [ -f backend/requirements.txt ]; then
    echo "Running pytest (this may take a minute)..."
    cd backend
    if pip install -q -r requirements.txt 2>/dev/null && pytest -q --tb=no >/dev/null 2>&1; then
        check 0 "All tests pass"
    else
        check 1 "Some tests fail (run 'cd backend && pytest' for details)"
    fi
    cd ..
else
    echo -e "${YELLOW}⊘${NC} Backend not found, skipping tests"
fi

# Summary
echo ""
echo "============================================"
echo "SUMMARY"
echo "============================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. docker compose build"
    echo "2. docker compose up -d"
    echo "3. Configure Nginx + SSL"
    echo "4. Test scripts/backup.sh"
    echo "5. Set up cron for daily backups"
    exit 0
else
    echo -e "${RED}✗ $ERRORS issue(s) found${NC}"
    echo ""
    echo "Please fix the issues above before deploying to production."
    exit 1
fi