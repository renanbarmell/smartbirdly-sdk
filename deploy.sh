#!/bin/bash
set -e

SDK="$HOME/Documents/Projetos claude/smartbirdly-sdk"
cd "$SDK"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  SmartBirdly SDK — Deploy Automático"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. package.json ────────────────────────────────────
echo "[1/5] Criando package.json..."
cat > package.json << 'PKGJSON'
{
  "name": "smartbirdly-sdk",
  "version": "1.0.0",
  "description": "SmartBirdly SDK Server",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "engines": {
    "node": ">=18"
  }
}
PKGJSON
echo "     ✅ package.json criado"

# ── 2. .gitignore ──────────────────────────────────────
echo "[2/5] Criando .gitignore..."
cat > .gitignore << 'GITIGNORE'
node_modules/
.env
.DS_Store
*.log
GITIGNORE
echo "     ✅ .gitignore criado"

# ── 3. Git init + commit ───────────────────────────────
echo "[3/5] Inicializando git..."
git init -q
git add .
git commit -q -m "SmartBirdly SDK - initial deploy" 2>/dev/null || \
  (git config user.email "deploy@smartbirdly.com" && \
   git config user.name "SmartBirdly" && \
   git add . && git commit -q -m "SmartBirdly SDK - initial deploy")
echo "     ✅ Git pronto"

# ── 4. Railway CLI ─────────────────────────────────────
echo "[4/5] Verificando Railway CLI..."
if ! command -v railway &> /dev/null; then
  echo "     Instalando Railway CLI..."
  brew install railway 2>/dev/null || \
    curl -fsSL https://railway.app/install.sh | sh
fi
echo "     ✅ Railway CLI disponível"

# ── 5. Deploy ──────────────────────────────────────────
echo "[5/5] Fazendo deploy no Railway..."
echo ""
echo "  → Abrindo login no browser..."
echo "  → Após logar, o deploy será automático"
echo ""
railway login
railway init --name smartbirdly-sdk
railway up --detach
URL=$(railway domain 2>/dev/null || echo "")

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy concluído!"
echo "═══════════════════════════════════════════════════"
if [ -n "$URL" ]; then
  echo "  URL: https://$URL"
  echo ""
  echo "  Snippets para seus clientes:"
  echo "  <script src=\"https://$URL/survey-abc123.js\" async></script>"
  echo "  <script src=\"https://$URL/survey-xyz789.js\" async></script>"
fi
echo "═══════════════════════════════════════════════════"
echo ""
