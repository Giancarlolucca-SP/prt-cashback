# Auditoria pre-merge - S1-US02: Historico minimo do cliente

## Resultado

Status recomendado: pronto para PR/revisao, mantendo a dependencia de merge da S1-US01.

Branch: `feat/s1-us02-customer-timeline-notes`

## Matriz de criterios de aceite

| Criterio | Status | Evidencia |
|---|---:|---|
| Lead minimo gera evento inicial | OK | `customer.minimal_lead_created` em `customers.routes.ts`; smoke cobre historico de lead/cliente. |
| Cliente completo gera evento inicial | OK | `customer.created` em `POST /customers`; smoke exige evento na timeline. |
| Movimento de Kanban registra status anterior/novo | OK | `customer.kanban_status_changed` com `fromStatus` e `toStatus`; smoke cobre movimentacao. |
| Test drive, negociacao, retorno e confirmacao de compra sao representaveis no Kanban | OK | Enum operacional inclui os status da story; Kanban/timeline usam eventos estruturados. |
| Aguardando confirmacao de compra prepara fluxo futuro | OK | `customer.sales_handoff_prepared` com `nextWorkflow: sales_documentation_kanban`. |
| Kanban de atendimento nao mistura documentacao de venda | OK | Evento registra apenas handoff futuro; nenhum fluxo documental foi criado nesta sprint. |
| Observacao manual gera historico/auditoria | OK | `POST /customers/:id/history-notes`; cria `customer.manual_note_created` e `auditLog`. |
| Observacao respeita carteira/ownership | OK | Endpoint usa `customerScopeWhere`; smoke cobre tentativa fora de carteira com `404`. |
| Agendamento criado/remarcado/realizado/cancelado gera rastro | OK | Eventos `customer.appointment_created`, `customer.appointment_updated`, `customer.appointment_status_changed`; smoke cobre `DONE` e `CANCELLED`. |
| Agendamento respeita ownership | OK | Validacao de cliente/lead considera carteira/atribuicao; smoke cobre vendedor tentando cliente de outra carteira. |
| Filtros da timeline por grupo funcional | OK | UI filtra por Todos, Atendimento, Kanban, Agendamentos, Venda e Sistema. |
| Eventos exibem detalhes estruturados | OK | UI mostra tipo, origem, perfil, status anterior/novo, workflow futuro e campos alterados. |
| Anti-tracker em textos livres | OK | Observacao de historico e notas de agendamento usam `containsRemoteLoadVector`; smoke cobre bloqueio em historico. |

## Riscos residuais

- A UI de criar/remarcar/cancelar agendamento diretamente dentro do detalhe do cliente ainda nao foi adicionada; o backend e a tela de agendamentos ja produzem a timeline.
- Cliente final ainda nao tem area propria no MVP, entao o bloqueio de timeline para cliente final permanece coberto por ausencia de permissao/rota autenticada operacional.
- A branch esta empilhada sobre S1-US01; conflitos devem ser resolvidos apos merge/retarget.

## Validacoes executadas

- `npm run db:generate`
- `npm run typecheck`
- `npm run build:api`
- `npm run build:web`
- `npm test`

## Recomendacao BMAP

- Abrir PR da S1-US02 apos merge da S1-US01.
- Manter o Kanban de vendas/documentacao como historia futura separada.
- Se houver rodada extra antes do merge, priorizar apenas ajustes de review, sem expandir escopo funcional.
