# Atualização do Credenciamento — novos parâmetros de segurança

Guia para ambientes **já em operação**. Não altera o contrato de mensagens (enroll / status / events).
Referência completa da integração: [INTEGRACAO.md](./INTEGRACAO.md).

Depois desta atualização, a comunicação HTTP poll fica restrita a **dois pontos**:

| Papel | Quem | Variável |
|-------|------|----------|
| Origem | IP público de **saída** (NAT/egresso) do Gateway | `FACIAL_PEER_ORIGIN_IP` |
| Destino | IP público do servidor do Credenciamento | `FACIAL_PEER_DESTINATION_IP` |

Os dois valores são **idênticos** no `.env` do Credenciamento e no `.env` do Gateway.

---

## 1. O que muda no boot

Com `NODE_ENV=production` o processo **não sobe** se faltar:

- `FACIAL_GATEWAY_EVENTS_SECRET` — obrigatório sempre (dev e prod): ≥ 32 caracteres, não pode ser `change-me-events-secret` nem `segredo-forte`
- `JWT_SECRET` — em produção, mínimo 32 caracteres; não pode ser `change-me` / `change-me-credenciamento-jwt`
- `FACIAL_PEER_ORIGIN_IP` e `FACIAL_PEER_DESTINATION_IP`

O Node passa a escutar só em `127.0.0.1` (`HOST`). A porta `3007` (padrão deste repo) não deve ficar aberta na internet; o Nginx faz o proxy.

Antes do restart: copie o secret Bearer que estava na UI do Credenciamento para `FACIAL_GATEWAY_EVENTS_SECRET` (o mesmo valor no Gateway). Sem isso o poll retorna 401.

Endpoints de integração (`/api/facial/events`, `/status`, `/jobs/claim`, `/jobs/queued`) exigem:

1. IP de origem na allowlist
2. `Authorization: Bearer <FACIAL_GATEWAY_EVENTS_SECRET>`

`GET /api/facial/health` e as rotas JWT admin **não** usam o pin de IP.

---

## 2. Descubra os dois IPs

No **servidor do Gateway** (IP que o Nginx do Credenciamento vai ver):

```bash
curl -4 -s https://ifconfig.me
# ou
curl -4 -s https://api.ipify.org
```

No **servidor do Credenciamento**:

```bash
curl -4 -s https://ifconfig.me
```

- Origem = resultado no Gateway. Se o Gateway sai por NAT/firewall, use o IP **público de saída**, não o IP da LAN (ex.: `192.168.x.x`).
- Destino = IP público do Credenciamento. O hostname da URL (`https://credenciamento.seu-dominio.com`) deve resolver para esse IP (`dig +short A credenciamento.seu-dominio.com`).
- IPv4 e IPv6: liste com vírgula, sem espaço obrigatório: `203.0.113.10,2001:db8::1`

---

## 3. Credenciamento — `.env`

Arquivo: `backend/.env` (base: [backend/.env.example](../backend/.env.example)).

Inclua ou substitua:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3007

# Gere um valor novo (≥ 32). Não reutilize change-me-events-secret.
# Se o poll já funcionava, copie o secret que estava na UI para não quebrar o Gateway.
FACIAL_GATEWAY_EVENTS_SECRET=

# Mesmo par no Gateway. Origem = egresso do Gateway.
FACIAL_PEER_ORIGIN_IP=
FACIAL_PEER_DESTINATION_IP=

# Em produção não use change-me / change-me-credenciamento-jwt
JWT_SECRET=
```

Gerar secret:

```bash
openssl rand -base64 32
```

Se o secret Bearer **mudar**, atualize também o campo **Secret compartilhado** em
Gateway → Configurações → Integração Credenciamento (tem de ser o mesmo valor).

Dependência nova (`ipaddr.js`, já no `package.json`):

```bash
cd backend
npm install
```

Reinicie o processo (PM2 / systemd / aaPanel) **depois** de gravar o `.env`.

---

## 4. Gateway — `.env`

Arquivo: `backend/.env` do AccessControlGateway. Os nomes das variáveis são os **mesmos**:

```env
NODE_ENV=production

