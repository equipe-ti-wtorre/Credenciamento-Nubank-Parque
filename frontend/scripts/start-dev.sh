#!/usr/bin/env bash
set -euo pipefail

PORT=4207
NODE_BIN=/www/server/nodejs/v24.11.1/bin
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

export PATH="${NODE_BIN}:${PATH}"

bash "${PROJECT_DIR}/scripts/free-port.sh" "${PORT}"

cd "$PROJECT_DIR"

exec env PATH="${NODE_BIN}:${PATH}" node ./node_modules/@angular/cli/bin/ng.js serve \
  --port "${PORT}" \
  --host 127.0.0.1 \
  --proxy-config proxy.conf.json
