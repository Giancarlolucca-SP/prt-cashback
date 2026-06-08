# CRM Automotivo MVP

Base tecnica isolada para o CRM automotivo definida na Sprint 11.

## Decisao de isolamento

O repositorio atual possui um produto existente de cashback/posto. Para preservar esse produto, a fundacao do CRM foi criada em `crm/` como uma area isolada.

Essa decisao evita misturar dominios, rotas, banco, telas e regras de negocio ate que exista uma estrategia explicita de migracao ou separacao de repositorios.

## Stack inicial

- Next.js/React para frontend.
- Node.js/Fastify para backend API.
- PostgreSQL com Prisma.
- Supabase Storage para anexos/documentos.
- pg-boss/PostgreSQL previsto para jobs.
- Docker Compose para PostgreSQL e SMTP local.

## Estado atual da fundacao

- Prisma schema expandido para os dominios principais do CRM.
- Testes de contrato protegem `store_id`, anexos, auditoria, snapshots financeiros e modelos aprovados no preview.
- Frontend Surface com rotas de preview e modulos operacionais para revisao de UX.
- Backend Fastify com auth, RBAC, clientes, leads, agenda, estoque, compras, vendas, financeiro, documentos, servicos, marketing, comunicacao, IA, OCR, auditoria, configuracoes, usuarios, jobs e webhooks.

## Documentacao da API

- [Mapa da API do CRM MVP](docs/api-map.md)
- [OpenAPI inicial](docs/openapi-mvp.yaml)
- [Runbook operacional](docs/ops-runbook.md)
- [Checklist de QA funcional](docs/qa-functional-checklist.md)
- [Decisoes de arquitetura](docs/architecture-decisions.md)

## Primeiros comandos

```bash
cd crm
npm install
cp .env.example .env
docker compose up -d
npm run dev:check
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

`dev:check` valida o ambiente completo. Os scripts `dev:web` e `dev:api` usam checks direcionados (`dev:check:web` e `dev:check:api`) para bloquear apenas conflitos do proprio servico.

## Validacao local

```bash
npm test
npm run typecheck
npm run build:api
npm run build:web
```

Atalho equivalente:

```bash
npm run qa
```

Com API e Web rodando, valide o caminho funcional principal:

```bash
npm run smoke:local
```

Atalho completo, incluindo QA tecnico e smoke local:

```bash
npm run qa:local
```

O smoke local usa por padrao:

- API em `http://localhost:3333`.
- Web em `http://localhost:3000`.
- Usuario `dono@gt3.local`.
- Senha `Gt3@2026dev`.
- Endpoints principais da API e rotas navegaveis do menu.

Variaveis opcionais: `SMOKE_API_URL`, `SMOKE_WEB_URL`, `SMOKE_EMAIL` e `SMOKE_PASSWORD`.

## Massa demo

`npm run db:seed` cria loja, usuarios, permissoes e dados operacionais de demonstracao para os workspaces live:

- clientes, leads e agendamentos;
- veiculos, estoque, custos, compras e avaliacoes;
- vendas, contratos, financeiro, prestadores, servicos e pos-venda;
- repasse, conversas, automacoes, anexos e auditoria.

O seed foi estruturado para ser reexecutavel sem duplicar os principais registros demo.

## Protocolo BMAP aplicado

- Ler documentacao viva antes de codar.
- Validar ambiente com `dev:check`; para subir servicos isolados, usar os checks direcionados dos scripts `dev:web` e `dev:api`.
- Entregar Frontend Surface quando houver uso operacional.
- Fazer commit/push por micro-historia validada.
- Evitar comandos destrutivos sem aprovacao explicita.
