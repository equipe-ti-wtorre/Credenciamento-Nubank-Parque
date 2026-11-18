# Ajustes da auditoria — Credenciamento (cred.nbpdev.com.br)

Auditoria feita em 01/11/2026 no servidor AZURE-WEB03 (`/www/wwwroot/Credenciamento`).
Este arquivo é o roteiro para o Cursor aplicar as correções. Siga a ordem: cada fase depende da anterior.

> **Para o agente (Cursor):**
> - Responda e comente em português do Brasil.
> - Siga as rules do projeto (`arquitetura-*`, `auth-gateway`, `ui-*`). Se alguma tarefa conflitar com elas, pare e avise.
> - Uma fase por vez. No fim de cada fase: liste os arquivos alterados, os comandos para rodar e marque os `[ ]` concluídos aqui.
> - Não apague dados nem rode `reset-database*` / `purge-domain-data`.
> - Não coloque segredo real em código, `.env.example` ou commit.
> - O guia do gateway está em `C:\dev\tvnbp\docs\auth-gateway.md`. A implementação de referência é o NBP Signage (`backend/src/modules/auth/auth.gateway.ts`, `frontend/src/app/core/auth/`).

---

## Fase 0 — Salvar o que está só no servidor (FAZER PRIMEIRO)

O último commit é de 02/10/2026 e há **187 arquivos alterados sem commit** (+4.890/−2.204 linhas), incluindo `authMiddleware.js`, `env.js`, `migrationManifest.js` e `modules.config.js`.

- [x] Criar o branch `chore/snapshot-servidor-2026-11` e commitar o estado atual como está, sem refatorar.
- [x] Antes do commit, conferir que nenhum `.env`, chave, `.pem` ou dump entrou no stage (`git status`, `git diff --cached --name-only`).
- [x] Ajustar o `.gitignore` para ignorar `tmp/`, `*.zip`, `storage/`, `.env`, `*.pem` e `cursor-rules-export/`.
- [x] Tirar do versionamento (`git rm --cached`) os arquivos `credenciamento-teams*.zip`, `exemplo-importacao-credenciamento-eventos.xlsx` e `tmp/`. A planilha de exemplo vai para `docs/exemplos/`.
- [x] Decidir sobre a exclusão de `V2/.cursor/rules/*`: confirmar se foi intencional antes de commitar.
- [x] Push para os dois remotes (`origin` e `gittrabalho`).

**Pronto quando:** `git status` está limpo e o branch existe no GitHub da equipe.

---

## Fase 1 — Front em build de produção (sair do `ng serve`)

Hoje o nginx manda `/` para `127.0.0.1:4207`, que é o `ng serve` (a página pública carrega `/@vite/client`). Quando esse processo cai, o site dá 502 (visto em 28/10).

### Front (`frontend/`)
- [x] Em `package.json`, separar os scripts:
  - `"build": "ng build"` (configuração `production`);
  - `"build:dev": "ng build --configuration development"`.
  - Tirar o `PATH=/www/server/nodejs/...` fixo do script; isso fica no script de deploy.
- [x] Em `angular.json`, revisar a configuração `production`: `optimization: true`, `outputHashing: "all"`, `sourceMap: false`, budgets.
- [x] Conferir `src/environments/environment.prod.ts` (ou o equivalente) com `apiUrl: '/api/v1'` relativo, sem host fixo.
- [x] Revisar o script do `index.html` que lê `localStorage`/`sessionStorage` para o popup do Teams: vai sair na Fase 2.
- [x] Remover a meta `Cache-Control: no-cache` do `index.html`. O cache passa a ser controlado no nginx.

