# Credenciamento

Sistema de credenciamento com backend Node.js/Express, frontend Angular 21 e suporte a apps mobile via Capacitor (Android/iOS).

## Arquitetura

- **API versionada:** `/api/v1` (rotas legadas em `/api` com aviso de depreciação)
- **Autenticação:** JWT de acesso (curto) + refresh token (persistido com hash SHA-256)
- **Logging:** Pino estruturado + tabela `audit_logs` para ações sensíveis
- **Mobile:** Angular + Capacitor reutilizando o mesmo código

## Backend

```bash
cd backend
cp .env.example .env
# Edite JWT_SECRET, REFRESH_TOKEN_SECRET, ENCRYPTION_KEY
npm install
npm run dev
```

### Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/health` | Health check + status DB |
| POST | `/api/v1/auth/login` | Login local |
| POST | `/api/v1/auth/login-microsoft` | Login Microsoft |
| POST | `/api/v1/auth/refresh` | Renovar access token |
| POST | `/api/v1/auth/logout` | Revogar refresh token |
| GET | `/api/v1/auth/me` | Dados do usuário autenticado |
| GET | `/api/v1/tenants/msal-config` | Config MSAL (web/android/ios) |

### Headers recomendados (todos os clientes)

- `Authorization: Bearer <accessToken>`
- `X-Client-Type: web | android | ios`
- `X-Request-Id: <uuid>` (opcional; gerado pelo servidor se ausente)

## Frontend (Web)

```bash
cd frontend
npm install
npm start
```

Acesse `http://127.0.0.1:4207`. O proxy encaminha `/api` para `http://127.0.0.1:3007`.

## Mobile (Capacitor)

### Pré-requisitos

- Node.js 20+
- Android Studio (Android) ou Xcode (iOS)
- Redirect URIs registrados no Azure AD

### Configuração

1. Ajuste `frontend/src/environments/environment.mobile.ts` com a URL absoluta da API.
2. Configure no `.env` do backend:
   - `MSAL_REDIRECT_URI_ANDROID`
   - `MSAL_REDIRECT_URI_IOS`
3. Inicialize plataformas nativas (primeira vez):

```bash
cd frontend
npm run build:mobile
npx cap add android   # ou: npx cap add ios
npx cap sync
```

### Build e execução

```bash
cd frontend
npm run build:mobile
npx cap open android   # ou: npx cap open ios
```

### MSAL em mobile

- Android: `msauth://<package>/<hash>`
- iOS: `msal<client-id>://auth`
- O backend retorna `redirectUris` em `GET /api/v1/tenants/msal-config`
- Tokens da aplicação são armazenados via `@capacitor/preferences` em plataformas nativas

## Estrutura de módulos (novos recursos)

### Backend

Crie em `backend/modules/<nome>/`:

- `*.routes.js`, `*.controller.js`, `*.service.js`, `*.schema.js`
- Registre em `backend/app.js` sob `/api/v1/<nome>`
- Use `logAudit()` para create/update/delete
- Use `AppError` + `errorHandler` global

### Frontend

Crie em `frontend/src/app/features/<nome>/`:

- Componentes standalone
- Serviço usando `ApiService`
- Rotas em `app.routes.ts` com `AuthGuard` quando necessário

## Segurança

- Em produção, defina `JWT_SECRET`, `REFRESH_TOKEN_SECRET` e `ENCRYPTION_KEY` (mín. 32 caracteres)
- `CORS_ORIGINS` restringe origens web; apps nativos não enviam `Origin`
- Rate limit: 100 req/15min global, 10 req/15min em login
- Refresh tokens armazenados apenas como hash no banco
