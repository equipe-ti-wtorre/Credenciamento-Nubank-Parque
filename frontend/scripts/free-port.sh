#!/usr/bin/env bash
# Libera a porta do frontend Angular (ng serve).
# Uso: free-port.sh [PORT]   (padrão: 4207)

PORT="${1:-4207}"

port_in_use() {
  ss -tln 2>/dev/null | grep -q ":${PORT} "
}

free_port() {
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  pkill -f "ng.js serve --port ${PORT}" 2>/dev/null || true
  pkill -f "ng serve --port ${PORT}" 2>/dev/null || true

  for _ in $(seq 1 15); do
    if ! port_in_use; then
      return 0
    fi
    sleep 1
  done

  return 1
}

if port_in_use; then
  echo "Liberando porta ${PORT}..."
  free_port || {
    echo "Erro: porta ${PORT} ainda ocupada."
    ss -tlnp 2>/dev/null | grep ":${PORT} " || true
    exit 1
  }
fi

exit 0
