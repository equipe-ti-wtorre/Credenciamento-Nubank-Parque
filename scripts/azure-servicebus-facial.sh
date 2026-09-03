#!/usr/bin/env bash
# Provisiona filas e SAS policies do módulo facial no namespace Service Bus compartilhado.
# Idempotente — seguro reexecutar.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-nubank-parque}"
NAMESPACE="${NAMESPACE:-sb-nubank-parque}"
LOCATION="${LOCATION:-brazilsouth}"

QUEUE_COMMANDS="${QUEUE_COMMANDS:-facial-commands}"
QUEUE_STATUS="${QUEUE_STATUS:-facial-enrollment-status}"

SAS_CRED_SEND="${SAS_CRED_SEND:-credenciamento-send}"
SAS_GATEWAY_LISTEN_CMD="${SAS_GATEWAY_LISTEN_CMD:-gateway-listen-cmd}"
SAS_CRED_LISTEN_STATUS="${SAS_CRED_LISTEN_STATUS:-credenciamento-listen-status}"
SAS_GATEWAY_SEND_STATUS="${SAS_GATEWAY_SEND_STATUS:-gateway-send-status}"

echo "==> Resource group: $RESOURCE_GROUP"
echo "==> Namespace: $NAMESPACE"

if ! az group show -n "$RESOURCE_GROUP" &>/dev/null; then
  echo "Criando resource group $RESOURCE_GROUP..."
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none
fi

if ! az servicebus namespace show -g "$RESOURCE_GROUP" -n "$NAMESPACE" &>/dev/null; then
  echo "Criando namespace $NAMESPACE (compartilhado com AccessControlGateway)..."
  az servicebus namespace create -g "$RESOURCE_GROUP" -n "$NAMESPACE" -l "$LOCATION" -o none
else
  echo "Namespace $NAMESPACE já existe — reutilizando."
fi

create_queue() {
  local name="$1"
  if az servicebus queue show -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" -n "$name" &>/dev/null; then
    echo "Fila $name já existe."
  else
    echo "Criando fila $name..."
    az servicebus queue create -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" -n "$name" -o none
  fi
}

create_queue_rule() {
  local queue="$1"
  local rule="$2"
  shift 2
  local rights=("$@")
  if az servicebus queue authorization-rule show \
    -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" \
    --queue-name "$queue" -n "$rule" &>/dev/null; then
    echo "SAS $rule em $queue já existe."
  else
    echo "Criando SAS $rule em $queue (${rights[*]})..."
    az servicebus queue authorization-rule create \
      -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" \
      --queue-name "$queue" -n "$rule" --rights "${rights[@]}" -o none
  fi
}

create_queue "$QUEUE_COMMANDS"
create_queue "$QUEUE_STATUS"

create_queue_rule "$QUEUE_COMMANDS" "$SAS_CRED_SEND" Send
create_queue_rule "$QUEUE_COMMANDS" "$SAS_GATEWAY_LISTEN_CMD" Listen
create_queue_rule "$QUEUE_STATUS" "$SAS_CRED_LISTEN_STATUS" Listen
create_queue_rule "$QUEUE_STATUS" "$SAS_GATEWAY_SEND_STATUS" Send

echo ""
echo "==> Connection strings (copie para .env):"
echo ""
echo "# Credenciamento — Send commands"
az servicebus queue authorization-rule keys list \
  -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" \
  --queue-name "$QUEUE_COMMANDS" -n "$SAS_CRED_SEND" \
  --query primaryConnectionString -o tsv
echo ""
echo "# Credenciamento worker — Listen status"
az servicebus queue authorization-rule keys list \
  -g "$RESOURCE_GROUP" --namespace-name "$NAMESPACE" \
  --queue-name "$QUEUE_STATUS" -n "$SAS_CRED_LISTEN_STATUS" \
  --query primaryConnectionString -o tsv
echo ""
echo "Provisionamento concluído."
