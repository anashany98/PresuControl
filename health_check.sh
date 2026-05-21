#!/bin/bash
# PresuControl V5 - Health Check Script
# Usage: ./health_check.sh
# Use in cron or monitoring systems

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0

check_service() {
    local name="$1"
    local url="$2"

    if curl -sf "$url" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
    else
        echo -e "${RED}✗${NC} $name"
        ERRORS=$((ERRORS + 1))
    fi
}

echo "PresuControl V5 - Health Check"
echo "=============================="

# Check frontend
check_service "Frontend (port 8088)" "http://127.0.0.1:8088"

# Check API health
check_service "API Health" "http://127.0.0.1:8088/api/health"

# Check PostgreSQL
if docker exec presucontrol-postgres pg_isready -U presucontrol >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} PostgreSQL"
else
    echo -e "${RED}✗${NC} PostgreSQL"
    ERRORS=$((ERRORS + 1))
fi

# Check backend container
if docker compose ps backend | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Backend container"
else
    echo -e "${RED}✗${NC} Backend container"
    ERRORS=$((ERRORS + 1))
fi

# Check frontend container
if docker compose ps frontend | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} Frontend container"
else
    echo -e "${RED}✗${NC} Frontend container"
    ERRORS=$((ERRORS + 1))
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All checks passed${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS check(s) failed${NC}"
    exit 1
fi