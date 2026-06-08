# Decisoes de Arquitetura - Sprint 11

## ADR-001: Criar base isolada em `crm/`

Status: aprovado na implementacao inicial da S11-US01.

Contexto:

- O repositorio existente contem um sistema de cashback/posto.
- A Sprint 11 define um CRM automotivo com dominio, telas, banco e regras diferentes.
- Alterar diretamente o app existente criaria risco alto de regressao.

Decisao:

- Criar a fundacao do CRM em `crm/`, com package proprio, Docker Compose, API, web, Prisma e scripts.

Consequencias:

- Produto atual permanece preservado.
- O CRM ganha trilha tecnica propria.
- Futuramente o CRM pode virar repositorio separado ou workspace principal.

## ADR-002: Fastify como backend inicial

Status: aprovado para a primeira implementacao.

Contexto:

- A Sprint 11 deixou NestJS ou Fastify como decisao final de implementacao.
- A primeira historia precisa de fundacao leve, rapida e modular.

Decisao:

- Usar Fastify no MVP inicial.

Consequencias:

- Menor complexidade inicial.
- Boa performance e tipagem.
- Se a organizacao crescer, a extracao para NestJS ou modularizacao mais formal continua possivel.

## ADR-003: Prisma schema minimo na S11-US01

Status: parcial e intencional.

Contexto:

- A S11-US02 cobre o modelo de dados completo.
- A S11-US01 deve apenas criar a base tecnica sem antecipar todas as entidades.

Decisao:

- Criar schema minimo com `Store`, `User`, `AuditLog` e `BackgroundJob`.

Consequencias:

- Prisma fica conectado desde o inicio.
- A S11-US02 pode expandir o schema com as entidades de dominio.

## ADR-004: Expansao do schema base para a S11-US02

Status: aplicado na fundacao atual do CRM.

Contexto:

- A S11-US02 precisava transformar o desenho macro do CRM em um banco relacional inicial.
- As telas de preview ja aprovaram dominios como clientes, leads, estoque, vendas, financeiro, comissoes, repasse, servicos, documentos, automacoes, integracoes, IA/OCR e auditoria.
- O MVP precisa nascer com `store_id` nos dominios principais para permitir evolucao futura para multiplas unidades.

Decisao:

- Expandir `packages/db/prisma/schema.prisma` para cobrir os dominios persistentes principais do CRM.
- Manter PostgreSQL como fonte principal de verdade.
- Usar referencias flexiveis por `entity_type` e `entity_id` em anexos, auditoria, automacoes, jobs e logs quando a relacao puder atravessar multiplos modulos.
- Preservar snapshots em dominios financeiros, contratos, comissoes, DRE e configuracoes tributarias.
- Criar testes de contrato em `tests/prisma-schema-contract.test.mjs` para proteger decisoes estruturais do schema.

Consequencias:

- O produto ja tem base de dados suficiente para iniciar endpoints reais por modulo.
- As proximas historias devem evitar duplicar entidades fora do Prisma e devem evoluir o schema por migrations versionadas.
- Relacoes flexiveis exigem validacao forte no backend para garantir permissao, escopo e integridade operacional.
- O schema deve continuar priorizando auditoria, historico, snapshots e `store_id` nos dominios operacionais.

Evolucao futura:

- Quando o volume real justificar, avaliar indices adicionais, views/materialized views para dashboards e eventual pgvector para busca semantica.
- Se um modulo for extraido no futuro, preservar contratos, IDs, logs, snapshots, permissoes e historico de auditoria.
