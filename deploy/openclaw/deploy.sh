#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# OpenClaw Gateway — Deploy to Fly.io
# ═══════════════════════════════════════════════════════════════════════
#
# Prerequisites:
#   1. Fly.io account + CLI installed: https://fly.io/docs/flyctl/install/
#   2. DeepSeek API key: https://platform.deepseek.com/api_keys
#   3. Anthropic API key: https://console.anthropic.com/settings/keys
#
# Usage:
#   cd deploy/openclaw
#   bash deploy.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "  OpenClaw Research Gateway — Fly.io Deployment"
echo "═══════════════════════════════════════════════════"
echo ""

# Step 1: Check fly CLI
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it:"
    echo "   Windows: powershell -Command \"iwr https://fly.io/install.ps1 -useb | iex\""
    echo "   Mac/Linux: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Step 2: Check auth
echo "→ Checking Fly.io authentication..."
fly auth whoami || { echo "❌ Not logged in. Run: fly auth login"; exit 1; }
echo ""

# Step 3: Launch app (first time only)
if fly apps list 2>/dev/null | grep -q "openclaw-gateway"; then
    echo "→ App 'openclaw-gateway' already exists, deploying update..."
else
    echo "→ Creating new Fly.io app..."
    fly launch --copy-config --name openclaw-gateway --no-deploy --region sea
fi
echo ""

# Step 4: Set secrets
echo "→ Setting API keys as secrets..."
echo "  (You'll be prompted for each key)"

read -p "  DeepSeek API Key: " DEEPSEEK_KEY
read -p "  Anthropic API Key: " ANTHROPIC_KEY

# Generate a random master key for the gateway
MASTER_KEY="sk-openclaw-$(openssl rand -hex 16)"
echo "  Generated master key: $MASTER_KEY"
echo "  ⚠️  Save this! You'll need it as OPENCLAW_API_KEY in Vercel."

fly secrets set \
    DEEPSEEK_API_KEY="$DEEPSEEK_KEY" \
    ANTHROPIC_API_KEY="$ANTHROPIC_KEY" \
    LITELLM_MASTER_KEY="$MASTER_KEY"

echo ""

# Step 5: Deploy
echo "→ Deploying to Fly.io..."
fly deploy

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ OpenClaw Gateway deployed!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  URL: https://openclaw-gateway.fly.dev"
echo "  Master Key: $MASTER_KEY"
echo ""
echo "  Next steps:"
echo "  1. Add to Vercel env vars:"
echo "     OPENCLAW_API_URL=https://openclaw-gateway.fly.dev"
echo "     OPENCLAW_API_KEY=$MASTER_KEY"
echo ""
echo "  2. Test with curl:"
echo "     curl https://openclaw-gateway.fly.dev/health"
echo ""
echo "  3. Test a model call:"
echo "     curl https://openclaw-gateway.fly.dev/v1/chat/completions \\"
echo "       -H 'Authorization: Bearer $MASTER_KEY' \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'"
echo ""