### Deploy (`deploy/`)
- [x] Criar `deploy/build-front.sh`: `npm ci` + `npm run build`, e copiar `dist/<projeto>/browser` para `frontend/dist-prod/` de forma atômica (gerar em pasta temporária e depois `mv`).
- [x] Criar `deploy/nginx/cred.nbpdev.com.br.conf` como **modelo** (quem aplica no aaPanel é a TI) com:
  ```nginx
  root /www/wwwroot/Credenciamento/frontend/dist-prod;

  location /api/ { proxy_pass http://127.0.0.1:3007/api/; ... }   # manter como está

  location / {
      try_files $uri $uri/ /index.html;
  }
  location = /index.html {
      add_header Cache-Control "no-cache";
  }
  location ~* \.(js|css|woff2?|png|jpg|svg|ico)$ {
      expires 1y;
      add_header Cache-Control "public, immutable";
  }

  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://auth.nbpdev.com.br; frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com; object-src 'none'; base-uri 'self'" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;

  ssl_protocols TLSv1.2 TLSv1.3;
  # remover TLSv1.1 e as cifras 3DES/RSA+3DES
  ```
- [x] Documentar em `deploy/README.md` como parar o processo do `ng serve` da porta 4207 depois da virada.

**Código pronto (01/11/2026):** `frontend/dist-prod` gerado neste servidor; `index.html` sem `@vite`.  
**Ainda aberto (TI):** aplicar o modelo no aaPanel e só então parar a 4207. Até lá o site público continua no `ng serve`.

**Pronto quando:** `curl -s https://cred.nbpdev.com.br/ | grep @vite` não retorna nada, rotas profundas (ex.: `/eventos/123`) abrem com F5 e a porta 4207 não existe mais.

---

## Fase 2 — Login só pelo auth-gateway (rule `auth-gateway`)

### Situação atual
- `POST /api/v1/auth/gateway/session` valida o cookie `nbp_session` corretamente (RS256, `iss`, `aud`, `clockTolerance: 30`, `oid`, lista de encerradas). Depois disso, porém, **emite um JWT HS256 próprio mais um refresh token** gravado em `refresh_tokens`.
- `authMiddleware` só aceita esse JWT próprio, via `Authorization: Bearer`.
- Ainda existem:
  - `POST /auth/login` (senha local, bcrypt);
  - `POST /auth/login-microsoft` (MSAL, com `validateMicrosoftToken.js`);
  - `GET /tenants/msal-config` (pública);
  - MSAL no front: `msal-config.service.ts`, `msal-runtime.config.ts`, `login.component.ts`, `teams-login-popup.component.ts`, `app.config.ts`.
- Há chamadas diretas ao Graph (`utils/microsoftGraph.js`, `modules/tenants/tenant.service.js`) e `client_secret` de tenant no banco.
- Usuário novo é criado com o perfil `USER`.

### Decisão necessária antes de codar
- [ ] **Empresas terceiras:** confirmar com o responsável se os usuários de empresas convidadas (`/auth/invite`, `/auth/company-register`) estão no Entra (convidado B2B em um dos tenants do gateway).
  - **Se estão:** remover o login local por completo.
  - **Se não estão:** manter o login local **apenas** para o perfil de empresa terceira e registrar como desvio no fim deste arquivo. Nesse caso, a sessão local continua com JWT próprio, separada do fluxo do gateway.

