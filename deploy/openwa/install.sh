#!/usr/bin/env bash
# Instala/atualiza o OpenWA do fonte (sem Docker) e sobe sob PM2.
#
# Uso:
#   bash deploy/openwa/install.sh            # instala/atualiza para a tag padrão
#   OPENWA_TAG=v0.26.0 bash deploy/openwa/install.sh
#   OPENWA_DIR=/outro/caminho bash deploy/openwa/install.sh
#
# Idempotente: reexecutar faz checkout da tag, reinstala deps, rebuilda e reinicia o PM2.
set -euo pipefail

OPENWA_REPO="${OPENWA_REPO:-https://github.com/rmyndharis/OpenWA.git}"
OPENWA_TAG="${OPENWA_TAG:-v0.25.0}"
OPENWA_DIR="${OPENWA_DIR:-/www/wwwroot/openwa}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# O OpenWA só usa pacotes do registro público. Força o registro para não herdar
# um registry alternativo do ~/.npmrc do usuário (ex.: npm.pkg.github.com no root).
export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*" >&2; exit 1; }

# --- pré-requisitos --------------------------------------------------------
command -v node >/dev/null || fail "node não encontrado no PATH"
command -v npm  >/dev/null || fail "npm não encontrado no PATH"
command -v git  >/dev/null || fail "git não encontrado"
command -v pm2  >/dev/null || fail "pm2 não encontrado (npm i -g pm2)"
command -v patch >/dev/null || fail "'patch' não encontrado (dnf install patch) — o postinstall do OpenWA depende dele"
for t in gcc g++ make python3; do
  command -v "$t" >/dev/null || fail "'$t' não encontrado — necessário para compilar better-sqlite3/sharp"
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "OpenWA exige Node >= 22.19 (atual: $(node -v))"

# --- clone / checkout -------------------------------------------------------
if [ ! -d "$OPENWA_DIR/.git" ]; then
  log "Clonando $OPENWA_REPO em $OPENWA_DIR"
  git clone --depth 1 --branch "$OPENWA_TAG" "$OPENWA_REPO" "$OPENWA_DIR"
else
  log "Atualizando checkout para $OPENWA_TAG"
  git -C "$OPENWA_DIR" fetch --depth 1 origin "refs/tags/$OPENWA_TAG:refs/tags/$OPENWA_TAG" --force
  git -C "$OPENWA_DIR" checkout -q "$OPENWA_TAG"
fi

cd "$OPENWA_DIR"
mkdir -p data logs

# --- .env -------------------------------------------------------------------
if [ ! -f .env ]; then
  log "Criando .env a partir de deploy/openwa/.env.example"
  cp "$HERE/.env.example" .env
else
  log ".env já existe — mantido"
fi

# --- deps + build -----------------------------------------------------------
# Puppeteer baixa o Chrome for Testing para ~/.cache/puppeteer (≈400 MB) na primeira vez.
log "Instalando dependências (npm ci) — pode compilar módulos nativos"
npm ci --include=dev

log "Build da API (NestJS) e do dashboard"
npm run build
npm run dashboard:build || log "dashboard:build falhou — a API continua funcional; o painel web do OpenWA ficará indisponível"

# --- PM2 --------------------------------------------------------------------
log "Subindo no PM2"
if pm2 describe openwa >/dev/null 2>&1; then
  OPENWA_DIR="$OPENWA_DIR" pm2 restart "$HERE/ecosystem.config.js" --update-env
else
  OPENWA_DIR="$OPENWA_DIR" pm2 start "$HERE/ecosystem.config.js"
fi
pm2 save

log "Aguardando a API responder..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:2785/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS "http://127.0.0.1:2785/api/health" >/dev/null 2>&1 || fail "API não respondeu em /api/health. Veja: pm2 logs openwa"

# --- API key ----------------------------------------------------------------
if [ -f data/.api-key ]; then
  log "API key admin (cole em Configurações → WhatsApp no Credenciamento):"
  cat data/.api-key; echo
else
  log "data/.api-key ainda não existe; confira 'pm2 logs openwa' (a key é impressa no primeiro boot)."
fi

# --- aviso de exposição -----------------------------------------------------
# O OpenWA faz app.listen(PORT) sem host → escuta em 0.0.0.0. Garanta bloqueio externo.
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  if firewall-cmd --list-ports 2>/dev/null | grep -qw "2785/tcp"; then
    log "AVISO: a porta 2785/tcp está LIBERADA no firewalld. Remova com:"
    echo "  sudo firewall-cmd --permanent --remove-port=2785/tcp && sudo firewall-cmd --reload"
  else
    log "firewalld ativo e 2785/tcp não liberada — acesso externo bloqueado."
  fi
else
  log "AVISO: firewalld não detectado. O OpenWA escuta em 0.0.0.0:2785 — bloqueie a porta no firewall/VPC."
fi

log "Pronto. URL do gateway (uso interno): http://127.0.0.1:2785"
