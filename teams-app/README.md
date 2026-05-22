# App Teams — notificações no sino

O Microsoft Graph **só envia notificações de feed** se existir um **app Teams** ligado ao mesmo **Client ID (AAD)** usado no tenant Azure do Credenciamento, e esse app estiver **instalado para o usuário** que recebe o teste.

## Gerar o pacote automaticamente

```bash
cd teams-app
node build-package.mjs \
  --client-id 90ac8301-8401-4287-9e69-287a4cdcbc2b \
  --base-url https://cred.allianzparque.intra
```

Isso gera `../credenciamento-teams.zip` na raiz do projeto (já pronto para upload).

### Azure — URI da API (obrigatório)

No registro do app (`90ac8301-...`) → **Expor uma API** → **URI da ID do aplicativo**:

`api://90ac8301-8401-4287-9e69-287a4cdcbc2b`

(deve coincidir com `webApplicationInfo.resource` do manifest.)

## Passo a passo manual (alternativa)

### 1. Ajustar o manifest

Use `build-package.mjs` ou edite `manifest.json` manualmente.

### 2. Ícones

`python3 generate-icons.py` ou inclua `color.png` (192×192) e `outline.png` (32×32).

### 3. Empacotar

```bash
cd teams-app
node build-package.mjs
```

### 4. Publicar no tenant

- **Teste:** Teams → **Apps** → **Gerenciar seus apps** → **Enviar um aplicativo personalizado** → envie o `.zip`.
- **Produção:** Centro de administração do Teams → **Gerenciar aplicativos** → carregar / aprovar para a organização.

### 5. Permissão RSC no manifest (obrigatório)

O manifest deve incluir `authorization.permissions.resourceSpecific` com
**TeamsActivity.Send.User** (tipo Application). Sem isso o Graph retorna *not authorized*
mesmo com o app instalado. A versão **1.0.2+** do pacote já traz essa entrada.

Após atualizar o zip, **remova e reinstale** o app para o usuário (ou faça upgrade no admin)
e confira a aba **Permissions** do app no centro de administração do Teams.

### 6. Instalar para o destinatário

O usuário que recebe o **Testar envio** precisa ter o app instalado no **escopo pessoal**:

Teams → Apps → Credenciamento → **Adicionar** (para mim).

Sem essa instalação, o Graph retorna *"Application with AAD App Id … is not authorized … Ensure that the expected Teams app is installed"*.

### 7. Teams App ID no Credenciamento

Após publicar o zip, consulte o ID:

```bash
cd teams-app
node query-teams-app-id.mjs --tenant-ref-id 1
```

(O script usa o client secret do tenant no banco. Para listar o catálogo via API, adicione **AppCatalog.Read.All** no Azure.)

Informe o ID do catálogo Graph em `TEAMS_APP_ID` no `.env` ou no campo da integração.

Após publicar, obtenha o **ID do app no catálogo** (Graph):

```http
GET https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq 'c8f4a2b1-6d3e-4f5a-9b0c-1e2d3f4a5b6c'
```

Use o campo `id` da resposta em:

- variável de ambiente `TEAMS_APP_ID` no `.env`, ou  
- campo **Teams App ID** na integração (Configurações → Integração Teams).

O `externalId` é o GUID do campo `id` no `manifest.json`.

### 8. Permissões Azure (aplicação)

No registro do app (mesmo Client ID):

- **TeamsActivity.Send**
- **User.Read.All**
- **AppCatalog.Read.All** (consultar Teams App ID no servidor)
- **TeamsAppInstallation.ReadWriteSelfForUser.All** (opcional — o backend tenta instalar o app para o destinatário antes de notificar)
- **Conceder consentimento de administrador**

Se não usar instalação via API, no admin do Teams use **Install for everyone** em Credenciamento.

## Tipo de atividade

O manifest declara `credenciamentoAlert`. O backend usa esse tipo quando `TEAMS_APP_ID` está configurado.

`systemDefault` (texto livre) também exige o app instalado; não dispensa o pacote Teams.
