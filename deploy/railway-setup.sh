#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# LK Chatbot — Railway Deployment Setup
# =============================================================================
# This script helps you deploy the full platform to Railway.
# Prerequisites: Node.js 18+, Railway CLI (npm i -g @railway/cli)
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Check prerequisites ----
command -v railway >/dev/null 2>&1 || err "Railway CLI not found. Install with: npm i -g @railway/cli"
command -v node >/dev/null 2>&1 || err "Node.js not found."

echo ""
echo "=============================================="
echo "  LK Chatbot — Railway Cloud Deployment"
echo "=============================================="
echo ""

# ---- Step 1: Login ----
info "Step 1: Logging into Railway..."
railway login 2>/dev/null || warn "Already logged in or login failed — continuing."
ok "Authenticated with Railway."
echo ""

# ---- Step 2: Create project ----
info "Step 2: Creating Railway project..."
echo "If you already have a project, press Ctrl+C and run: railway link"
railway init
ok "Project created."
echo ""

# ---- Step 3: Add Postgres ----
info "Step 3: Adding PostgreSQL plugin..."
echo "In the Railway dashboard, add a PostgreSQL plugin to your project."
echo "Copy the DATABASE_URL from the plugin's variables tab."
echo ""
read -rp "Paste your DATABASE_URL here: " DATABASE_URL
railway variables set DATABASE_URL="$DATABASE_URL"
ok "DATABASE_URL set."
echo ""

# ---- Step 4: Add Redis ----
info "Step 4: Adding Redis plugin..."
echo "In the Railway dashboard, add a Redis plugin to your project."
echo "Copy the REDIS_URL from the plugin's variables tab."
echo ""
read -rp "Paste your REDIS_URL here: " REDIS_URL
railway variables set REDIS_URL="$REDIS_URL"
ok "REDIS_URL set."
echo ""

# ---- Step 5: Set required environment variables ----
info "Step 5: Setting environment variables..."

read -rp "Enter your API_KEY (for authenticating API requests): " API_KEY
railway variables set API_KEY="$API_KEY"

read -rp "Enter your ANTHROPIC_API_KEY (sk-ant-...): " ANTHROPIC_API_KEY
railway variables set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"

read -rp "Enter OPENAI_API_KEY (optional, press Enter to skip): " OPENAI_API_KEY
if [ -n "$OPENAI_API_KEY" ]; then
  railway variables set OPENAI_API_KEY="$OPENAI_API_KEY"
fi

read -rp "Enter EVOLUTION_API_KEY (must match Evolution API service): " EVOLUTION_API_KEY
railway variables set EVOLUTION_API_KEY="$EVOLUTION_API_KEY"

read -rp "Enter EVOLUTION_API_URL (Railway internal URL of Evolution service): " EVOLUTION_API_URL
railway variables set EVOLUTION_API_URL="$EVOLUTION_API_URL"

# Set default AI models
railway variables set AI_PRIMARY_PROVIDER=claude
railway variables set AI_PRIMARY_MODEL=claude-haiku-4-5-20251001
railway variables set AI_QUALIFICATION_MODEL=claude-sonnet-4-5-20250929
railway variables set NODE_ENV=production
railway variables set PORT=3000

ok "Environment variables set."
echo ""

# ---- Step 6: Deploy ----
info "Step 6: Deploying the application..."
railway up --detach
ok "Deployment started."
echo ""

# ---- Step 7: Get public URL ----
info "Step 7: Setting up public URL..."
echo "In the Railway dashboard, go to your service's Settings > Networking."
echo "Click 'Generate Domain' to get a public URL (e.g., your-app.up.railway.app)."
echo ""
read -rp "Paste your public URL here (https://...): " PUBLIC_URL
railway variables set WEBHOOK_BASE_URL="$PUBLIC_URL"
ok "WEBHOOK_BASE_URL set to $PUBLIC_URL"
echo ""

# ---- Step 8: Run database migrations ----
info "Step 8: Pushing database schema..."
railway run npx prisma db push --skip-generate
ok "Database schema applied."
echo ""

# ---- Step 9: Verify ----
info "Step 9: Verifying deployment..."
echo ""
echo "Testing health endpoint..."
HEALTH_URL="${PUBLIC_URL}/health"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  ok "Health check passed! (HTTP $HTTP_CODE)"
else
  warn "Health check returned HTTP $HTTP_CODE. The service may still be starting."
  echo "Try again in a minute: curl $HEALTH_URL"
fi

echo ""
echo "=============================================="
echo "  Deployment Complete!"
echo "=============================================="
echo ""
echo "  App URL:     $PUBLIC_URL"
echo "  Health:      $PUBLIC_URL/health"
echo "  Readiness:   $PUBLIC_URL/health/ready"
echo "  API docs:    $PUBLIC_URL/api/tenants"
echo ""
echo "  Next steps:"
echo "  1. Deploy Evolution API as a separate Railway service"
echo "     (Docker image: atendai/evolution-api:v2.1.1)"
echo "  2. Connect a WhatsApp number via Evolution API"
echo "  3. Create your first tenant via POST /api/tenants"
echo "  4. Configure the webhook on Evolution API to point to:"
echo "     $PUBLIC_URL/webhook/evolution"
echo ""
ok "All done! Happy chatbotting!"