### Back-end
- [ ] `config/env.js` e `.env.example`:
  - Trocar `AUTH_GATEWAY_ENABLED`/`AUTH_GATEWAY_URL` por `AUTH_URL` (dev: `https://auth.nbpdev.com.br`; produção: `https://auth.nubankparque.com`).
  - Adicionar `AUTH_MODE=dev`, que deve ser recusado quando `NODE_ENV=production`.
  - Manter `AUTH_GATEWAY_JWKS_URL` só como override opcional.
  - Remover `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_*_EXPIRES`, `MSAL_*`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` (exceto o que a decisão sobre terceiros exigir manter).
- [ ] `middleware/authMiddleware.js`:
  - Ler o token do cookie `nbp_session` (ou `Authorization: Bearer`, para scripts) e validar com `gateway.service.verifyGatewayToken`.
  - Carregar o usuário pelo `oid` (+ `tid`) e montar `req.user` como hoje.
  - Respostas de erro no contrato `{ error: { code, message } }`:
    - 401 `UNAUTHENTICATED` (sem token);
    - 401 `SESSION_INVALID` (token inválido, vencido ou encerrado);
    - 403 `FORBIDDEN` (sem perfil ou desativado).
- [ ] `modules/auth/gateway.service.js`:
  - Conferir com o gateway se `/sessions/revoked` devolve `jti` ou `sid` e comparar com o campo certo do token.
  - Expor `isRevoked(jti)`.
- [ ] Primeiro acesso: criar o usuário **sem perfil** (`id_perfil = NULL`, "aguardando liberação") em vez de `USER`. O `authMiddleware` devolve 403 com a mensagem "Seu acesso está aguardando liberação do administrador."
- [ ] Remover (ou isolar para terceiros, conforme a decisão):
  - `modules/auth/token.service.js`: JWT e refresh;
  - rotas `POST /auth/login`, `/auth/login-microsoft`, `/auth/refresh`, `/auth/gateway/session`;
  - `GET /tenants/msal-config`;
  - `middleware/validateMicrosoftToken.js`.
- [ ] `GET /api/v1/auth/config` (pública) → `{ authUrl, palette }`, com `authUrl: null` em modo dev. Substitui `/auth/gateway/config`.
- [ ] `GET /api/v1/auth/me` continua devolvendo usuário, perfil e permissões.
- [ ] Migração: remover a tabela `refresh_tokens`, ou deixar sem uso e remover numa migração posterior.
- [ ] Graph e segredos da Microsoft:
  - Substituir `utils/microsoftGraph.js` e a sincronização de AD (`scripts/sync-ad-users.js`, cron `AD_USERS_SYNC_*`) pela API do gateway: `GET ${AUTH_URL}/v1/directory/users?changedSince=…` com `Authorization: Bearer ${AUTH_API_KEY}`.
  - O departamento (`departamento`) passa a vir do pacote `org` do gateway.
  - Fotos via `GET /v1/directory/users/:oid/photo`.
  - Envio pelo Teams/e-mail: avaliar `POST /v1/mail/send`. O bot do Teams (`botbuilder`) é um caso à parte: registrar como desvio se precisar continuar.
  - Nova variável `AUTH_API_KEY` (só no back, só no `.env`).
  - Retirar `client_secret` do módulo `tenants`.
  - **Pedir à TI** a liberação em Sistemas → Acesso à API (pacotes `basic`, `org`, `photo`).

### Front-end
- [ ] Criar `core/auth/auth.service.ts`:
  - `GET ${authUrl}/me` com `withCredentials` para nome, cargo e foto (`/me/photo`);
  - depois `GET /api/v1/auth/me` para as permissões.
- [ ] Interceptor HTTP: enviar `withCredentials: true` para a API e **não** anexar Bearer. Em 401, chamar `${authUrl}/me` de novo (renova o cookie), repetir a requisição uma vez e, se falhar de novo, ir para `/entrar?motivo=expirou`.
- [ ] Rota pública `/entrar` com o cartão da rule `ui-login`.
  - "Entrar com Microsoft" → `${authUrl}/login?redirect=${location.origin}${rota}`.
  - Mensagens para `motivo=expirou` e `motivo=saiu`.
- [ ] Sair: `${authUrl}/logout?redirect=${location.origin}/entrar?motivo=saiu`.
- [ ] Remover `@azure/msal-*` do `package.json`, `msal-config.service.ts`, `msal-runtime.config.ts`, os providers MSAL de `app.config.ts`, o formulário de senha e qualquer token em `localStorage`/`sessionStorage`.
- [ ] Teams: substituir `teams-login-popup` pelo fluxo do gateway em popup ou guia (o cookie é do domínio pai), e remover o script de popup do `index.html`.

**Pronto quando:**
- Ninguém entra sem passar pelo gateway.
- Logout ou sessão encerrada no admin do gateway derruba o acesso em até 1 minuto.
- `grep -ri msal frontend/src backend --exclude-dir=node_modules` não encontra nada.
- Usuário novo vê "aguardando liberação".

---

## Fase 3 — Permissões e dados sensíveis

- [ ] `modules/storage/storage.routes.js`: as rotas `/pictures` e `/pictures/:filename` (fotos de colaborador, que são dado biométrico) só exigem login. Adicionar:
  - permissão `collaborators.view` (ou a do módulo dono), com `autorizar({ vinculo })` para que o usuário de empresa terceira só veja colaboradores da própria empresa;
  - o mesmo critério em `company-logos`, `event-covers` e `event-accreditation-covers` quando o arquivo não for público.
- [ ] Confirmar que `sendStoredFile` usa `path.basename` + `path.resolve` + `startsWith(dir + sep)`, como já é feito em `/merchandise`.
- [ ] Revisar as rotas que só têm `authMiddleware`, sem checagem de permissão, e garantir filtro por usuário ou empresa no service:
  - `GET /companies/` → `companies.view`, ou filtro pela empresa do usuário;
  - `GET /approvals/pending`, `/pending/count`, `/team`, `/sectors/:tipoEntidade`;
  - `GET /sectors/select`;
  - `GET /system-settings/access-schedule`.
- [ ] `POST /api/v1/teams/bot/messages` com corpo vazio responde 500. Validar o token do Bot Framework (o `botbuilder` faz isso com `CloudAdapter`/`ConfigurationBotFrameworkAuthentication`) e responder 401 antes de processar.
- [ ] `GET /api/v1/health/` é público: tirar `publicUrl` e `environment` da resposta pública e devolver só `{ status }`.
- [ ] Alinhar a chave `modulo.acao` entre `backend/config/modules.config.js`, o config de módulos do front, os itens de menu e os guards. Listar no fim qualquer módulo que exista em um lado e não no outro.
- [ ] Remover `authorizeRoles` de `authMiddleware.js` se não houver mais uso (a autorização é só por `modulo.acao`).

---

## Fase 4 — Contrato da API e camadas

- [ ] `middleware/errorHandler.js` e `authMiddleware.js`: padronizar todo erro como
  `{ "error": { "code", "message", "details"? } }`, com `requestId` dentro de `error`.
  Códigos: `VALIDATION` 422 (hoje a validação Joi devolve **400**), `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `RATE_LIMIT` 429, `INTERNAL` 500 (sem stack).
