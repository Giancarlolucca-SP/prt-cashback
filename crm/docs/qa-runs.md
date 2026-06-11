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

## 2026-06-11 - QA funcional automatizado por perfil

Contexto:

- Etapa BMAP: reforco do QA funcional com roteiro repetivel.
- Foco: validar todos os perfis seedados, permissoes criticas de RBAC, endpoints sensiveis e rotas Web principais.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:functional:local` | Passou |

Resultado:

- Readiness da API: ok.
- Logins validados: Dono/Gestor, Admin, Administrativo, Vendedor, SDR, Avaliador e Servicos.
- Permissoes RBAC validadas: 16.
- Endpoints RBAC validados: 8.
- Rotas Web principais validadas: 13.

Cobertura automatizada desta rodada:

- Vendedor sem acesso a financeiro global e auditoria.
- SDR sem acesso a vendas.
- Avaliador sem acesso a auditoria global.
- Servicos com acesso a OS e sem acesso a auditoria.
- Dono/Gestor com acesso a financeiro, auditoria e usuarios.
- Administrativo com acesso a financeiro operacional e sem acesso a auditoria.

Observacoes:

- Esta rodada nao substitui a inspecao visual de layout, tema, modais e estados vazios.
- Proxima etapa recomendada: QA visual/manual nas telas principais com os perfis do checklist.

## 2026-06-11 - QA visual automatizado desktop/mobile

Contexto:

- Etapa BMAP: QA visual assistido e repetivel.
- Foco: detectar regressao visual basica, overflow horizontal, erros acionaveis de console e gerar screenshots locais.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:visual:local` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |

Resultado:

- Rotas verificadas: 9.
- Viewports: desktop `1440x900` e mobile `390x844`.
- Screenshots gerados em `.qa-screenshots/` e ignorados pelo Git.
- Sem overflow horizontal detectado nas rotas verificadas.
- Sem erros acionaveis de console apos correcoes.

Correcoes feitas durante a rodada:

- Agregadas fontes de leads com o mesmo nome humanizado no grafico de distribuicao, evitando fatias duplicadas com chave igual.
- Corrigidas chaves React em cards de configuracoes, blueprint generico e kanban consolidado para tolerar nomes repetidos vindos da massa seed/teste.

Observacoes:

- O script ignora ruidos conhecidos do Next/React em modo development, como avisos de `unsafe-eval`.
- A inspecao humana ainda deve revisar detalhes finos de usabilidade, texto e fluxo de modais.
