#!/usr/bin/env bash
# ============================================================================
# Railway Setup Script for LK Chatbot
# Run this once to configure all environment variables on your Railway service.
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          LK Chatbot — Railway Setup                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Step 1: Check Railway CLI ──────────────────────────────
if ! command -v railway &>/dev/null; then
  echo -e "${RED}Railway CLI is not installed.${NC}"
  echo ""
  echo "Install it with one of these commands:"
  echo ""
  echo "  npm install -g @railway/cli"
  echo "  OR"
  echo "  curl -fsSL https://railway.com/install.sh | sh"
  echo ""
  echo "Then run: railway login"
  echo "Then re-run this script."
  exit 1
fi

# ─── Step 2: Check login ────────────────────────────────────
echo -e "${YELLOW}Checking Railway login...${NC}"
if ! railway whoami &>/dev/null 2>&1; then
  echo -e "${RED}Not logged in to Railway.${NC}"
  echo "Run: railway login"
  exit 1
fi
WHOAMI=$(railway whoami 2>/dev/null || echo "unknown")
echo -e "${GREEN}Logged in as: ${WHOAMI}${NC}"
echo ""

# ─── Step 3: Link to project ────────────────────────────────
echo -e "${YELLOW}Linking to your Railway project...${NC}"
echo "Select your LK Chatbot PROJECT, then select your APP SERVICE (not Redis/Postgres/Evolution)."
echo ""
railway link
echo ""
echo -e "${GREEN}Linked successfully.${NC}"
echo ""

# ─── Step 4: Collect values we can't auto-detect ────────────
echo -e "${CYAN}I need a few values from you. Press Enter to skip optional ones.${NC}"
echo ""

# API Key for admin access
read -rp "API_KEY (admin key for your dashboard) [auto-generate]: " INPUT_API_KEY
if [ -z "$INPUT_API_KEY" ]; then
  INPUT_API_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  echo -e "  ${GREEN}Generated: ${INPUT_API_KEY}${NC}"
fi

# Anthropic
read -rp "ANTHROPIC_API_KEY (from console.anthropic.com): " INPUT_ANTHROPIC_KEY
if [ -z "$INPUT_ANTHROPIC_KEY" ]; then
  echo -e "  ${YELLOW}Skipped — AI features won't work until you set this.${NC}"
fi

# Evolution API Key
echo ""
echo -e "${CYAN}For EVOLUTION_API_KEY: go to your evolution-api service in Railway → Variables → copy AUTHENTICATION_API_KEY${NC}"
read -rp "EVOLUTION_API_KEY: " INPUT_EVO_KEY
if [ -z "$INPUT_EVO_KEY" ]; then
  echo -e "  ${YELLOW}Skipped — WhatsApp features won't work until you set this.${NC}"
fi

# Evolution API URL (internal)
echo ""
echo -e "${CYAN}For EVOLUTION_API_URL: go to your evolution-api service → Settings → Networking → Private domain${NC}"
echo -e "${CYAN}It looks like: evolution-api-production-XXXX.railway.internal${NC}"
read -rp "Evolution API private domain (just the domain, no http://): " INPUT_EVO_DOMAIN
if [ -z "$INPUT_EVO_DOMAIN" ]; then
  INPUT_EVO_DOMAIN="evolution-api-production-30bd.railway.internal"
  echo -e "  ${YELLOW}Using default: ${INPUT_EVO_DOMAIN}${NC}"
fi

# Evolution API port
read -rp "Evolution API port [8080]: " INPUT_EVO_PORT
INPUT_EVO_PORT=${INPUT_EVO_PORT:-8080}

# Webhook base URL
echo ""
echo -e "${CYAN}For WEBHOOK_BASE_URL: go to your app service → Settings → Networking → Public domain${NC}"
echo -e "${CYAN}It looks like: https://lk-chatbot-production-XXXX.up.railway.app${NC}"
read -rp "Your app's public URL (with https://): " INPUT_WEBHOOK_URL
if [ -z "$INPUT_WEBHOOK_URL" ]; then
  echo -e "  ${YELLOW}Skipped — webhooks won't work until you set this.${NC}"
fi

# ─── Step 5: Set all variables ──────────────────────────────
echo ""
echo -e "${YELLOW}Setting environment variables on your Railway service...${NC}"
echo ""

set_var() {
  local key=$1
  local value=$2
  if [ -n "$value" ]; then
    railway variables set "${key}=${value}" 2>/dev/null
    echo -e "  ${GREEN}✓ ${key}${NC}"
  else
    echo -e "  ${YELLOW}⏭ ${key} (skipped — empty)${NC}"
  fi
}

# Core
set_var "NODE_ENV" "production"
set_var "PORT" "3000"
set_var "API_KEY" "$INPUT_API_KEY"

# Database — use Railway reference variable
railway variables set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' 2>/dev/null
echo -e "  ${GREEN}✓ DATABASE_URL (linked to Postgres service)${NC}"

# Redis — use Railway reference variable
railway variables set 'REDIS_URL=${{Redis.REDIS_URL}}' 2>/dev/null
echo -e "  ${GREEN}✓ REDIS_URL (linked to Redis service)${NC}"

# Evolution API
set_var "EVOLUTION_API_URL" "http://${INPUT_EVO_DOMAIN}:${INPUT_EVO_PORT}"
set_var "EVOLUTION_API_KEY" "$INPUT_EVO_KEY"

# AI
set_var "ANTHROPIC_API_KEY" "${INPUT_ANTHROPIC_KEY:-}"
set_var "AI_PRIMARY_PROVIDER" "claude"
set_var "AI_PRIMARY_MODEL" "claude-haiku-4-5-20251001"
set_var "AI_QUALIFICATION_MODEL" "claude-sonnet-4-5-20250929"

# Webhook
set_var "WEBHOOK_BASE_URL" "${INPUT_WEBHOOK_URL:-}"

# ─── Step 6: Summary ────────────────────────────────────────
echo ""
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${GREEN}Railway will now auto-deploy with the new variables.${NC}"
echo ""
echo "Your admin API key (save this!):"
echo -e "  ${CYAN}${INPUT_API_KEY}${NC}"
echo ""
echo "Next steps:"
echo "  1. Wait for Railway to finish deploying (~2 minutes)"
echo "  2. Check deploy logs for the config diagnostics"
echo "  3. Open your app URL and start training your chatbot!"
echo ""
echo -e "${YELLOW}If you need to change a variable later:${NC}"
echo '  railway variables set "KEY=VALUE"'
echo ""
