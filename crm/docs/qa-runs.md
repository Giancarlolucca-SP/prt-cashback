# Rodadas de QA - CRM Automotivo MVP

Este documento registra validacoes executadas durante a consolidacao BMAP da fundacao do CRM.

## 2026-06-11 - Fundacao tecnica Sprint 11

Contexto:

- Etapa BMAP: consolidacao tecnica da fundacao do CRM novo em `crm/`.
- Foco: validar testes automatizados, typecheck e builds antes de avancar para QA funcional manual.
- Escopo: apenas projeto novo `crm/`; alteracoes pendentes fora de `crm/` pertencem ao produto legado e nao entram nesta rodada.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm test` | Passou: 11 testes, 0 falhas |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |

Observacoes:

- `npm test` ainda imprime logs `prisma:error` em cenarios esperados de constraint unica e idempotencia. Os testes passam, mas o ruido deve ser reduzido em uma melhoria futura para facilitar leitura de QA/CI.
- `npm run smoke:local` nao foi executado nesta rodada porque exige API e Web rodando localmente em paralelo.
- Proxima etapa recomendada: subir ambiente local via Docker/setup e executar o smoke funcional/manual do checklist.

## 2026-06-11 - Smoke funcional local

Contexto:

- Etapa BMAP: QA funcional automatizado da fundacao do CRM novo.
- Foco: validar ambiente local com banco seedado, API, Web e rota funcional principal.
- Escopo: apenas projeto novo `crm/`.

Preparacao executada:

| Acao | Resultado |
| --- | --- |
| `npm run dev:check` | Passou apos liberar a porta `3000`, que estava ocupada pelo servidor legado `src/server.js` |
| Docker Desktop | Nao respondeu durante a janela de espera |
| PostgreSQL local `localhost:5432` | Disponivel conforme `.env` local |
| `npm run db:generate` | Passou |
| `npm run db:deploy` | Passou, sem migrations pendentes |
| `npm run db:seed` | Passou |
| `npm run dev:api` | API disponivel em `http://localhost:3333` |
| `npm run dev:web` | Web disponivel em `http://localhost:3000` |

Smoke executado:

| Comando | Resultado |
| --- | --- |
| `npm run smoke:local` | Passou |

Resultado do smoke:

- `health`: ok.
- Sessao autenticada: `dono@gt3.local`.
- Clientes: 5.
- Leads: 5.
- Estoque: 5.
- Vendas: 5.
- Ordens de servico: 5.
- Prestadores: 5.
- Clientes de pos-venda: 5.
- `financeNet`: 7133500.
- Rotas Web navegadas: 26.

Observacoes:

- API e Web ficaram rodando localmente apos a validacao para permitir QA manual.
- Docker deve ser revisitado antes de validar portabilidade completa. A rodada atual prova o fluxo local usando PostgreSQL local existente.
