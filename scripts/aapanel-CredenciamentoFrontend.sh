#!/bin/bash
# Script de start do aaPanel — CredenciamentoFrontend
# Cópia de referência: manter sincronizado com
# /www/server/nodejs/vhost/scripts/CredenciamentoFrontend.sh

PATH=/www/server/Credenciamento/frontend/node_modules/.bin:/www/server/nodejs/v24.11.1/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export NODE_PROJECT_NAME="CredenciamentoFrontend"
PORT=4207
PROJECT_DIR=/www/server/Credenciamento/frontend
LOG=/www/wwwlogs/nodejs/CredenciamentoFrontend.log
PID_FILE=/www/server/nodejs/vhost/pids/CredenciamentoFrontend.pid

mkdir -p "$(dirname "$PID_FILE")"
cd "$PROJECT_DIR"

# Mata processo registrado no PID (wrapper npm) e qualquer ng serve órfão na porta
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
fi

bash "$PROJECT_DIR/scripts/free-port.sh" "$PORT"

nohup /www/server/nodejs/v24.11.1/bin/npm run start >> "$LOG" 2>&1 &

for _ in $(seq 1 90); do
  NG_PID=$(ss -tlnp 2>/dev/null | awk '/:4207/ { match($0, /pid=([0-9]+)/, a); if (a[1]) print a[1]; exit }')
  if [ -n "$NG_PID" ]; then
    echo "$NG_PID" > "$PID_FILE"
    exit 0
  fi
  sleep 1
done

echo "Erro: ng serve não subiu na porta ${PORT} em 90s." >> "$LOG"
exit 1
