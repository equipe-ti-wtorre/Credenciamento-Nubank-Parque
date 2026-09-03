# Módulo Facial — Integração Azure (Credenciamento ↔ AccessControlGateway)

**Modo recomendado:** HTTP poll (sem Azure). Este arquivo cobre o modo **opcional** Service Bus.

Documentação operacional completa (poll + APIs): [INTEGRACAO.md](./INTEGRACAO.md).

## Visão geral

Com **ambas** as connection strings Azure preenchidas em **Admin → Configurações → Integração facial**, o Credenciamento envia comandos de enrollment/revoke para o **AccessControlGateway** via Azure Service Bus e recebe:

- **Status de enrollment** na fila `facial-enrollment-status` (worker PM2)
- **Eventos de acesso** via webhook HTTPS `POST /api/facial/events` (sempre HTTP, mesmo com Service Bus)

Se as connection strings estiverem vazias, o transporte é HTTP poll (`POST /api/facial/jobs/claim` e `POST /api/facial/status`).

## Pré-requisitos

- Azure CLI (`az`) autenticado (`az login`)
- Namespace Service Bus compartilhado com o AccessControlGateway (ex.: `sb-nubank-parque`)
- Resource group (ex.: `rg-nubank-parque`)

## Provisionamento

```bash
cd /www/wwwroot/Credenciamento
chmod +x scripts/azure-servicebus-facial.sh
RESOURCE_GROUP=rg-nubank-parque NAMESPACE=sb-nubank-parque ./scripts/azure-servicebus-facial.sh
```

O script é idempotente: não recria namespace/filas/SAS existentes.

### Filas

| Fila | Credenciamento | AccessControlGateway |
|------|----------------|----------------------|
| `facial-commands` | Send | Listen + Complete |
| `facial-enrollment-status` | Listen + Complete | Send |

### SAS policies

| Policy | Fila | Permissão | Usado por |
|--------|------|-----------|-----------|
| `credenciamento-send` | facial-commands | Send | Backend Credenciamento |
| `credenciamento-listen-status` | facial-enrollment-status | Listen | Worker Credenciamento |
| `gateway-listen-cmd` | facial-commands | Listen | AccessControlGateway |
| `gateway-send-status` | facial-enrollment-status | Send | AccessControlGateway |

## Variáveis de ambiente (Credenciamento)

HTTP poll: `FACIAL_GATEWAY_EVENTS_SECRET`, `FACIAL_PEER_ORIGIN_IP` e `FACIAL_PEER_DESTINATION_IP` no `.env`. Connection strings Azure (opcional) continuam na UI, criptografadas com `ENCRYPTION_KEY`.

Guia operacional: [atualizacao-seguranca-facial.md](./atualizacao-seguranca-facial.md) e [INTEGRACAO.md](./INTEGRACAO.md).

## Webhook de eventos (gateway → Credenciamento)

Configure no AccessControlGateway (**Configurações → Integração Azure → URL de eventos**):

```
https://<credenciamento-api>/api/facial/events
```

Header obrigatório:

```
Authorization: Bearer <FACIAL_GATEWAY_EVENTS_SECRET>
```

O gateway deve enviar o Bearer no `flushOutbox()` (pré-requisito coordenado).

## PM2

Além da API (`server.js`), iniciar o worker:

```bash
pm2 start backend/ecosystem.config.cjs
# ou
cd backend && npm run start:facial-worker
```

## Checklist pós-provisionamento

- [ ] Filas `facial-commands` e `facial-enrollment-status` criadas
- [ ] 4 SAS policies com permissões mínimas
- [ ] Connection strings e secret preenchidos em **Configurações → Integração facial** (somente se for usar Service Bus; vazias = HTTP poll)
- [ ] URL de eventos apontando para `/api/facial/events`
- [ ] Worker `facial-worker` rodando no PM2
- [ ] Teste: upload de foto → comando na fila → status `synced` no colaborador

## Scripts de teste local

```bash
cd backend
node scripts/facial-mock-send-command.js --collaborator-id 1 --photo ./storage/pictures/exemplo.jpg
node scripts/facial-mock-send-status.js --collaborator-id 1 --overall synced
```
