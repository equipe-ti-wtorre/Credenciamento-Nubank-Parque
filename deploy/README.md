# Deploy — Credenciamento (cred.nbpdev.com.br)

Build de produção do frontend e virada do nginx (sair do `ng serve` na porta 4207).
O gateway WhatsApp continua em [openwa/README.md](openwa/README.md).

## Build do frontend

No servidor (`/www/wwwroot/Credenciamento`):

```bash
bash deploy/build-front.sh
```

O script:

1. Usa o Node do aaPanel (`/www/server/nodejs/v26.5.1/bin`). Para outro caminho: `NODE_BIN=/caminho/bin bash deploy/build-front.sh`.
2. Roda `npm ci --legacy-peer-deps` + `npm run build` em `frontend/` (configuração `production`). O `--legacy-peer-deps` é necessário por conflito de peer do `ng2-charts` com o Angular 21.
3. Copia `frontend/dist/frontend/browser` para `frontend/dist-prod/` de forma atômica (pasta temporária + `mv`).

`frontend/dist-prod/` não entra no git.

Se o `ng serve` da 4207 ainda estiver no ar (antes da virada), use `SKIP_NPM_CI=1 bash deploy/build-front.sh` para não apagar o `node_modules` em uso. Depois da virada, rode o script sem esse flag.

## Aplicar o nginx (TI / aaPanel)

O arquivo [nginx/cred.nbpdev.com.br.conf](nginx/cred.nbpdev.com.br.conf) é **modelo**. Não é o vhost ativo.

1. No aaPanel, abra o site `cred.nbpdev.com.br` → configuração nginx.
2. Troque o `root` / proxy de `/` (hoje `127.0.0.1:4207`) pelo conteúdo do modelo:
   - `root /www/wwwroot/Credenciamento/frontend/dist-prod;`
   - `location /` com `try_files $uri $uri/ /index.html;`
   - `location /api/` continua em `http://127.0.0.1:3007/api/`
3. Preserve os certificados SSL que o painel já gerencia.
4. Use só `ssl_protocols TLSv1.2 TLSv1.3`. Remova TLSv1.1 e cifras 3DES/RSA+3DES.
5. **Não apague** os `location =` da allowlist facial (`/api/facial/events`, `/status`, `/jobs/claim`, `/jobs/queued`). Ver [docs/nginx-facial-allowlist.conf.example](../docs/nginx-facial-allowlist.conf.example).
6. Recarregue o nginx e teste:
   - `curl -s https://cred.nbpdev.com.br/ | grep @vite` — não deve retornar nada
   - Abrir uma rota profunda (ex.: `/eventos/123`) e dar F5 — a SPA deve abrir

O CSP do modelo inclui `https://login.microsoftonline.com` em `connect-src` enquanto o MSAL existir (Fase 2 do roteiro de auditoria remove isso).

## Depois da virada: parar o `ng serve` da 4207

Só depois do nginx estar servindo `dist-prod`:

```bash
# mata o ng serve da 4207, se ainda estiver no ar
bash frontend/scripts/free-port.sh 4207
```

Se o processo foi criado pelo aaPanel (Node project / PM2):

```bash
# conferir o que escuta
ss -lptn 'sport = :4207'
# ou
lsof -iTCP:4207 -sTCP:LISTEN
```

Pare pelo painel (Node project) ou pelo PM2, se for o caso. Confirme que a porta sumiu:

```bash
ss -lptn 'sport = :4207'
```

Não mate a 4207 **antes** de aplicar o nginx: o site atual ainda depende dela.
