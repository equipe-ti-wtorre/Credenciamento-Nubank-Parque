# Integração Credenciamento — Especificação de UI para o AccessControlGateway

Documento de referência para recriar no **AccessControlGateway** o mesmo layout e UX da página **Admin → Configurações → Integração facial** do projeto **Credenciamento**.

Use este arquivo como prompt/spec completa para implementação no Gateway (frontend + backend + menu).

**Modo padrão:** HTTP poll (recomendado). Azure Service Bus é opcional.

---

## 1. Objetivo

Espelhar visualmente e funcionalmente a tela de integração já implementada no Credenciamento, adaptando campos e APIs ao **papel do Gateway**.

O Credenciamento **não precisa** alcançar o Gateway. Todas as conexões de integração são iniciadas pelo Gateway.

| Canal | Transporte (poll — recomendado) | Transporte (Service Bus — opcional) |
|-------|----------------------------------|-------------------------------------|
| Comandos enroll/revoke | Gateway → `POST …/jobs/claim` | Fila `facial-commands` (Listen) |
| Status enrollment | Gateway → `POST …/status` | Fila `facial-enrollment-status` (Send) |
| Eventos de acesso | Gateway → `POST …/events` | Mesmo webhook HTTP |
| Secret Bearer | Envia no header outbound | Envia no header outbound |

**Seleção de transporte:** se **ambas** as connection strings Azure estiverem configuradas, usa Service Bus; caso contrário (vazias), usa HTTP poll.

---

## 2. Wireframes

### 2.1 Estrutura geral

```text
┌─────────────────────────────────────────────────────────────────┐
│ Integração Credenciamento                    [Salvar / Atualizar]│
│ HTTP poll (recomendado) ou Azure Service Bus + eventos          │
├─────────────────────────────────────────────────────────────────┤
│  [ Configuração ]  [ Logs ]     ← pill tabs (max-width 420px)   │
├─────────────────────────────────────────────────────────────────┤
│                         CONTEÚDO DA ABA ATIVA                    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Aba Configuração (`lg+`)

```text
┌──────────────────────────────┬──────────────────┐
│ Card: Configuração da        │ Status operacional│
│       integração             │  (sticky)         │
│  ☑ Integração ativa          │  badges           │
│  URL do Credenciamento       │  transporte       │
│  Secret Bearer               │  enrollment 3 cols│
│  CS Listen (opcional)        │  acesso 24h       │
│  Fila comandos               │                   │
│  CS Send (opcional)          │                   │
│  Fila status                 │                   │
│  Última alteração            │                   │
├──────────────────────────────┤                   │
│ Card: Credenciamento — URL   │                   │
│  (paths derivados + notas)   │                   │
└──────────────────────────────┴──────────────────┘
```

Grid CSS: `lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 lg:gap-5`

### 2.3 Aba Logs

```text
┌─────────────────────────────────────────────────────────────────┐
│ Status operacional (largura total, layout md:grid-cols-2)        │
├─────────────────────────────────────────────────────────────────┤
│ [ Comandos ] [ Eventos ]              Últimos 24 registros       │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                 │
│ │ log card    │ │ log card    │ │ log card    │  ← grid 1/2/3   │
│ └─────────────┘ └─────────────┘ └─────────────┘                 │
│              (scroll max-h adaptável à viewport)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Cabeçalho da página

| Elemento | Valor no Gateway |
|----------|------------------|
| Título | `Integração Credenciamento` |
| Subtítulo | `HTTP poll (recomendado) ou Azure Service Bus e eventos com o Credenciamento.` |
| Botão (aba Configuração) | `Salvar configuração` — classe `btn-primary` |
| Botão (aba Logs) | `Atualizar` — classe `btn-secondary` |

Layout do header: `flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5`

---

## 4. Abas principais (pill tabs)

Replicar o padrão de `smtp-tabs` / `facial-tabs` do Credenciamento.

### 4.1 CSS (component-scoped)

