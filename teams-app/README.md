# App Teams — feed + Adaptive Cards + Bot

O Credenciamento envia:

1. **Feed de atividades** (sino) com deep link para `/aprovacoes?id=…`
2. **Adaptive Card** no chat 1:1 com botões **Aprovar** / **Bloquear** e **Ver detalhe**

O feed exige o app Teams instalado. Os botões interativos exigem o **Bot** configurado no Azure e no `.env`.

---

## Passo a passo: integrar o Bot no portal Azure

Use o **mesmo App Registration** já usado pelo Credenciamento (Client ID abaixo). Assim o `botId` do manifest bate com o Azure.

| Item | Valor neste projeto |
|------|---------------------|
| Application (client) ID | `90ac8301-8401-4287-9e69-287a4cdcbc2b` |
| Messaging endpoint | `https://cred.allianzparque.intra/api/v1/teams/bot/messages` |
| URI da API (SSO) | `api://cred.allianzparque.intra/90ac8301-8401-4287-9e69-287a4cdcbc2b` |
| Manifest externalId | `c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c` |

### 1. Abrir o App Registration existente

1. Acesse [portal.azure.com](https://portal.azure.com) com conta admin do tenant.
2. Vá em **Microsoft Entra ID** → **Registros de aplicativo** (App registrations).
3. Abra o app `90ac8301-8401-4287-9e69-287a4cdcbc2b` (Credenciamento / Teams).
4. Anote (já existem em Configurações → Tenants Azure):
   - **Application (client) ID** → `client_id` do tenant
   - **Directory (tenant) ID** → `azure_tenant_id` do tenant

### 2. Client secret do Bot

O secret já pode estar em **Configurações → Tenants Azure**. Se o Bot Framework for o **mesmo** App Registration:

- Garanta que o tenant está **ativo**, com **client secret** válido e, de preferência, marcado como **principal**.
- Não precisa colar de novo no `.env`.

Se o secret expirou: no App Registration → **Certificados e segredos** → novo secret → atualize o campo Secret na tela **Tenants Azure** (não no `.env`).

### Azure Bot (recurso) — ainda necessário

Client ID/secret do tenant **não** criam sozinhos o recurso Azure Bot. Ainda é preciso:

1. Criar o **Azure Bot** apontando para o Client ID do tenant.
2. Messaging endpoint + canal Teams (passos 3–5 abaixo).

### 3. Criar o recurso Azure Bot

1. No portal: **Criar um recurso** → busque **Azure Bot** → **Criar**.
2. Preencha:
   - **Bot handle**: ex. `credenciamento-bot` (nome único na Azure)
   - **Tipo de assinatura / Resource group**: o da organização
   - **Tipo de dados**: `Multi Tenant` **ou** `Single Tenant`  
     - Se Single Tenant: informe o **Microsoft App ID** = `90ac8301-…` e o tenant  
     - Recomendado neste projeto: **Single Tenant** (mesmo tenant do Allianz Parque)
   - **Método de criação**: **Use existing app registration**
   - **App ID**: `90ac8301-8401-4287-9e69-287a4cdcbc2b`
   - **App tenant ID**: o Directory (tenant) ID do passo 1
3. Revise e **Criar**. Aguarde o deploy.

### 4. Configurar o Messaging endpoint

1. Abra o recurso **Azure Bot** criado.
2. Menu **Configuração** (Configuration).
3. Em **Messaging endpoint**, cole:

   ```text
   https://cred.allianzparque.intra/api/v1/teams/bot/messages
   ```

4. Salve.
5. Confirme que a API Credenciamento está no ar e acessível em HTTPS por esse caminho (teste rápido):

   ```bash
   curl -s -o /dev/null -w "%{http_code}" \
     -X POST https://cred.allianzparque.intra/api/v1/teams/bot/messages
   ```

   Sem o secret/JWT do Bot Framework a resposta pode ser `401`/`403`/`503` — o importante é **não** ser timeout/DNS. Com Bot configurado no `.env`, o endpoint existe.

### 5. Habilitar o canal Microsoft Teams

1. No Azure Bot → **Canais** (Channels).
2. Clique em **Microsoft Teams** → configurar / aplicar.
3. Aceite os termos e salve.
4. O canal **Teams** deve aparecer como ativo.

### 6. Expor a API (SSO da aba + getAuthToken)

Ainda no **App Registration** (`90ac8301-…`):

1. **Expor uma API** → **Definir** URI do aplicativo (**deve incluir o hostname da aba**, senão `getAuthToken` falha com *App resource defined in manifest and iframe origin do not match*):

   ```text
   api://cred.allianzparque.intra/90ac8301-8401-4287-9e69-287a4cdcbc2b
   ```

   Esse valor precisa bater com `webApplicationInfo.resource` do `manifest.json`.

2. **Adicionar um escopo**, por exemplo:
   - Nome: `access_as_user`
   - Quem pode consentir: Administradores e usuários
   - Nome/descrição de admin e usuário: `Acesso ao Credenciamento no Teams`
3. **Aplicativos cliente autorizados** → Adicionar (obrigatório para SSO no Teams):
   - Client ID do Teams desktop/web: `1fec8e78-bce4-4aaf-ab1b-5451cc387264`
   - Client ID do Teams mobile: `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`
   - Escopos autorizados: o escopo criado acima

Sem o passo 3, o Teams mostra “Não foi possível autenticar automaticamente” / falha em **Entrar com Microsoft (Teams)**.

No App Registration → **Autenticação** → plataforma **SPA**, cadastre:

```text
https://cred.allianzparque.intra
```

(recomendado também) `https://cred.allianzparque.intra/auth/teams.html`

O popup inicia em `/auth/teams.html` (página estática), mas o **redirect do Microsoft** usa o **origin** acima (já cadastrado). Sem o origin, aparece **AADSTS50011** / erro de popup em máquina sem sessão.

Após alterar o Application ID URI / redirect, regenere o zip e **republique** o app no Teams Admin (versão **1.1.2+**).

### 7. Permissões de aplicativo (Graph) — se ainda faltarem

No App Registration → **Permissões de API** → Microsoft Graph → **Permissões de aplicativo**:

| Permissão | Para quê |
|-----------|----------|
| `TeamsActivity.Send` | Sino (feed) |
| `User.Read.All` | Resolver usuário por e-mail |
| `AppCatalog.Read.All` | Descobrir Teams App ID |
| `Chat.Create` | Fallback de Adaptive Card via Graph |
| `ChatMessage.Send` | Fallback de Adaptive Card via Graph |
| `TeamsAppInstallation.ReadWriteSelfForUser.All` | Instalar app no usuário (opcional) |

Clique em **Conceder consentimento de administrador** para o tenant.

### 8. Backend — credenciais do Bot

Por padrão **não é preciso** colocar Client ID/secret no `.env`.

O Bot usa automaticamente o **tenant principal** (ou o primeiro ativo com secret) de  
**Configurações → Tenants Azure** (`client_id`, secret e `azure_tenant_id`).

Reinicie a API Credenciamento após salvar/alterar o tenant.

Opcional — override no `.env` (só se quiser um App/Bot separado do tenant cadastrado):

```env
# TEAMS_BOT_APP_ID=...
# TEAMS_BOT_APP_PASSWORD=...
# TEAMS_BOT_TENANT_ID=...
# TEAMS_BOT_SERVICE_URL=https://smba.trafficmanager.net/br/
TEAMS_ACTIVITY_WEB_URL=https://cred.allianzparque.intra
TEAMS_APP_EXTERNAL_ID=c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c
# TEAMS_APP_ID=<id do catálogo Graph após publicar o zip>
```

Verifique o status (usuário com permissão `settings_teams`):

```http
GET /api/v1/teams/bot/status
```

Exemplo de resposta:

```json
{
  "configured": true,
  "messagingEndpoint": "/api/v1/teams/bot/messages",
  "source": "azure_tenant",
  "label": "Nome do tenant na tela",
  "appId": "90ac8301-...",
  "tenantId": "..."
}
```

`source: "azure_tenant"` = usando Configurações → Tenants Azure.  
`source: "env"` = override via `TEAMS_BOT_*`.

### 9. Republicar o pacote Teams (manifest com bot)

```bash
cd teams-app
node build-package.mjs \
  --client-id 90ac8301-8401-4287-9e69-287a4cdcbc2b \
  --base-url https://cred.allianzparque.intra
```

1. Abra [admin.teams.microsoft.com](https://admin.teams.microsoft.com) → **Gerenciar aplicativos**.
2. Localize **Credenciamento** → **Carregar arquivo atualizado** (upload do `credenciamento-teams.zip` versão **1.1.2+**).
3. **Instalar para todos** (ou política que alcance os aprovadores).
4. Confira a aba **Permissions**: deve listar `TeamsActivity.Send.User`.
5. Atualize `TEAMS_APP_ID` se necessário:

```bash
cd teams-app
node query-teams-app-id.mjs --tenant-ref-id 1
```

### 10. Teste ponta a ponta

1. Usuário aprovador: Teams → Apps → **Credenciamento** → Adicionar (escopo pessoal), se ainda não tiver.
2. No Credenciamento, crie um **acesso de serviço** no setor desse aprovador.
3. Esperado:
   - Notificação no **sino** (Activity)
   - Mensagem no **chat** do bot com Adaptive Card (Aprovar / Bloquear / Ver detalhe)
4. Clique **Aprovar** no card → solicitação avança/finaliza; solicitante recebe alerta.
5. Sem `TEAMS_BOT_*` no `.env`, o feed e o card com link para o app ainda funcionam, mas **sem** Action.Submit no Teams.

### Checklist rápido de problemas

| Sintoma | O que conferir |
|---------|----------------|
| `configured: false` | Tenant Azure sem secret / inativo, ou `.env` TEAMS_BOT_* incompleto; restart da API |
| Card sem botões Aprovar/Bloquear | Azure Bot + canal Teams; secret do tenant válido |
| **"This bot is disabled"** | 1) Remova e reinstale o app Credenciamento no Teams (pessoa). 2) Admin Center → app Credenciamento → Status **Allowed**/Unblocked + políticas de permissão incluem você. 3) Clique **Open in Teams** no canal Azure Bot e envie "oi" ao bot. 4) Messaging endpoint precisa ser **HTTPS alcançável pela Microsoft** (URL `.intra` privada costuma impedir Action.Submit — use proxy público/reverse tunnel ou publique a API). 5) Cards enviados só via Graph não ativam o bot — precisa envio proativo Bot Connector OK |
| “Bot não autorizado” / 401 no endpoint | Secret do tenant desatualizado (renove na tela Tenants Azure) |
| Clique no sino abre login | SSO (passo 6). Em `/aprovacoes/:id` o Teams faz SSO automático (TeamsAwareAuthGuard); login só se falhar |
| Clique no sino não abre o detalhe | Novas notificações usam `/aprovacoes/{id}`; no app a página focada (sem sidebar) lê `subEntityId` |
| `App resource … iframe origin do not match` | Application ID URI = `api://cred.allianzparque.intra/{clientId}` + mesmo valor no manifest; republicar zip |
| **AADSTS50011** (redirect mismatch) | Em Autenticação SPA cadastre `https://cred.allianzparque.intra` **e** `https://cred.allianzparque.intra/auth/teams.html` |
| Feed “app not installed” | Pacote 1.1.2 republished + instalado para o usuário |
| Mensagem proativa não chega | Canal Teams ativo no Azure Bot + tenant com `azure_tenant_id` correto |

---

## Gerar o pacote (resumo)

```bash
cd teams-app
node build-package.mjs \
  --client-id 90ac8301-8401-4287-9e69-287a4cdcbc2b \
  --base-url https://cred.allianzparque.intra
```

Gera `../credenciamento-teams.zip`.

## Fluxos

| Evento | Destinatário | Canais |
|--------|--------------|--------|
| Nova aprovação | Aprovadores do setor | Feed + Adaptive Card + alerta in-app |
| Aprovado/reprovado | Solicitante | Feed + card informativo + alerta |
| Check-in na portaria | Solicitante + aprovadores/gestores **com** “Alerta portaria” ligado | Feed + card + alerta |

Preferência **Alerta portaria**: toggle no perfil da sidebar (desligado por padrão).

## Tipo de atividade

Manifest: `credenciamentoAlert`. Backend usa esse tipo quando o Teams App ID do catálogo está resolvido.
