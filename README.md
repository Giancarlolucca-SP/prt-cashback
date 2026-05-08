# PostoCash — Sistema de Cashback para Postos de Combustível

MVP multi-tenant de cashback para postos de combustível, com app mobile, painel administrativo, campanhas WhatsApp e assinaturas Stripe.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express (porta 3000) |
| Frontend/Admin | React + Vite (porta 5173) |
| Mobile | React Native + Expo |
| Banco de dados | PostgreSQL via Supabase |
| Storage | Supabase Storage (logos, selfies) |
| Pagamentos | Stripe (assinaturas recorrentes) |
| WhatsApp | Z-API (campanhas) |
| Landing page | HTML estático |

---

## Arquitetura

```
/
├── src/                    # Backend Node.js + Express
│   ├── controllers/        # Recebem req/res e delegam para services
│   ├── services/           # Lógica de negócio
│   ├── routes/             # Definição dos endpoints
│   ├── middlewares/        # Auth, rate limit, error handler
│   ├── workers/            # Fila de mensagens WhatsApp
│   ├── app.js              # Express app
│   └── server.js           # Entry point
├── frontend/               # Painel admin React + Vite
│   └── src/
│       ├── pages/          # Dashboard, ConfiguracoesPosto, etc.
│       └── services/       # API client
├── mobile/                 # App React Native + Expo
│   ├── app/
│   │   ├── (auth)/         # Login, registro, boas-vindas
│   │   └── (tabs)/         # Home, validar, configurações
│   └── src/
│       ├── context/        # AppConfigContext (branding)
│       └── hooks/          # useBranding
├── landing/                # Landing page HTML estático
├── prisma/
│   ├── schema.prisma       # Modelos do banco de dados
│   └── seed-demo.js        # Dados de demonstração
├── render.yaml             # Deploy Render (backend)
├── DEPLOY.md               # Guia completo de deploy
└── package.json
```

---

## Módulos

| Módulo | Descrição |
|--------|-----------|
| Multi-tenant | Múltiplos estabelecimentos com branding próprio |
| Clientes | Cadastro por CPF, biometria facial |
| Transações | Cashback via QR Code NF-e + validação por foto |
| Resgates | Controle de saldo, limites diários, cooldown |
| Campanhas | Envio WhatsApp em massa via fila (Z-API) |
| Antifraude | Blacklist, limites, geolocalização |
| Relatórios | Exportação PDF + Excel |
| Assinaturas | Planos recorrentes via Stripe |

---

## Pré-requisitos

- Node.js >= 18
- Conta Supabase (banco + storage)
- Variáveis de ambiente configuradas (ver `.env.example`)

---

## Como rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas credenciais:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="chave_secreta_forte_aqui"
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_SERVICE_KEY="sua_service_key"
SUPABASE_ANON_KEY="sua_anon_key"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_PRICE_ID="price_..."
ZAPI_INSTANCE_ID="seu_instance_id"
ZAPI_TOKEN="seu_token"
```

### 3. Gerar client Prisma e aplicar schema

```bash
npx prisma generate
npx prisma db push
```

### 4. Popular com dados de demonstração

```bash
node prisma/seed-demo.js
```

### 5. Iniciar o servidor

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

Backend disponível em `http://localhost:3000`.

### 6. Iniciar o frontend admin

```bash
cd frontend
npm install
npm run dev
```

Painel disponível em `http://localhost:5173`.

### 7. Iniciar o app mobile

```bash
cd mobile
npm install
npx expo start --tunnel
```

---

## Credenciais de teste (seed)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin posto (Dilma) | admin@autoposto.com | Admin@1234 |
| Admin geral | admin@posto.com | admin123 |

| Cliente | CPF | Saldo |
|---------|-----|-------|
| João Silva | 529.982.247-25 | R$ 25,00 |
| Maria Souza | 877.482.488-00 | R$ 0,00 |

---

## Endpoints da API

> Todos os endpoints protegidos exigem o header:
> `Authorization: Bearer <token>`

### Autenticação

#### `POST /auth/login`
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@autoposto.com","password":"Admin@1234"}'
```

**Resposta:**
```json
{
  "mensagem": "Login realizado com sucesso.",
  "token": "eyJhbGciOi...",
  "operador": { "id": "...", "nome": "Dilma Admin", "perfil": "ADMIN" }
}
```

---

### App Mobile

#### `POST /app/register` — Cadastro de cliente via app
```bash
curl -X POST http://localhost:3000/app/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Lima","cpf":"529.982.247-25","phone":"11999990003","establishmentId":"uuid-do-posto"}'
```

#### `POST /app/validate-nfce` — Validar QR Code NF-e para gerar cashback
```bash
curl -X POST http://localhost:3000/app/validate-nfce \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"qrCodeData":"...","cpf":"52998224725"}'
```

#### `POST /app/validate-photo` — Validar abastecimento por foto
```bash
curl -X POST http://localhost:3000/app/validate-photo \
  -H "Authorization: Bearer TOKEN" \
  -F "photo=@/caminho/para/foto.jpg" \
  -F "cpf=52998224725"