```css
.credenciamento-tabs {
  display: flex;
  background: #eef2f7;
  border-radius: 11px;
  padding: 4px;
  gap: 4px;
  max-width: 420px;
}
.credenciamento-tabs button {
  flex: 1;
  height: 36px;
  border: none;
  background: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 13.5px;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.credenciamento-tabs button.on {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}
```

### 4.2 Abas

| ID interno | Label | Conteúdo |
|------------|-------|----------|
| `config` | Configuração | Formulário + painel status lateral |
| `logs` | Logs | Status full-width + sub-abas de logs |

Atributos de acessibilidade: `role="tablist"`, `role="tab"`, `aria-selected`.

---

## 5. Aba Configuração — Campos

### 5.1 Card 1 — Configuração da integração

| Campo | Tipo | Default / placeholder | Obrigatório (ativo) |
|-------|------|------------------------|---------------------|
| Integração Credenciamento ativa | checkbox | — | — |
| URL do Credenciamento | text/url | `https://credenciamento.seu-dominio.com` | Sim |
| Secret do webhook (Bearer) | password | Obrigatório se ativo | Sim (se ainda não houver secret) |
| Connection string — fila de comandos (Listen) | password | SAS `gateway-listen-cmd` | **Não** (vazio = poll) |
| Fila de comandos | text | `facial-commands` | Não |
| Connection string — fila de status (Send) | password | SAS `gateway-send-status` | **Não** (vazio = poll) |
| Fila de status | text | `facial-enrollment-status` | Não |
| Última alteração | timestamp readonly | `atualizado_em` | — |

**Placeholders quando secret já existe no banco:**

- `•••••••• (mantém o atual se vazio)`

**URL do Credenciamento — formatos aceitos:**

- `https://host`
- `https://host/api/facial`
- `https://host/api/facial/events`

O Gateway normaliza para a base `/api/facial` e deriva os paths (ver §5.2 e §10.6).

**Grid interno do formulário:** `grid gap-4 md:grid-cols-2` — URL, secret e connection strings em `md:col-span-2`.

**Validação ao salvar** (integração ativa):

- Secret obrigatório se `has_events_secret === false` e campo vazio
- URL do Credenciamento obrigatória (não vazia / URL válida HTTPS)
- Connection strings **não** obrigatórias

Mensagem: *"Com a integração ativa, informe a URL do Credenciamento e o secret Bearer. Connection strings Azure são opcionais (vazias = HTTP poll)."*

**Limpar Service Bus (voltar ao poll):** no PUT, enviar connection string como string vazia explícita para limpar o valor persistido; após limpar **ambas**, o transporte volta a `http_poll`.

### 5.2 Card 2 — Credenciamento — URL e paths derivados

| Elemento | Conteúdo |
|----------|----------|
| Título | `Credenciamento — URL da integração` |
| Texto | Configure a URL pública do Credenciamento. O Gateway deriva claim, status e eventos. |
| Code block (base) | valor de `credenciamento_url` (ou hint com origin) |
| Paths derivados | Ver tabela abaixo |
| Nota 1 | `Header: Authorization: Bearer <secret acima>` |
| Nota 2 | Com connection strings vazias: consumer usa HTTP poll (`CREDENCIAMENTO_POLL_MS`, default 3000). |
| Nota 3 | Com ambas connection strings: consumer usa Service Bus; eventos de acesso continuam via HTTP. |

| Uso | Path derivado |
|-----|----------------|
| Claim | `{base}/api/facial/jobs/claim` |
| Status | `{base}/api/facial/status` |
| Eventos | `{base}/api/facial/events` |

---

## 6. Painel Status operacional

Template reutilizável (`#statusPanel`) nas duas abas principais.

### 6.1 Badges

| Estado | Classes Tailwind |
|--------|------------------|
| Integração ativa | `bg-emerald-100 text-emerald-800` |
| Integração inativa | `bg-slate-100 text-slate-600` |
| Configuração completa | `bg-emerald-100 text-emerald-800` |
| Configuração incompleta | `bg-amber-100 text-amber-800` |
| Transporte: HTTP poll | `bg-sky-100 text-sky-800` |
| Transporte: Service Bus | `bg-violet-100 text-violet-800` |

