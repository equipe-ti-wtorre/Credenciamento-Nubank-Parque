#!/bin/bash
# Script de start para aaPanel — salva o PID do processo que escuta na porta 3007
NODE_BIN=/www/server/nodejs/v26.5.1/bin
PROJECT_DIR=/www/wwwroot/Credenciamento/backend
PATH=${PROJECT_DIR}/node_modules/.bin:${NODE_BIN}:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export NODE_PROJECT_NAME="CredenciamentoBackend"
export HOME=/root
export PM2_HOME=/root/.pm2
export LC_ALL=C
export LANG=C
export LANGUAGE=C

cd "$PROJECT_DIR"

LOG=/www/server/nodejs/vhost/logs/CredenciamentoBackend.log
PID_FILE=/www/server/nodejs/vhost/pids/CredenciamentoBackend.pid
mkdir -p "$(dirname "$LOG")" "$(dirname "$PID_FILE")"

# Prefer PM2 (persistente + reboot via pm2-root.service)
if [ -x "${NODE_BIN}/pm2" ]; then
  if ${NODE_BIN}/pm2 describe backend >/dev/null 2>&1; then
    ${NODE_BIN}/pm2 restart backend --update-env >> "$LOG" 2>&1
  else
    ${NODE_BIN}/pm2 start "$PROJECT_DIR/server.js" --name backend >> "$LOG" 2>&1
  fi
  ${NODE_BIN}/pm2 save >> "$LOG" 2>&1 || true
else
  nohup ${NODE_BIN}/npm run start >> "$LOG" 2>&1 &
fi

for _ in $(seq 1 60); do
  NODE_PID=$(ss -tlnp 2>/dev/null | awk '/:3007/ { match($0, /pid=([0-9]+)/, a); if (a[1]) print a[1]; exit }')
  if [ -n "$NODE_PID" ]; then
    echo "$NODE_PID" > "$PID_FILE"
    exit 0
  fi
  sleep 1
done

echo "Erro: API não subiu na porta 3007 em 60s." >> "$LOG"
exit 1
