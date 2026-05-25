# Credenciamento

Sistema de credenciamento corporativo com **Angular 21**, **Node.js + Express**, **MySQL** e suporte a aplicativos **mobile** (Capacitor). A interface de login segue o padrão visual do projeto BID (layout dedicado para autenticação e layout para o sistema autenticado).

Os tenants do **Azure AD** são configurados pelo painel administrativo e armazenados no banco — **não** ficam no arquivo `.env`.

---

## Índice

- [Visão geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Portas](#portas)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Primeiro acesso](#primeiro-acesso)
- [API](#api)
- [Azure AD (multi-tenant)](#azure-ad-multi-tenant)
- [Frontend web](#frontend-web)
- [Mobile (Capacitor)](#mobile-capacitor)
- [Banco de dados](#banco-de-dados)
- [Segurança](#segurança)
- [Deploy (aaPanel)](#deploy-aapanel)
- [Estender o projeto](#estender-o-projeto)
- [Solução de problemas](#solução-de-problemas)

---

## Visão geral

| Recurso | Descrição |
|---------|-----------|
| Login local | E-mail/senha com JWT de acesso + refresh token |
| Login Microsoft | MSAL no cliente; API valida token contra tenants cadastrados no MySQL |
| Multi-tenant Azure | CRUD em **Configurações → Tenants Azure** |
| SMTP | Configuração de e-mail + histórico de envios |
| Microsoft Teams | Notificações em canais via Graph API |
| API versionada | Prefixo `/api/v1` (rotas em `/api` mantidas com aviso de depreciação) |
| Observabilidade | Interceptor de auditoria + error handler global; `audit_logs` (JSON) e `app_error_logs` |
| Logs | Pino (HTTP) + `audit_logs` (ações) + `app_error_logs` (erros) |
| Mobile | Mesmo frontend Angular empacotado com Capacitor |

---

## Tecnologias

**Backend:** Express 4, MySQL2, JWT, JWKS (validação Microsoft), Joi, Helmet, CORS, rate-limit, Pino  

**Frontend:** Angular 21 (standalone), Tailwind CSS 3, MSAL Angular 5, SweetAlert2, Capacitor 8  

**Referência de UI:** projeto BID (`/www/server/BID_NEW/BID`)

---

## Portas

| Serviço | Porta padrão |
|---------|----------------|
| API (backend) | **3007** |
| Frontend (dev) | **4207** |

O proxy do Angular encaminha `/api` → `http://127.0.0.1:3007`.

---

## Estrutura do repositório

```
Credenciamento/
├── README.md
├── backend/
│   ├── server.js              # Entrada: DB + listen
│   ├── app.js                 # Express, rotas /api/v1
│   ├── config/                # env, db, logger, cors, helmet
│   ├── modules/
│   │   ├── auth/              # login, refresh, logout, me
│   │   ├── tenants/           # CRUD Azure + msal-config
│   │   ├── smtp/              # Config SMTP + logs de envio
│   │   ├── teams/             # Integração Teams (Graph)
│   │   └── health/            # health check
│   ├── middleware/            # auth, rate-limit, erros, MS token
│   ├── migrations/            # SQL opcionais
│   └── .env.example
├── frontend/
│   ├── src/app/
│   │   ├── layouts/           # auth-layout, main-layout
│   │   ├── pages/             # login, dashboard, admin/tenants
│   │   └── core/              # guards, interceptors, services
│   ├── proxy.conf.json
│   └── src/environments/
└── scripts/
    ├── aapanel-CredenciamentoBackend.sh
    └── aapanel-CredenciamentoFrontend.sh
```

---

## Pré-requisitos

- **Node.js** 20.19+ ou 22.12+ (Angular CLI 21)
- **MySQL** 8+
- **npm**
- Para mobile: Android Studio e/ou Xcode, contas e URIs no Azure AD

---

## Instalação

### Backend

```bash
cd backend
cp .env.example .env
# Edite DB_*, JWT_SECRET, REFRESH_TOKEN_SECRET, ENCRYPTION_KEY, ADMIN_*
npm install
npm run dev
```

Em produção:

```bash
npm start
```

### Frontend (web)

```bash
cd frontend
npm install
npm start
```

Acesse: **http://127.0.0.1:4207**

Build de produção:

```bash
npm run build:prod
```

> No servidor WTorre, os scripts `npm` do frontend já incluem o Node 24 em `/www/server/nodejs/v24.11.1/bin`. Em outra máquina, use Node 20.19+ no PATH.

---

## Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env`.

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta da API (padrão **3007**) |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Sim | Conexão MySQL |
| `JWT_SECRET` | Produção | Assinatura do access token (mín. 32 caracteres) |
| `REFRESH_TOKEN_SECRET` | Produção | Assinatura do refresh token |
| `ENCRYPTION_KEY` | Produção | Criptografia AES do `client_secret` dos tenants (32+ chars) |
| `JWT_ACCESS_EXPIRES` | Não | Padrão `30m` |
| `JWT_REFRESH_EXPIRES` | Não | Padrão `7d` |
| `CORS_ORIGINS` | Não | Origens web permitidas (vírgula) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Recomendado | Usuário admin inicial (seed) |
| `MSAL_REDIRECT_URI_WEB` | Opcional | Redirect web customizado no msal-config |
| `MSAL_REDIRECT_URI_ANDROID` | Mobile | URI Android |
| `MSAL_REDIRECT_URI_IOS` | Mobile | URI iOS |
| `LOG_LEVEL` | Não | `info`, `debug`, etc. |

**Não use no `.env`:** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — cadastre em **Tenants Azure**.

Gerar chave de criptografia:

```bash
openssl rand -hex 32
```

---

## Primeiro acesso

1. Suba o **backend** (cria o banco `credenciamento`, tabelas e admin seed).
2. Suba o **frontend**.
3. Em `/login`, use **Login sem Microsoft** com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
4. Menu **Configurações** (sidebar) → **Tenants Azure**:
   - Cadastre cada tenant (nome, Azure Tenant ID, Client ID, Client Secret).
   - Marque **um** como **tenant principal** (fornece o `clientId` ao MSAL).
   - Use **Testar conexões** para validar OAuth + Microsoft Graph.
5. Volte ao login e use **Entrar com Microsoft**.

---

## API

Base recomendada: **`/api/v1`**

Rotas legadas em `/api` respondem igualmente, com header de depreciação.

### Headers recomendados

| Header | Valor |
|--------|--------|
| `Authorization` | `Bearer <accessToken>` |
| `X-Client-Type` | `web`, `android` ou `ios` |
| `X-Request-Id` | UUID opcional (gerado pelo servidor se ausente) |

### Autenticação

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/v1/auth/login` | — | Login e-mail/senha |
| POST | `/api/v1/auth/login-microsoft` | Bearer (id token Azure) | Login Microsoft |
| POST | `/api/v1/auth/refresh` | Body: `refreshToken` | Novo access token |
| POST | `/api/v1/auth/logout` | — | Revoga refresh token |
| GET | `/api/v1/auth/me` | JWT | Dados do usuário logado |

### Tenants Azure

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v1/tenants/msal-config` | — | `clientId`, `authority`, `redirectUris` |
| GET | `/api/v1/tenants` | ADMIN | Lista tenants |
| GET | `/api/v1/tenants/:id` | ADMIN | Detalhe |
| POST | `/api/v1/tenants` | ADMIN | Criar (secret obrigatório) |
| PUT | `/api/v1/tenants/:id` | ADMIN | Atualizar |
| DELETE | `/api/v1/tenants/:id` | ADMIN | Desativar (soft delete) |
| GET | `/api/v1/tenants/status` | ADMIN | Diagnóstico OAuth + Graph |

### SMTP (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/smtp/settings` | Configuração ativa |
| PUT | `/api/v1/smtp/settings` | Salvar/atualizar configuração |
| POST | `/api/v1/smtp/test` | Enviar e-mail de teste (body: `destinatario`, opcional `assunto`, `corpo`) |
| GET | `/api/v1/smtp/logs` | Histórico de envios (`?page=1&limit=20`) |

### Microsoft Teams (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/teams` | Lista integrações |
| POST | `/api/v1/teams` | Criar integração (tenant ref, team_id, channel_id) |
| PUT | `/api/v1/teams/:id` | Atualizar |
| DELETE | `/api/v1/teams/:id` | Desativar |
| POST | `/api/v1/teams/:id/test` | Teste (body opcional: `email`, `mensagem`) |
| POST | `/api/v1/teams/:id/send` | Enviar notificação a um usuário (`email`, `mensagem`) |

### Relatórios do sistema (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/system-reports/audit` | Logs de auditoria (`?page=1&limit=20`, filtros: `module`, `action`, `user_id`, `from`, `to`) |
| GET | `/api/v1/system-reports/audit/export` | Exportar auditoria em Excel (mesmos filtros, até 10.000 linhas) |
| GET | `/api/v1/system-reports/errors` | Logs de erros (`?page=1&limit=20`, filtros: `module`, `level`, `status_code`, `from`, `to`) |
| GET | `/api/v1/system-reports/errors/export` | Exportar erros em Excel (mesmos filtros, até 10.000 linhas) |

### Usuários (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/users` | Lista paginada (`?page=1&limit=20`, filtros: `search`, `perfil`) — somente ativos com departamento |
| GET | `/api/v1/users/:id` | Detalhe do usuário |
| PATCH | `/api/v1/users/:id` | Atualizar `perfil`, `ativo`; usuários **locais** também: `email`, `password`, `nome_completo` |
| POST | `/api/v1/users/sync-departments` | Sincronizar departamentos do Azure AD para usuários Microsoft sem departamento |
| POST | `/api/v1/users/sync-ad-users` | Importar/atualizar todos os usuários do Azure AD (mesma rotina da cron) |
| POST | `/api/v1/users/:id/sync-ad` | Sincronizar departamento de um usuário Microsoft |

Ao bloquear (`ativo: false`), refresh tokens do usuário são revogados imediatamente e o usuário deixa de aparecer na listagem. **Somente usuários ativos com departamento** podem logar e são exibidos na administração.

### Cron — sync Azure AD

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `AD_USERS_SYNC_ENABLED` | `true` | Ativa cron interna ao iniciar a API |
| `AD_USERS_SYNC_CRON` | `0 2 * * *` | Expressão cron (todo dia às 02:00) |
| `AD_USERS_SYNC_TIMEZONE` | `America/Sao_Paulo` | Timezone da cron |

Execução manual: `npm run sync-ad-users` na pasta `backend`. Requer permissão **User.Read.All** (aplicação) em cada tenant Azure.

### Health

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/health` | Status da API e do MySQL |

### Exemplo — login local

```bash
curl -X POST http://127.0.0.1:3007/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -d '{"username":"admin@exemplo.com","password":"admin123"}'
```

---

## Azure AD (multi-tenant)

1. Registre o aplicativo no Azure como **multitenant**.
2. **Authority** no frontend: `https://login.microsoftonline.com/common`
3. **Redirect URIs** (exemplos):
   - Dev web: `http://localhost:4207` ou `http://127.0.0.1:4207`
   - Android: `msauth://<package>/<hash>`
   - iOS: `msal<client-id>://auth`
4. Permissões Graph recomendadas (consentimento de administrador):
   - `User.Read.All` — diagnóstico de tenants e foto de perfil
   - `TeamsActivity.Send`, `User.Read.All` (aplicação) — notificação ao **usuário** no feed do Teams
   - `ChannelMessage.Send` (aplicação) — opcional, envio a **canal** do Teams
5. Cada combinação **Tenant ID + Client ID** usada no login deve existir em `azure_tenants` com `ativo = 1`.

### SMTP

Configure em **Configurações → Envios SMTP**: host, porta, TLS, usuário, senha e remetente. Use **Testar envio** para validar; todos os envios (sucesso ou falha) são registrados em `smtp_send_logs`.

### Microsoft Teams (Graph)

**Notificação ao usuário (recomendado)** — feed de atividades do Teams (ícone de sino):

1. Cadastre o tenant em **Tenants Azure** com client secret.
2. No portal Azure → Microsoft Graph → **Permissões de aplicativo**:
   - **TeamsActivity.Send** (enviar notificação ao usuário)
   - **User.Read.All** (localizar usuário pelo e-mail)
   
   > **Não use** `ChatMessage.Read.All` (só leitura). **`ChatMessage.Send`** existe apenas como permissão **Delegada** — não entra no token do servidor.
   > Permissões **Delegadas** não funcionam com client credentials; o backend usa somente permissões de **Aplicação**.
3. **Grant admin consent** no tenant.
4. **App Teams obrigatório** (mesmo Client ID do Azure):
   - Ajuste e empacote o manifest em [`teams-app/`](teams-app/README.md) (`webApplicationInfo.id` = Client ID do tenant).
   - Publique no tenant e **instale o app no escopo pessoal** de cada destinatário (Teams → Apps → Credenciamento → Adicionar).
   - Configure `TEAMS_APP_ID` no `.env` ou o campo **Teams App ID** na integração (ID retornado por `appCatalogs/teamsApps` após publicar).
5. Em **Integração Teams**, tipo **Usuário**: e-mail + **URL https** do sistema (o backend gera o deep link `teams.microsoft.com/l/…`).
6. Opcional: `TEAMS_ACTIVITY_WEB_URL` e `TEAMS_APP_EXTERNAL_ID` (GUID do `id` no manifest; padrão do repositório) no `.env`.
7. **Testar** — o usuário vê a notificação no **sino** do Teams.

**Notificação a canal** (opcional): tipo **Canal**, permissão **ChannelMessage.Send**, Team ID e Channel ID.

API para enviar a qualquer usuário (integração tipo `user`):

```bash
POST /api/v1/teams/{id}/send
{ "email": "usuario@empresa.com", "mensagem": "Sua credencial foi aprovada." }
```

O backend valida o token Microsoft conferindo `tid` e `aud` no banco e a assinatura via JWKS do tenant.

---

## Frontend web

### Rotas

| Rota | Perfil | Descrição |
|------|--------|-----------|
| `/login` | Público | Tela de login (layout BID) |
| `/dashboard` | ADMIN, USER | Início |
| `/admin/usuarios` | ADMIN | Gestão de usuários |
| `/admin/configuracoes` | ADMIN | Configurações do sistema (layout com menu lateral interno) |
| `/admin/configuracoes/tenants-azure` | ADMIN | Tenants Azure |
| `/admin/configuracoes/smtp` | ADMIN | Envios SMTP e histórico |
| `/admin/configuracoes/teams` | ADMIN | Integração Microsoft Teams |
| `/admin/configuracoes/sobre` | ADMIN | Sobre o sistema |
| `/admin/tenants` | ADMIN | Redireciona para `tenants-azure` |
| `/admin/configuracoes/usuarios` | ADMIN | Redireciona para `/admin/usuarios` |

### Layouts

- **Login:** vídeo/imagem à esquerda + painel escuro à direita (`auth-layout`).
- **Sistema:** sidebar + área de conteúdo (`main-layout`).
- **Configurações:** menu lateral interno + painel full-height (`settings-layout`).

### MSAL dinâmico

Antes de iniciar o MSAL, o app chama `GET /api/v1/tenants/msal-config` para obter o `clientId` do tenant principal. Se nenhum tenant estiver configurado, o login Microsoft exibe aviso para o administrador.

---

## Mobile (Capacitor)

### Configuração

1. Ajuste `frontend/src/environments/environment.mobile.ts` com a URL absoluta da API.
2. Defina no `.env` do backend:
   - `MSAL_REDIRECT_URI_ANDROID`
   - `MSAL_REDIRECT_URI_IOS`
3. Primeira vez (plataforma nativa):

```bash
cd frontend
npm run build:mobile
npx cap add android   # ou: npx cap add ios
npx cap sync
```

### Executar

```bash
npm run build:mobile
npx cap open android   # ou: npx cap open ios
```

Tokens da aplicação em plataformas nativas podem usar `@capacitor/preferences`. O endpoint `msal-config` retorna `redirectUris` por tipo de cliente (`web`, `android`, `ios`).

---

## Observabilidade e auditoria

Pipeline em três camadas:

| Camada | Destino | Conteúdo |
|--------|---------|----------|
| HTTP (Pino) | stdout / arquivos de log | Todas as requisições (`requestLogger`) |
| Auditoria | `audit_logs` | Ações de negócio (CRUD usuários, login/logout, sync) |
| Erros | `app_error_logs` | Exceções e falhas técnicas (`errorHandler` global) |

Código em `backend/observability/`:

- `audit.interceptor.js` — grava automaticamente rotas de **usuários** (GET list/read, PATCH, POST sync) ao final da requisição.
- `error.middleware.js` — mantém `app_error_logs` e grava `LOGIN_FAILED` em `audit_logs` para `POST /auth/login` e `/auth/login-microsoft` com status **401** ou **403**.
- `audit.metadata.js` — contrato JSON estável no campo `metadata` (coluna `JSON` no MySQL).

### Ações auditadas (usuários e auth)

| `module` | `action` | Quando |
|----------|----------|--------|
| `users` | `LIST`, `READ` | GET listagem / detalhe |
| `users` | `UPDATE`, `DEACTIVATE`, `ACTIVATE` | PATCH usuário |
| `users` | `SYNC` | sync departamentos, AD, usuário |
| `auth` | `LOGIN`, `LOGIN_MICROSOFT` | login com sucesso |
| `auth` | `LOGIN_FAILED` | credencial inválida, inativo, sem departamento |
| `auth` | `LOGOUT` | logout |

`user_id` em `audit_logs` é **apenas índice** (sem FK), para não impedir exclusão de usuários.

### Exemplo de `metadata` (Grafana / SQL)

```json
{
  "event": "users.update",
  "outcome": "success",
  "resource": { "type": "user", "id": 12, "email": "user@empresa.com" },
  "changes": { "ativo": 0, "wasDeactivated": true },
  "http": { "method": "PATCH", "path": "/api/v1/users/12", "status": 200, "durationMs": 34 }
}
```

Consultas úteis para dashboards:

```sql
SELECT
  DATE(created_at) AS dia,
  JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.event')) AS evento,
  JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.outcome')) AS resultado,
  COUNT(*) AS total
FROM audit_logs
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY dia, evento, resultado
ORDER BY dia DESC, total DESC;
```

Relatórios admin: **Configurações → Relatórios do sistema** (`/admin/configuracoes/relatorios-sistema`).

### Retenção e cold storage (`audit_logs`)

Leituras (`LIST`, `READ`) geram muito volume. Registros antigos são exportados para **JSONL.gz** e removidos da tabela quente.

| Classe | `action` | Retenção quente (padrão) |
|--------|----------|--------------------------|
| Leitura | `LIST`, `READ` | 90 dias |
| Demais | login, PATCH, SYNC, etc. | 365 dias |

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `AUDIT_RETENTION_ENABLED` | `true` | Cron interna ao iniciar a API |
| `AUDIT_RETENTION_CRON` | `0 3 * * *` | Após sync AD (`02:00`) |
| `AUDIT_RETENTION_TIMEZONE` | `America/Sao_Paulo` | Timezone IANA |
| `AUDIT_RETENTION_READ_DAYS` | `90` | Hot storage LIST/READ |
| `AUDIT_RETENTION_DEFAULT_DAYS` | `365` | Hot storage demais ações |
| `AUDIT_ARCHIVE_DIR` | `./storage/audit-archive` | Pasta cold storage (relativa a `backend/`) |
| `AUDIT_ARCHIVE_BATCH_SIZE` | `2000` | Linhas por lote |
| `AUDIT_ARCHIVE_MAX_BATCHES` | `50` | Máx. lotes por execução (~100k linhas/passagem) |
| `AUDIT_ARCHIVE_DRY_RUN` | `false` | Exporta sem apagar (homologação) |

Layout dos arquivos:

```text
backend/storage/audit-archive/
  2026/05/audit-2026-05-01.jsonl.gz
```

Execução manual:

```bash
cd backend
npm run archive-audit-logs
```

Homologação sem delete:

```bash
AUDIT_ARCHIVE_DRY_RUN=true npm run archive-audit-logs
```

Consulta offline (exemplo):

```bash
zcat storage/audit-archive/2026/05/audit-2026-05-01.jsonl.gz | head
```

Inclua `backend/storage/audit-archive/` no backup do servidor. Histórico além da janela quente não aparece em Relatórios do sistema (somente na tabela `audit_logs` recente).

---

## Banco de dados

Banco padrão: **`credenciamento`**

| Tabela | Uso |
|--------|-----|
| `usuarios` | Usuários locais e sincronizados via Microsoft |
| `azure_tenants` | Configuração multi-tenant (secret criptografado) |
| `refresh_tokens` | Refresh tokens (apenas hash SHA-256) |
| `audit_logs` | Auditoria de ações |
| `app_error_logs` | Erros da aplicação |

Migrations adicionais em `backend/migrations/` (opcional se `setupDatabase.js` já criou as tabelas).

### Scripts de reset (desenvolvimento / homologação)

**Pare a API** antes de executar (`npm run dev` / `start`), para evitar conflito com o pool de conexões.

| Comando | Efeito |
|---------|--------|
| `npm run reset-database -- --force` | `DROP DATABASE` + recria schema, seeds de lookup e admin (se `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`) |
| `npm run reset-database-data -- --force` | Apaga dados operacionais e logs; **preserva** tenants Azure, SMTP, Teams, usuários e tabelas de referência |

Proteções: sem `--force` o script não roda; em `NODE_ENV=production` é necessário `DB_RESET_ALLOW_PRODUCTION=true` no `.env`.

Simulação (sem alterar o banco): adicione `--dry-run` após `--force` ou sozinho (dry-run não exige `--force`).

```bash
cd backend
npm run reset-database -- --dry-run
npm run reset-database-data -- --force
```

**Reset parcial** — tabelas zeradas: empresas, colaboradores, eventos, credenciamento/portaria, `refresh_tokens`, `audit_logs`, `smtp_send_logs`, `app_error_logs`. Sessões ativas são invalidadas (re-login necessário).

**Reset total** — remove tudo; tenants, SMTP e Teams precisam ser cadastrados de novo. Arquivos em `AUDIT_ARCHIVE_DIR` não são apagados por esses scripts.

---

## Segurança

- Em **produção**, defina `JWT_SECRET`, `REFRESH_TOKEN_SECRET` e `ENCRYPTION_KEY` com no mínimo 32 caracteres.
- **Rate limit:** 100 req / 15 min (global); 10 req / 15 min em login.
- Refresh tokens **nunca** são armazenados em texto claro — apenas hash no banco.
- `client_secret` dos tenants criptografado com `ENCRYPTION_KEY` (AES-256-GCM).
- CORS restrito por `CORS_ORIGINS` para clientes web; apps nativos não enviam `Origin`.
- Helmet habilitado; API atrás de proxy (`trust proxy`) para IP real e rate-limit.

---

## Deploy (aaPanel)

Scripts em `scripts/`:

- `aapanel-CredenciamentoBackend.sh` — API na porta **3007**
- `aapanel-CredenciamentoFrontend.sh` — build/serve do Angular

Configure no painel:

- Proxy reverso do site → frontend estático ou `ng serve`/build
- Proxy `/api` → `http://127.0.0.1:3007`
- Node **24.11.1** (caminho usado nos scripts do projeto)

---

## Estender o projeto

### Novo módulo no backend

Crie em `backend/modules/<nome>/`:

- `<nome>.routes.js`, `<nome>.controller.js`, `<nome>.service.js`, `<nome>.schema.js`

Registre em `backend/app.js`:

```javascript
v1Router.use("/<nome>", require("./modules/<nome>/<nome>.routes"));
```

Use `logAudit()` de `utils/auditLogger.js` e `AppError` + `errorHandler` para erros.

### Nova feature no frontend

Crie em `frontend/src/app/features/<nome>/` ou `pages/<nome>/`:

- Componentes standalone
- Serviço HTTP (base: `environment.apiBaseUrl`)
- Rota em `app.routes.ts` com `AuthGuard` e `data.roles` quando necessário

---

## Solução de problemas

| Problema | Possível solução |
|----------|------------------|
| `Access denied` MySQL | Confira `DB_USER` e `DB_PASSWORD` no `.env` |
| Login Microsoft recusado | Tenant com `tid`/`aud` do token deve estar cadastrado e ativo |
| MSAL sem clientId | Cadastre tenant principal em **Tenants Azure** |
| SMTP falha no teste | Verifique host/porta/TLS, credenciais e firewall; consulte histórico em Envios SMTP |
| Teams teste falha | Confirme `ChannelMessage.Send` + admin consent e IDs corretos de team/canal |
| Angular CLI exige Node 20.19+ | Use Node 24 do servidor ou atualize o Node local |
| Aviso `lmdb` no build | Opcional: `npm install lmdb --save-dev` no frontend |
| API 404 em `/api/auth` | Use `/api/v1/auth` (versão atual) |

---

## Licença

Uso interno WTorre. Ajuste conforme política da organização.