**Modo de transporte:**

```text
transport = (has_commands_connection_string && has_status_connection_string)
  ? "service_bus"
  : "http_poll"
```

**Configuração completa:**

```text
// Sempre: secret + URL
baseComplete = has_events_secret && !!credenciamento_url

// Poll
configComplete (http_poll) = baseComplete

// Service Bus (além de base)
configComplete (service_bus) = baseComplete
  && has_commands_connection_string
  && has_status_connection_string
```

Na prática, se o usuário preencheu só uma connection string, tratar como **incompleta** para Service Bus e preferir exibir aviso (ou continuar em poll até ambas existirem — regra de runtime: **ambas** necessárias para ativar Service Bus).

### 6.2 Seção Enrollment

Três mini-contadores:

| Status | Fundo | Texto |
|--------|-------|-------|
| Synced | `bg-emerald-50` / `text-emerald-700` | contagem |
| Pending | `bg-amber-50` / `text-amber-700` | contagem |
| Failed | `bg-rose-50` / `text-rose-700` | contagem |

Rodapé: *Última atividade: dd/MM/yyyy HH:mm*

**No Gateway:** agregar por status de enrollment processado nos devices (equivalente funcional aos contadores do Credenciamento).

### 6.3 Seção Acesso (24h)

| Métrica | Descrição |
|---------|-----------|
| Total | Eventos enviados/recebidos nas últimas 24h |
| Bloqueados | Subconjunto com `blocked=true` |
| Último evento | Data/hora + `device_id` |

### 6.4 Layout responsivo do painel

| Aba | Layout enrollment + acesso |
|-----|----------------------------|
| Configuração | Vertical (sidebar estreita), separador `border-t` |
| Logs | Horizontal `md:grid-cols-2` |

Sidebar na aba Config: `lg:sticky lg:top-4`

---

## 7. Aba Logs

### 7.1 Sub-abas

| ID | Label Credenciamento | Label sugerido Gateway |
|----|---------------------|------------------------|
| `enrollment` | Enrollment | **Comandos** |
| `access` | Acesso | **Eventos** |

Estilo sub-abas: `px-3 py-1.5 text-xs font-medium rounded-t-lg` — ativo `bg-slate-100 text-slate-800`.

### 7.2 Lista de logs

| Propriedade | Valor |
|-------------|-------|
| Limite padrão | 24 registros |
| Máximo API | 50 |
| Grid | `gap-2 md:grid-cols-2 xl:grid-cols-3` |
| Scroll | `min-h-48 max-h-[min(40rem,calc(100vh-16rem))] overflow-y-auto` |
| Card | `rounded-lg border border-[var(--app-border)] px-3 py-2.5 text-sm` |

### 7.3 Card — Comandos (enrollment)

| Campo exibido | Origem |
|---------------|--------|
| Título | `userName` / `linkedId` / `userId` |
| Badge | `overallStatus` (synced, pending, failed, revoked) |
| Linha 2 | `criado_em` formatado `dd/MM/yyyy HH:mm:ss` |
| Linha 3 | `command` · `direction` · `correlation_id` |
| Erro | `error` em `text-rose-600 break-words` |

### 7.4 Card — Eventos (access)

| Campo exibido | Origem |
|---------------|--------|
| Título | `user_id` |
| Badge | "Bloqueado" se `blocked=true` |
| Linha 2 | `criado_em` |
| Linha 3 | `Device: {device_id}` · `method` · `status` |

### 7.5 Cores de badge de status

```typescript
function enrollmentStatusClass(status: string) {
  const s = status.toLowerCase();
  return {
    'bg-emerald-100 text-emerald-800': ['synced', 'success', 'completed'].includes(s),
    'bg-amber-100 text-amber-800': ['pending', 'partial'].includes(s),
    'bg-rose-100 text-rose-800': ['failed', 'error', 'revoked'].includes(s),
  };
}
```

