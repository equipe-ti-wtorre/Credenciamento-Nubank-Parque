#!/bin/bash
# Produção: SPA estática via Nginx (frontend/dist). Este script só valida o build.

PROJECT_DIR=/www/wwwroot/Credenciamento/frontend
DIST_DIR=${PROJECT_DIR}/dist/frontend/browser
LOG=/www/wwwlogs/nodejs/CredenciamentoFrontend.log
PID_FILE=/www/server/nodejs/vhost/pids/CredenciamentoFrontend.pid

mkdir -p "$(dirname "$LOG")" "$(dirname "$PID_FILE")" 2>/dev/null || true

if [ ! -f "${DIST_DIR}/index.html" ]; then
  echo "Erro: build de produção ausente em ${DIST_DIR}. Rode: npm run build:prod" | tee -a "$LOG" 2>/dev/null
  exit 1
fi

msg="OK: dist presente — Nginx serve ${DIST_DIR} (ng serve desabilitado em produção)."
echo "$msg" >> "$LOG" 2>/dev/null || echo "$msg"
echo "0" > "$PID_FILE" 2>/dev/null || true
exit 0