- [ ] Rota 404 da API (`app.js`, `app.use("/api/*")`): usar o mesmo contrato.
- [ ] Front: garantir que `notifyHttpError` lê `error.message`.
- [ ] Remover o alias `/api` sem versão (`app.use("/api", deprecationWarning, v1Router)`) depois de confirmar nos logs do nginx que ninguém usa mais. O facial continua em `/api/facial`.
- [ ] Listas paginadas no formato `{ data, meta: { page, pageSize, total } }`. Listar as que hoje fogem disso.
- [ ] Mover para `modules/sectors/` o arquivo `backend/sectors.service.js`, que está solto na raiz.
- [ ] Apagar as pastas vazias `backend/controllers`, `backend/routes` e `backend/services`.
- [ ] Atualizar para Express 5 (padrão do projeto). Revisar `app.use("/api/*")` (vira `"/api/*splat"` ou `"/api/{*splat}"`), `req.query` somente leitura e o tratamento de erros async.

---

## Fase 5 — Operação

- [ ] `backend/ecosystem.config.cjs`: rodar `backend` e `facial-worker` com um usuário sem privilégio, em vez de root (definir `user` aqui, ou PM2 do usuário `www`/`nbp_dev`). Ajustar o dono de `storage/` e dos logs.
- [ ] Investigar os 11 restarts do `facial-worker`: memória, erro não tratado, timeout do OpenCV. Definir `max_memory_restart` e rotação de log.
- [ ] `modules/materials/nfe-barcode.js`: tratar `NotFoundException` do zxing como "código não encontrado" (log `debug`), sem jogar stack trace no `backend-error.log` a cada nota sem código.
- [ ] `.env.example`: tirar `ADMIN_PASSWORD=admin123` e `DB_USER=root`. Usar valores vazios com comentário de como gerar.
- [ ] Atualizar o `README.md`: como rodar local (`AUTH_MODE=dev`), build, deploy e variáveis.