---

## 8. Comportamento / UX

### 8.1 Ciclo de vida

| Ação | Comportamento |
|------|---------------|
| `constructor` / `reloadPage()` | Carrega settings + status sempre |
| `reloadPage()` | Logs **somente** se `activeTab === 'logs'` |
| `setPageTab('logs')` | Carrega ambas sub-abas de logs |
| `setLogTab(tab)` | Lazy load se lista vazia |
| `refreshPanel()` | Recarrega status + ambos tipos de log |
| `salvar()` | PUT settings → toast sucesso → `loadStatus()` |
| Loading logs | Flag separada por tipo (`logsLoading.commands`, `logsLoading.events`) |
| `loadingLogs` getter | Retorna flag da sub-aba ativa |

### 8.2 Interface SettingsReloadable

Implementar `reloadPage()` para integração com layout de Configurações (recarrega ao trocar item no menu lateral).

---

## 9. APIs backend (Gateway)

Espelhar estrutura do Credenciamento substituindo prefixo `/facial` por `/credenciamento` (ou manter convenção do Gateway).

### 9.1 Rotas

| Método | Path | Permissão sugerida |
|--------|------|-------------------|
| GET | `/api/v1/credenciamento/settings` | `settings_credenciamento:view` |
| PUT | `/api/v1/credenciamento/settings` | `settings_credenciamento:edit` |
| GET | `/api/v1/credenciamento/status` | `settings_credenciamento:view` |
| GET | `/api/v1/credenciamento/logs` | `settings_credenciamento:view` |

**Query logs:** `type=commands|events` (ou `enrollment|access` se preferir paridade literal), `page`, `limit` (máx. 50).

### 9.2 GET `/settings` — resposta pública

```json
{
  "settings": {
    "enabled": true,
    "credenciamento_url": "https://cred.example.com",
    "commands_queue": "facial-commands",
    "status_queue": "facial-enrollment-status",
    "has_events_secret": true,
    "has_commands_connection_string": false,
    "has_status_connection_string": false,
    "transport": "http_poll",
    "atualizado_em": "2026-08-19 17:36:57"
  }
}
```

Secrets nunca retornam em claro — apenas flags `has_*`.

`transport` é derivado no backend:

- `service_bus` se `has_commands_connection_string && has_status_connection_string`
- caso contrário `http_poll`

### 9.3 PUT `/settings` — body

```json
{
  "enabled": true,
  "credenciamento_url": "https://cred.example.com",
  "commands_queue": "facial-commands",
  "status_queue": "facial-enrollment-status",
  "events_secret": "opcional-se-alterar",
  "commands_connection_string": "opcional-se-alterar-ou-vazio-para-limpar",
  "status_connection_string": "opcional-se-alterar-ou-vazio-para-limpar"
}
```

Persistir secrets criptografados (equivalente a `facial_gateway_config` + `ENCRYPTION_KEY` no Credenciamento).

String vazia explícita em `commands_connection_string` / `status_connection_string` **limpa** o valor salvo (volta ao poll quando ambas estiverem vazias).

Campo legado `events_url` (se ainda existir no Gateway): tratar como alias de `credenciamento_url` na leitura/escrita, preferindo `credenciamento_url`.

### 9.4 GET `/status` — resposta

```json
{
  "status": {
    "integration": {
      "enabled": true,
      "configComplete": true,
      "transport": "http_poll",
      "credenciamentoUrl": "https://cred.example.com",
      "commandsQueue": "facial-commands",
      "statusQueue": "facial-enrollment-status",
      "atualizado_em": "2026-08-19 17:36:57"
    },
    "enrollment": {
      "synced": 12,
      "pending": 3,
      "partial": 1,
      "failed": 2,
      "revoked": 0,
      "lastActivityAt": "2026-08-19T17:41:40.000Z"
    },
    "access": {
      "total24h": 45,
      "blocked24h": 2,
      "lastEventAt": "2026-08-19T16:44:37.000Z",
      "lastDeviceId": "entrada-01"
    }
  }
}
```

