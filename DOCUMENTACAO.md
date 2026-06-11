# PostoCash — Documentação Técnica Completa

> Versão: 2.0 | Atualizado: Maio 2026 | Autor: Giancarlo Velden

---

## Índice

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Stack Técnica Detalhada](#3-stack-técnica-detalhada)
4. [Estrutura de Pastas](#4-estrutura-de-pastas)
5. [Banco de Dados](#5-banco-de-dados)
6. [APIs e Endpoints](#6-apis-e-endpoints)
7. [Autenticação e Segurança](#7-autenticação-e-segurança)
8. [Módulos do Sistema](#8-módulos-do-sistema)
9. [Deploy e Infraestrutura](#9-deploy-e-infraestrutura)
10. [Credenciais e Acessos](#10-credenciais-e-acessos)
11. [Pendências e Roadmap](#11-pendências-e-roadmap)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Visão Geral do Projeto

### O que é o PostoCash

PostoCash é uma plataforma SaaS de fidelização por cashback voltada para postos de combustível. Permite que estabelecimentos ofereçam recompensas em dinheiro real para clientes que abastecem, criando um programa de fidelidade digital completo e automatizado.

O cliente final (motorista) instala o app mobile, faz o cadastro com CPF e biometria facial, e a cada abastecimento recebe um percentual de cashback em sua carteira digital. O saldo acumulado pode ser resgatado diretamente no posto.

### Modelo de Negócio

- **Modelo:** SaaS B2B (Software as a Service para Pessoas Jurídicas)
- **Clientes pagantes:** Postos de combustível (estabelecimentos)
- **Usuários finais:** Motoristas (gratuito)
- **Preço:** R$ 200,00/mês por unidade (posto)
- **Cobrança:** Recorrente mensal via Stripe
- **Onboarding:** Self-service via landing page + Stripe Checkout

### Público-Alvo

| Segmento | Perfil |
|----------|--------|
| **Estabelecimentos** | Postos de combustível independentes ou redes pequenas/médias |
| **Gestores** | Donos e administradores de posto (ADMIN) |
| **Atendentes** | Funcionários no caixa que registram abastecimentos (OPERATOR) |
| **Motoristas** | Clientes finais do posto (usuários do app mobile) |
| **SuperAdmin** | Equipe PostoCash (gestão da plataforma SaaS) |

### Proposta de Valor

- Para o **posto:** Aumenta retenção de clientes, diferencia da concorrência e gera dados de comportamento de consumo
- Para o **motorista:** Cashback real, acumulado e resgatável no mesmo posto
- Para a **PostoCash:** Receita recorrente SaaS com baixo custo de operação

---

## 2. Arquitetura do Sistema

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTES                                  │
│   [App Mobile]    [Portal Admin]    [Landing Page]              │
│   React Native     React + Vite      HTML Estático              │
│   Expo SDK 54     TailwindCSS                                   │
└──────────┬───────────────┬──────────────────┬───────────────────┘
           │               │                  │
           ▼               ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API BACKEND                                  │
│              Node.js + Express (Render)                         │
│         15 grupos de rotas | 28 services | 5 middlewares        │
└──────┬──────────┬───────────┬──────────┬──────────┬────────────┘
       │          │           │          │          │
       ▼          ▼           ▼          ▼          ▼
  [Supabase]  [Stripe]  [Evolution]  [Resend]  [AWS Rekognition]
  PostgreSQL  Pagamentos   API WA     E-mail    Face Comparison
  + Storage              WhatsApp
```

### Fluxo de Dados — Abastecimento com Cashback

```
Motorista abre app
    │
    ├─► Escaneia QR Code do posto
    │       │
    │       └─► GET /app/establishment/:id/qrcode-data
    │               └─► Retorna branding + configurações
    │
    ├─► Valida NF-e (opcional)
    │       │
    │       └─► POST /app/validate-nfce
    │               └─► SEFAZ SP → parsing HTML → extrai valor
    │
    ├─► Atendente registra abastecimento no portal
    │       │
    │       └─► POST /transactions
    │               ├─► Verifica limite de fraude
    │               ├─► Calcula cashback (% ou centavos/litro)
    │               ├─► Atualiza saldo do cliente
    │               └─► Retorna recibo + QR Code
    │
    └─► Cliente vê saldo atualizado no app
            └─► GET /app/balance
```

### Fluxo de Dados — Resgate de Cashback

```
Cliente solicita resgate no app
    │
    └─► POST /app/redeem/generate
            ├─► Verifica saldo mínimo (R$ 10,00)
            ├─► Verifica cooldown (5 min entre resgates)
            ├─► Gera QR Code temporário com código único
            └─► Retorna QR Code
                    │
                    └─► Atendente escaneia no portal
                            │
                            └─► POST /redeem
                                    ├─► Valida código QR
                                    ├─► Debita saldo do cliente
                                    └─► Registra Redemption
```

### Fluxo de Dados — Pagamento SaaS (Stripe)

```
Posto acessa landing page
    │
    └─► POST /stripe/create-checkout-session
            │
            └─► Stripe Checkout → dados de cartão
                    │
                    └─► POST /stripe/webhook (evento: payment_intent.succeeded)
                            ├─► Cria registro Establishment no banco
                            ├─► Cria Operator (ADMIN) com senha provisória
                            ├─► Envia e-mail de boas-vindas (Resend)
                            └─► Retorna URL do portal admin
```

### Multi-Tenancy

O sistema é **multi-tenant por isolamento de dados via `establishmentId`**:

- Cada `Establishment` tem UUID único gerado pelo Prisma
- Todos os recursos (clientes, transações, campanhas, configurações) são vinculados ao `establishmentId`
- O `Operator` carrega o `establishmentId` no JWT — cada requisição filtra dados pelo tenant automaticamente
- Não há compartilhamento de dados entre estabelecimentos
- O SUPERADMIN pode visualizar dados de todos os estabelecimentos

---

## 3. Stack Técnica Detalhada

### Backend — Node.js + Express

| Pacote | Versão | Finalidade |
|--------|--------|-----------|
| `express` | ^4.18.2 | Framework web HTTP |
| `@prisma/client` | ^5.7.0 | ORM para PostgreSQL |
| `jsonwebtoken` | ^9.0.2 | Geração e validação de JWT |
| `bcryptjs` | ^2.4.3 | Hash de senhas (salt rounds: 10) |
| `cors` | ^2.8.6 | Política de CORS |
| `helmet` | ^8.1.0 | Headers de segurança HTTP |
| `express-rate-limit` | ^7.1.5 | Rate limiting por IP |
| `multer` | ^2.1.1 | Upload de arquivos (multipart/form-data) |
| `node-cron` | ^4.2.1 | Jobs agendados (cron syntax) |
| `stripe` | ^22.1.1 | SDK pagamentos Stripe |
| `resend` | ^6.12.3 | API de envio de e-mail transacional |
| `nodemailer` | ^8.0.7 | SMTP fallback de e-mail |
| `tesseract.js` | ^7.0.0 | OCR para leitura de cupons fiscais |
| `axios` | ^1.15.2 | Cliente HTTP (SEFAZ, Evolution API) |
| `@supabase/supabase-js` | ^2.103.3 | Storage (selfies, logos) |
| `@aws-sdk/client-rekognition` | ^3.1032.0 | Comparação facial AWS |
| `google-auth-library` | ^10.6.2 | Verificação de tokens Google OAuth |
| `qrcode` | ^1.5.4 | Geração de QR Code PNG |
| `pdfkit` | ^0.18.0 | Geração de relatórios PDF |
| `exceljs` | ^4.4.0 | Geração de planilhas Excel |
| `sharp` | ^0.34.5 | Redimensionamento e compressão de imagens |
| `xml2js` | ^0.6.2 | Parsing de XML (resposta SEFAZ) |
| `dotenv` | ^16.3.1 | Carregamento de variáveis de ambiente |

### Frontend — Portal Admin

| Pacote | Versão | Finalidade |
|--------|--------|-----------|
| `react` | ^18 | UI framework |
| `react-dom` | ^18 | Renderização DOM |
| `vite` | ^5 | Build tool e dev server |
| `react-router-dom` | ^6 | Roteamento SPA |
| `tailwindcss` | ^3 | Utilitários CSS |
| `axios` | ^1.15.2 | Requisições HTTP ao backend |
| `recharts` | ^2 | Gráficos de dashboard |
| `@phosphor-icons/react` | ^2 | Biblioteca de ícones |
| `@react-oauth/google` | ^0.12 | Google OAuth Button |

### Mobile — React Native + Expo

| Pacote | Versão | Finalidade |
|--------|--------|-----------|
| `expo` | SDK 54 | Plataforma React Native |
| `expo-router` | ^4 | Navegação baseada em arquivos |
| `expo-camera` | ^15 | Câmera para QR scan e selfie |
| `expo-local-authentication` | ^14 | Biometria (Face ID / impressão digital) |
| `expo-location` | ^17 | GPS do dispositivo |
| `expo-notifications` | ^0.29 | Push notifications |
| `expo-secure-store` | ^13 | Armazenamento seguro de tokens |
| `@tanstack/react-query` | ^5 | Cache e sincronização de dados |
| `zustand` | ^4 | Gerenciamento de estado global |
| `@react-native-async-storage` | ^1 | Storage assíncrono |
| `react-native-qrcode-svg` | ^6 | Renderização de QR Codes |
| `axios` | ^1 | Requisições HTTP |

### Infraestrutura

| Serviço | Plano | Finalidade |
|---------|-------|-----------|
| **Render** | Free/Paid | Hospedagem do backend Node.js |
| **Vercel** | Free | Hospedagem do frontend React + landing |
| **Supabase** | Free | PostgreSQL + Storage (selfies, logos) |
| **Cloudflare** | Free | DNS + CDN + proteção DDoS |
| **Evolution API** | Self-hosted (Render) | WhatsApp Baileys multi-instância |
| **Resend** | Free | E-mails transacionais (boas-vindas, etc.) |
| **Stripe** | Pay-per-use | Cobranças recorrentes dos postos |
| **AWS Rekognition** | Pay-per-use | Comparação facial anti-fraude |

---

## 4. Estrutura de Pastas

```
meu-projeto/
│
├── src/                              # Backend Node.js + Express
│   │
│   ├── controllers/                  # Handlers HTTP (entrada e saída)
│   │   ├── appController.js          # Endpoints do app mobile
│   │   ├── authController.js         # Login, Google/Facebook OAuth
│   │   ├── adminPhotoController.js   # Validação manual de fotos
│   │   ├── campaignController.js     # Criação e gestão de campanhas
│   │   ├── cashbackSettingsController.js  # Regras de cashback
│   │   ├── customerController.js     # Gestão de clientes/motoristas
│   │   ├── dashboardController.js    # Métricas e KPIs
│   │   ├── establishmentController.js # Gestão de estabelecimentos
│   │   ├── fraudController.js        # Antifraude e blacklist
│   │   ├── rankingController.js      # Ranking de clientes
│   │   ├── redemptionController.js   # Resgates de cashback
│   │   ├── reportController.js       # PDF e Excel
│   │   ├── saasController.js         # Métricas SaaS (SUPERADMIN)
│   │   ├── stripeController.js       # Pagamentos e assinaturas
│   │   └── transactionController.js  # Transações de abastecimento
│   │
│   ├── services/                     # Lógica de negócio
│   │   ├── appService.js             # Fluxos do app mobile
│   │   ├── auditService.js           # Registro de logs de auditoria
│   │   ├── authService.js            # JWT, bcrypt, OAuth validation
│   │   ├── campaignService.js        # Filtros de clientes, envio em massa
│   │   ├── cashbackSettingsService.js # Cálculo de cashback
│   │   ├── customerService.js        # CRUD clientes + CPF lookup
│   │   ├── dashboardService.js       # Queries de métricas
│   │   ├── emailService.js           # Envio de e-mail via Resend
│   │   ├── establishmentService.js   # CRUD estabelecimentos
│   │   ├── faceService.js            # AWS Rekognition face comparison
│   │   ├── fraudAlertService.js      # Criação de alertas de fraude
│   │   ├── fraudService.js           # Regras e limites antifraude
│   │   ├── messageQueueService.js    # Enfileiramento de mensagens WA
│   │   ├── nfceService.js            # Validação NF-e SEFAZ SP
│   │   ├── notificationService.js    # Push notifications Expo
│   │   ├── otpService.js             # Geração e validação OTP
│   │   ├── pendingRedemptions.js     # Resgates pendentes
│   │   ├── photoValidationService.js # Validação de fotos de cupom
│   │   ├── rankingService.js         # Cálculo de ranking
│   │   ├── receiptService.js         # Geração de recibos
│   │   ├── redemptionService.js      # Lógica de resgate de saldo
│   │   ├── reportService.js          # Geração PDF/Excel
│   │   ├── saasService.js            # Métricas e gestão SaaS
│   │   ├── schedulerService.js       # Configuração de cron jobs
│   │   ├── selfieService.js          # Upload/delete selfies Supabase
│   │   ├── stripeService.js          # Stripe API wrapper
│   │   ├── transactionService.js     # Lógica de transações
│   │   └── whatsappService.js        # Evolution API / Z-API sender
│   │
│   ├── routes/                       # Definição de rotas Express
│   │   ├── adminPhotoRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── appRoutes.js
│   │   ├── authRoutes.js
│   │   ├── campaignRoutes.js
│   │   ├── cashbackSettingsRoutes.js
│   │   ├── customerRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── establishmentRoutes.js
│   │   ├── fraudRoutes.js
│   │   ├── rankingRoutes.js
│   │   ├── redemptionRoutes.js
│   │   ├── reportRoutes.js
│   │   ├── stripeRoutes.js
│   │   └── transactionRoutes.js
│   │
│   ├── middlewares/                  # Middlewares Express
│   │   ├── authMiddleware.js         # Verificação JWT
│   │   ├── deviceMiddleware.js       # Fingerprint de dispositivo
│   │   ├── errorMiddleware.js        # Handler global de erros
│   │   ├── rateLimitMiddleware.js    # Rate limiting por IP
│   │   └── uploadMiddleware.js       # Multer (imagens)
│   │
│   ├── workers/
│   │   └── messageWorker.js          # Worker WhatsApp (3-6s delay)
│   │
│   ├── utils/
│   │   ├── cpfValidator.js           # Validação e formatação de CPF
│   │   ├── currencyFormatter.js      # Formatação BRL
│   │   ├── dateFormatter.js          # Datas em pt-BR
│   │   ├── receiptCode.js            # Geração de código de recibo
│   │   └── scheduler.js              # Setup dos cron jobs
│   │
│   ├── uploads/                      # Arquivos temporários (multer)
│   ├── logos/                        # Logos dos estabelecimentos
│   ├── scripts/                      # Scripts utilitários de banco
│   ├── app.js                        # Configuração Express (middlewares, rotas)
│   └── server.js                     # Ponto de entrada (listen + crons)
│
├── frontend/                         # Portal Admin React
│   ├── src/
│   │   ├── pages/                    # 18 páginas do dashboard
│   │   ├── components/               # Componentes reutilizáveis
│   │   │   ├── EstablishmentQRCode.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── SuperAdminRoute.jsx
│   │   │   └── ui/
│   │   ├── context/                  # Contextos React (auth, config)
│   │   ├── services/                 # Clientes de API (axios)
│   │   └── utils/                    # Utilitários frontend
│   ├── public/
│   └── package.json
│
├── mobile/                           # App React Native
│   ├── app/                          # Expo Router (file-based routing)
│   │   ├── (auth)/                   # Login, cadastro, recuperação
│   │   ├── (onboarding)/             # Tutorial inicial
│   │   └── (tabs)/                   # Telas principais com abas
│   ├── src/
│   │   ├── api/                      # Clientes HTTP do app
│   │   ├── components/               # Componentes React Native
│   │   ├── context/                  # AppConfigContext (branding)
│   │   ├── hooks/                    # useBranding, etc.
│   │   ├── store/                    # Zustand stores
│   │   └── utils/                    # Helpers mobile
│   ├── assets/                       # Ícones e imagens
│   ├── config/                       # Configurações de build
│   ├── app.json                      # Configuração Expo
│   └── package.json
│
├── landing/                          # Landing page marketing
│   ├── acessibilidade/
│   ├── assets/
│   └── design/
│
├── prisma/                           # ORM e banco de dados
│   ├── schema.prisma                 # 13 modelos + enums
│   ├── seed.js                       # Dados de demonstração
│   └── migrations/                   # Histórico de migrações
│
├── logos/                            # Assets da marca PostoCash
├── scripts/                          # Scripts utilitários
├── printtelas/                       # Screenshots para documentação
├── .env                              # Variáveis de ambiente (dev)
├── .env.example                      # Template de variáveis
├── .env.production                   # Template produção
├── .gitignore
├── package.json                      # Dependências backend
├── package-lock.json
├── README.md
├── DEPLOY.md                         # Guia de deploy
├── EVOLUTION_DEPLOY.md               # Setup Evolution API WhatsApp
└── render.yaml                       # Config de deploy no Render
```

---

## 5. Banco de Dados

### Visão Geral

- **Provedor:** PostgreSQL via Supabase
- **ORM:** Prisma v5
- **Schema:** `prisma/schema.prisma`
- **Modelos:** 13 tabelas + enums
- **Connection pooling:** Via `DIRECT_URL` (Supabase pooler)

### Modelos e Relacionamentos

#### Establishment (Estabelecimento / Tenant)

```prisma
model Establishment {
  id                    String    @id @default(cuid())
  name                  String                          // Nome do posto
  cnpj                  String?   @unique               // CNPJ
  phone                 String?                         // Telefone do posto
  address               String?                         // Endereço completo
  latitude              Float?                          // Coordenada GPS
  longitude             Float?                          // Coordenada GPS
  logoUrl               String?                         // URL logo (Supabase)
  primaryColor          String?   @default("#FF6B00")   // Cor primária (branding)
  secondaryColor        String?   @default("#1A1A2E")   // Cor secundária (branding)
  cashbackPercent       Float     @default(2.0)         // % cashback padrão
  stripeCustomerId      String?                         // ID cliente Stripe
  stripeSubscriptionId  String?                         // ID assinatura Stripe
  subscriptionStatus    String?   @default("ACTIVE")    // Status da assinatura
  subscriptionEndsAt    DateTime?                       // Data de vencimento
  active                Boolean   @default(true)        // Ativo/inativo
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  // Relacionamentos
  operators             Operator[]
  customers             Customer[]
  transactions          Transaction[]
  redemptions           Redemption[]
  campaigns             Campaign[]
  cashbackSettings      CashbackSettings?
  fraudSettings         FraudSettings?
  messageQueue          MessageQueue[]
}
```

#### Customer (Cliente / Motorista)

```prisma
model Customer {
  id               String    @id @default(cuid())
  name             String
  cpf              String                          // CPF (único por establishment)
  phone            String?
  balance          Float     @default(0)           // Saldo cashback em R$
  deviceId         String?                         // Fingerprint do celular
  selfieUrl        String?                         // URL selfie (Supabase)
  selfieKey        String?                         // Chave no storage
  rekognitionId    String?                         // Face ID AWS Rekognition
  pushToken        String?                         // Token Expo push
  latitude         Float?                          // Última localização
  longitude        Float?                          // Última localização
  establishmentId  String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  establishment    Establishment  @relation(fields: [establishmentId], ...)
  transactions     Transaction[]
  redemptions      Redemption[]
  fraudAlerts      FraudAlert[]

  @@unique([cpf, establishmentId])                // CPF único por posto
}
```

#### Operator (Operador / Atendente)

```prisma
model Operator {
  id               String   @id @default(cuid())
  name             String
  email            String   @unique
  password         String                   // bcrypt hash
  role             Role     @default(OPERATOR)
  active           Boolean  @default(true)
  establishmentId  String?                  // null = SUPERADMIN
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  establishment    Establishment?  @relation(...)
  transactions     Transaction[]
  redemptions      Redemption[]
  campaigns        Campaign[]
  blacklistedCpfs  BlacklistedCpf[]
}
```

#### Transaction (Abastecimento)

```prisma
model Transaction {
  id               String   @id @default(cuid())
  amount           Float                    // Valor total abastecido (R$)
  liters           Float?                   // Litros abastecidos
  fuelType         String?                  // Tipo combustível
  cashbackPercent  Float                    // % aplicado
  cashbackValue    Float                    // Valor cashback (R$)
  receiptCode      String?  @unique         // Código único do recibo
  qrCodeUrl        String?                  // QR Code gerado (PNG)
  photoUrl         String?                  // Foto do cupom fiscal
  status           String   @default("APPROVED")
  validatedAt      DateTime?
  metadata         Json?                    // Dados adicionais (NF-e, etc.)
  customerId       String
  operatorId       String
  establishmentId  String
  createdAt        DateTime @default(now())

  customer         Customer      @relation(...)
  operator         Operator      @relation(...)
  establishment    Establishment @relation(...)
}
```

#### Redemption (Resgate de Saldo)

```prisma
model Redemption {
  id               String           @id @default(cuid())
  amountUsed       Float                              // Valor resgatado (R$)
  status           RedemptionStatus @default(CONFIRMED)
  receiptCode      String?          @unique
  customerId       String
  operatorId       String
  establishmentId  String
  createdAt        DateTime         @default(now())

  customer         Customer      @relation(...)
  operator         Operator      @relation(...)
  establishment    Establishment @relation(...)
}
```

#### Campaign (Campanha WhatsApp)

```prisma
model Campaign {
  id              String         @id @default(cuid())
  name            String
  filterType      FilterType                      // ACTIVE ou INACTIVE
  filterPeriod    FilterPeriod?                   // Período de inatividade
  rewardType      RewardType                      // PER_LITER ou FIXED
  rewardValue     Float                           // Valor da recompensa
  message         String                          // Texto da mensagem
  status          CampaignStatus @default(DRAFT)  // DRAFT, SENT, CLOSED
  sentCount       Int?           @default(0)
  establishmentId String
  operatorId      String
  createdAt       DateTime       @default(now())

  establishment   Establishment @relation(...)
  operator        Operator      @relation(...)
}
```

#### CashbackSettings (Configurações de Cashback)

```prisma
model CashbackSettings {
  id                String       @id @default(cuid())
  mode              CashbackMode @default(PERCENTAGE)  // PERCENTAGE ou CENTS_PER_LITER
  defaultPercent    Float        @default(2.0)
  fuelTypes         Json?        // Ex: {"gasolina": 2.5, "etanol": 3.0}
  doubleBonus       Boolean      @default(false)
  doubleMultiplier  Float        @default(2.0)
  doubleBonusDays   Json?        // Dias da semana com bônus duplo
  rushHourBonus     Boolean      @default(false)
  rushHourMultiplier Float       @default(1.5)
  rushHourStart     String?      // "07:00"
  rushHourEnd       String?      // "09:00"
  establishmentId   String       @unique

  establishment     Establishment @relation(...)
}
```

#### FraudSettings (Configurações Antifraude)

```prisma
model FraudSettings {
  id                   String @id @default(cuid())
  maxFuelsPerDay       Int    @default(3)   // Máx. abastecimentos/dia
  maxFuelsPerWeek      Int    @default(10)  // Máx. abastecimentos/semana
  maxCashbackPerDay    Float  @default(50)  // Máx. cashback R$/dia
  maxRedeemsPerWeek    Int    @default(2)   // Máx. resgates/semana
  establishmentId      String @unique

  establishment        Establishment @relation(...)
}
```

#### BlacklistedCpf (CPF Bloqueado)

```prisma
model BlacklistedCpf {
  id              String   @id @default(cuid())
  cpf             String
  reason          String?
  blockedBy       String?
  establishmentId String
  operatorId      String?
  createdAt       DateTime @default(now())

  establishment   Establishment @relation(...)
  operator        Operator?     @relation(...)

  @@unique([cpf, establishmentId])
}
```

#### MessageQueue (Fila WhatsApp)

```prisma
model MessageQueue {
  id              String   @id @default(cuid())
  phone           String                        // Número destino
  message         String                        // Texto da mensagem
  status          String   @default("PENDING")  // PENDING, SENT, FAILED
  priority        Int      @default(0)
  scheduledAt     DateTime?
  retryCount      Int      @default(0)
  establishmentId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  establishment   Establishment @relation(...)
}
```

#### AuditLog, FraudAlert

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  action    String                        // Ex: "TRANSACTION_CREATED"
  entity    String                        // Ex: "Transaction"
  entityId  String
  metadata  Json?
  createdAt DateTime @default(now())
}

model FraudAlert {
  id          String         @id @default(cuid())
  customerId  String
  type        FraudAlertType
  metadata    Json?
  createdAt   DateTime       @default(now())

  customer    Customer @relation(...)
}
```

### Enums

```prisma
enum Role {
  SUPERADMIN   // Equipe PostoCash — acesso total
  ADMIN        // Dono/gerente do posto
  OPERATOR     // Atendente do posto
}

enum CashbackMode {
  PERCENTAGE          // Ex: 2% do valor
  CENTS_PER_LITER     // Ex: R$ 0,05/litro
}

enum RedemptionStatus {
  CONFIRMED
  CANCELLED
}

enum FilterType {
  ACTIVE     // Clientes ativos
  INACTIVE   // Clientes inativos
}

enum FilterPeriod {
  ONE_MONTH
  TWO_MONTHS
  THREE_MONTHS
  ONE_YEAR
}

enum RewardType {
  PER_LITER  // Recompensa por litro
  FIXED      // Valor fixo
}

enum CampaignStatus {
  DRAFT   // Rascunho
  SENT    // Enviada
  CLOSED  // Encerrada
}

enum FraudAlertType {
  DUPLICATE_QR          // QR Code usado duas vezes
  DAILY_LIMIT_EXCEEDED  // Limite diário ultrapassado
  WRONG_DEVICE          // Dispositivo diferente do cadastro
  VELOCITY_ANOMALY      // Velocidade anormal de transações
  LOCATION_MISMATCH     // Localização incompatível
  SELFIE_MISMATCH       // Face não reconhecida
}
```

### Índices e Performance

- `@@unique([cpf, establishmentId])` em Customer — busca por CPF dentro do tenant
- `@@unique([cpf, establishmentId])` em BlacklistedCpf — verificação de bloqueio
- `receiptCode @unique` em Transaction e Redemption — unicidade de recibos
- `email @unique` em Operator — login único
- `cnpj @unique` em Establishment — CNPJ único por posto

### Executando Migrations

```bash
# Criar nova migration
npx prisma migrate dev --name nome_da_migration

# Aplicar em produção
npx prisma migrate deploy

# Reset completo (desenvolvimento)
npx prisma migrate reset

# Visualizar banco (Prisma Studio)
npx prisma studio

# Popular dados de demonstração
node prisma/seed.js
```

---

## 6. APIs e Endpoints

**Base URL Produção:** `https://postocash-api.onrender.com`  
**Base URL Local:** `http://localhost:3000`  
**Autenticação:** `Authorization: Bearer <JWT>` (exceto rotas públicas)

---

### Autenticação (`/auth`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/auth/login` | Pública | Login com e-mail e senha |
| POST | `/auth/google` | Pública | Login/cadastro via Google OAuth |
| POST | `/auth/facebook` | Pública | Login/cadastro via Facebook OAuth |

**POST /auth/login**
```json
// Request
{ "email": "admin@posto.com", "password": "senha123" }

// Response 200
{
  "token": "eyJhbGciOiJIUzI1...",
  "operator": {
    "id": "clx...",
    "name": "João",
    "role": "ADMIN",
    "establishmentId": "clx..."
  }
}
```

---

### App Mobile (`/app`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/app/establishment/:id/qrcode-data` | Pública | Branding e config do posto |
| POST | `/app/verify-cpf` | Pública | Verificar CPF cadastrado |
| POST | `/app/register` | Pública | Cadastrar novo cliente |
| POST | `/app/login` | Pública | Login do motorista |
| POST | `/app/otp/send` | Pública | Enviar OTP por WhatsApp/SMS |
| POST | `/app/otp/verify` | Pública | Verificar OTP |
| POST | `/app/verify-face` | App | Reconhecimento facial |
| GET | `/app/balance` | App | Saldo atual do cliente |
| GET | `/app/history` | App | Histórico de transações |
| GET | `/app/statement` | App | Extrato de saldo |
| POST | `/app/transaction` | App | Registrar abastecimento |
| POST | `/app/redeem/generate` | App | Gerar QR Code de resgate |
| POST | `/app/redeem/validate` | App | Validar QR Code de resgate |
| POST | `/app/validate-nfce` | App | Validar NF-e SEFAZ SP |
| POST | `/app/validate-photo` | App | Enviar foto cupom fiscal |
| POST | `/app/register-selfie` | App | Registrar selfie biométrica |
| POST | `/app/push-token` | App | Salvar token Expo Push |
| POST | `/app/token/refresh` | App | Renovar JWT |
| POST | `/app/recovery/lookup` | Pública | Buscar conta para recuperação |
| POST | `/app/recovery/complete` | Pública | Concluir recuperação de conta |
| GET | `/app/config` | Pública | Configurações gerais do app |

---

### Clientes (`/customers`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/customers` | OPERATOR | Criar ou buscar cliente por CPF |
| GET | `/customers` | OPERATOR | Listar clientes com paginação |
| GET | `/customers/all` | ADMIN | Listar todos os clientes |
| GET | `/customers/:cpf` | OPERATOR | Detalhes + histórico do cliente |

---

### Transações (`/transactions`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/transactions` | OPERATOR | Registrar abastecimento + cashback |
| GET | `/transactions/:cpf` | OPERATOR | Listar transações do cliente |

**POST /transactions — Request**
```json
{
  "cpf": "123.456.789-00",
  "amount": 150.00,
  "liters": 30.5,
  "fuelType": "gasolina_comum",
  "photoUrl": "https://..."
}
```

**POST /transactions — Response 201**
```json
{
  "transaction": {
    "id": "clx...",
    "cashbackValue": 3.00,
    "cashbackPercent": 2.0,
    "receiptCode": "RC-2024-ABCD"
  },
  "customer": {
    "name": "Maria Silva",
    "balance": 18.50
  }
}
```

---

### Resgates (`/redeem`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/redeem` | OPERATOR | Processar resgate via QR Code |
| GET | `/redeem/:cpf` | OPERATOR | Histórico de resgates do cliente |

---

### Dashboard (`/dashboard`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/dashboard` | ADMIN | Métricas gerais (transações, saldos, clientes) |
| GET | `/dashboard/campaign-results` | ADMIN | Analytics de campanhas |
| GET | `/dashboard/fuel-types` | ADMIN | Breakdown por tipo de combustível |
| GET | `/dashboard/attendants` | ADMIN | Ranking de atendentes |

---

### Campanhas WhatsApp (`/campaigns`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/campaigns` | ADMIN | Listar campanhas do estabelecimento |
| POST | `/campaigns` | ADMIN | Criar campanha e enfileirar mensagens |
| GET | `/campaigns/preview` | ADMIN | Preview de clientes que receberão |
| GET | `/campaigns/queue-status` | ADMIN | Status geral da fila WhatsApp |
| GET | `/campaigns/:id/queue-status` | ADMIN | Status da fila de uma campanha |
| GET | `/campaigns/:id/returnees` | ADMIN | Clientes que retornaram pós-campanha |
| PATCH | `/campaigns/:id/close` | ADMIN | Encerrar campanha |

---

### Antifraude (`/fraud`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/fraud/settings` | ADMIN | Ver configurações de fraude |
| PUT | `/fraud/settings` | ADMIN | Atualizar limites e regras |
| GET | `/fraud/blacklist` | ADMIN | Listar CPFs bloqueados |
| POST | `/fraud/blacklist` | ADMIN | Bloquear CPF |
| DELETE | `/fraud/blacklist/:cpf` | ADMIN | Desbloquear CPF |

---

### Estabelecimentos (`/establishments`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/establishments` | Pública | Cadastro self-service do posto |
| POST | `/establishments/completar-cadastro` | Pública | Finalizar cadastro OAuth |
| GET | `/establishments` | SUPERADMIN | Listar todos os postos |
| POST | `/establishments/:id/logo` | ADMIN | Upload de logo |
| PATCH | `/establishments/:id/branding` | ADMIN | Atualizar cores e identidade |
| GET | `/establishments/:id/qrcode` | ADMIN | Gerar QR Code PNG do posto |

---

### Relatórios (`/reports`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/reports/preview` | ADMIN | Preview dos dados do relatório |
| GET | `/reports/export/pdf` | ADMIN | Download PDF |
| GET | `/reports/export/excel` | ADMIN | Download Excel (.xlsx) |

---

### Configurações Cashback (`/cashback-settings`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/cashback-settings` | ADMIN | Ver configurações atuais |
| PUT | `/cashback-settings` | ADMIN | Atualizar modo, percentuais e bônus |

---

### Ranking (`/ranking`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/ranking` | OPERATOR | Top clientes por cashback acumulado |

---

### Stripe (`/stripe`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/stripe/create-checkout-session` | Pública | Criar sessão de checkout Stripe |
| POST | `/stripe/create-setup-intent` | Pública | Setup de método de pagamento |
| POST | `/stripe/confirm-subscription` | Pública | Confirmar assinatura + criar posto |
| POST | `/stripe/activate` | Pública | Ativar após pagamento |
| GET | `/stripe/subscription/my` | ADMIN | Ver assinatura atual |
| POST | `/stripe/cancel-subscription` | ADMIN | Cancelar assinatura |
| POST | `/stripe/webhook` | Pública (raw) | Webhook Stripe (sem JWT) |

---

### Admin (`/admin`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/admin/whatsapp-status` | ADMIN | Status da conexão Evolution API |
| GET | `/admin/saas-metrics` | SUPERADMIN | Métricas da plataforma SaaS |
| GET | `/admin/photo-validations` | ADMIN | Fotos pendentes de validação |
| POST | `/admin/photo-validations/:id/approve` | ADMIN | Aprovar foto |
| POST | `/admin/photo-validations/:id/reject` | ADMIN | Rejeitar foto |

---

### Health Check

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/health` | Pública | Status do servidor |

---

## 7. Autenticação e Segurança

### Fluxo JWT

```
1. POST /auth/login
   └─► authService.validateCredentials()
         ├─► bcrypt.compare(password, operator.password)
         └─► jwt.sign({ id, role, establishmentId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

2. Requisições autenticadas
   └─► authMiddleware.authenticate()
         ├─► Extrai Bearer token do header Authorization
         ├─► jwt.verify(token, JWT_SECRET)
         └─► Injeta req.operator = { id, role, establishmentId }

3. Autorização por role
   ├─► requireAdmin() → role IN ['ADMIN', 'SUPERADMIN']
   └─► requireSuperAdmin() → role === 'SUPERADMIN'
```

### Roles e Permissões

| Role | Acesso | Descrição |
|------|--------|-----------|
| `SUPERADMIN` | Total | Equipe PostoCash. Ver todos os estabelecimentos, métricas SaaS, criar ADMIN |
| `ADMIN` | Tenant | Dono/gerente do posto. Acesso completo ao próprio estabelecimento |
| `OPERATOR` | Restrito | Atendente. Pode registrar transações, resgates e consultar clientes |

### Middlewares de Segurança

**Rate Limiting** (express-rate-limit):

| Limiter | Limite | Janela | Aplicado em |
|---------|--------|--------|-------------|
| `apiLimiter` | 200 req | 15 min | Todas as rotas |
| `authLimiter` | 10 tentativas | 15 min | `/auth/login` |
| `redemptionLimiter` | 10 req | 1 min | `/redeem` |
| `nfceLimiter` | 10 req | 1 hora | `/app/validate-nfce` |
| `registerLimiter` | 3 req | 1 hora | `/app/register` |

**Helmet** (headers de segurança):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`

**CORS** — configurado em `src/app.js`:
```js
cors({
  origin: process.env.FRONTEND_URL,  // Vercel URL em produção
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
})
```

**Device Fingerprinting** — `deviceMiddleware.js`:
- Lê header `X-Device-Id` em requisições do app mobile
- No primeiro uso, vincula o deviceId ao Customer
- Nas requisições seguintes, compara com o deviceId armazenado
- Mismatch gera `FraudAlert` do tipo `WRONG_DEVICE`

**Bcrypt** — hash de senhas:
```js
const salt = await bcrypt.genSalt(10)
const hash = await bcrypt.hash(password, salt)
```

### LGPD Compliance

- **Dados pessoais armazenados:** Nome, CPF, telefone, foto (selfie), localização GPS
- **Finalidade:** Exclusivamente para operação do programa de cashback
- **Retenção:** Selfies são deletadas automaticamente pelo cron job diário às 02h
- **Acesso:** Dados isolados por `establishmentId` (multi-tenancy)
- **Direito ao esquecimento:** Endpoint de exclusão de conta disponível
- **Consentimento:** Coletado no onboarding do app mobile

---

## 8. Módulos do Sistema

### 8.1 App Mobile

**Tecnologia:** React Native + Expo SDK 54 + Expo Router (file-based routing)  
**EAS Project ID:** `d4dfb95f-dd47-4912-b248-db2a50bce0d0`

**Fluxo de Cadastro:**
```
1. Cliente escaneia QR Code do posto (Expo Camera)
2. App faz GET /app/establishment/:id/qrcode-data → carrega branding
3. Cliente informa CPF → POST /app/verify-cpf
4. Se CPF novo: fluxo de cadastro
   ├─► Nome, telefone
   ├─► Tirar selfie (face detection)
   ├─► POST /app/register-selfie → upload Supabase + indexação AWS Rekognition
   └─► POST /app/register → cria conta
5. Se CPF existente:
   ├─► Verificação biométrica (Face ID / impressão digital) via expo-local-authentication
   ├─► POST /app/verify-face → AWS Rekognition compara selfie ao vivo com cadastro
   └─► Gera JWT de sessão
```

**Validação NF-e:**
```
1. Cliente abre QR Code da NF-e com Expo Camera
2. POST /app/validate-nfce → envia URL da SEFAZ SP
3. Backend faz GET na URL SEFAZ → retorna HTML da nota
4. nfceService.js faz parsing do HTML → extrai valor, CNPJ, data
5. Retorna dados estruturados para o app
```

**Fallback OCR (Tesseract.js):**
```
1. Se QR Code NF-e não disponível, cliente tira foto do cupom
2. POST /app/validate-photo → envia imagem (multipart)
3. Backend processa com Tesseract.js OCR
4. Extrai texto → identifica valor e informações fiscais
5. Foto vai para fila de validação manual (admin)
```

**Resgate de Cashback:**
```
1. Cliente acessa "Resgatar" no app
2. POST /app/redeem/generate
   ├─► Verifica saldo >= R$ 10,00 (MIN_REDEMPTION_AMOUNT)
   ├─► Verifica cooldown (5 min desde último resgate)
   └─► Gera QR Code com código único assinado
3. Atendente escaneia QR Code no portal admin
4. POST /redeem → valida código, debita saldo, registra Redemption
```

**Deep Links:**
- `https://postocash.app/*` (Universal Links iOS)
- `postocash://*` (Custom URL Scheme Android)
- Permissões: CAMERA, BIOMETRIC, FINGERPRINT, RECORD_AUDIO, INTERNET

---

### 8.2 Portal Admin

**Tecnologia:** React 18 + Vite + TailwindCSS  
**Deploy:** Vercel  
**URL Produção:** `https://postocash-admin.vercel.app`

**Páginas e Funcionalidades:**

| Página | Rota | Role | Descrição |
|--------|------|------|-----------|
| Login | `/login` | Pública | Autenticação com Google ou e-mail/senha |
| Dashboard | `/` | OPERATOR | KPIs: transações, cashback, clientes ativos |
| Abastecer | `/abastecer` | OPERATOR | Registrar venda + calcular cashback |
| Resgatar | `/resgatar` | OPERATOR | Processar resgate via QR Code |
| Clientes | `/clientes` | OPERATOR | Lista e busca de clientes |
| Cadastrar Cliente | `/cadastrar-cliente` | OPERATOR | Novo cliente sem app |
| Consultar Cliente | `/consultar/:cpf` | OPERATOR | Histórico detalhado |
| Campanhas | `/campanhas` | ADMIN | Criar e monitorar campanhas WA |
| Ranking | `/ranking` | OPERATOR | Top clientes |
| Relatórios | `/relatorios` | ADMIN | Export PDF/Excel |
| Config Posto | `/config-posto` | ADMIN | Nome, logo, cores, CNPJ |
| Config Cashback | `/config-cashback` | ADMIN | %, bônus duplo, hora-pico |
| Antifraude | `/antifraude` | ADMIN | Limites, blacklist CPFs |
| Novo Estabelecimento | `/novo-estabelecimento` | Pública | Onboarding SaaS |
| SaaS Dashboard | `/saas` | SUPERADMIN | Métricas da plataforma |

---

### 8.3 Fluxo de Pagamento Stripe

**Modo atual:** Test mode (chaves de teste configuradas via ambiente)
**Produto Stripe:** "PostoCash — Sistema de Fidelidade"  
**Preço:** Recorrente mensal (R$ 200/mês → equivalente USD no Stripe)

**Fluxo completo de onboarding pago:**
```
1. Posto acessa landing page → clica "Começar agora"

2. POST /stripe/create-checkout-session
   ├─► Stripe cria session com STRIPE_PRICE_ID
   └─► Retorna URL do Stripe Checkout

3. Posto preenche dados do cartão no Stripe Checkout

4. Stripe redireciona para /stripe/activate?session_id=...

5. POST /stripe/webhook (evento: checkout.session.completed)
   ├─► stripeService.handleWebhook()
   ├─► Cria Establishment no banco
   │   ├─► name, email extraídos do Stripe customer
   │   ├─► stripeCustomerId, stripeSubscriptionId
   │   └─► subscriptionStatus: "ACTIVE"
   ├─► Cria Operator ADMIN com senha provisória
   ├─► emailService.sendWelcomeEmail()
   │   └─► Template HTML com link do portal + credenciais
   └─► Retorna URL do portal admin

6. Posto recebe e-mail e acessa o portal
7. Troca senha no primeiro login
```

**Eventos Stripe tratados:**
- `checkout.session.completed` — Pagamento aprovado, cria estabelecimento
- `customer.subscription.deleted` — Assinatura cancelada, desativa posto
- `invoice.payment_failed` — Falha no pagamento, envia alerta por e-mail

---

### 8.4 WhatsApp — Evolution API

**Provider:** Evolution API v2.3.7 (Baileys)  
**Deploy:** Render (self-hosted)  
**URL:** `<EVOLUTION_API_URL>`
**Instância:** `postocash`  
**API Key:** Configurada via env `EVOLUTION_API_KEY`

**Arquitetura da Fila de Mensagens:**

```
Admin cria campanha (POST /campaigns)
    │
    └─► campaignService.createCampaign()
            ├─► Filtra clientes (ACTIVE/INACTIVE + período)
            ├─► Para cada cliente:
            │     └─► messageQueueService.enqueue({ phone, message, establishmentId })
            │           └─► INSERT INTO MessageQueue (status: "PENDING")
            └─► Retorna { campaignId, totalEnqueued }

Worker (messageWorker.js) — executado a cada 3-6s:
    │
    ├─► Verifica horário: 08h00 - 20h00 BRT
    ├─► SELECT FROM MessageQueue WHERE status = 'PENDING' LIMIT 1
    ├─► whatsappService.sendViaEvolution(phone, message)
    │     └─► POST /message/sendText/postocash
    │           { "number": phone, "text": message }
    ├─► UPDATE MessageQueue SET status = 'SENT'
    └─► Em caso de erro:
          ├─► UPDATE MessageQueue SET retryCount += 1
          └─► Se retryCount >= 3: SET status = 'FAILED'
```

**Janela de envio:** 08:00 – 20:00 (horário de Brasília) — proteção anti-ban

**Delay aleatório:** 3 a 6 segundos entre mensagens — simula comportamento humano

**Template de mensagem de campanha:**
```
🎉 Olá [Nome]!

Você tem cashback disponível no [Nome do Posto]!

💰 Oferta especial: [descrição da recompensa]

Venha abastecer e aproveitar seu benefício!

📍 [Nome do Posto]
```

**Conectar instância WhatsApp:**
```
1. GET /instance/fetchInstances → verificar status
2. Se status != "open":
   GET /instance/connect/postocash → retorna base64 QR Code
3. Abrir WhatsApp no celular → Dispositivos vinculados → Vincular dispositivo
4. Escanear QR Code
5. Status muda para "open" automaticamente
```

**Monitorar status no portal:**
```
GET /admin/whatsapp-status
→ { connected: true, instanceName: "postocash", status: "open" }
```

---

### 8.5 Validação NF-e

**Integração:** SEFAZ SP (Secretaria da Fazenda de São Paulo)  
**Método:** HTTP GET na URL da NF-e + parsing HTML  

**Fluxo:**
```
1. Cliente escaneia QR Code da nota fiscal no app
2. QR Code contém URL: https://www.nfce.fazenda.sp.gov.br/consulta?...
3. POST /app/validate-nfce { nfceUrl: "https://..." }
4. nfceService.fetchNFCe(url)
   ├─► axios.get(url) → retorna HTML da SEFAZ
   ├─► Parsing com regex/cheerio
   ├─► Extrai: valor total, CNPJ emitente, data/hora, número da nota
   └─► Retorna dados estruturados
5. Backend verifica se CNPJ bate com o estabelecimento
6. Retorna { valid: true, amount: 150.00, date: "2026-05-24" }
```

**Fallback OCR (quando QR Code não disponível):**
```
1. Cliente tira foto do cupom fiscal
2. POST /app/validate-photo (multipart/form-data, max 2MB)
3. uploadMiddleware processa imagem
4. sharp.js redimensiona e otimiza
5. tesseract.js extrai texto da imagem
6. Regex identifica valor, CNPJ, data
7. Foto vai para fila de validação manual
8. ADMIN aprova/rejeita em /admin/photo-validations
```

---

## 9. Deploy e Infraestrutura

### URLs de Produção

| Serviço | URL |
|---------|-----|
| Backend API | `https://postocash-api.onrender.com` |
| Portal Admin | `https://postocash-admin.vercel.app` |
| Landing Page | `https://postocash.com.br` (Vercel) |
| Evolution API | `<EVOLUTION_API_URL>` |
| Supabase | `https://[project].supabase.co` |

### Variáveis de Ambiente Completas

```bash
# ─── Servidor ───────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── Banco de Dados ─────────────────────────────────────────
DATABASE_URL="<DATABASE_URL_PRODUCAO>"
DIRECT_URL="<DIRECT_URL_PRODUCAO>"  # Sem pooler

# ─── JWT ────────────────────────────────────────────────────
JWT_SECRET="<JWT_SECRET_FORTE>"
JWT_EXPIRES_IN="8h"

# ─── Supabase ───────────────────────────────────────────────
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_SERVICE_KEY="eyJ..."         # Service role (backend)
SUPABASE_ANON_KEY="eyJ..."            # Anon key (público)
SUPABASE_STORAGE_BUCKET="selfies"

# ─── Stripe ─────────────────────────────────────────────────
STRIPE_PUBLISHABLE_KEY="<STRIPE_PUBLISHABLE_KEY>"
STRIPE_SECRET_KEY="<STRIPE_SECRET_KEY>"
STRIPE_PRICE_ID="<STRIPE_PRICE_ID>"
STRIPE_WEBHOOK_SECRET="<STRIPE_WEBHOOK_SECRET>"

# ─── WhatsApp ───────────────────────────────────────────────
WHATSAPP_PROVIDER="evolution"           # "evolution" ou "z-api"
EVOLUTION_API_URL="<EVOLUTION_API_URL>"
EVOLUTION_API_KEY="<EVOLUTION_API_KEY>"
EVOLUTION_INSTANCE="postocash"

# Z-API (legado/fallback)
ZAPI_INSTANCE_ID="xxxxx"
ZAPI_TOKEN="xxxxx"
ZAPI_BASE_URL="https://api.z-api.io"

# ─── E-mail ─────────────────────────────────────────────────
RESEND_API_KEY="re_..."

# ─── AWS Rekognition ────────────────────────────────────────
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="xxxx"
AWS_REGION="us-east-1"

# ─── Google OAuth ───────────────────────────────────────────
GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com"

# ─── Regras de Negócio ──────────────────────────────────────
MIN_REDEMPTION_AMOUNT=10.00         # Resgate mínimo R$
MAX_DAILY_REDEMPTION=500.00         # Máx. resgate diário R$
REDEMPTION_COOLDOWN_MINUTES=5       # Intervalo entre resgates

# ─── CORS ───────────────────────────────────────────────────
FRONTEND_URL="https://postocash-admin.vercel.app"
```

### Como Fazer Deploy no Render (Backend)

```bash
# 1. Conectar repositório GitHub ao Render
# 2. Configurar build:
Build Command: npm install && npx prisma generate && npx prisma migrate deploy
Start Command: node src/server.js

# 3. Adicionar todas as variáveis de ambiente no painel Render
# 4. Configurar render.yaml (já existente no projeto)
```

### Como Rodar Localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/seu-usuario/postocash.git
cd postocash

# 2. Instalar dependências backend
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 4. Executar migrations e seed
npx prisma migrate dev
node prisma/seed.js

# 5. Iniciar backend
npm run dev   # com nodemon
# ou
node src/server.js

# 6. Frontend (em outro terminal)
cd frontend
npm install
npm run dev  # Vite dev server em http://localhost:5173

# 7. Mobile (em outro terminal)
cd mobile
npm install
npx expo start

# 8. Evolution API local (opcional)
cd C:\Users\Giancarlo\Documents\evolution-local-node
npm run start:prod
```

### Jobs Agendados (Cron)

| Job | Schedule (cron) | Horário BRT | Ação |
|-----|----------------|-------------|------|
| Selfie Cleanup | `0 2 * * *` | 02:00 | Deleta selfies antigas do Supabase |
| NFCe Revalidation | `*/30 * * * *` | A cada 30min | Revalida transações PENDING_VALIDATION |
| Message Worker | A cada 3-6s | 08:00 – 20:00 | Processa fila WhatsApp |

---

## 10. Credenciais e Acessos

### Contas de Teste

| Conta | Email | Senha | Papel |
|-------|-------|-------|-------|
| SuperAdmin | (configurado via seed) | (seed.js) | SUPERADMIN |
| Admin Teste | (configurado via seed) | (seed.js) | ADMIN |
| Atendente | (configurado via seed) | (seed.js) | OPERATOR |

### Onde Encontrar as Chaves

| Serviço | Onde obter |
|---------|-----------|
| **Stripe Keys** | dashboard.stripe.com → Developers → API Keys |
| **Stripe Webhook Secret** | dashboard.stripe.com → Developers → Webhooks → seu endpoint |
| **Stripe Price ID** | dashboard.stripe.com → Products → seu produto → preço |
| **Supabase URL + Keys** | supabase.com → Project Settings → API |
| **Supabase DB URL** | supabase.com → Project Settings → Database → Connection string |
| **Resend API Key** | resend.com → API Keys |
| **AWS Keys** | aws.amazon.com → IAM → Users → seu usuário → Security credentials |
| **Google OAuth Client ID** | console.cloud.google.com → APIs & Services → Credentials |
| **Evolution API Key** | Configurado em `AUTHENTICATION_API_KEY` no docker-compose ou .env |
| **JWT Secret** | Gerado localmente: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |

### Painéis de Administração

| Painel | URL | Acesso |
|--------|-----|--------|
| Render Dashboard | dashboard.render.com | Conta Render |
| Vercel Dashboard | vercel.com/dashboard | Conta Vercel |
| Supabase Studio | supabase.com/dashboard | Conta Supabase |
| Stripe Dashboard | dashboard.stripe.com | Conta Stripe |
| Resend Dashboard | resend.com | Conta Resend |
| Cloudflare | dash.cloudflare.com | Conta Cloudflare |
| Evolution Manager | http://localhost:4040 (local) | Via ngrok |

---

## 11. Pendências e Roadmap

### Funcionalidades Pendentes

| Item | Prioridade | Status |
|------|-----------|--------|
| Publicar app Android na Google Play Store | Alta | Pendente |
| Migrar Stripe de test mode para produção | Alta | Pendente |
| Instância Evolution API no Render com env vars corretos | Alta | Em andamento |
| Conectar instância WhatsApp no Render (QR Code) | Alta | Pendente |
| Configurar webhook Stripe em produção | Alta | Pendente |
| Testes automatizados (Jest/Vitest) | Média | Pendente |
| App iOS (Apple Developer Account) | Média | Pendente |
| Relatórios avançados com filtros de período | Média | Pendente |
| Notificações push para cashback recebido | Média | Pendente |
| Portal de autoatendimento para motoristas (web) | Baixa | Backlog |

### Variáveis Faltantes no Render (Evolution API)

Adicionar no painel do Render → Evolution API service:
```
CONFIG_SESSION_PHONE_VERSION=2.3000.1023181250
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true
DATABASE_CONNECTION_CLIENT_NAME=evolution_exchange
```

### Melhorias Planejadas

- **Multi-instância WhatsApp:** Cada posto com sua própria instância Evolution API
- **Dashboard tempo real:** WebSocket para métricas ao vivo
- **Programa de indicação:** Cliente indica amigo, ambos ganham bônus
- **Integração PIX:** Resgate via PIX em vez de crédito no posto
- **Análise de churn:** ML para prever clientes prestes a abandonar
- **App para iOS:** Build EAS + submissão App Store
- **White-label:** Cada posto com app próprio (branding completo)

---

## 12. Troubleshooting

### Problemas Comuns e Soluções

#### ❌ "Connection Closed" ao enviar mensagem WhatsApp

**Causa:** A instância Baileys perdeu a sessão WebSocket internamente, mas o status ainda mostra "open".

**Solução:**
```bash
# Reiniciar o servidor Node.js local
Stop-Process -Name "node" -Force
cd C:\Users\Giancarlo\Documents\evolution-local-node
$env:DATABASE_PROVIDER="postgresql"
npm run start:prod
```

---

#### ❌ Prisma: "Table does not exist"

**Causa:** Migrations não foram executadas no banco.

**Solução:**
```bash
# Rodar schema push (sem migrations)
npx prisma db push --schema=prisma/postgresql-schema.prisma

# Ou rodar migrations
npx prisma migrate deploy
```

---

#### ❌ QR Code Evolution API retorna `{"count":0}`

**Causa:** Variáveis de ambiente faltando no Render (`CONFIG_SESSION_PHONE_VERSION`, `DATABASE_SAVE_DATA_*`).

**Solução:** Adicionar as variáveis listadas na seção 11 e aguardar redeploy.

---

#### ❌ "Can't reach database server" no Evolution API

**Causa:** URL do banco usando hostname interno do Render (`dpg-xxx`) em vez do externo.

**Solução:** Usar a URL externa do Render PostgreSQL:
```
<DATABASE_URL_EXTERNA_RENDER>
```

---

#### ❌ Docker daemon not running (Docker Desktop)

**Causa:** Docker Desktop não foi iniciado.

**Solução:** Abrir Docker Desktop e aguardar status "Engine running" antes de rodar `docker-compose up`.

---

#### ❌ Build Evolution API: "Module '@prisma/client' has no exported member"

**Causa:** Prisma Client não foi gerado com o schema correto.

**Solução:**
```bash
cd evolution-local-node
npx prisma generate --schema=prisma/postgresql-schema.prisma
npm run build
```

---

#### ❌ Frontend: erro 401 em todas as requisições

**Causa:** JWT expirado ou `FRONTEND_URL` incorreto no CORS do backend.

**Solução:**
1. Verificar se o token no localStorage não expirou (padrão: 8h)
2. Verificar variável `FRONTEND_URL` no backend (deve bater com a origem do frontend)
3. Fazer logout e login novamente

---

#### ❌ Stripe webhook retorna 400

**Causa:** `STRIPE_WEBHOOK_SECRET` incorreto ou body não está sendo passado como raw.

**Solução:**
- A rota `/stripe/webhook` deve usar `express.raw({ type: 'application/json' })` (não `express.json()`)
- Verificar se o webhook secret no Stripe Dashboard bate com o da variável de ambiente

---

### Logs Importantes

```bash
# Backend Render — ver logs em tempo real
render logs --service postocash-api --tail

# Evolution API local
Get-Content "C:\Users\GIANCA~1\AppData\Local\Temp\...\tasks\[task-id].output"

# Prisma queries (ativar em desenvolvimento)
# Adicionar em .env:
DEBUG="prisma:query"

# Node.js — stack trace completo
NODE_ENV=development node src/server.js
```

### Como Debugar Envio de WhatsApp

```bash
# 1. Verificar status da instância
Invoke-WebRequest -Uri "http://localhost:8080/instance/fetchInstances" `
  -Headers @{"apikey"="<EVOLUTION_API_KEY>"} -Method GET | Select-Object -ExpandProperty Content

# 2. Enviar mensagem de teste
Invoke-WebRequest -Uri "http://localhost:8080/message/sendText/postocash2" `
  -Headers @{"apikey"="<EVOLUTION_API_KEY>"; "Content-Type"="application/json"} `
  -Method POST `
  -Body '{"number":"<TELEFONE_TESTE>","text":"Teste"}' | Select-Object -ExpandProperty Content

# 3. Verificar status das últimas mensagens
Invoke-WebRequest -Uri "http://localhost:8080/chat/findMessages/postocash2" `
  -Headers @{"apikey"="<EVOLUTION_API_KEY>"; "Content-Type"="application/json"} `
  -Method POST `
  -Body '{"where":{"fromMe":true},"limit":5}' | Select-Object -ExpandProperty Content

# 4. Ver fila de mensagens (banco de dados)
npx prisma studio
# Abrir tabela MessageQueue e verificar status dos registros
```

### Checklist de Saúde do Sistema

```
✅ Backend respondendo: GET /health → { status: "ok" }
✅ Banco conectado: GET /dashboard → retorna dados
✅ WhatsApp conectado: GET /admin/whatsapp-status → { connected: true }
✅ Stripe ativo: assinatura com status ACTIVE no banco
✅ Supabase storage: selfies sendo salvas sem erro 403
✅ E-mail funcionando: envio de welcome email após novo cadastro Stripe
✅ Crons rodando: verificar logs às 02h (selfie cleanup) e a cada 30min (nfce)
✅ Evolution API: instanceStatus === "open"
✅ Frontend carregando: portal admin acessível e fazendo login
```

---

*Documentação gerada em Maio 2026. Para atualizar, editar este arquivo e commitar.*
