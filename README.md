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
| Multi-tenant Azure | CRUD em **Administração → Tenants Azure** |
| API versionada | Prefixo `/api/v1` (rotas em `/api` mantidas com aviso de depreciação) |
| Auditoria | Tabela `audit_logs` para ações sensíveis |
| Logs | Pino (estruturado) + `app_error_logs` no banco |
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
4. Menu **Administração → Tenants Azure**:
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
4. Permissão Graph para diagnóstico/sync: `User.Read.All` com consentimento de administrador.
5. Cada combinação **Tenant ID + Client ID** usada no login deve existir em `azure_tenants` com `ativo = 1`.

O backend valida o token Microsoft conferindo `tid` e `aud` no banco e a assinatura via JWKS do tenant.

---

## Frontend web

### Rotas

| Rota | Perfil | Descrição |
|------|--------|-----------|
| `/login` | Público | Tela de login (layout BID) |
| `/dashboard` | ADMIN, USER | Início |
| `/admin/tenants` | ADMIN | Gestão de tenants Azure |

### Layouts

- **Login:** vídeo/imagem à esquerda + painel escuro à direita (`auth-layout`).
- **Sistema:** sidebar + área de conteúdo (`main-layout`).

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
| Angular CLI exige Node 20.19+ | Use Node 24 do servidor ou atualize o Node local |
| Aviso `lmdb` no build | Opcional: `npm install lmdb --save-dev` no frontend |
| API 404 em `/api/auth` | Use `/api/v1/auth` (versão atual) |

---

## Licença

Uso interno WTorre. Ajuste conforme política da organização.
