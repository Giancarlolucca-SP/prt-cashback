# PR - S1-US02: Historico minimo do cliente

## Contexto

Entrega a base operacional da S1-US02 para timeline de cliente/lead no CRM automotivo.

A historia cobre rastreabilidade minima desde criacao do lead/cliente, movimentacao no Kanban de atendimento, observacoes manuais, agendamentos e preparacao da passagem futura para o Kanban de vendas/documentacao.

## O que mudou

- Criado endpoint `POST /customers/:id/history-notes` para observacoes manuais na timeline.
- Criacao de cliente completo passa a gerar evento automatico `customer.created`.
- Lead minimo ja registrado pelo fluxo de clientes segue gerando `customer.minimal_lead_created`.
- Movimentacao do Kanban registra `customer.kanban_status_changed` com status anterior e novo.
- Ao chegar em `WAITING_PURCHASE_CONFIRMATION`, o sistema registra `customer.sales_handoff_prepared`, preparando a passagem futura para vendas/documentacao sem implementar esse Kanban nesta sprint.
- Agendamentos vinculados a cliente geram eventos de criacao, atualizacao/remarcacao e mudanca de status.
- Timeline ganhou filtros funcionais: Todos, Atendimento, Kanban, Agendamentos, Venda e Sistema.
- UI exibe detalhes estruturados dos eventos sem mostrar JSON bruto.
- Ownership reforcado para observacoes, Kanban e agendamentos, com `404` para recursos fora do escopo.
- Entrada de observacoes e agendamentos bloqueia vetores remotos carregaveis para evitar trackers.

## Seguranca e acesso

- Vendedor/SDR ficam limitados a clientes/leads da propria carteira/atribuicao.
- Tentativas fora do escopo retornam `404`.
- Observacoes manuais passam por validacao server-side e bloqueio anti-tracker.
- Agendamentos nao podem ser criados ou atualizados apontando para cliente/lead fora do escopo do usuario.

## Testes executados

- `npm run db:generate`
- `npm run typecheck`
- `npm run build:api`
- `npm run build:web`
- `npm test`

## Observacoes de review

- Esta branch esta empilhada sobre `feat/s1-us01-role-visuals`.
- Revisar/mergear S1-US01 antes, ou retargetar esta branch depois que S1-US01 entrar em `main`.
- A historia nao implementa Kanban de vendas/documentacao; apenas registra a preparacao quando o atendimento chega em `Aguardando confirmacao de compra`.