### 9.5 GET `/logs` — resposta (type=commands)

```json
{
  "type": "commands",
  "logs": [
    {
      "id": 1,
      "criado_em": "2026-08-19T17:41:40.000Z",
      "direction": "inbound",
      "correlation_id": "uuid",
      "linked_id": "col-1",
      "user_id": "1",
      "user_name": "Ana Silva",
      "command": "enroll",
      "overallStatus": "synced",
      "error": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 24,
    "total": 100,
    "totalPages": 5
  }
}
```

### 9.6 GET `/logs` — resposta (type=events)

```json
{
  "type": "events",
  "logs": [
    {
      "id": 1,
      "criado_em": "2026-08-19T16:44:37.000Z",
      "gateway_event_id": 12345,
      "device_id": "entrada-01",
      "user_id": "1",
      "linked_id": "col-1",
      "event_time": "2026-08-19T16:44:30.000Z",
      "blocked": false,
      "antipassback": false,
      "method": "face",
      "status": "granted"
    }
  ],
  "pagination": { "page": 1, "limit": 24, "total": 50, "totalPages": 3 }
}
```

**Regra de sanitização:** nunca retornar `photoBase64` nos logs — substituir por `[redacted]` ou omitir.

---

## 10. Contrato de mensagens (HTTP poll + Service Bus + webhook)

Espelhar `backend/modules/facial/facial.contract.js` do Credenciamento.

### 10.1 IDs

| Campo | Regra |
|-------|-------|
| `linkedId` | `col-{id_colaborador}` — ID canônico |
| `userId` | String numérica do colaborador (terminais Dahua) |
| `correlationId` | UUID por operação |

### 10.2 Comando enroll (Credenciamento → Gateway)

Via poll (`jobs/claim`) ou fila `facial-commands`:

```json
{
  "type": "enroll",
  "correlationId": "uuid",
  "linkedId": "col-1",
  "userId": "1",
  "userName": "Ana Silva",
  "photoBase64": "...",
  "cardNo": "1",
  "validDateStart": "2026-01-01 00:00:00",
  "validDateEnd": "2027-01-01 23:59:59"
}
```

`validDateStart` e `validDateEnd` são obrigatórios em todo enroll. Sempre no formato `YYYY-MM-DD HH:MM:SS`: início do primeiro dia (`00:00:00`) e fim do último dia (`23:59:59`). Enviar só a data (ou o mesmo instante nos dois lados) faz o terminal Dahua gravar janela de duração zero e barrar o acesso.

### 10.3 Comando revoke

```json
{
  "type": "revoke",
  "correlationId": "uuid",
  "linkedId": "col-1",
  "userId": "1"
}
```

### 10.4 Status enrollment (Gateway → Credenciamento)

Via HTTP `POST …/status` ou fila `facial-enrollment-status`:

```json
{
  "type": "enrollment-status",
  "correlationId": "uuid",
  "linkedId": "col-1",
  "userId": "1",
  "command": "enroll",
  "overallStatus": "synced",
  "devices": {
    "entrada-01": { "status": "synced" },
    "entrada-02": { "status": "synced" },
    "saida-01": { "status": "synced" },
    "saida-02": { "status": "synced" }
  },
  "timestamp": "2026-08-19T17:41:40.000Z"
}
```

**Valores `overallStatus`:** `synced`, `partial`, `pending`, `failed`

**Devices padrão:** `entrada-01`, `entrada-02`, `saida-01`, `saida-02`

### 10.5 Evento de acesso (Gateway → Credenciamento)

Webhook: `POST https://<cred>/api/facial/events`

Header: `Authorization: Bearer <FACIAL_GATEWAY_EVENTS_SECRET>`

