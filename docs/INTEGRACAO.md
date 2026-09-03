# Credenciamento Facial — Documentação de integração

Módulo de credenciamento facial integrado ao **AccessControlGateway** (terminais Dahua).

Cobre instalação, configuração na UI, HTTP poll (recomendado), Azure Service Bus (opcional), contratos, APIs e troubleshooting.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura e conectividade](#2-arquitetura-e-conectividade)
3. [Stack e requisitos](#3-stack-e-requisitos)
4. [Instalação do backend](#4-instalação-do-backend)
5. [Configuração](#5-configuração)
6. [Modo HTTP poll (recomendado)](#6-modo-http-poll-recomendado)
7. [Configuração no Gateway](#7-configuração-no-gateway)
8. [APIs do Gateway → Credenciamento](#8-apis-do-gateway--credenciamento)
9. [APIs administrativas (JWT)](#9-apis-administrativas-jwt)
10. [Contrato de mensagens](#10-contrato-de-mensagens)
11. [Estados do colaborador e jobs](#11-estados-do-colaborador-e-jobs)
12. [Modo Azure Service Bus (opcional)](#12-modo-azure-service-bus-opcional)
13. [Nginx / aaPanel](#13-nginx--aapanel)
14. [Checklist de go-live](#14-checklist-de-go-live)
15. [Troubleshooting](#15-troubleshooting)

Atualização de segurança (IP pin + secret no `.env`): [atualizacao-seguranca-facial.md](./atualizacao-seguranca-facial.md).

---

## 1. Visão geral

O Credenciamento gerencia colaboradores (aprovação, foto, validade) e solicita sincronização facial nos terminais Dahua através do AccessControlGateway.

| Responsabilidade | Sistema |
|------------------|---------|
| Cadastro / aprovação / foto | Credenciamento |
| Enviar face / revogar nos terminais | AccessControlGateway |
| Eventos de passagem (entrada/saída) | Gateway → Credenciamento |

**IDs**

| Campo | Formato | Uso |
|-------|---------|-----|
| `linkedId` | `col-{id}` | ID canônico no Credenciamento |
| `userId` | `{id}` (string numérica) | ID nos terminais Dahua |

Exemplo: colaborador `42` → `linkedId=col-42`, `userId=42`.

---

## 2. Arquitetura e conectividade

Cenário típico (Gateway em rede interna, Credenciamento em servidor público):

```
┌─────────────────────────┐         HTTPS (saída)        ┌──────────────────────────┐
│  AccessControlGateway   │ ───────────────────────────► │     Credenciamento       │
│  (aaPanel / rede local) │   jobs/claim, status, events │  (servidor externo)      │
│  Portas Dahua locais    │                              │  API pública :443        │
└─────────────────────────┘                              └──────────────────────────┘
           ▲
           │ Rede local
           ▼
    Terminais Dahua
```

O Credenciamento **não precisa** alcançar o Gateway. Todas as conexões de integração são iniciadas pelo Gateway (modo HTTP poll).

---

## 3. Stack e requisitos

| Item | Requisito |
|------|-----------|
| Node.js | ≥ 20 |
| MySQL | 8.x |
| Porta padrão da API | `3007` (`PORT` no `.env`) |
| Gateway | AccessControlGateway com integração HTTP poll |
| Rede | Gateway com saída HTTPS até a URL pública do Credenciamento |

Estrutura:

```
Credenciamento/
├── docs/
│   ├── INTEGRACAO.md              ← este arquivo
│   ├── atualizacao-seguranca-facial.md
│   ├── nginx-facial-allowlist.conf.example
│   ├── modulo-facial-azure.md     ← Service Bus (opcional)
│   └── gateway-integracao-credenciamento-ui.md
├── backend/
│   ├── .env.example
│   ├── migrations/051–054_*.sql
│   └── modules/facial/
└── frontend/                      ← Admin → Configurações → Integração facial
```

---

## 4. Instalação do backend

```bash
cd /www/wwwroot/Credenciamento/backend
cp .env.example .env
# edite .env (MySQL, JWT, ENCRYPTION_KEY)

npm install
npm start
# migrations rodam na inicialização (inclui 054_facial_enrollment_jobs.sql)
```

Health check (público, sem Bearer):

```bash
curl -s http://127.0.0.1:3007/api/facial/health
# {"ok":true,"memoryStore":false,"enabled":true,"transport":"http_poll"}
```

| Comando | Descrição |
|---------|-----------|
| `npm start` | Sobe a API (`server.js`) |
| `npm run start:facial-worker` | Worker Service Bus (em poll fica em espera) |
| `npm run facial:mock-send-status` | Injeta status de enrollment (dev) |

---

## 5. Configuração

O Bearer da integração **vai no `.env`** (`FACIAL_GATEWAY_EVENTS_SECRET`). A UI só liga/desliga a integração e as connection strings Azure.

Ambientes já em produção: [atualizacao-seguranca-facial.md](./atualizacao-seguranca-facial.md).

### Obrigatório (HTTP poll)

| Item | Onde | Descrição |
|------|------|-----------|
| Integração ativa | UI | Checkbox |
| `FACIAL_GATEWAY_EVENTS_SECRET` | `.env` | Bearer ≥ 32 caracteres; mesmo valor na UI do Gateway |
| `FACIAL_PEER_ORIGIN_IP` | `.env` | IP público de saída do Gateway (allowlist). Obrigatório em produção |
| `FACIAL_PEER_DESTINATION_IP` | `.env` | IP público do Credenciamento (paridade com o Gateway). Obrigatório em produção |
| `HOST` | `.env` | `127.0.0.1` — o Nginx faz o proxy |
| `ENCRYPTION_KEY` | `.env` | Criptografa connection strings Azure no banco |

### Opcional

| Item | Default | Descrição |
|------|---------|-----------|
| Connection strings Azure | vazio | Ambas preenchidas = Service Bus |
| Filas | `facial-commands` / `facial-enrollment-status` | Só se usar Service Bus |
| `FACIAL_JOB_STALE_MINUTES` | `30` | Timeout de jobs `processing` |
| `CORS_ORIGINS` | localhost:4207 | Origins do frontend |

**Para HTTP poll:** deixe as connection strings Azure vazias.

---

## 6. Modo HTTP poll (recomendado)

### Fluxo

```
1. Operador envia foto / facial-enroll no Credenciamento
2. Job criado com status = queued  (sem Service Bus)
3. Gateway (a cada ~3s) → POST /api/facial/jobs/claim
4. Credenciamento marca job = processing e devolve comando + foto
5. Gateway sincroniza terminais Dahua
6. Gateway → POST /api/facial/status  (overallStatus + devices)
7. Credenciamento atualiza facial_status do colaborador
8. Passagens: Gateway → POST /api/facial/events
```

Upload de foto em `POST /api/v1/collaborators/:id/picture` já dispara enroll. Revoke dispara ao remover foto, desativar ou colocar na blocklist. Enroll dispara de novo na reativação e na saída da blocklist, se o colaborador estiver ativo, tiver foto e não estiver na lista de restrição.

### Autenticação

Endpoints de integração (exceto `/health`) exigem **IP na allowlist** (`FACIAL_PEER_ORIGIN_IP`) e:

```http
Authorization: Bearer <FACIAL_GATEWAY_EVENTS_SECRET>
Content-Type: application/json
```

O valor deve ser **idêntico** ao secret configurado no Gateway. Em desenvolvimento, IPs vazios dispensam o pin (curl local).

### Intervalo de poll no Gateway

```env
CREDENCIAMENTO_POLL_MS=3000
```

---

## 7. Configuração no Gateway

No AccessControlGateway → **Configurações → Integração Credenciamento** (spec em `docs/gateway-integracao-credenciamento-ui.md`):

| Campo | Valor |
|-------|--------|
| Integração ativa | Sim |
| URL do Credenciamento | `https://credenciamento.seu-dominio.com` |
| Secret Bearer | mesmo de `FACIAL_GATEWAY_EVENTS_SECRET` no Credenciamento |
| Connection strings Service Bus | **vazias** (mantém HTTP poll) |

A URL aceita `https://host`, `https://host/api/facial` ou `https://host/api/facial/events`. O Gateway deriva:

| Uso | Path derivado |
|-----|----------------|
| Claim | `{base}/api/facial/jobs/claim` |
| Fila (peek) | `{base}/api/facial/jobs/queued` |
| Status | `{base}/api/facial/status` |
| Eventos | `{base}/api/facial/events` |

Log esperado no Gateway após salvar:

```text
Command consumer using HTTP poll → https://…/api/facial
```

---

## 8. APIs do Gateway → Credenciamento

Base: `https://<credenciamento>/api/facial`  
Auth: IP allowlist + Bearer (exceto health)

### 8.1 Health

```http
GET /api/facial/health
```

```json
{ "ok": true, "memoryStore": false, "enabled": true, "transport": "http_poll" }
```

`transport`: `http_poll` | `service_bus`.

### 8.2 Claim de jobs (poll)

```http
POST /api/facial/jobs/claim
Authorization: Bearer <secret>
Content-Type: application/json

{ "limit": 5 }
```

`limit` máximo efetivo: 20.

Resposta (enroll):

```json
{
  "jobs": [
    {
      "type": "enroll",
      "correlationId": "a1b2c3d4-…",
      "linkedId": "col-42",
      "userId": "42",
      "userName": "Maria Silva",
      "cardNo": "42",
      "photoBase64": "/9j/4AAQ…"
    }
  ]
}
```

Revoke (sem foto):

```json
{
  "jobs": [
    {
      "type": "revoke",
      "correlationId": "…",
      "linkedId": "col-42",
      "userId": "42"
    }
  ]
}
```

Comportamento:

- Seleciona jobs `queued` (FIFO, `FOR UPDATE SKIP LOCKED`)
- Atualiza atomicamente para `processing`
- Inclui `photoBase64` apenas em `enroll`
- Enroll sem arquivo de foto no disco é marcado `failed` e não retorna no claim
- Jobs `processing` além de `FACIAL_JOB_STALE_MINUTES` voltam para `queued`

### 8.2.1 Peek da fila (sem claim)

```http
GET  /api/facial/jobs/queued?limit=5
POST /api/facial/jobs/queued
Authorization: Bearer <secret>
Content-Type: application/json

{ "limit": 5 }
```

Não altera status dos jobs e **não** devolve `photoBase64`.

```json
{
  "count": 3,
  "jobs": [
    {
      "correlationId": "a1b2c3d4-…",
      "type": "enroll",
      "linkedId": "col-42",
      "userId": "42",
      "createdAt": "2026-08-25T14:00:00.000Z"
    }
  ]
}
```

`count` é o total na fila `queued`; `jobs` respeita `limit` (1–20).

### 8.3 Status de enrollment

```http
POST /api/facial/status
Authorization: Bearer <secret>
```

```json
{
  "type": "enrollment-status",
  "correlationId": "a1b2c3d4-…",
  "linkedId": "col-42",
  "userId": "42",
  "command": "enroll",
  "overallStatus": "synced",
  "devices": {
    "entrada-01": { "status": "synced" },
    "entrada-02": { "status": "synced" },
    "saida-01": { "status": "synced" },
    "saida-02": { "status": "failed", "error": "timeout" }
  },
  "timestamp": "2026-08-21T14:00:00.000Z"
}
```

`overallStatus`: `synced` | `partial` | `pending` | `failed`.

### 8.4 Eventos de acesso

```http
POST /api/facial/events
Authorization: Bearer <secret>
```

```json
{
  "type": "access",
  "eventId": 12345,
  "deviceId": "entrada-01",
  "recNo": 987,
  "userId": "42",
  "direcao": "entrada",
  "eventTime": "2026-08-21T14:05:00.000Z",
  "method": "Face",
  "status": "Success",
  "antipassback": false,
  "blocked": false
}
```

- `type` **deve** ser `access`
- `direcao`: `entrada` | `saida`
- Deduplicação por `gatewayEventId` (`eventId`) ou (`deviceId` + `recNo`)

---

## 9. APIs administrativas (JWT)

Login em `/api/v1/auth` (ou `/api/auth`) → `Authorization: Bearer <jwt>`.

Configuração da integração: permissão `settings_facial` (`view` / `edit`).

Ações de colaborador: `collaborators` (`view` / `edit`).

### Integração (settings)

| Método | Path | Permissão | Descrição |
|--------|------|-----------|-----------|
| `GET` | `/api/v1/facial/settings` | `settings_facial:view` | Config pública (`transport`, flags `has_*`) |
| `PUT` | `/api/v1/facial/settings` | `settings_facial:edit` | Salva; CS vazias = poll |
| `GET` | `/api/v1/facial/status` | `settings_facial:view` | Painel operacional |
| `GET` | `/api/v1/facial/logs` | `settings_facial:view` | `?type=enrollment\|access` |
| `POST` | `/api/v1/facial/status/ingest` | `settings_facial:edit` | Injeta status (teste) |
| `POST` | `/api/v1/facial/sync/test` | `settings_facial:edit` | Diagnóstico da fila e da configuração |
| `POST` | `/api/v1/facial/sync/force` | `settings_facial:edit` | Reenvia enroll de todos os elegíveis |

### Colaborador

| Método | Path | Permissão | Descrição |
|--------|------|-----------|-----------|
| `GET` | `/api/v1/collaborators/:id/facial-status` | `collaborators:view` | Status + jobs |
| `POST` | `/api/v1/collaborators/:id/facial-enroll` | `collaborators:edit` | Solicita enroll (202) |
| `POST` | `/api/v1/collaborators/:id/facial-revoke` | `collaborators:edit` | Solicita revoke (202) |
| `POST` | `/api/v1/collaborators/:id/facial-retry` | `collaborators:edit` | Reenvia enroll |
| `POST` | `/api/v1/collaborators/:id/picture` | `collaborators:edit` | Upload de foto (já dispara enroll) |

Body enroll (opcional foto override):

```json
{ "photoBase64": "<jpeg base64>" }
```

Resposta 202:

```json
{
  "correlationId": "…",
  "linkedId": "col-42",
  "userId": "42",
  "transport": "http_poll",
  "queued": true
}
```

Sem Service Bus, o job permanece `queued` até o Gateway fazer claim.

---

## 10. Contrato de mensagens

Espelhado em `backend/modules/facial/facial.contract.js`.

### Comando enroll

```json
{
  "type": "enroll",
  "correlationId": "uuid",
  "linkedId": "col-42",
  "userId": "42",
  "userName": "Nome",
  "photoBase64": "…",
  "cardNo": "42"
}
```

### Comando revoke

```json
{
  "type": "revoke",
  "correlationId": "uuid",
  "linkedId": "col-42",
  "userId": "42"
}
```

### Status (`type: enrollment-status`)

Ver [§ 8.3](#83-status-de-enrollment).

Mapeamento `overallStatus` → `collaborator.facial_status`:

| overallStatus | command | facial_status |
|---------------|---------|---------------|
| `synced` | `enroll` | `synced` |
| `partial` | * | `partial` |
| `pending` | * | `pending` |
| `failed` | * | `failed` |
| `synced` | `revoke` | `revoked` |

---

## 11. Estados do colaborador e jobs

### `collaborator.facial_status`

`NULL` → `pending` → `synced` | `partial` | `failed` | `revoked`

### `facial_enrollment_jobs.status`

| Status | Significado |
|--------|-------------|
| `queued` | Aguardando claim do Gateway |
| `processing` | Já claimado / em execução |
| `synced` | Sucesso total |
| `partial` | Sucesso parcial nos devices |
| `pending` | Ainda pendente em devices |
| `failed` | Falha / substituído / sem foto |

Jobs em `processing` além de `FACIAL_JOB_STALE_MINUTES` voltam para `queued` (claim e cron a cada 5 min). Um novo enroll/revoke marca jobs `queued` anteriores do mesmo colaborador como `failed` (`superseded_by_newer_job`).

---

## 12. Modo Azure Service Bus (opcional)

Use apenas se **ambas** as connection strings estiverem configuradas na UI. Nesse caso o transporte de comandos/status deixa de ser HTTP poll.

| Fila | Credenciamento | Gateway |
|------|----------------|---------|
| `facial-commands` | Send | Listen |
| `facial-enrollment-status` | Listen (worker PM2) | Send |

Eventos de acesso **continuam** via `POST /api/facial/events`.

Provisionamento: [modulo-facial-azure.md](./modulo-facial-azure.md) e `scripts/azure-servicebus-facial.sh`.

Para voltar ao poll: na UI, marque **Limpar connection strings Azure**.

---

## 13. Nginx / aaPanel

O Node escuta em `127.0.0.1:3007`. O Gateway precisa alcançar o Credenciamento pela internet (ou VPN).

Allowlist nos paths de integração: modelo em [nginx-facial-allowlist.conf.example](./nginx-facial-allowlist.conf.example). Passo a passo: [atualizacao-seguranca-facial.md](./atualizacao-seguranca-facial.md).

Use `location =` **exato** em `/api/facial/events`, `/status`, `/jobs/claim` e `/jobs/queued` com `allow ORIGIN_IP; deny all;`. Não use prefixo em `/api/facial/status` (preserva JWT `/api/v1/facial/status/ingest`).

`GET /api/facial/health` e o restante de `/api/` ficam no `location /api/` sem pin de IP.

Mantenha `X-Real-IP` e `X-Forwarded-For` (o Node usa `trust proxy`).

Fotos base64 no claim podem ser grandes — mantenha `client_max_body_size` e timeout altos no **Gateway** (cliente HTTP).

Firewall: liberar **443** a partir do IP de saída do Gateway.

---

## 14. Checklist de go-live

### Credenciamento

- [ ] MySQL ok; API sobe e aplica migrations (054 inclusa)
- [ ] `HOST=127.0.0.1`, `FACIAL_GATEWAY_EVENTS_SECRET` (≥ 32) e par de IPs no `.env`
- [ ] UI: integração ativa
- [ ] Connection strings Azure vazias (modo poll)
- [ ] Nginx com allow/deny nos 4 paths; HTTPS responde `GET /api/facial/health`
- [ ] Processo Node gerenciado (PM2 / aaPanel) e reinicia no boot

### Gateway

- [ ] Integração ativa na UI
- [ ] URL apontando para o host público do Credenciamento
- [ ] Secret idêntico
- [ ] Sem connection strings Azure (poll)
- [ ] Log: `Command consumer using HTTP poll`
- [ ] Saída HTTPS até o Credenciamento (`curl`)

### Teste funcional

1. Aprovar colaborador com foto válida
2. Confirmar job `queued` → `processing` / `synced` (ou `POST …/facial-enroll`)
3. Verificar face no terminal Dahua
4. Passar na catraca e ver evento em logs de Acesso / `facial_access_log`

Teste manual de claim (do servidor do Gateway):

```bash
curl -sS -X POST "https://credenciamento.seu-dominio.com/api/facial/jobs/claim" \
  -H "Authorization: Bearer SEU_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":1}'
```

---

## 15. Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Jobs ficam `queued` | Gateway sem poll / URL errada / secret errado | Conferir UI Gateway + logs `HTTP poll` |
| Claim `401` | Secret divergente | Igualar `FACIAL_GATEWAY_EVENTS_SECRET` e o Bearer da UI do Gateway |
| Claim / events `403` | IP visto pelo Nginx ≠ origem | Conferir egresso, `allow` e `FACIAL_PEER_ORIGIN_IP` |
| Claim `503` | Integração inativa | Ativar na UI |
| Processo não sobe | Secret/IPs/JWT inválidos em produção | Ver [atualizacao-seguranca-facial.md](./atualizacao-seguranca-facial.md) |
| Claim `404` / HTML nginx | Path ou vhost errado | Proxy `/api/` → `:3007` |
| Enroll `failed` sem foto | Arquivo ausente em `storage/pictures` | Reenviar foto e `facial-retry` |
| Status não atualiza | Gateway não alcança `/status` | Testar `curl` POST `/api/facial/status` |
| Eventos não aparecem | URL / secret / `type` ≠ `access` | Conferir outbox do Gateway |
| `processing` travado | Gateway caiu após claim | Aguardar `FACIAL_JOB_STALE_MINUTES` |
| Timeout no claim | Foto grande / proxy lento | Aumentar `proxy_read_timeout` e `client_max_body_size` |
| UI exige CS Azure | Frontend antigo | Atualizar build; CS são opcionais |

### Logs úteis

**Credenciamento**

```text
Service Bus ausente — job fica queued para HTTP poll: enroll <correlationId>
HTTP poll: job(s) claimados do Gateway
Enrollment status processed
```

**Gateway**

```text
Command consumer using HTTP poll → https://…/api/facial
HTTP poll: N job(s) claimados do Credenciamento
Enrollment status { correlationId, overallStatus }
```

---

## Referências

| Arquivo | Conteúdo |
|---------|----------|
| [modulo-facial-azure.md](./modulo-facial-azure.md) | Provisionamento Service Bus |
| [gateway-integracao-credenciamento-ui.md](./gateway-integracao-credenciamento-ui.md) | Spec de UI do Gateway |
| `backend/modules/facial/facial.contract.js` | Contrato de mensagens |
| `backend/migrations/054_facial_enrollment_jobs.sql` | Tabela de jobs poll |
| Gateway UI | Configurações → Integração Credenciamento |
