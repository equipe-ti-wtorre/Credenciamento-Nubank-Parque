# OpenWA — gateway WhatsApp (sem Docker)

Gateway REST self-hosted ([rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)) usado pelo Credenciamento
como canal de notificação por WhatsApp. Roda do fonte, sob PM2, no mesmo servidor do backend.

## Antes de começar

- Use um **número dedicado**. O OpenWA usa clientes não oficiais (whatsapp-web.js); há risco real de
  restrição/banimento. Nunca pareie o número principal da empresa.
- Mantenha e-mail como canal principal; WhatsApp é complementar.
- Engine `whatsapp-web.js`: ~300–500 MB de RAM por sessão (Chromium headless).
- O OpenWA escuta em **todas as interfaces** na porta 2785 (não há variável de bind fora do Docker).
  A porta precisa estar bloqueada para fora no firewall do servidor. Em AlmaLinux com firewalld, basta
  **não** liberar `2785/tcp` (o `install.sh` avisa se ela estiver aberta). Nunca exponha o gateway
  sem TLS + proxy reverso: a API key trafega em texto puro.

## Instalar / atualizar

```bash
bash deploy/openwa/install.sh
```

O script clona a tag fixada (`OPENWA_TAG`, padrão `v0.25.0`) em `/www/wwwroot/openwa`, cria o `.env`
a partir de `.env.example`, roda `npm ci` + build, sobe o processo `openwa` no PM2 e imprime a API key.

Para atualizar de versão: `OPENWA_TAG=vX.Y.Z bash deploy/openwa/install.sh`. Confira o CHANGELOG do
OpenWA antes — o `postinstall` aplica patches no whatsapp-web.js e pode quebrar entre versões.

## Configurar no Credenciamento

1. Pegue a API key: `cat /www/wwwroot/openwa/data/.api-key`.
2. No Credenciamento, abra **Configurações → WhatsApp (OpenWA)**.
3. Informe URL `http://127.0.0.1:2785`, a API key e um nome de sessão (ex.: `credenciamento`). Salve.
4. Clique em **Iniciar sessão** e escaneie o QR exibido com o WhatsApp do número dedicado
   (Aparelhos conectados → Conectar aparelho).
5. Quando o status ficar **ready**, use **Testar envio**.

Com `AUTO_START_SESSIONS=true` a sessão reconecta sozinha após `pm2 restart openwa`.

## Operação

```bash
pm2 logs openwa            # logs
pm2 restart openwa         # reinicia (a sessão volta sozinha)
pm2 stop openwa            # para
curl -s http://127.0.0.1:2785/api/health
```

Dados persistentes (SQLite, sessão pareada, mídia, API key): `/www/wwwroot/openwa/data`.
Faça backup desse diretório; perder `data/sessions` exige parear o QR novamente.

## Painel web do OpenWA (opcional)

O dashboard é servido em `http://127.0.0.1:2785`. Como a porta está só em loopback, acesse via túnel:

```bash
ssh -L 2785:127.0.0.1:2785 usuario@servidor
# depois abra http://localhost:2785 e entre com a API key
```
