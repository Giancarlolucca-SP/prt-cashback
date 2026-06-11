# Mapa da API do CRM MVP

Este documento resume a superficie backend implementada no MVP. Todas as rotas usam JSON e retornam erros padronizados pelo handler da API.

Contrato OpenAPI inicial: `docs/openapi-mvp.yaml`.
Matriz explicita de RBAC: `docs/access-control-matrix.md`.

## Validacao

```bash
npm test
npm run typecheck
npm run build:api
```

O smoke test principal esta em `tests/auth-api-smoke.ts` e percorre autenticao, RBAC e os principais fluxos operacionais ponta a ponta.

## Autenticacao e Plataforma

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/auth` | sessao autenticada | Login, logout, usuario atual e checagem de permissao |
| `/health` | publico | Health e readiness |
| `/ops` | `automation:manage:ALL:technical` | Sumario operacional e status de backup |
| `/jobs` | `automation:manage:ALL:technical` e `documents:manage:STORE:documents` | Jobs genericos, OCR e retry |
| `/webhooks` | segredo compartilhado opcional | Entrada idempotente de webhooks externos |

Endpoints principais:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/permissions/check`
- `GET /health`
- `GET /health/ready`
- `GET /ops/summary`
- `GET /ops/backup-status`
- `POST /ops/backup-status`
- `GET /jobs`
- `POST /jobs/enqueue`
- `POST /jobs/document-ocr`
- `POST /jobs/:id/retry`
- `POST /webhooks/:provider`

## CRM Comercial

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/customers` | `customers:*:STORE:general` | Cadastro, edicao e arquivamento de clientes |
| `/leads` | `leads:*:STORE:general` | Leads, funil e historico de etapa |
| `/appointments` | `appointments:manage:STORE:general` | Agenda, status e vinculos comerciais |
| `/sales` | `sales:*:STORE:general` e `sales:approve:ALL:sensitive_approval` | Propostas, aprovacao e fechamento |
| `/commissions` | `commissions:*` | Calculo, ajustes, aprovacao e pagamento |

Endpoints principais:

- `GET/POST /customers`
  - `GET /customers` aceita filtros `origin`, `responsible_user_id`, `created_by_user_id`, `birth_month`, `purchase_done` e `visit_done`.
  - Respostas de clientes expõem `primaryInterest`, derivado do lead vinculado mais recente com `interest` preenchido.
- `POST /customers/minimal-leads`
- `GET /customers/kanban`
- `GET/PATCH/DELETE /customers/:id`
- `GET /customers/:id/history`
- `POST /customers/:id/kanban-status`
- `GET/POST /leads`
- `GET/PATCH /leads/:id`
- `POST /leads/:id/stage`
- `GET/POST /appointments`
- `GET/PATCH /appointments/:id`
- `POST /appointments/:id/status`
- `GET/POST /sales`
- `GET/PATCH /sales/:id`
- `POST /sales/:id/status`
- `GET /commissions`
- `GET /commissions/mine`
- `POST /commissions/calculate`
- `POST /commissions/:id/status`
- `POST /commissions/:id/adjustments`

## Veiculos, Estoque e Compras

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/inventory` | `inventory:*:STORE:general` | Estoque, veiculos e custos |
| `/purchases` | `purchases:*` | Leads de compra, avaliacoes, checklist, aprovacao e pagamentos |
| `/repasse` | `repasse:manage:STORE:general` | Processo de repasse e receita reconhecida |
| `/services` | `services:manage:STORE:general` | Prestadores, catalogo, OS, itens, custos e notas |

Endpoints principais:

- `GET/POST /inventory`
- `GET/PATCH /inventory/:id`
- `POST /inventory/:id/costs`
- `GET/POST /purchases/leads`
- `GET /purchases/leads/:id`
- `POST /purchases/leads/:id/status`
- `GET/POST /purchases/evaluations`
- `GET /purchases/evaluations/:id`
- `POST /purchases/evaluations/:id/checklist`
- `POST /purchases/evaluations/:id/approval`
- `POST /purchases/payments`
- `POST /purchases/payments/:id/status`
- `GET/POST /repasse`
- `GET/PATCH /repasse/:id`
- `POST /repasse/:id/revenues`
- `GET/POST /services/providers`
- `GET/POST /services/catalog`
- `GET/POST /services/post-sale/customers`
- `GET/POST /services/orders`
- `GET /services/orders/:id`
- `POST /services/orders/:id/status`
- `POST /services/orders/:id/items`
- `POST /services/orders/:id/costs`
- `POST /services/orders/:id/invoices`

