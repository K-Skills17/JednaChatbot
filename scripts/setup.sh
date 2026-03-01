#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# LK Chatbot — One-Command Setup
# =============================================================================
# This script does EVERYTHING:
#   1. Starts Docker containers (Postgres, Redis, Evolution API)
#   2. Installs dependencies
#   3. Generates Prisma client
#   4. Pushes database schema
#   5. Seeds the default tenant (WhatsApp: 11 959041799)
#   6. Starts the app in dev mode
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}  [OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; }
step()  { echo -e "\n${BOLD}── Step $1: $2${NC}"; }

cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       LK Chatbot — Automated Setup          ║${NC}"
echo -e "${BOLD}║  WhatsApp: +55 11 95904-1799                 ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Pre-flight checks ──────────────────────────────────────
step "0" "Pre-flight checks"

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js >= 20."
  exit 1
fi
ok "Node.js $(node -v)"

if ! command -v docker &>/dev/null; then
  fail "Docker not found. Install Docker."
  exit 1
fi
ok "Docker found"

if ! docker info &>/dev/null 2>&1; then
  fail "Docker daemon is not running. Start Docker first."
  exit 1
fi
ok "Docker daemon running"

# Check .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
  fail ".env file not found. Copy .env.example to .env and fill in your ANTHROPIC_API_KEY."
  exit 1
fi
ok ".env file found"

# Check ANTHROPIC_API_KEY is set
ANTHROPIC_KEY=$(grep -E '^ANTHROPIC_API_KEY=' "$PROJECT_DIR/.env" | cut -d= -f2-)
if [ -z "$ANTHROPIC_KEY" ] || [ "$ANTHROPIC_KEY" = "sk-ant-..." ] || [ "$ANTHROPIC_KEY" = "" ]; then
  fail "ANTHROPIC_API_KEY is not set in .env"
  echo ""
  echo -e "  Open ${BOLD}.env${NC} and paste your Anthropic API key:"
  echo -e "  ${CYAN}ANTHROPIC_API_KEY=sk-ant-your-key-here${NC}"
  echo ""
  echo "  Get a key at: https://console.anthropic.com/settings/keys"
  exit 1
fi
ok "ANTHROPIC_API_KEY is configured"

# ─── Step 1: Docker containers ──────────────────────────────
step "1" "Starting Docker containers (Postgres, Redis, Evolution API)"

docker compose up -d 2>&1 | tail -5
echo ""

# Wait for services to be healthy
info "Waiting for services to be healthy..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  PG_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' lk-postgres 2>/dev/null || echo "not_found")
  REDIS_HEALTHY=$(docker inspect --format='{{.State.Health.Status}}' lk-redis 2>/dev/null || echo "not_found")

  if [ "$PG_HEALTHY" = "healthy" ] && [ "$REDIS_HEALTHY" = "healthy" ]; then
    break
  fi

  sleep 2
  WAITED=$((WAITED + 2))
  echo -ne "\r  Waiting... ${WAITED}s (postgres=$PG_HEALTHY, redis=$REDIS_HEALTHY)    "
done
echo ""

if [ "$PG_HEALTHY" = "healthy" ]; then
  ok "PostgreSQL is healthy"
else
  warn "PostgreSQL may still be starting"
fi

if [ "$REDIS_HEALTHY" = "healthy" ]; then
  ok "Redis is healthy"
else
  warn "Redis may still be starting"
fi

# Check Evolution API (may take longer)
info "Checking Evolution API..."
EVOLUTION_READY=false
for i in {1..15}; do
  if curl -s http://localhost:8080 >/dev/null 2>&1; then
    EVOLUTION_READY=true
    break
  fi
  sleep 2
done

if [ "$EVOLUTION_READY" = true ]; then
  ok "Evolution API is running on port 8080"
else
  warn "Evolution API is still starting (this is normal, it takes 30-60s)"
fi

# ─── Step 2: Install dependencies ───────────────────────────
step "2" "Installing Node.js dependencies"

if [ -d "$PROJECT_DIR/node_modules" ] && [ -f "$PROJECT_DIR/node_modules/.package-lock.json" ]; then
  ok "node_modules already exists, skipping install"
else
  npm install 2>&1 | tail -3
  ok "Dependencies installed"
fi

# ─── Step 3: Generate Prisma client ─────────────────────────
step "3" "Generating Prisma client"

npx prisma generate 2>&1 | tail -3
ok "Prisma client generated"

# ─── Step 4: Push database schema ───────────────────────────
step "4" "Pushing database schema to PostgreSQL"

npx prisma db push --skip-generate 2>&1 | tail -5
ok "Database schema applied"

# ─── Step 5: Seed tenant ────────────────────────────────────
step "5" "Creating default tenant (WhatsApp: +55 11 95904-1799)"

