# Deploy Evolution API no Render — PostoCash WhatsApp

## Visão geral

A Evolution API é o gateway WhatsApp do PostoCash.
Após o deploy, o backend usa `WHATSAPP_PROVIDER=evolution` para enviar
mensagens de cashback e campanhas via Evolution em vez do Z-API.

---

## Passo 1 — Criar o serviço no Render

1. Acesse **https://render.com** e faça login
2. Clique em **New → Web Service**
3. Escolha **Deploy an existing image from a registry**
4. Image URL: `atendai/evolution-api:latest`
5. **Name:** `postocash-evolution`
6. **Region:** mesma do backend (`Oregon` ou `Frankfurt`)
7. **Instance Type:** Starter ($7/mês) — suficiente para até 3 instâncias WhatsApp
8. **Port:** `8080`

---

## Passo 2 — Variáveis de ambiente no Render

Adicione exatamente estas variáveis em **Environment → Add Environment Variable**:

| Variável | Valor |
|---|---|
| `SERVER_URL` | `https://postocash-evolution.onrender.com` |
| `AUTHENTICATION_API_KEY` | `postocash-evo-2026` |
| `DATABASE_ENABLED` | `true` |
| `DATABASE_PROVIDER` | `postgresql` |
| `DATABASE_CONNECTION_URI` | *(sua DATABASE_URL do Supabase)* |
| `DATABASE_CONNECTION_CLIENT_NAME` | `postocash_evolution` |
| `QRCODE_LIMIT` | `30` |
| `DEL_INSTANCE` | `false` |
| `LOG_LEVEL` | `ERROR` |
| `CONFIG_SESSION_PHONE_CLIENT` | `PostoCash` |
| `CONFIG_SESSION_PHONE_NAME` | `Chrome` |

> **Atenção:** `DATABASE_CONNECTION_URI` deve ser a mesma string
> `postgresql://...` do Supabase que o backend usa.

---

## Passo 3 — Deploy e aguardar inicialização

- Clique em **Create Web Service**
- Aguarde o build (3–5 min na primeira vez)
- A URL ficará: `https://postocash-evolution.onrender.com`
- Confirme que está online: `GET https://postocash-evolution.onrender.com` deve retornar `{"status":"online"}`

---

## Passo 4 — Criar instância WhatsApp

Use o Swagger UI em `https://postocash-evolution.onrender.com/manager`
ou faça as chamadas diretamente:

### 4.1 Criar instância

```http
POST https://postocash-evolution.onrender.com/instance/create
apikey: postocash-evo-2026
Content-Type: application/json

{
  "instanceName": "postocash",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS"
}
```

### 4.2 Obter QR Code

```http
GET https://postocash-evolution.onrender.com/instance/connect/postocash
apikey: postocash-evo-2026
```

A resposta inclui `base64` com a imagem do QR Code.

### 4.3 Escanear com WhatsApp Business

1. Abra o **WhatsApp Business** no celular do posto
2. Vá em **Configurações → Aparelhos conectados → Conectar aparelho**
3. Escaneie o QR Code
4. Aguarde a confirmação (estado `open`)

### 4.4 Verificar conexão

```http
GET https://postocash-evolution.onrender.com/instance/fetchInstances
apikey: postocash-evo-2026
```

O campo `connectionStatus` deve ser `"open"`.

---

## Passo 5 — Configurar variáveis no backend (Render)

No serviço `postocash-api`, adicione/atualize:

```
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=https://postocash-evolution.onrender.com
EVOLUTION_API_KEY=postocash-evo-2026
EVOLUTION_INSTANCE=postocash
```

Isso faz o backend usar Evolution em vez de Z-API automaticamente.

---

## Passo 6 — Testar envio

```http
POST https://postocash-api.onrender.com/campaigns/preview
Authorization: Bearer {seu_token}
Content-Type: application/json

{
  "filterType": "ACTIVE",
  "filterPeriod": "ONE_MONTH",
  "rewardType": "FIXED",
  "rewardValue": 5.00,
  "message": "Teste Evolution API"
}
```

---

## Troubleshooting

| Problema | Solução |
|---|---|
| QR Code expirado | `DELETE /instance/postocash` e recrie |
| Estado `close` após escaneio | Verifique `DATABASE_CONNECTION_URI` |
| Erro 401 | Confirme `AUTHENTICATION_API_KEY` no header `apikey` |
| Mensagens não enviadas | Verifique se `WHATSAPP_PROVIDER=evolution` no backend |
| Render cold start | A instância "dorme" após 15 min de inatividade no plano free — use Starter |

---

## Manutenção

- **Logout do WhatsApp:** `DELETE /instance/logout/postocash`
- **Reconectar:** `GET /instance/connect/postocash`
- **Restart da instância:** `PUT /instance/restart/postocash`
- **Logs no Render:** Dashboard → postocash-evolution → Logs
