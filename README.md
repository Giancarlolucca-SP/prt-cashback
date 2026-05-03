# PRT — Sistema de Cashback para Postos

MVP de sistema de cashback standalone para postos de combustível.

---

## Stack

- **Node.js** (Express)
- **PostgreSQL** + **Prisma ORM**
- **JWT** para autenticação
- Validação de CPF brasileiro
- Formatação em BRL (R$)
- Cupons em texto ESC/POS

---

## Pré-requisitos

- Node.js >= 18
- PostgreSQL rodando localmente (ou via Docker)

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

Edite `.env` com sua string de conexão PostgreSQL:

```env
DATABASE_URL="postgresql://postgres:suasenha@localhost:5432/prt_cashback"
JWT_SECRET="chave_secreta_forte_aqui"
STATION_NAME="Posto XYZ"
```

### 3. Criar o banco e aplicar migrations

```bash
npm run db:generate
npm run db:migrate
```

### 4. Popular com dados de teste (seed)

```bash
npm run db:seed
```

### 5. Iniciar o servidor

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

O servidor sobe em `http://localhost:3000`.

---

## Credenciais do seed

| Perfil   | E-mail                 | Senha        |
|----------|------------------------|--------------|
| Admin    | admin@posto.com        | admin123     |
| Operador | operador@posto.com     | operador123  |

| Cliente      | CPF             | Saldo     |
|-------------|-----------------|-----------|
| João Silva  | 529.982.247-25  | R$ 25,00  |
| Maria Souza | 877.482.488-00  | R$ 0,00   |

---

## Regras de negócio configuráveis (via .env)

| Variável                     | Padrão  | Descrição                          |
|------------------------------|---------|------------------------------------|
| `MIN_REDEMPTION_AMOUNT`      | 10.00   | Valor mínimo para resgatar         |
| `MAX_DAILY_REDEMPTION`       | 500.00  | Limite diário de resgate por cliente |
| `REDEMPTION_COOLDOWN_MINUTES`| 5       | Minutos entre resgates (antifraude)|

---

## Endpoints da API

### Autenticação

#### `POST /auth/login`
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"operador@posto.com","password":"operador123"}'
```

**Resposta:**
```json
{
  "mensagem": "Login realizado com sucesso.",
  "token": "eyJhbGciOi...",
  "operador": { "id": "...", "nome": "Carlos Operador", "perfil": "OPERATOR" }
}
```

---

### Clientes

> Todos os endpoints abaixo exigem o header:
> `Authorization: Bearer <token>`

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

### Transações (Acúmulo de cashback)

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
  },
  "cupom": "========================================\n          POSTO XYZ\n    COMPROVANTE DE CASHBACK\n..."
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
  },
  "cupom": "..."
}
```

**Erros possíveis:**
- `400` — Saldo insuficiente
- `400` — Valor abaixo do mínimo (R$ 10,00)
- `400` — Limite diário atingido
- `429` — Cooldown ativo (resgates muito frequentes)

#### `GET /redeem/:cpf` — Histórico de resgates
```bash
curl http://localhost:3000/redeem/52998224725 \
  -H "Authorization: Bearer TOKEN"
```

---

### Dashboard (somente admin)

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

## Estrutura do projeto

```
/
├── prisma/
│   ├── schema.prisma       # Modelos do banco de dados
│   └── seed.js             # Dados iniciais
├── src/
│   ├── controllers/        # Recebem req/res e delegam para services
│   ├── services/           # Lógica de negócio
│   ├── routes/             # Definição dos endpoints
│   ├── middlewares/        # Auth, rate limit, error handler
│   ├── utils/              # CPF, moeda, data, código de cupom
│   ├── app.js              # Express app
│   └── server.js           # Entry point
├── .env.example
└── package.json
```

---

## Antifraude implementado

| Proteção                    | Descrição                                        |
|-----------------------------|--------------------------------------------------|
| Cooldown entre resgates     | Configurável via `REDEMPTION_COOLDOWN_MINUTES`   |
| Limite diário por cliente   | Configurável via `MAX_DAILY_REDEMPTION`          |
| Valor mínimo de resgate     | Configurável via `MIN_REDEMPTION_AMOUNT`         |
| Saldo nunca negativo        | Verificação + rollback atômico via Prisma        |
| Código único por operação   | `TXN-XXXXXXXX` e `RSG-XXXXXXXX` por operação    |
| Log de auditoria completo   | Toda ação registrada na tabela `AuditLog`        |
| Rate limit no resgate       | 10 resgates/minuto por IP (ajustável)            |
| JWT com expiração           | Tokens expiram em 8h por padrão                  |