# Iguais ao Credenciamento
FACIAL_PEER_ORIGIN_IP=
FACIAL_PEER_DESTINATION_IP=
```

Em produção, se `FACIAL_PEER_DESTINATION_IP` estiver vazio, o Gateway **não envia** claim, status nem events.

A URL na UI (Integração Credenciamento) deve ser o host HTTPS cujo DNS aponta para `FACIAL_PEER_DESTINATION_IP`.

Reinicie o backend do Gateway após gravar o `.env`.

---

## 5. Nginx no Credenciamento

Use o modelo [nginx-facial-allowlist.conf.example](./nginx-facial-allowlist.conf.example).

Substitua:

- `ORIGIN_IP` → valor de `FACIAL_PEER_ORIGIN_IP`
- `DESTINO_IP` → valor de `FACIAL_PEER_DESTINATION_IP` (opcional no `listen` se o vhost já escuta em `*:443`)

Regras:

- `location =` **exato** em `/api/facial/events`, `/api/facial/status`, `/api/facial/jobs/claim`, `/api/facial/jobs/queued`
- `allow ORIGIN_IP;` + `deny all;` só nesses quatro
- **Não** use prefixo em `/api/facial/status` — bloquearia `/api/v1/facial/status/ingest` (JWT)
- `location /api/` continua para health, login e admin
- `proxy_pass` para `http://127.0.0.1:3007`
- manter `X-Forwarded-For` / `X-Real-IP` (o Node usa `trust proxy`)

Recarregar:

```bash
nginx -t && nginx -s reload
```

Firewall do host: 443 só a partir do IP de origem do Gateway, se possível.

---

## 6. Conferência rápida

Do **servidor do Gateway** (deve passar):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://credenciamento.seu-dominio.com/api/facial/health

curl -sS -X POST "https://credenciamento.seu-dominio.com/api/facial/jobs/claim" \
  -H "Authorization: Bearer SEU_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":1}'
```

Esperado: health `200`; claim `200` com `{"jobs":[...]}` ou lista vazia.

De **outro IP** (não o Gateway): claim/events devem retornar **403** (Nginx ou app). Sem Bearer: **401**.

Logs do Gateway após o restart:

```text
Command consumer using HTTP poll → https://…/api/facial
```

Se aparecer recusa de destino / DNS não autorizado, o A/AAAA do hostname não bate com `FACIAL_PEER_DESTINATION_IP`.

---

## 7. Erros frequentes nesta atualização

| Sintoma | Causa | Ação |
|---------|--------|------|
| Processo não sobe: secret obrigatório / 32 caracteres / valor de exemplo | `.env` antigo ou `change-me-events-secret` | Gerar secret ≥ 32 e igualar na UI do Gateway |
| Processo não sobe: IPs obrigatórios em produção | IPs vazios | Preencher origem e destino nos dois servidores |
| Claim `401` | Bearer divergente | Mesmo valor no `.env` do Credenciamento e na UI do Gateway |
| Claim / events `403` | IP visto pelo Nginx ≠ origem | Usar IP de **egresso**; conferir `allow` e `FACIAL_PEER_ORIGIN_IP` |
| Poller não envia / erro de destino | DNS ≠ destino | Conferir `dig` vs `FACIAL_PEER_DESTINATION_IP` (lado Gateway) |
| Admin da UI facial some / `403` em `/status/ingest` | `location` prefixo em `/api/facial/status` | Usar `location =` exato |
| Integração ok na LAN e falha na internet | Origem era IP privado | Trocar para o IP público de NAT |

---

## 8. Checklist

**Credenciamento**

- [ ] `npm install` no `backend`
- [ ] `HOST=127.0.0.1`
- [ ] Secret Bearer ≥ 32, não é valor de exemplo (copiado da UI antiga ou gerado e igualado no Gateway)
- [ ] `FACIAL_PEER_ORIGIN_IP` e `FACIAL_PEER_DESTINATION_IP` preenchidos
- [ ] `JWT_SECRET` forte (`NODE_ENV=production`)
- [ ] Nginx com allow/deny nos 4 paths de integração
- [ ] Processo reiniciado

**Gateway**

- [ ] Mesmo par de IPs no `.env`
- [ ] Mesmo Bearer na UI
- [ ] URL HTTPS cujo DNS aponta para o IP de destino
- [ ] Backend reiniciado
- [ ] claim de teste a partir deste servidor: HTTP 200
