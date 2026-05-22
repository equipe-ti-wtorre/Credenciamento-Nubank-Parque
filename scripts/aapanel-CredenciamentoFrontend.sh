#!/bin/bash
# Cópia de referência — manter sincronizado com /www/server/nodejs/vhost/scripts/CredenciamentoFrontend.sh
PATH=/www/server/Credenciamento/frontend/node_modules/.bin:/www/server/nodejs/v24.11.1/bin:/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

export NODE_PROJECT_NAME="CredenciamentoFrontend"
cd /www/server/Credenciamento/frontend

LOG=/www/wwwlogs/nodejs/CredenciamentoFrontend.log
PID_FILE=/www/server/nodejs/vhost/pids/CredenciamentoFrontend.pid
mkdir -p "$(dirname "$PID_FILE")"

# Libera a porta se um ng serve órfão ficou preso (restart falho no aaPanel)
fuser -k 4207/tcp 2>/dev/null || true
sleep 1

nohup /www/server/nodejs/v24.11.1/bin/npm run start >> "$LOG" 2>&1 &

for _ in $(seq 1 90); do
  NG_PID=$(ss -tlnp 2>/dev/null | awk '/:4207/ { match($0, /pid=([0-9]+)/, a); if (a[1]) print a[1]; exit }')
  if [ -n "$NG_PID" ]; then
    echo "$NG_PID" > "$PID_FILE"
    exit 0
  fi
  sleep 1
done

echo "$!" > "$PID_FILE"
exit 1