```json
{
  "type": "access",
  "eventId": 12345,
  "deviceId": "entrada-01",
  "recNo": 987,
  "userId": "1",
  "direcao": "entrada",
  "eventTime": "2026-08-19T16:44:30.000Z",
  "blocked": false,
  "antipassback": false,
  "method": "Face",
  "status": "Success"
}
```

- `type` **deve** ser `access`
- `direcao`: `entrada` | `saida`
- Sem `linkedId` no payload — Credenciamento deriva via `col-{userId}`
- Deduplicação no Credenciamento por `gatewayEventId` / (`deviceId` + `recNo`)

### 10.6 Modo HTTP poll (recomendado)

Todas as chamadas usam:

```http
Authorization: Bearer <secret>
Content-Type: application/json
```

**Fluxo:**

```text
1. Operador aprova / facial-enroll no Credenciamento
2. Job queued no Credenciamento
3. Gateway (a cada ~CREDENCIAMENTO_POLL_MS) → POST /api/facial/jobs/claim
4. Credenciamento marca job processing e devolve comando (+ photoBase64 se enroll)
5. Gateway sincroniza terminais Dahua
6. Gateway → POST /api/facial/status
7. Passagens → Gateway → POST /api/facial/events
```

**Claim:**

```http
POST /api/facial/jobs/claim
{ "limit": 5 }
```

Resposta: `{ "jobs": [ /* enroll | revoke */ ] }` — `limit` máximo efetivo no Credenciamento: 20.

**Intervalo no processo do Gateway** (não no Credenciamento):

```env
CREDENCIAMENTO_POLL_MS=3000
```

**Log esperado após salvar (poll):**

```text
Command consumer using HTTP poll → https://…/api/facial
HTTP poll: N job(s) claimados do Credenciamento
```

---

## 11. Azure Service Bus — opcional

Use apenas se **ambas** as connection strings estiverem configuradas na UI. Nesse caso o transporte de comandos/status deixa de ser HTTP poll. Eventos de acesso **continuam** via `POST /api/facial/events`.

| Fila | Credenciamento | Gateway |
|------|----------------|---------|
| `facial-commands` | Send (`credenciamento-send`) | Listen (`gateway-listen-cmd`) |
| `facial-enrollment-status` | Listen (`credenciamento-listen-status`) | Send (`gateway-send-status`) |

Script de provisionamento no Credenciamento: `scripts/azure-servicebus-facial.sh`

Documentação completa: `docs/modulo-facial-azure.md`

---

## 12. Menu de navegação (Gateway)

Espelhar item do Credenciamento em `frontend/src/app/config/admin-menu.config.ts`:

```typescript
{
  path: 'credenciamento',
  label: 'Integração Credenciamento',
  icon: '🔗',
  subtitle: 'HTTP poll / Service Bus',
  module: 'settings_credenciamento',
}
```

| Propriedade | Credenciamento | Gateway |
|-------------|----------------|---------|
| Rota settings | `/admin/configuracoes/facial` | `/admin/configuracoes/credenciamento` |
| Label | Integração facial | Integração Credenciamento |
| Permissão | `settings_facial` | `settings_credenciamento` |
| Subtítulo | Service Bus / Gateway | HTTP poll / Service Bus |

Filtrar item do menu lateral de Configurações por permissão `module` (padrão `settings-layout`).

---

## 13. Design system — classes CSS

Reutilizar ou criar equivalentes:

| Classe | Uso |
|--------|-----|
| `page-section-title` | Título H2 da página |
| `page-section-subtitle` | Subtítulo cinza |
| `card-surface` | Cards com borda/fundo padrão |
| `btn-primary` | Ação principal (Salvar) |
| `btn-secondary` | Ação secundária (Atualizar) |
| `border-[var(--app-border)]` | Bordas de inputs e cards |
| Labels | `text-xs font-bold text-slate-500 uppercase` |
| Inputs | `w-full mt-1 border rounded-xl px-3 py-2` |
| Code blocks | `bg-slate-100 rounded-lg px-3 py-2 text-xs break-all` |

---

## 14. Frontend — arquivos sugeridos (Gateway)

