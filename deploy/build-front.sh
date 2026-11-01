#!/usr/bin/env bash
# Gera o build de produção do frontend e publica em frontend/dist-prod de forma atômica.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONT="$ROOT/frontend"
NODE_BIN="${NODE_BIN:-/www/server/nodejs/v26.5.1/bin}"
export PATH="$NODE_BIN:$PATH"

DIST_BROWSER="$FRONT/dist/frontend/browser"
DIST_PROD="$FRONT/dist-prod"
STAGING="$FRONT/dist-prod.next"

if ! command -v npm >/dev/null 2>&1; then
  echo "Erro: npm não encontrado. Ajuste NODE_BIN (atual: $NODE_BIN)." >&2
  exit 1
fi

cd "$FRONT"
if [ "${SKIP_NPM_CI:-}" = "1" ]; then
  echo "SKIP_NPM_CI=1: pulando npm ci (usa node_modules já instalado)."
else
  npm ci --legacy-peer-deps
fi
npm run build

if [ ! -f "$DIST_BROWSER/index.html" ]; then
  echo "Erro: build não gerou $DIST_BROWSER/index.html" >&2
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -a "$DIST_BROWSER/." "$STAGING/"

if [ -d "$DIST_PROD" ]; then
  rm -rf "$DIST_PROD.old"
  mv "$DIST_PROD" "$DIST_PROD.old"
fi
mv "$STAGING" "$DIST_PROD"
rm -rf "$DIST_PROD.old"

echo "OK: frontend publicado em $DIST_PROD"
