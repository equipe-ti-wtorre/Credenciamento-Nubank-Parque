# Credenciamento

Sistema corporativo de **credenciamento e controle de acessos** (WTorre / Nubank Parque): cadastro de empresas e colaboradores, solicitações com **fluxo de aprovação por time**, **portaria** (QR/código, check-in, substituições), **eventos** e **credenciamento**, **acessos de serviço**, **frota**, **mercadorias**, **reconhecimento facial** (Dahua / Gateway), notificações por **e-mail**, **Microsoft Teams** e **alertas in-app**.

Stack: **Angular 21**, **Node.js + Express**, **MySQL**, app **Teams** e suporte **mobile** (Capacitor). A interface de login segue o padrão visual do projeto BID. Temas **WTorre** e **Nubank Parque** (`data-theme`).

Os tenants do **Azure AD** são configurados pelo painel administrativo e armazenados no banco — **não** ficam no arquivo `.env`.

---

## Índice

- [Visão geral](#visão-geral)
- [Funções atuais](#funções-atuais)
- [Tecnologias](#tecnologias)
- [Portas](#portas)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Primeiro acesso](#primeiro-acesso)
- [Perfis e permissões](#perfis-e-permissões)
- [API](#api)
- [Jobs e crons](#jobs-e-crons)
- [Azure AD (multi-tenant)](#azure-ad-multi-tenant)
- [Frontend web](#frontend-web)
- [Mobile (Capacitor)](#mobile-capacitor)
- [App Microsoft Teams](#app-microsoft-teams)
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
| Auth Gateway | SSO corporativo opcional (`AUTH_GATEWAY_*`, cookie `nbp_session`) |
| Multi-tenant Azure | CRUD em **Configurações → Tenants Azure** |
| RBAC | Permissões por módulo × ação (`view` / `create` / `edit` / `delete`) |
| Aprovações | Inbox multi-nível por time (evento, acesso de serviço, credenciamento interno/externo) |
| Portaria | Validação de credencial/serviço, QR, substituição, liberação manual, kiosk |
| Eventos e credenciamento | Empresas por dia/fase, pulseiras, convites, importação em massa |
| Acessos de serviço | Wizard patrimonial, colaboradores, veículos, bulk, overlap |
| Mercadorias | Entrada/saída com NF (OCR), produtos, locais, empresas eventuais |
| Facial | Validação de foto, enroll/revoke Dahua direto ou via AccessControlGateway |
| SMTP / Azure ACS / SendGrid | Provedor de e-mail unificado + histórico e delivery reports |
| Microsoft Teams | Feed, Adaptive Cards, Bot Aprovar/Bloquear e deep links |
| WhatsApp (OpenWA) | Gateway admin (sessão, QR, limites, teste); canal complementar |
| Observabilidade | Interceptor de auditoria + error handler; `audit_logs` e `app_error_logs` |
| Mobile | Mesmo frontend Angular empacotado com Capacitor |

---

## Funções atuais

Catálogo alinhado aos menus, rotas Angular e módulos da API.

### Autenticação e sessão

- Login local (e-mail/senha) e **Entrar com Microsoft**.
- Refresh token, logout e `GET /auth/me`.
- **Convite de acesso** (`/cadastro-acesso`) — conclusão do cadastro de usuário de empresa.
- **Auto-cadastro de empresa** (`/cadastro-empresa`) — token público, logo opcional.
- **Auth Gateway** opcional: SSO centralizado, JWKS, cookie `nbp_session` e poller de sessões revogadas.
- Política de **inatividade** em **Configurações → Sessão**.
- **Horários de acesso** comercial/noturno aplicados a operações de portaria e patrimonial.

### Início (dashboard)

- Métricas agregadas de credenciais, tendências e rankings.
- Auto-refresh (~30 s) e modo tela cheia.
- Alertas in-app no sino do header (ler, marcar lidos, limpar).

### Aprovações

- Caixa: pendentes, minhas, equipe; contador no menu.
- Tipos de entidade: `EVENTO`, `ACESSO_SERVICO`, `CREDENCIAMENTO_EVENTO`, `CREDENCIAMENTO_EVENTO_INTERNO`.
- Fluxo multi-nível por **time** (papéis APROVADOR / GESTOR).
- Aprovar, reprovar ou cancelar; expiração automática quando o período da entidade encerra.
- Notificações Teams (feed + Adaptive Card + Bot) e alertas in-app.
- Deep links `/aprovacoes/abrir/:publicId` (Teams / handoff, sem expor ID interno).

### Portaria

- Modos **Patrimonial**, **Eventos** e **Calendário**.
- Leitura de código/QR, validação de acesso, check-in, **substituição** de titular.
- Reenvio de enroll facial; autorizadores do acesso de serviço.
- **Liberação manual** (busca de colaborador + criação).
- Notificar ou cancelar aprovação pendente a partir da portaria.
- Modo kiosk / tela cheia; tolerância extra de horário (`GATE_ACCESS_TOLERANCE_HOURS`).
- Opt-in de alerta de check-in por evento (colaborador/veículo).

### Acessos de serviço (patrimonial)

- Lista, wizard de criação, detalhe e rascunho.
- Colaboradores e veículos (unitário ou importação em massa).
- Validação de sobreposição de período; exclusão de rascunho.
- Submissão ao fluxo de aprovação do time.
- Deep links `/acessos-servico/abrir/:publicId`.

### Eventos

- CRUD de eventos (tipo, capa, período, responsável, status, preferências).
- Empresas vinculadas por dia/fase; veículos por empresa.
- Credenciais por colaborador/dia; envio de e-mail (`credential_approved`).
- Credenciais em massa (preview/commit) e bulk import por empresa.
- Submissão para aprovação (`POST /events/:id/submit-approval`).
- Deep link `/admin/eventos/abrir/:publicId`.

### Credenciamento de eventos

- Processo por evento/setor: criar, duplicar, exportar XLSX, capa, status.
- Empresas, setores, colaboradores; completar cadastro da empresa.
- Tipos de **pulseira**; decisões em lote de colaboradores.
- Convites HTML (TinyMCE), anexos, envio imediato ou **agendado** (cron a cada 15 min).
- Credenciamento **interno AD** (registro/desregistro de usuários internos).
- Notificações a empresas, setores e dono; fluxo de aprovação interno/externo.
- Bulk import de colaboradores por empresa.
- Telas dedicadas Teams: `/credenciamento-eventos/abrir/:publicId`.

### Gestão de bloqueio

- Blocklist de colaboradores na arena (incluir, editar, remover).
- Blocklist também no cadastro de **frota** (veículo).

### Mercadorias

- **Registrar entrada** e **Registrar saída** com fotos de NF e OCR/parse.
- Cadastro de **produtos** e **locais de armazenagem**.
- **Empresas eventuais**: lista, merge, sugestão; enriquecimento CNPJ via BrasilAPI (job, flag `EXTERNAL_COMPANY_ENRICH`).
- Estoque, histórico, dashboard e relatório de mercadorias.

### Relatórios operacionais

- **Relatório de acessos** + export Excel.
- **Recusas de acessos** (negações de credenciamento).
- **Relatório de mercadorias**.
- **Auditoria** operacional (trilha de negócio, distinta dos logs técnicos).

### Cadastros

| Função | Capacidades |
|--------|-------------|
| Empresas | CRUD, tipos, status, logo, convite de acesso, convite de auto-cadastro |
| Colaboradores | CRUD, foto, funções, estatísticas, importação em massa, enroll/revoke facial, visão de acessos |
| Frota | CRUD de veículos, tipos, estatísticas, blocklist |
| Times | CRUD de setores, contatos, membros (APROVADOR/GESTOR), fluxos por tipo de entidade |

### Sistema (administração)

- **Perfis de acesso** — matriz RBAC customizável; perfis de sistema não deletáveis.
- **Usuários internos** — listagem, perfil, ativo; sync Azure AD (manual e cron horária).
- **Usuários de empresas** — CRUD vinculado à empresa; reenvio de convite.

Regra: somente usuários **ativos com departamento** entram na listagem interna e podem logar (exceto fluxos de convite/empresa).

### Configurações

| Tela | Função |
|------|--------|
| Tenants Azure | CRUD multi-tenant, tenant principal, teste OAuth + Graph |
| Sessão | Timeout por inatividade |
| Horários de acesso | Janelas comercial e noturna |
| Envios de e-mail | SMTP, Azure ACS ou SendGrid; verificar, testar, histórico, webhooks |
| Templates de e-mail | HTML editável (TinyMCE), preview e envio de teste |
| WhatsApp | OpenWA: URL/API key, sessão, QR, start/stop, limites anti-bloqueio, logs e teste |
| Integração Teams | Integrações Graph (usuário/canal), teste, envio, status do Bot |
| Notificações de credenciamento | Destinatários AD internos para avisos do módulo |
| Integração facial | Modo HTTP poll ou Service Bus, devices Dahua, sync, logs, testes |
| Aparência | Paleta **WTorre** ou **Nubank Parque** |
| Relatórios do sistema | `audit_logs` e `app_error_logs` + export Excel |
| Sobre | Versão da API e health check |

### Integração facial

- Validação de qualidade da foto (`POST /faces/validar`: pose, nitidez, dimensões Dahua/Control iD).
- Enroll e revoke via **AccessControlGateway** (HTTP poll em `/api/facial/*`, Bearer + allowlist de IP) ou **Azure Service Bus** (`npm run start:facial-worker`).
- Cadastro **direto Dahua** (VPN): cron de enroll, poll de passagens (~20 s) e revoke com grace hours.
- Admin: devices, teste de conexão, force sync, ingest status, logs.

Documentação detalhada: [`docs/INTEGRACAO.md`](docs/INTEGRACAO.md).

### Comunicação

| Canal | Uso no produto |
|-------|----------------|
| E-mail | Convites, eventos, credenciais, credenciamento, templates editáveis |
| Microsoft Teams | Nova aprovação, decisão, check-in (opt-in), Bot Aprovar/Bloquear, deep links |
| Alertas in-app | Sino do header (`/alerts`) |
| WhatsApp | Infra admin + OpenWA pronta; envio automático de negócio **ainda não acoplado** (teste/admin) |

---

## Tecnologias

**Backend:** Express 4, MySQL2, JWT, JWKS (Microsoft), Joi, Helmet, CORS, rate-limit, Pino, `@vladmandic/face-api` / OpenCV.js / TensorFlow.js (validação facial), Tesseract + ZXing (OCR de NF)

**Frontend:** Angular 21 (standalone), Tailwind CSS 3, MSAL Angular 5, SweetAlert2, TinyMCE, Chart.js, Capacitor 8, `@microsoft/teams-js`

**Referência de UI:** projeto BID (`/www/server/BID_NEW/BID`)

---

## Portas

| Serviço | Porta padrão |
|---------|----------------|
| API (backend) | **3007** |
| Frontend (dev) | **4207** |
| OpenWA (loopback) | **2785** |

O proxy do Angular encaminha `/api` → `http://127.0.0.1:3007`.

---

## Estrutura do repositório

```
Credenciamento/
├── README.md
├── docs/                      # Integração facial, manuais
├── backend/
│   ├── server.js              # Entrada: DB, jobs, listen
│   ├── app.js                 # Express, rotas /api/v1
│   ├── config/                # env, db, logger, cors, helmet, modules
│   ├── modules/               # Ver catálogo abaixo
│   ├── jobs/                  # Crons internas
│   ├── workers/               # facial-enrollment (Service Bus)
│   ├── middleware/            # auth, RBAC, vínculos, public IDs
│   ├── observability/         # auditoria e erros
│   ├── migrations/            # SQL versionadas
│   └── .env.example
├── frontend/
│   ├── src/app/
│   │   ├── layouts/           # auth, main, settings
│   │   ├── pages/             # telas do produto
│   │   ├── config/            # menus, módulos, MSAL
│   │   └── core/              # guards, interceptors, services
│   ├── proxy.conf.json
│   └── src/environments/
├── teams-app/                 # Manifest, SSO, Bot
├── deploy/openwa/             # PM2 do gateway WhatsApp
└── scripts/                   # aaPanel + Azure Service Bus facial
```

### Módulos backend

| Pasta | Prefixo API | Função |
|-------|-------------|--------|
| `auth` | `/auth` | Login local/Microsoft, refresh, convites, gateway |
| `tenants` | `/tenants` | Tenants Azure + `msal-config` |
| `users` | `/users` | Usuários internos + sync AD |
| `company-users` | `/company-users` | Usuários vinculados a empresa |
| `profiles` | `/profiles` | Perfis e catálogo de permissões |
| `companies` | `/companies` | Empresas, tipos, convites |
| `collaborators` | `/collaborators` | Colaboradores, foto, facial, bulk |
| `collaborator-blocklist` | `/blocklist` | Bloqueio na arena |
| `sectors` | `/sectors` | Times, membros, fluxos |
| `approvals` | `/approvals` | Inbox e decisões |
| `events` | `/events` | Eventos, empresas, bulk |
| `credentials` | `/credentials` | Credenciais do módulo eventos |
| `event-accreditation` | `/event-accreditations` | Credenciamento, convites, pulseiras |
| `patrimonial/service-access` | `/patrimonial/services` | Acessos de serviço |
| `patrimonial/vehicle` | `/vehicles` | Frota |
| `gate` | `/gate` | Portaria patrimonial/eventos |
| `materials` | `/materials` | Mercadorias, NF, estoque |
| `reports` | `/reports` | Dashboard e relatórios operacionais |
| `audit` | `/audit` | Auditoria operacional |
| `system-reports` | `/system-reports` | Logs técnicos admin |
| `error-logs` | `/error-logs` | Erros do cliente |
| `alerts` | `/alerts` | Alertas in-app |
| `smtp` | `/smtp`, `/webhooks` | E-mail + delivery reports |
| `whatsapp` | `/whatsapp` | OpenWA admin |
| `email-templates` | `/email-templates` | Templates HTML |
| `system-settings` | `/system-settings` | Sessão, aparência, horários, avisos |
| `teams` | `/teams`, `/teams/bot` | Graph + Bot |
| `facial` | `/facial`, `/api/facial` | Settings e Gateway |
| `faces` | `/faces` | Validação de foto |
| `storage` | `/storage` | Arquivos autenticados |
| `health` | `/health` | Saúde da API e do MySQL |

---

## Pré-requisitos

- **Node.js** 20.19+ ou 22.12+ (Angular CLI 21)
- **MySQL** 8+
- **npm**
- Para mobile: Android Studio e/ou Xcode, contas e URIs no Azure AD
- Opcional: OpenWA (WhatsApp), AccessControlGateway / devices Dahua, Azure Service Bus

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

> No servidor WTorre, os scripts `npm` do frontend já incluem o Node 26 em `/www/server/nodejs/v26.5.1/bin`. Em outra máquina, use Node 20.19+ no PATH.

---

## Variáveis de ambiente

Copie `backend/.env.example` para `backend/.env`.

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta da API (padrão **3007**) |
| `HOST` | Não | Interface de bind (padrão **127.0.0.1**) |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Sim | Conexão MySQL |
| `JWT_SECRET` | Produção | Assinatura do access token (mín. 32 caracteres; não use `change-me`) |
| `REFRESH_TOKEN_SECRET` | Produção | Assinatura do refresh token |
| `ENCRYPTION_KEY` | Produção | Criptografia AES de secrets (tenants, SMTP, ACS, SendGrid) — 32+ chars |
| `FACIAL_GATEWAY_EVENTS_SECRET` | Sim | Bearer HTTP poll (≥ 32; mesmo valor no Gateway) |
| `FACIAL_PEER_ORIGIN_IP` | Produção | IP público de saída do Gateway (allowlist) |
| `FACIAL_PEER_DESTINATION_IP` | Produção | IP público do Credenciamento (paridade com o Gateway) |
| `JWT_ACCESS_EXPIRES` | Não | Padrão `30m` |
| `JWT_REFRESH_EXPIRES` | Não | Padrão `7d` |
| `CORS_ORIGINS` | Não | Origens web permitidas (vírgula) |
| `APP_PUBLIC_URL` | Convites | URL pública do frontend (links de e-mail) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Recomendado | Usuário admin inicial (seed) |
| `EVENT_GRID_WEBHOOK_SECRET` | Webhook ACS | Secret da subscription Event Grid (delivery reports) |
| `MSAL_REDIRECT_URI_WEB` | Opcional | Redirect web customizado no msal-config |
| `MSAL_REDIRECT_URI_ANDROID` | Mobile | URI Android |
| `MSAL_REDIRECT_URI_IOS` | Mobile | URI iOS |
| `AUTH_GATEWAY_ENABLED` | Não | Liga SSO via auth-gateway |
| `AUTH_GATEWAY_URL` | Gateway | URL do gateway (ex.: `https://auth.nubankparque.com`) |
| `TEAMS_ACTIVITY_WEB_URL` | Teams | URL https ao clicar na notificação |
| `TEAMS_APP_ID` | Teams | ID no catálogo Graph após publicar `teams-app/` |
| `TEAMS_BOT_INTERACTIVE` | Não | `true` para Action.Submit no Adaptive Card |
| `GATE_ACCESS_TOLERANCE_HOURS` | Não | Horas extras na portaria além do dia do evento (padrão `6`) |
| `EXTERNAL_COMPANY_ENRICH` | Não | Enriquecer CNPJ de empresas eventuais (BrasilAPI) |
| `OWN_CNPJS` | Não | CNPJs do grupo (sem máscara, vírgula) |
| `LOG_LEVEL` | Não | `info`, `debug`, etc. |

**Não use no `.env`:** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — cadastre em **Tenants Azure**. Connection string ACS, senha SMTP, API key SendGrid e Verification Key do Event Webhook também **não** vão no `.env` — configure em **Envios de e-mail**.

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

## Perfis e permissões

Ações: `view`, `create`, `edit`, `delete`. Catálogo em `frontend/src/app/config/modules.config.ts` e `backend/config/modules.config.js`.

### Módulos

| Grupo | Módulos |
|-------|---------|
| Geral | `dashboard`, `approvals` |
| Acessos | `gate`, `service_access`, `events`, `event_accreditation`, `collaborator_blocklist` |
| Mercadorias | `merchandise_entry`, `merchandise_exit`, `merchandise_products`, `merchandise_locations`, `merchandise_external_companies` |
| Relatórios | `access_reports`, `credential_denials`, `merchandise_reports`, `audit` |
| Cadastros | `companies`, `collaborators`, `fleet`, `sectors` |
| Sistema | `profiles`, `users`, `company_users` |
| Configurações | `settings_tenants`, `settings_smtp`, `settings_whatsapp`, `settings_facial`, `settings_email_templates`, `settings_session`, `settings_appearance`, `settings_teams`, `settings_system_reports`, `settings_about`, `settings_event_accreditation`, `settings_access_schedule` |

### Perfis seed

| Código | Nome | Observação |
|--------|------|------------|
| `ADMIN` | Administrador | Super admin; `permissions: all` |
| `USER` | Usuário | Interno: dashboard + aprovações |
| `PRODUTORA` | Produtora | Empresa; eventos, credenciamento, frota, acessos |
| `PADRAO` | Empresa Padrão | Mesmo recorte da produtora |
| `CONTROLADOR` | Controlador | Portaria + mercadorias + relatório de acessos |
| `GESTAO` | Gestão (legado) | Dashboard + aprovações |
| `EMPRESA_GESTOR` | Gestor da Empresa | Usuários da empresa, colaboradores, eventos, frota |
| `EMPRESA_SOLICITANTE` | Solicitante da Empresa | Solicitações e cadastro de colaboradores |
| `GESTAO_BLOQUEIO` | Gestão de bloqueio | Só blocklist da arena |

Perfis com `requires_company` só operam nos dados da empresa vinculada (`middleware/vinculos`). Gestores de time usam `SectorGestorGuard`.

---

## API

Base recomendada: **`/api/v1`**

Rotas legadas em `/api` respondem igualmente, com header de depreciação.

IDs internos podem ser omitidos nas URLs públicas: o backend aceita **UUID público** (`resolveIncomingPublicIds` / `abrir/:publicId`).

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
| GET/POST | `/api/v1/auth/invite/:token` | — | Convite de usuário de empresa |
| GET/POST | `/api/v1/auth/company-register/:token` | — | Auto-cadastro de empresa |
| GET | `/api/v1/auth/gateway/config` | — | Config do Auth Gateway |
| POST | `/api/v1/auth/gateway/session` | — | Sessão via gateway |

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

### Aprovações

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/approvals/pending` | Caixa pendente |
| GET | `/api/v1/approvals/pending/count` | Contador (badge) |
| GET | `/api/v1/approvals/mine` | Minhas |
| GET | `/api/v1/approvals/team` | Equipe |
| GET | `/api/v1/approvals/sectors/:tipoEntidade` | Times elegíveis |
| GET | `/api/v1/approvals/:id` | Detalhe |
| POST | `/api/v1/approvals/:id/approve` | Aprovar |
| POST | `/api/v1/approvals/:id/reject` | Reprovar |
| POST | `/api/v1/approvals/:id/cancel` | Cancelar |

### Portaria

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/gate/events/today` | Eventos do dia |
| POST | `/api/v1/gate/events/validate` | Validar credencial |
| POST | `/api/v1/gate/events/facial-enroll` | Reenviar facial do evento |
| POST | `/api/v1/gate/events/substitute` | Substituir titular |
| GET | `/api/v1/gate/services/today` | Acessos de serviço do dia |
| POST | `/api/v1/gate/services/validate` | Validar acesso patrimonial |
| POST | `/api/v1/gate/services/facial-enroll` | Reenviar facial do serviço |
| POST | `/api/v1/gate/services/substitute` | Substituir titular |
| GET | `/api/v1/gate/calendar` | Calendário |
| POST | `/api/v1/gate/services/manual-release` | Liberação manual |
| POST | `/api/v1/gate/services/:id/notify-approval` | Notificar aprovação pendente |
| POST | `/api/v1/gate/services/:id/cancel-approval` | Cancelar aprovação pendente |

### Demais prefixos de negócio

| Prefixo | Função principal |
|---------|------------------|
| `/companies` | CRUD empresas, tipos, convites, logo |
| `/collaborators` | CRUD, foto, facial, importação em massa, acessos |
| `/blocklist` | Gestão de bloqueio |
| `/sectors` | Times, membros, fluxos (`ACESSO_SERVICO`, `CREDENCIAMENTO_EVENTO`, `CREDENCIAMENTO_EVENTO_INTERNO`) |
| `/events` | Eventos, empresas, veículos, submit-approval, bulk |
| `/credentials` | Credenciais por dia/empresa/colaborador |
| `/event-accreditations` | Processo de credenciamento, convites, pulseiras, export |
| `/patrimonial/services` | Acessos de serviço, colaboradores, veículos, bulk |
| `/vehicles` | Frota |
| `/materials` | Produtos, locais, movimentos, OCR NF, empresas eventuais |
| `/reports` | Dashboard, recusas, relatório de acessos + Excel |
| `/audit` | Auditoria operacional + Excel |
| `/alerts` | Listar, unread, marcar lidos, limpar |
| `/profiles` | Perfis e `GET /profiles/modules` |
| `/company-users` | Usuários de empresa + reenvio de convite |
| `/email-templates` | CRUD/preview/teste dos templates |
| `/system-settings` | Sessão, aparência (GET público no login), horários, avisos AD |
| `/whatsapp` | Config, QR, sessão, teste, logs, limites |
| `/faces/validar` | Qualidade da foto facial |
| `/facial` | Settings admin (JWT) |
| `/api/facial` | Gateway (Bearer + IP): health, claim jobs, eventos de passagem |
| `/storage` | Fotos, logos, capas, NF |
| `/error-logs/client` | Erros reportados pelo frontend |

### E-mail — SMTP, Azure ACS e SendGrid (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/smtp/settings` | Configuração (SMTP + provedor ACS/SendGrid; sem segredos) |
| PUT | `/api/v1/smtp/settings` | Salvar provedor, SMTP, ACS e/ou SendGrid (`email_ativo`, `ocultar_para`) |
| POST | `/api/v1/smtp/verificar` | Verifica conexão SMTP (`transporter.verify`) |
| POST | `/api/v1/smtp/test` | Enviar e-mail de teste pelo provedor ativo |
| GET | `/api/v1/smtp/logs` | Histórico (`sent` / `failed` / `entregue` / `bounce`) |
| POST | `/api/v1/webhooks/acs-email` | Webhook Event Grid (delivery reports; sem JWT) |
| POST | `/api/v1/webhooks/sendgrid-email` | Webhook SendGrid Event (delivery/bounce; sem JWT) |

### Microsoft Teams (ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/teams` | Lista integrações |
| POST | `/api/v1/teams` | Criar integração (tenant ref, team_id, channel_id) |
| PUT | `/api/v1/teams/:id` | Atualizar |
| DELETE | `/api/v1/teams/:id` | Desativar |
| POST | `/api/v1/teams/:id/test` | Teste (body opcional: `email`, `mensagem`) |
| POST | `/api/v1/teams/:id/send` | Enviar notificação a um usuário (`email`, `mensagem`) |
| POST | `/api/v1/teams/bot/messages` | Messaging endpoint do Bot (Adaptive Card) |
| GET | `/api/v1/teams/bot/status` | Status do Bot |

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
| GET | `/api/v1/users/sync-ad-status` | Status da sync automática (cron, última execução) |
| POST | `/api/v1/users/sync-departments` | Sincronizar departamentos do Azure AD para usuários Microsoft sem departamento |
| POST | `/api/v1/users/sync-ad-users` | Importar/atualizar todos os usuários do Azure AD (mesma rotina da cron) |
| POST | `/api/v1/users/:id/sync-ad` | Sincronizar departamento de um usuário Microsoft |

Ao bloquear (`ativo: false`), refresh tokens do usuário são revogados imediatamente e o usuário deixa de aparecer na listagem. **Somente usuários ativos com departamento** podem logar e são exibidos na administração.

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

## Jobs e crons

Ligadas ao subir a API (`backend/jobs/`), salvo o worker facial.

| Job | Padrão | Função |
|-----|--------|--------|
| Sync Azure AD | `0 * * * *` (`AD_USERS_SYNC_*`) | Importar/atualizar usuários AD |
| Retenção `audit_logs` | `0 3 * * *` | Arquivar leituras antigas em JSONL.gz |
| Retenção `app_error_logs` | `15 3 * * *` | Arquivar erros |
| Expiração de aprovações | `15 0 * * *` | Encerrar pendentes vencidas + revoke facial |
| Jobs faciais stale | a cada 5 min | Requeue `processing` travados |
| Facial direto Dahua | 1 min / 20 s / 15 min | Enroll, poll de passagens, revoke expirados |
| Convites de credenciamento | `*/15 * * * *` | Disparar convites agendados |
| Empresas eventuais | agendado | BrasilAPI CNPJ se `EXTERNAL_COMPANY_ENRICH=true` |
| Auth Gateway | 1 min | Sessões revogadas |

Scripts manuais (`backend/`):

```bash
npm run sync-ad-users
npm run archive-audit-logs
npm run archive-error-logs
npm run start:facial-worker    # Azure Service Bus (opcional)
```

Requer permissão **User.Read.All** (aplicação) em cada tenant Azure para a sync AD.

---

## Azure AD (multi-tenant)

1. Registre o aplicativo no Azure como **multitenant**.
2. **Authority** no frontend: `https://login.microsoftonline.com/common`
3. **Redirect URIs** (exemplos):
   - Dev web: `http://localhost:4207` ou `http://127.0.0.1:4207`
   - Android: `msauth://<package>/<hash>`
   - iOS: `msal<client-id>://auth`
4. Permissões Graph recomendadas (consentimento de administrador):
   - `User.Read.All` — diagnóstico de tenants, sync de usuários e foto de perfil
   - `TeamsActivity.Send`, `User.Read.All` (aplicação) — notificação ao **usuário** no feed do Teams
   - `ChannelMessage.Send` (aplicação) — opcional, envio a **canal** do Teams
5. Cada combinação **Tenant ID + Client ID** usada no login deve existir em `azure_tenants` com `ativo = 1`.

### E-mail (SMTP, Azure ACS e SendGrid)

Configure em **Configurações → Envios de e-mail**:

1. Escolha o provedor **SMTP**, **Azure ACS** ou **SendGrid**.
2. **SMTP:** host, porta, TLS, usuário, senha e remetente. Use **Verificar SMTP** e **Testar envio**.
3. **Azure ACS:** connection string (cifrada com `ENCRYPTION_KEY`) e remetente do domínio verificado. Ative o envio e teste.
4. **SendGrid:** API key (cifrada com `ENCRYPTION_KEY`) e e-mail/nome do remetente verificado no SendGrid. Ative o envio e teste. Para delivery reports, cole também a **Verification Key** do Signed Event Webhook (salva cifrada no banco).
5. Opcional: **Ocultar e-mail do destinatário no campo Para** (destinatário real em BCC).

Templates editáveis em **Configurações → Templates de e-mail**: `invite_access`, `company_self_register`, `event_created`, `event_partner_linked`, `event_partner_complete`, `credential_approved`.

Envios (sucesso ou falha) vão para `smtp_send_logs`. O `message_id` permite atualizar status via webhook:

**Azure ACS**
1. No Azure, subscription Event Grid no Communication Services — evento **Email Delivery Report Received**.
2. Endpoint: `https://<host-da-api>/api/v1/webhooks/acs-email`
3. Defina `EVENT_GRID_WEBHOOK_SECRET` no `.env` e use o mesmo secret na subscription.
4. Status ACS `Delivered` → `entregue`; demais terminais → `bounce`.

**SendGrid**
1. No SendGrid → Mail Settings → Event Webhook: URL `https://<host-da-api>/api/v1/webhooks/sendgrid-email`.
2. Ative **Signed Event Webhook** e copie a Verification Key.
3. Em **Envios de e-mail → SendGrid**, cole a Verification Key (não vai no `.env`).
4. Eventos: `delivered` → `entregue`; `bounce` / `dropped` → `bounce`.

Rate limit ACS (em memória): 30/min, 100/h, 2400/dia.

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

Menus filtrados por permissão (`sidebar-nav.config.ts` e `admin-menu.config.ts`).

### Rotas públicas

| Rota | Descrição |
|------|-----------|
| `/login` | Login local + Microsoft (layout BID / tema Nubank) |
| `/cadastro-acesso` | Conclusão de convite de usuário |
| `/cadastro-empresa` | Auto-cadastro de empresa (token) |
| `/auth/teams`, `/login/teams-popup` | Redirecionam para SSO estático `/auth/teams.html` |

### Deep links (Teams / handoff)

| Rota | Descrição |
|------|-----------|
| `/aprovacoes/detalhe`, `/aprovacoes/abrir/:publicId` | Aprovação focada |
| `/acessos-servico/detalhe`, `/acessos-servico/abrir/:publicId` | Visualização do acesso de serviço |
| `/credenciamento-eventos/detalhe`, `/credenciamento-eventos/abrir/:publicId` | Visualização do credenciamento |

### Área autenticada

| Rota | Módulo | Descrição |
|------|--------|-----------|
| `/dashboard` | `dashboard` | Início |
| `/aprovacoes` | `approvals` | Inbox |
| `/portaria` | `gate` | Portaria (kiosk) |
| `/mercadorias/entrada` | `merchandise_entry` | Registrar entrada |
| `/mercadorias/saida` | `merchandise_exit` | Registrar saída |
| `/operacao/relatorio-acessos` | `access_reports` | Relatório de acessos |
| `/operacao/negacoes-credenciamento` | `credential_denials` | Recusas |
| `/operacao/auditoria` | `audit` | Auditoria operacional |
| `/admin/acessos-servico` (+ `/novo`, `/detalhe`) | `service_access` | Acessos de serviço |
| `/admin/credenciamento-eventos` (+ `/novo`, `/detalhe`, `/abrir/:id`) | `event_accreditation` | Credenciamento |
| `/admin/eventos` (+ `/novo`, `/detalhe`, `/colaboradores`, `/abrir/:id`) | `events` | Eventos |
| `/admin/empresas` | `companies` | Empresas |
| `/admin/colaboradores` | `collaborators` | Colaboradores |
| `/admin/frota` | `fleet` | Frota |
| `/admin/gestao-bloqueio` | `collaborator_blocklist` | Blocklist |
| `/admin/setores`, `/admin/setores/detalhe` | `sectors` | Times |
| `/admin/perfis` | `profiles` | Perfis |
| `/admin/usuarios` | `users` | Usuários internos |
| `/admin/usuarios-empresas` | `company_users` | Usuários de empresas |
| `/admin/mercadorias-produtos` | `merchandise_products` | Produtos |
| `/admin/mercadorias-locais` | `merchandise_locations` | Locais |
| `/admin/mercadorias-eventuais` | `merchandise_external_companies` | Empresas eventuais |
| `/admin/mercadorias/relatorios` | `merchandise_reports` | Relatório de mercadorias |

### Configurações (`/admin/configuracoes/…`)

| Rota | Descrição |
|------|-----------|
| `tenants-azure` | Tenants Azure |
| `sessao` | Política de sessão |
| `horarios-acesso` | Comercial / noturno |
| `smtp` | Envios de e-mail e histórico |
| `templates-email` | Templates HTML |
| `whatsapp` | OpenWA |
| `teams` | Integração Teams + Bot |
| `notificacoes-credenciamento` | Avisos AD internos |
| `facial` | Devices, sync, logs |
| `aparencia` | Paleta WTorre / Nubank Parque |
| `relatorios-sistema` | Audit + error logs |
| `sobre` | Versão e health |

Redirects: `/admin/tenants` → tenants-azure; `/admin/configuracoes/usuarios` → `/admin/usuarios`.

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

## App Microsoft Teams

Pacote em [`teams-app/`](teams-app/README.md):

- Manifest + zip por tenant/client id.
- SSO (`/auth/teams.html`).
- Feed de atividades com deep link.
- Adaptive Card **Aprovar** / **Bloquear** + **Ver detalhe** (Bot; `TEAMS_BOT_INTERACTIVE=true`).
- Messaging endpoint público: `https://<host>/api/v1/teams/bot/messages`.

Fluxos notificados hoje: nova aprovação, decisão, check-in de portaria (serviço e credencial com opt-in por evento).

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

Há ainda a **auditoria operacional** em `/operacao/auditoria` (`GET /api/v1/audit`), distinta dos relatórios técnicos.

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
| `AUDIT_RETENTION_CRON` | `0 3 * * *` | Diária às 03:00 |
| `AUDIT_RETENTION_TIMEZONE` | `America/Sao_Paulo` | Timezone IANA |
| `AUDIT_RETENTION_READ_DAYS` | `90` | Hot storage LIST/READ |
| `AUDIT_RETENTION_DEFAULT_DAYS` | `365` | Hot storage demais ações |
| `AUDIT_ARCHIVE_DIR` | `./storage/audit-archive` | Pasta cold storage (relativa a `backend/`) |
| `AUDIT_ARCHIVE_BATCH_SIZE` | `2000` | Linhas por lote |
| `AUDIT_ARCHIVE_MAX_BATCHES` | `50` | Máx. lotes por execução (~100k linhas/passagem) |
| `AUDIT_ARCHIVE_DRY_RUN` | `false` | Exporta sem apagar (homologação) |

`app_error_logs` tem o mesmo modelo (`ERROR_RETENTION_*`, `ERROR_ARCHIVE_DIR`, cron às 03:15).

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

O schema operacional (empresas, colaboradores, eventos, credenciamento, portaria, aprovações, mercadorias, facial, etc.) é criado por `setupDatabase.js` + arquivos em `backend/migrations/`.

| Tabela (núcleo) | Uso |
|-----------------|-----|
| `usuarios` | Usuários locais e sincronizados via Microsoft |
| `azure_tenants` | Configuração multi-tenant (secret criptografado) |
| `refresh_tokens` | Refresh tokens (apenas hash SHA-256) |
| `audit_logs` | Auditoria de ações |
| `app_error_logs` | Erros da aplicação |

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

Há ainda `npm run purge-domain-data` para limpeza pontual de domínio.

---

## Segurança

- Em **produção**, defina `JWT_SECRET`, `REFRESH_TOKEN_SECRET` e `ENCRYPTION_KEY` com no mínimo 32 caracteres.
- **Rate limit:** configurável (`RATE_LIMIT_*`); login tem limite próprio por IP.
- Refresh tokens **nunca** são armazenados em texto claro — apenas hash no banco.
- `client_secret` dos tenants criptografado com `ENCRYPTION_KEY` (AES-256-GCM).
- CORS restrito por `CORS_ORIGINS` para clientes web; apps nativos não enviam `Origin`.
- Helmet habilitado; API atrás de proxy (`trust proxy`) para IP real e rate-limit.
- Gateway facial: Bearer compartilhado + allowlist de IP de origem/destino.
- IDs públicos (UUID) nas URLs de deep link; IDs internos não vazam no Teams.

---

## Deploy (aaPanel)

Scripts em `scripts/`:

- `aapanel-CredenciamentoBackend.sh` — API na porta **3007**
- `aapanel-CredenciamentoFrontend.sh` — build/serve do Angular
- `azure-servicebus-facial.sh` — auxiliar do worker facial

WhatsApp: [`deploy/openwa/`](deploy/openwa/README.md) instala OpenWA via PM2 em `127.0.0.1:2785` (não exponha a porta).

Configure no painel:

- Proxy reverso do site → frontend estático ou `ng serve`/build
- Proxy `/api` → `http://127.0.0.1:3007`
- Node **24.11.1** / **26** (caminho usado nos scripts do projeto)

---

## Estender o projeto

### Novo módulo no backend

Crie em `backend/modules/<nome>/`:

- `<nome>.routes.js`, `<nome>.controller.js`, `<nome>.service.js`, `<nome>.schema.js`

Registre em `backend/app.js`:

```javascript
v1Router.use("/<nome>", require("./modules/<nome>/<nome>.routes"));
```

Se a tela tiver permissão própria, adicione a chave em `backend/config/modules.config.js` e `frontend/src/app/config/modules.config.ts`.

Use `logAudit()` de `utils/auditLogger.js` e `AppError` + `errorHandler` para erros.

### Nova feature no frontend

Crie em `frontend/src/app/pages/<nome>/`:

- Componentes standalone
- Serviço HTTP (base: `environment.apiBaseUrl`)
- Rota em `app.routes.ts` com `AuthGuard` / `PermissionGuard` e `data.permission`
- Item de menu em `sidebar-nav.config.ts` ou `admin-menu.config.ts`

---

## Solução de problemas

| Problema | Possível solução |
|----------|------------------|
| `Access denied` MySQL | Confira `DB_USER` e `DB_PASSWORD` no `.env` |
| Login Microsoft recusado | Tenant com `tid`/`aud` do token deve estar cadastrado e ativo |
| MSAL sem clientId | Cadastre tenant principal em **Tenants Azure** |
| Auth Gateway não loga | `AUTH_GATEWAY_*`, cookie no domínio pai, JWKS e sistema em subdomínio |
| SMTP falha no teste | Verifique host/porta/TLS, credenciais e firewall; consulte histórico em Envios de e-mail |
| ACS falha no teste | Domínio verificado (SPF/DKIM), connection string e remetente no painel; `ENCRYPTION_KEY` válida |
| SendGrid falha no teste | API key com permissão Mail Send, remetente/domínio verificado no SendGrid; `ENCRYPTION_KEY` válida |
| Webhook ACS sem update | `EVENT_GRID_WEBHOOK_SECRET`, assinatura `aeg-signature` e `message_id` no log |
| Webhook SendGrid sem update | Verification Key em Envios de e-mail, headers Twilio Signature/Timestamp e `message_id` no log |
| Teams teste falha | Confirme `ChannelMessage.Send` / `TeamsActivity.Send` + admin consent, app instalado e IDs corretos |
| Bot sem Aprovar/Bloquear | Messaging endpoint HTTPS, `TEAMS_BOT_INTERACTIVE=true` e secret do tenant |
| Facial Gateway 401/403 | `FACIAL_GATEWAY_EVENTS_SECRET` e IPs `FACIAL_PEER_*` iguais nos dois lados |
| OpenWA sem QR | Serviço em `127.0.0.1:2785`, API key e sessão em **WhatsApp** |
| Angular CLI exige Node 20.19+ | Use Node 24/26 do servidor ou atualize o Node local |
| Aviso `lmdb` no build | Opcional: `npm install lmdb --save-dev` no frontend |
| API 404 em `/api/auth` | Use `/api/v1/auth` (versão atual) |

---

## Licença

Uso interno WTorre. Ajuste conforme política da organização.
