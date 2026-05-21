#!/bin/bash
# Script de start para aaPanel — salva o PID do processo que escuta na porta 3007
PATH=/www/server/Credenciamento/backend/node_modules/.bin:/www/server/nodejs/v24.11.1/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export NODE_PROJECT_NAME="CredenciamentoBackend"
cd /www/server/Credenciamento/backend

LOG=/www/server/nodejs/vhost/logs/CredenciamentoBackend.log
PID_FILE=/www/server/nodejs/vhost/pids/CredenciamentoBackend.pid

nohup /www/server/nodejs/v24.11.1/bin/npm run start >> "$LOG" 2>&1 &

for _ in $(seq 1 60); do
  NODE_PID=$(ss -tlnp 2>/dev/null | awk '/:3007/ { match($0, /pid=([0-9]+)/, a); if (a[1]) print a[1]; exit }')
  if [ -n "$NODE_PID" ]; then
    echo "$NODE_PID" > "$PID_FILE"
    exit 0
  fi
  sleep 1
done

echo "$!" > "$PID_FILE"