npx tsx scripts/seed-tenant.ts 2>&1
ok "Tenant seeded"

# ─── Step 6: Create Evolution instance + connect ─────────────
step "6" "Provisioning WhatsApp instance in Evolution API"

# Get tenant ID and instance name from the database
TENANT_INFO=$(npx tsx -e "
  const { PrismaClient } = require('./src/generated/prisma');
  const p = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  p.tenant.findFirst({ where: { whatsappNumber: '5511959041799' } })
    .then(t => { if(t) console.log(JSON.stringify({id:t.id,instance:t.evolutionInstanceId})); else console.log('null'); })
    .finally(() => p.\$disconnect());
" 2>/dev/null || echo "null")

if [ "$TENANT_INFO" = "null" ] || [ -z "$TENANT_INFO" ]; then
  warn "Could not read tenant from DB. You may need to provision the WhatsApp instance manually."
else
  TENANT_ID=$(echo "$TENANT_INFO" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.id)})")
  INSTANCE_NAME=$(echo "$TENANT_INFO" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.instance)})")

  ok "Tenant ID: $TENANT_ID"
  ok "Instance:  $INSTANCE_NAME"

  # Read keys from .env
  EVOLUTION_API_KEY=$(grep -E '^EVOLUTION_API_KEY=' "$PROJECT_DIR/.env" | cut -d= -f2-)
  WEBHOOK_BASE_URL=$(grep -E '^WEBHOOK_BASE_URL=' "$PROJECT_DIR/.env" | cut -d= -f2-)

  # Create instance in Evolution API
  info "Creating Evolution API instance..."
  CREATE_RESULT=$(curl -s -X POST "http://localhost:8080/instance/create" \
    -H "apikey: $EVOLUTION_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"instanceName\": \"$INSTANCE_NAME\",
      \"integration\": \"WHATSAPP-BAILEYS\",
      \"qrcode\": true,
      \"webhook\": {
        \"url\": \"$WEBHOOK_BASE_URL/webhook/evolution\",
        \"byEvents\": false,
        \"base64\": false,
        \"events\": [\"messages.upsert\", \"messages.update\", \"connection.update\", \"qrcode.updated\"]
      }
    }" 2>/dev/null || echo '{"error":"failed"}')

  if echo "$CREATE_RESULT" | grep -q '"error"' 2>/dev/null; then
    warn "Instance creation returned: $(echo "$CREATE_RESULT" | head -c 200)"
    info "This may be OK if the instance already exists. Trying to connect..."
  else
    ok "Evolution instance created"
  fi

  # Get QR code
  info "Requesting QR code for WhatsApp connection..."
  QR_RESULT=$(curl -s "http://localhost:8080/instance/connect/$INSTANCE_NAME" \
    -H "apikey: $EVOLUTION_API_KEY" 2>/dev/null || echo '{"error":"failed"}')

  if echo "$QR_RESULT" | grep -q '"base64"' 2>/dev/null; then
    ok "QR code ready!"
  else
    warn "QR code not yet available. You can get it after the app starts."
  fi
fi

# ─── Step 7: Start the app ──────────────────────────────────
step "7" "Starting the application"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                  SETUP COMPLETE!                            ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Your API Key:${NC}     $(grep -E '^API_KEY=' "$PROJECT_DIR/.env" | cut -d= -f2-)"
echo ""
echo -e "  ${BOLD}Endpoints:${NC}"
echo -e "    Health:          http://localhost:3000/health"
echo -e "    Connect WhatsApp: POST http://localhost:3000/api/tenants/${TENANT_ID:-<id>}/connect"
echo -e "    Tenant Status:   GET  http://localhost:3000/api/tenants/${TENANT_ID:-<id>}/status"
echo ""
echo -e "  ${BOLD}To connect WhatsApp, run this after the server starts:${NC}"
echo -e "    ${CYAN}curl -s http://localhost:3000/api/tenants/${TENANT_ID:-<id>}/connect \\${NC}"
echo -e "    ${CYAN}  -H 'x-api-key: $(grep -E '^API_KEY=' "$PROJECT_DIR/.env" | cut -d= -f2-)' \\${NC}"
echo -e "    ${CYAN}  -X POST | node -e \"process.stdin.on('data',d=>{const j=JSON.parse(d);if(j.base64)console.log('Open this in browser: data:image/png;base64,'+j.base64);else console.log(JSON.stringify(j,null,2))})\"${NC}"
echo ""
echo -e "  ${BOLD}Or open the Evolution API dashboard:${NC}"
echo -e "    ${CYAN}http://localhost:8080/manager${NC}"
echo ""
echo -e "${YELLOW}  Starting dev server now... (press Ctrl+C to stop)${NC}"
echo ""

exec npm run dev
