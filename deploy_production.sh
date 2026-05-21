#!/bin/bash
# PresuControl V5 - Production Deploy Script
# Usage: ./deploy_production.sh
# Run from the project root directory

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEPLOY_DIR"

echo "============================================"
echo "PresuControl V5 - Production Deploy"
echo "============================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env not found${NC}"
    echo "Copy .env.production.example to .env and configure it first."
    exit 1
fi

# Check for placeholder values
if grep -q "CHANGE_THIS\|generar_" .env 2>/dev/null; then
    echo -e "${RED}ERROR: .env contains placeholder values${NC}"
    echo "Please set real secrets before deploying."
    exit 1
fi

echo -e "${YELLOW}Pre-flight checks passed${NC}"
echo ""

# Pull latest changes (if using git)
if [ -d .git ]; then
    echo "Updating code from git..."
    git pull origin $(git branch --show-current)
fi

echo ""
echo "Building Docker images..."
docker compose build

echo ""
echo "Stopping existing containers..."
docker compose down

echo ""
echo "Starting services..."
docker compose up -d

echo ""
echo "Waiting for services to be healthy..."
sleep 5

# Check health
MAX_ATTEMPTS=30
ATTEMPT=0

echo -n "Backend health check: "
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://127.0.0.1:8088/api/health >/dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo -n "."
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo -e "${RED}WARNING: Backend health check failed${NC}"
    echo "Check logs: docker compose logs backend"
fi

# Check PostgreSQL
echo -n "PostgreSQL check: "
if docker exec presucontrol-postgres pg_isready -U presucontrol >/dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}WARNING: PostgreSQL not ready${NC}"
fi

echo ""
echo "============================================"
echo -e "${GREEN}Deploy completed!${NC}"
echo "============================================"
echo ""
echo "Services:"
docker compose ps
echo ""
echo "Logs:"
echo "  docker compose logs -f"
echo ""
echo "Test:"
echo "  curl -I http://127.0.0.1:8088"
echo ""
echo "IMPORTANT: Configure Nginx + SSL for production!"
echo "See PRODUCTION_CHECKLIST above for details."