| Arquivo | Responsabilidade |
|---------|------------------|
| `pages/admin/credenciamento/credenciamento-settings.component.ts` | UI completa (tabs, form, status, logs) |
| `services/credenciamento-integration.service.ts` | Tipos + HTTP (`getSettings`, `updateSettings`, `getStatus`, `getLogs`) |
| `config/admin-menu.config.ts` | Item no menu Configurações |
| `app.routes.ts` | Rota lazy/standalone do componente |

### 14.1 Tipos TypeScript (espelho)

```typescript
export type CredenciamentoTransport = 'http_poll' | 'service_bus';

export interface CredenciamentoIntegrationSettings {
  enabled: boolean;
  credenciamento_url: string;
  commands_queue: string;
  status_queue: string;
  has_events_secret: boolean;
  has_commands_connection_string: boolean;
  has_status_connection_string: boolean;
  transport: CredenciamentoTransport;
  atualizado_em?: string | null;
  events_secret?: string;
  commands_connection_string?: string;
  status_connection_string?: string;
}

export interface CredenciamentoIntegrationStatus {
  integration: {
    enabled: boolean;
    configComplete: boolean;
    transport: CredenciamentoTransport;
    credenciamentoUrl?: string | null;
    commandsQueue: string;
    statusQueue: string;
    atualizado_em?: string | null;
  };
  enrollment: {
    synced: number;
    pending: number;
    partial: number;
    failed: number;
    revoked: number;
    lastActivityAt?: string | null;
  };
  access: {
    total24h: number;
    blocked24h: number;
    lastEventAt?: string | null;
    lastDeviceId?: string | null;
  };
}
```

---

## 15. Backend — arquivos sugeridos (Gateway)

| Arquivo | Responsabilidade |
|---------|------------------|
| `modules/credenciamento/credenciamento-settings.routes.js` | Rotas REST |
| `modules/credenciamento/credenciamento-settings.controller.js` | Handlers |
| `modules/credenciamento/credenciamento-gateway-config.service.js` | CRUD config criptografada |
| `modules/credenciamento/credenciamento-status.service.js` | Agregações status + logs |
| `modules/credenciamento/credenciamento-http-poll.consumer.js` | Loop claim + POST status/events |
| `migrations/xxx_credenciamento_gateway_config.sql` | Tabela config + logs |
| `migrations/xxx_settings_credenciamento_permission.sql` | Permissão admin |

---

## 16. Referência — arquivos no Credenciamento

| Arquivo | Conteúdo |
|---------|----------|
| `frontend/src/app/pages/admin/facial/facial-settings.component.ts` | **Layout de referência principal** |
| `frontend/src/app/pages/admin/smtp/smtp-settings.component.ts` | Padrão pill tabs + abas Config/Histórico |
| `frontend/src/app/services/facial-gateway.service.ts` | Tipos e métodos API |
| `backend/modules/facial/facial-status.service.js` | Queries status/logs |
| `backend/modules/facial/facial-settings.controller.js` | Controller |
| `backend/modules/facial/facial-settings.routes.js` | Rotas |
| `backend/modules/facial/facial-gateway-config.service.js` | Config criptografada |
| `backend/modules/facial/facial.contract.js` | Contrato de mensagens |
| `docs/modulo-facial-azure.md` | Infra Azure, filas, SAS, PM2 |
| `backend/migrations/051_collaborator_facial_enrollment.sql` | Schema logs enrollment/access |
| `backend/migrations/052_facial_gateway_config.sql` | Tabela config |
| `backend/migrations/053_settings_facial_permission.sql` | Permissão admin |

---

## 17. Fora de escopo (v1)

- Status do worker PM2 em tempo real (heartbeat / integração PM2)
- Paginação completa nos logs (apenas últimos N + botão Atualizar)
- Filtros avançados (busca, status, device, data)
- Badge `facial_status` na ficha do usuário no Gateway

---

## 18. Critérios de aceite