## Financeiro, Documentos e Pos-venda

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/finance` | `finance:*:ALL:financial` | Lancamentos e resumo financeiro |
| `/contracts` | `documents:manage:STORE:documents` | Contratos, garantia e checklist de entrega |
| `/files` | `documents:manage:STORE:documents` | Upload metadata, download e exclusao controlada |
| `/dispatch` | `dispatch:manage:STORE:general` | Processo de despachante/transferencia |
| `/ocr` | `documents:manage:STORE:documents` | Jobs OCR, campos extraidos e revisao |

Endpoints principais:

- `GET/POST /finance/transactions`
- `GET/PATCH /finance/transactions/:id`
- `POST /finance/transactions/:id/settle`
- `GET /finance/summary`
- `GET /contracts`
- `GET /contracts/:id`
- `POST /contracts/generate`
- `POST /contracts/:id/sign`
- `POST /contracts/warranty-terms`
- `POST /contracts/delivery-checklists`
- `POST /files/prepare-upload`
- `GET /files/:id/download`
- `POST /files/:id/delete-customer-document`
- `GET/POST /dispatch/processes`
- `GET/PATCH /dispatch/processes/:id`
- `POST /dispatch/processes/:id/status`
- `GET /ocr/jobs`
- `GET /ocr/jobs/:id`
- `POST /ocr/jobs/:id/status`
- `POST /ocr/jobs/:id/fields`
- `POST /ocr/fields/:fieldId/review`

## Marketing, Comunicacao e IA

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/listings` | `ads:manage:STORE:general` | Anuncios, canais, publicacoes e metricas |
| `/campaigns` | `ads:manage:STORE:general` | Campanhas, custos, resultados e resumo |
| `/communications` | `communications:manage:STORE:general` | Canais, conversas, mensagens, e-mails e preferencias |
| `/ai` | `ai:use:STORE:general` | Logs de IA, sugestoes e feedback |

Endpoints principais:

- `GET/POST /listings`
- `GET/PATCH /listings/:id`
- `POST /listings/:id/status`
- `POST /listings/channels`
- `POST /listings/:id/publications`
- `POST /listings/:id/metrics`
- `GET/POST /campaigns`
- `GET/PATCH /campaigns/:id`
- `POST /campaigns/:id/status`
- `POST /campaigns/:id/costs`
- `POST /campaigns/:id/results`
- `GET /campaigns/:id/summary`
- `GET/POST /communications/channels`
- `POST /communications/whatsapp-instances`
- `POST /communications/email-accounts`
- `GET/POST /communications/threads`
- `GET /communications/threads/:id`
- `POST /communications/threads/:id/messages`
- `POST /communications/emails`
- `POST /communications/preferences`
- `GET/POST /ai/query-logs`
- `GET/POST /ai/suggestions`
- `GET /ai/suggestions/:id`
- `POST /ai/suggestions/:id/status`
- `POST /ai/suggestions/:id/feedback`

## Gestao, Analytics e Compliance

| Prefixo | Permissao principal | Escopo |
| --- | --- | --- |
| `/analytics` | `dashboard:read:STORE:general` | Resumo executivo, funil e performance |
| `/notifications` | autenticado / `automation:manage` para criar | Alertas internos |
| `/settings` | `settings:manage:ALL:technical` | Parametros, horarios, categorias e templates |
| `/users` | `users:manage:ALL:security` | Usuarios, permissoes, escopos e transferencias |
| `/compliance` | `suppliers:manage:ALL:credentials` | Checagens legais e consultas externas |
| `/automations` | `automation:manage:ALL:technical` | Regras, versoes, testes e eventos |
| `/audit` | `audit:read:ALL:audit` | Logs de auditoria, eventos tecnicos e seguranca |

Endpoints principais:

- `GET /analytics/executive-summary` - totais operacionais/financeiros e `revenueSeries` mensal para o dashboard.
- `GET /analytics/sales-funnel` - funil por status, origem de leads, vendas e agendamentos.
- `GET /analytics/inventory-performance`
- `GET /notifications`
- `GET /notifications/summary`
- `POST /notifications`
- `POST /notifications/:id/read`
- `GET /settings/summary`
- `PUT /settings/store-settings/:key`
- `POST /settings/tax-settings`
- `POST /settings/accountants`
- `POST /settings/business-hours`
- `POST /settings/holidays`
- `POST /settings/deadlines`
- `POST /settings/categories`
- `POST /settings/document-templates`
- `POST /settings/message-templates`
- `PUT /settings/operational-parameters/:key`
- `GET/PUT /settings/customer-birthday-notifications`
- `GET/POST /users`
- `GET/PATCH /users/:id`
- `POST /users/:id/permissions`
- `POST /users/:id/scopes`
- `POST /users/responsibility-transfers`
- `GET/POST /compliance/legal-checks`
- `POST /compliance/legal-checks/:id/status`
- `GET/POST /compliance/external-jobs`
- `GET /compliance/external-jobs/:id`
- `POST /compliance/external-jobs/:id/results`
- `GET/POST /automations/rules`
- `GET/PATCH /automations/rules/:id`
- `POST /automations/rules/:id/status`
- `POST /automations/rules/:id/events`
- `POST /automations/rules/:id/tests`
- `GET /audit/logs`
- `GET /audit/technical-events`
- `GET /audit/security-events`
- `GET /audit/summary`

## Observacoes de implementacao

- As rotas preservam `storeId` como fronteira multiunidade.
- Eventos internos sao gravados em `technical_events` via `emitInternalEvent`.
- Operacoes sensiveis geram `audit_logs` quando fazem parte do fluxo operacional.
- Jobs externos e OCR usam o modelo de background job como fila persistente, ainda sem worker real acoplado.
- O smoke test serve como contrato vivo ate existir uma especificacao OpenAPI formal.