```

---

### Clientes

#### `POST /customers` — Criar ou localizar cliente por CPF
```bash
curl -X POST http://localhost:3000/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Ana Lima","cpf":"529.982.247-25","phone":"11999990003"}'
```

**Resposta (cliente existente):**
```json
{
  "mensagem": "Cliente localizado com sucesso.",
  "cliente": {
    "nome": "João Silva",
    "cpf": "529.982.247-25",
    "saldo": "R$ 25,00"
  }
}
```

#### `GET /customers/:cpf` — Consultar saldo e histórico
```bash
curl http://localhost:3000/customers/52998224725 \
  -H "Authorization: Bearer TOKEN"
```

#### `GET /customers?page=1&limit=20` — Listar todos (admin)
```bash
curl http://localhost:3000/customers \
  -H "Authorization: Bearer TOKEN"
```

---

### Transações

#### `POST /transactions` — Registrar abastecimento e gerar cashback
```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"cpf":"52998224725","amount":200.00,"cashbackPercent":5}'
```

**Resposta:**
```json
{
  "mensagem": "Cashback gerado com sucesso.",
  "transacao": {
    "codigoCupom": "TXN-A3F9B2C1",
    "valorAbastecimento": "R$ 200,00",
    "percentualCashback": "5%",
    "cashbackGerado": "R$ 10,00",
    "novoSaldo": "R$ 35,00",
    "data": "14/04/2026 10:30"
  }
}
```

#### `GET /transactions/:cpf` — Histórico de transações
```bash
curl http://localhost:3000/transactions/52998224725 \
  -H "Authorization: Bearer TOKEN"
```

---

### Resgates

#### `POST /redeem` — Resgatar cashback
```bash
curl -X POST http://localhost:3000/redeem \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"cpf":"52998224725","amount":15.00}'
```

**Resposta:**
```json
{
  "mensagem": "Resgate realizado com sucesso.",
  "resgate": {
    "codigoCupom": "RSG-9D4E2F10",
    "valorResgatado": "R$ 15,00",
    "saldoAnterior": "R$ 35,00",
    "novoSaldo": "R$ 20,00",
    "data": "14/04/2026 10:35"
  }
}
```

**Erros possíveis:**
- `400` — Saldo insuficiente
- `400` — Valor abaixo do mínimo (R$ 10,00)
- `400` — Limite diário atingido
- `429` — Cooldown ativo (resgates muito frequentes)

---

### Campanhas WhatsApp

#### `POST /campaigns` — Criar campanha
```bash
curl -X POST http://localhost:3000/campaigns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Promoção Junho","message":"Olá {nome}, ganhe 10% de cashback hoje!","targetAudience":"ALL"}'
```

#### `GET /campaigns` — Listar campanhas
```bash
curl http://localhost:3000/campaigns \
  -H "Authorization: Bearer TOKEN"
```

---

### Relatórios

#### `GET /reports/export/pdf` — Exportar relatório em PDF
```bash
curl http://localhost:3000/reports/export/pdf \
  -H "Authorization: Bearer TOKEN" \
  --output relatorio.pdf
```

#### `GET /reports/export/excel` — Exportar relatório em Excel
```bash
curl http://localhost:3000/reports/export/excel \
  -H "Authorization: Bearer TOKEN" \
  --output relatorio.xlsx
```

---

### Assinaturas Stripe

#### `POST /stripe/confirm-subscription` — Confirmar assinatura
```bash
curl -X POST http://localhost:3000/stripe/confirm-subscription \
  -H "Content-Type: application/json" \
  -d '{"paymentMethodId":"pm_...","establishmentData":{...}}'
```

#### `POST /stripe/activate` — Ativar estabelecimento após pagamento
```bash
curl -X POST http://localhost:3000/stripe/activate \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"sub_..."}'
```

---

### Dashboard

#### `GET /dashboard`
```bash
curl http://localhost:3000/dashboard \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

**Resposta:**
```json
{
  "resumo": {
    "totalClientes": 2,
    "totalTransacoes": 5,
    "cashbackGeradoTotal": "R$ 120,00",
    "cashbackResgatadoTotal": "R$ 45,00",
    "saldoEmCirculacao": "R$ 75,00"
  },
  "rankingClientes": [
    { "posicao": 1, "nome": "João Silva", "saldo": "R$ 75,00" }
  ]
}
```

---

### Health Check

```bash
curl http://localhost:3000/health
```

---

## Build do App Mobile

```bash
cd mobile

# Preview (APK para testes)
npx eas-cli build --platform android --profile preview

# Produção (AAB para Google Play)
npx eas-cli build --platform android --profile production
```

---

## Antifraude implementado

| Proteção | Descrição |
|----------|-----------|
| Cooldown entre resgates | Configurável via `REDEMPTION_COOLDOWN_MINUTES` |
| Limite diário por cliente | Configurável via `MAX_DAILY_REDEMPTION` |
| Valor mínimo de resgate | Configurável via `MIN_REDEMPTION_AMOUNT` |
| Saldo nunca negativo | Verificação + rollback atômico via Prisma |
| Código único por operação | `TXN-XXXXXXXX` e `RSG-XXXXXXXX` por operação |
| Log de auditoria completo | Toda ação registrada na tabela `AuditLog` |
| Rate limit no resgate | 10 resgates/minuto por IP (ajustável) |
| JWT com expiração | Tokens expiram em 8h por padrão |
| Blacklist de clientes | Bloqueio manual por CPF |
| Validação geolocalização | Verificação de proximidade ao posto |

---

## Deploy

Consulte o [DEPLOY.md](./DEPLOY.md) para o guia completo de deploy em produção (Render + Vercel + Google Play).