1. Duas abas visíveis: **Configuração** e **Logs**
2. Aba Configuração: formulário à esquerda + status sticky à direita, sem faixa vazia no centro
3. Aba Logs: status full-width + sub-abas Comandos/Eventos + grid scrollável
4. Botões contextuais no header (Salvar vs Atualizar)
5. Layout responsivo — mobile empilha colunas
6. Visual consistente com Credenciamento (cores, tipografia, espaçamentos, pill tabs)
7. Campos: URL do Credenciamento + secret obrigatórios; connection strings Azure **opcionais**
8. Com CS vazias: transporte `http_poll`; badge e log `Command consumer using HTTP poll`
9. Com **ambas** CS preenchidas: transporte `service_bus`; eventos de acesso ainda via HTTP
10. APIs `/settings`, `/status`, `/logs` com `credenciamento_url` e `transport`
11. Logs lazy-loaded ao abrir aba Logs
12. Secrets nunca expostos em GET; placeholders corretos no form
13. Teste manual de claim a partir do servidor do Gateway (curl) retorna 200 com Bearer correto

---

## 19. Checklist de implementação

### Frontend
- [ ] Componente standalone com tabs Configuração / Logs
- [ ] CSS pill tabs (`.credenciamento-tabs`)
- [ ] Grid 2 colunas na Config (`lg+`)
- [ ] Campo URL do Credenciamento + hint de paths derivados
- [ ] Connection strings Azure opcionais (não bloquear save)
- [ ] Badge de transporte (`HTTP poll` / `Service Bus`)
- [ ] Template `#statusPanel` reutilizável
- [ ] Sub-abas Comandos / Eventos na aba Logs
- [ ] Service HTTP com tipos TypeScript (`credenciamento_url`, `transport`)
- [ ] Item no menu Configurações + rota + permissão
- [ ] `SettingsReloadable.reloadPage()` se aplicável

### Backend
- [ ] Tabela config + migration (inclui `credenciamento_url`)
- [ ] Criptografia de secrets
- [ ] GET/PUT settings com `transport` derivado
- [ ] Limpeza de CS via string vazia → volta ao poll
- [ ] GET status (agregações + `transport` + `credenciamentoUrl`)
- [ ] GET logs (commands + events, sanitizado)
- [ ] Consumer HTTP poll (`jobs/claim` + POST status/events)
- [ ] Consumer Service Bus só se ambas CS presentes
- [ ] Permissão `settings_credenciamento`
- [ ] Audit log em UPDATE settings

### Integração
- [ ] Poll sem Azure: secret + URL + log `HTTP poll`
- [ ] Service Bus opcional com SAS Listen/Send corretos
- [ ] Webhook outbound de eventos com Bearer (sempre HTTP)
- [ ] Teste curl claim do host do Gateway
- [ ] Testes manuais: enroll → status → evento access → logs na UI

---

## 20. Prompt curto (copiar/colar)

> Implemente no AccessControlGateway a tela **Admin → Configurações → Integração Credenciamento** espelhando o layout de `Credenciamento/frontend/src/app/pages/admin/facial/facial-settings.component.ts`: duas abas pill (**Configuração** | **Logs**); na Config, grid 2 colunas (form + status sticky); na Logs, status full-width + sub-abas **Comandos** | **Eventos** com grid scrollável de 24 itens; botões Salvar/Atualizar contextuais. Campos: **URL do Credenciamento** + **secret Bearer** (obrigatórios se ativo); connection strings Azure **opcionais** — vazias = **HTTP poll** (`POST …/jobs/claim`, `…/status`, `…/events`); ambas preenchidas = Service Bus. Expor `transport` e `credenciamento_url` em GET/PUT `/credenciamento/settings` e GET `/status`. APIs admin `/credenciamento/settings|status|logs`; contrato em `facial.contract.js`; spec completa em `Credenciamento/docs/gateway-integracao-credenciamento-ui.md`.

---

*Gerado a partir da implementação Credenciamento — agosto/2026. Atualizado com modo HTTP poll (recomendado).*