### Para a TI (fora do código; só documentar em `deploy/README.md`)
- Firewall do WEB03: FTP (21, 39000–40000) e o painel aaPanel (24616) abertos para qualquer IP. Restringir por IP ou VPN.
- MariaDB escuta em `0.0.0.0:3306`. Mudar para `bind-address=127.0.0.1` se nenhum outro servidor acessa.
- Aplicar o modelo do nginx da Fase 1 (TLS 1.2/1.3, CSP, cache).

---

## Variáveis de ambiente

| Variável | Ação |
|---|---|
| `AUTH_URL` | nova |
| `AUTH_MODE` | nova (só fora de produção) |
| `AUTH_API_KEY` | nova (só back, pedir à TI) |
| `AUTH_GATEWAY_ENABLED`, `AUTH_GATEWAY_URL` | remover (viram `AUTH_URL`) |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES` | remover (a menos que o login de terceiros continue) |
| `MSAL_REDIRECT_URI_*`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | remover |
| `AD_USERS_SYNC_*` | renomear para `DIRECTORY_SYNC_*` (sincronização via gateway) |

---

## Situação em 18/11/2026

- **Fase 0:** concluída.
- **Fase 1:** concluída. O nginx serve `frontend/dist-prod`; o `ng serve` da 4207 foi desligado. A config real está em `deploy/nginx/cred.nbpdev.com.br.conf` (editada fora do aaPanel). TLS 1.2/1.3 sem 3DES e sem 0-RTT. CSP aplicada só com `frame-ancestors`, `object-src` e `base-uri`; a CSP completa está em `Content-Security-Policy-Report-Only` até alguém navegar logado sem violações no console.
- **Fase 2:** decisão tomada: as empresas terceiras continuam com login próprio (usuário e senha, convite e recuperação de senha). Usuário interno passa a entrar só pelo auth-gateway. Implementação pendente.
- **Fase 3:** concluída. Listagens de aprovação com `approvals.view`, fotos com escopo de empresa, bot do Teams com 401 sem JWT, `/health` público reduzido. As rotas que só exigem login são dados do próprio usuário, listas auxiliares ou têm escopo no service (`GET /companies`, alertas).
- **Fase 4:** aguardando definição.
- **Fase 5:**
  - Feito: rotação dos logs do PM2 (`deploy/logrotate-pm2-credenciamento`, instalado em `/etc/logrotate.d/`), leitor de código de barras só CODE_128 (sem o log do zxing), `backend/.env` com permissão 600. O worker facial só caiu em 11–12/11, durante a troca para o MySQL 8.
  - Pendente: tirar a API do root. A tela WhatsApp → Limites grava o `.env` do OpenWA (do root) e reinicia o processo no PM2 do root; com outro usuário essa função para.

## Desvios aceitos (preencher)

| Item | Motivo | Decidido por / data |
|---|---|---|
| CSP `connect-src` inclui `https://login.microsoftonline.com` | MSAL ainda no front; sem isso o login quebra. Sai na Fase 2. | Fase 1 / 01/11/2026 |
| `npm ci --legacy-peer-deps` | Peer do `ng2-charts` conflita com Angular 21. | Fase 1 / 01/11/2026 |
| Login próprio (senha, convite, recuperação) para usuários de empresa terceira | As empresas terceiras não estão no Entra dos tenants do gateway. Vale só para perfis com `requires_company`; usuário interno entra pelo gateway. | Daniel Lemes / 18/11/2026 |
| CSP completa em Report-Only | Precisa ser observada com usuário logado (TinyMCE, Teams, gateway) antes de bloquear. | Fase 1 / 18/11/2026 |
| API e worker no PM2 do root | A tela WhatsApp → Limites grava o `.env` do OpenWA e reinicia o processo dele. | Fase 5 / 18/11/2026 |
