---
title: 'S2-US08: Metricas Comerciais Basicas e Visao Administrativa dos Kanbans'
status: draft
created: 2026-05-30
sprint: 'Sprint 2: Kanban Comercial, Agendamentos e Passagem para Venda'
source_sprint: '../sprint-02.md'
source_prd: '../../prds/prd-projeto-2-2026-05-25/prd.md'
related_frs:
  - FR-015
  - FR-015A
  - FR-015D
  - FR-015E
  - FR-015F
  - FR-015K
  - FR-015L
  - FR-022A
  - FR-022B
  - FR-022C
  - FR-022CM
  - FR-036
  - FR-118B
  - FR-118C
  - NFR-002
  - NFR-003
  - NFR-005
---

# S2-US08: Metricas Comerciais Basicas e Visao Administrativa dos Kanbans

## Historia

**Como** Administrador, Dono ou Gestor,  
**quero** acessar todos os Kanbans e escolher qual modulo desejo visualizar, com metricas por etapa e dashboards comerciais basicos,  
**para** acompanhar gargalos de SDR, Vendas e Gestao sem depender de abrir card por card.

## Objetivo da Entrega

Criar uma visao administrativa para acompanhar os Kanbans da Sprint 2. O Administrador deve ter acesso a todos os Kanbans e poder selecionar qual modulo deseja visualizar: Kanban SDR, Kanban Vendas, Gestao/Documentacao, alertas, agenda e demais modulos habilitados.

A entrega tambem deve criar dashboards basicos com indicadores por processo: um dashboard geral e visoes especificas para o Kanban SDR e o Kanban Vendas. O foco e responder rapidamente quantos leads/cards existem em cada etapa, onde estao parados e quem e o responsavel.

## Requisitos Cobertos

| FR/NFR | Aplicacao nesta historia |
|---|---|
| FR-015 | Cards/status do Kanban viram indicadores por etapa. |
| FR-015A | Passo a passo do atendimento vira funil visual. |
| FR-015D | Responsavel, etapa, proxima acao e resultado alimentam metricas. |
| FR-015E | Analise por midia, canal e atendente em nivel basico. |
| FR-015F | Performance de agendamentos. |
| FR-015K | Leads esfriando como indicador gerencial. |
| FR-015L | Fila priorizada e alertas resumidos no dashboard. |
| FR-022A | Gestao acompanha leads filtrados/repassados pelo SDR. |
| FR-022B | Metricas de qualificacao e visitas geradas pelo SDR. |
| FR-022C | Metricas de visitas agendadas pelo SDR. |
| FR-022CM | Historico dos SDRs alimenta relatorios de performance. |
| FR-036 | Alteracoes de responsavel e motivo ficam rastreaveis. |
| FR-118B | Performance por atendente/SDR/vendedor. |
| FR-118C | Relatorios de CRM cruzando origem, canal, responsavel, periodo e etapa. |
| NFR-002 | Consistencia das metricas. |
| NFR-003 | Rastreabilidade dos dados usados. |
| NFR-005 | Permissao por papel. |

## Fora de Escopo

- Dashboard executivo financeiro completo.
- Rentabilidade, margem, DRE e comissoes.
- IA/score avancado de Next Best Action.
- Graficos sofisticados de campanha paga.
- Integracao real com marketplaces.
- BI externo.
- Exportacao avancada.

## Decisoes Confirmadas

1. Administrador pode acessar todos os Kanbans.
2. Dono/Gestor tambem pode acessar visao geral conforme permissao.
3. Administrador deve poder selecionar qual modulo/Kanban deseja visualizar.
4. Deve existir dashboard geral da operacao comercial da Sprint 2.
5. Deve existir dashboard especifico para Kanban SDR.
6. Deve existir dashboard especifico para Kanban Vendas.
7. Os dashboards devem mostrar quantos leads/cards estao em cada etapa/processo.
8. As metricas devem respeitar permissao: vendedor/SDR ve dados proprios quando permitido; Administrador/Gestor ve geral.

## Modulos Selecionaveis na Visao Administrativa

A tela administrativa deve oferecer um seletor de modulo, com pelo menos:

- Kanban SDR.
- Kanban Vendas.
- Gestao/Documentacao, como fila/status inicial criada na S2-US04.
- Agenda Comercial.
- Alertas/Leads Esfriando.

Futuro, fora desta story:

- Kanban de Servicos.
- Kanban de Repasse.
- Kanban de Compras/Aquisicao.
- Dashboard financeiro/margem.

## Dashboard Geral

Indicadores minimos:

- Total de cards ativos.
- Total de leads novos no periodo.
- Total de cards no Kanban SDR.
- Total de cards no Kanban Vendas.
- Total de processos em Gestao/Documentacao inicial.
- Total de agendamentos no periodo.
- Total de follow-ups vencidos.
- Total de leads em risco alto.
- Total de negociacoes paradas.
- Total de negocios fechados no periodo.
- Distribuicao por responsavel.
- Distribuicao por origem/canal.

## Dashboard Kanban SDR

Indicadores minimos:

- Total de leads/cards do SDR.
- Quantidade por etapa do Kanban SDR.
- Novos leads.
- Leads em contato.
- Leads agendados.
- Visitas confirmadas.
- Visitas realizadas/comparecidas.
- Visitas nao comparecidas.
- Reagendamentos.
- Leads sem resposta.
- Leads em resgate.
- Leads transferidos para Vendas.
- Taxa basica de conversao SDR -> Vendas.
- Leads parados/esfriando por SDR.

Filtros:

- periodo;
- SDR;
- origem/canal;
- status/etapa;
- veiculo de interesse;
- lead esfriando/risco alto.

## Dashboard Kanban Vendas

Indicadores minimos:

- Total de cards em Vendas.
- Quantidade por etapa do Kanban Vendas.
- Cards recebidos do SDR.
- Cards criados direto pelo vendedor.
- Clientes que visitaram a loja.
- Test drives realizados.
- Negociacoes em andamento.
- Aguardando retorno.
- Aguardando confirmacao de compra.
- Negocios fechados.
- Perdidos/sem interesse.
- Negociacoes paradas por 48h.
- Follow-ups vencidos por vendedor.
- Cards enviados para Gestao/Documentacao.

Filtros:

- periodo;
- vendedor;
- origem/canal;
- etapa;
- veiculo/interesse;
- tipo de entrada: SDR ou direto;
- negociacao parada;
- negocio fechado.

## Visao de Gestao/Documentacao Inicial

Como a S2-US04 ainda cria apenas a fila/status inicial de Gestao/Documentacao, os indicadores devem ser simples:

- processos recebidos de Vendas;
- pendentes de documentacao;
- pendentes de conferencia de pagamento;
- com alerta de financeira propria;
- liberados/concluidos, quando aplicavel futuramente;
- bloqueados por pendencia.

## Permissoes

| Papel | Acesso aos Kanbans | Dashboard geral | Dashboard SDR | Dashboard Vendas |
|---|---|---:|---:|---:|
| Administrador | Todos | Sim | Sim | Sim |
| Dono/Gestor | Todos conforme permissao | Sim | Sim | Sim |
| Administrativo | Gestao/Documentacao, agenda e consultas permitidas | Operacional | Conforme permissao | Conforme permissao |
| Vendedor | Seus cards/base permitida | Nao geral | Nao, salvo permissao | Proprio |
| SDR | Seus leads/cards | Nao geral | Proprio | Nao |
| Cliente final | Nao | Nao | Nao | Nao |

## Modelo de Dados / Fontes

As metricas devem ser calculadas a partir das fontes transacionais da Sprint 2:

- cards do Kanban SDR;
- cards do Kanban Vendas;
- eventos de historico;
- agendamentos;
- interacoes/follow-ups;
- alertas comerciais;
- passagem para Gestao/Documentacao.

Campos ou views recomendadas:

- `stage`
- `kanban_type`
- `responsavel_id`
- `origin_channel`
- `created_at`
- `updated_at`
- `stage_entered_at`
- `last_interaction_at`
- `next_action_at`
- `alert_status`
- `closed_at`
- `lost_reason`

## Criterios de Aceite Funcional

1. Administrador acessa todos os Kanbans.
2. Administrador consegue selecionar qual modulo/Kanban deseja visualizar.
3. Dono/Gestor acessa visao geral conforme permissao.
4. Dashboard geral exibe resumo de cards, leads, agendamentos, alertas e negocios fechados.
5. Dashboard SDR exibe quantidade de leads/cards por etapa.
6. Dashboard SDR exibe leads transferidos para Vendas.
7. Dashboard SDR exibe leads parados/esfriando por SDR.
8. Dashboard Vendas exibe quantidade de cards por etapa.
9. Dashboard Vendas exibe negocios fechados e cards enviados para Gestao/Documentacao.
10. Dashboard Vendas exibe negociacoes paradas e follow-ups vencidos por vendedor.
11. Filtros por periodo, responsavel, origem/canal e etapa funcionam.
12. Vendedor nao acessa dashboard geral sem permissao.
13. SDR nao acessa dashboard geral sem permissao.
14. Dados dos dashboards batem com os Kanbans e agendamentos.
15. Metricas nao expoem dados financeiros sensiveis sem permissao.

## Checklist Tecnico de Aceite

1. Criar tela/rota de visao administrativa dos Kanbans.
2. Criar seletor de modulo/Kanban.
3. Criar consultas agregadas por Kanban e etapa.
4. Criar dashboard geral.
5. Criar dashboard SDR.
6. Criar dashboard Vendas.
7. Criar filtros por periodo, responsavel, origem/canal e etapa.
8. Aplicar permissoes no backend.
9. Garantir que metricas usem fonte transacional, nao contagem manual solta.
10. Criar estados de carregamento, vazio, erro e sem permissao.
11. Criar testes de agregacao, permissao e consistencia com Kanban.

## Testes Minimos

### Testes de Unidade/Agregacao

- Contagem por etapa do Kanban SDR.
- Contagem por etapa do Kanban Vendas.
- Total de leads transferidos SDR -> Vendas.
- Total de negociacoes paradas.
- Total de follow-ups vencidos.
- Filtro por periodo.
- Filtro por responsavel.

### Testes de Permissao

- Administrador ve todos os Kanbans e dashboards.
- Dono/Gestor ve visao geral conforme permissao.
- Vendedor ve apenas metricas proprias quando permitido.
- SDR ve apenas metricas proprias quando permitido.
- Cliente final nao acessa.

### Testes de Integracao

- Criar cards em diferentes etapas e verificar dashboard SDR.
- Transferir card SDR -> Vendas e verificar contadores.
- Criar cards em Vendas e verificar dashboard Vendas.
- Marcar negocio fechado e verificar Gestao/Documentacao inicial.
- Criar follow-up vencido e verificar contador.
- Criar alerta de lead esfriando e verificar dashboard geral.

## Dados Seed/Demo

Criar pelo menos:

- cards distribuídos em todas as etapas SDR;
- cards distribuídos em todas as etapas Vendas;
- cards transferidos de SDR para Vendas;
- negocios fechados enviados para Gestao/Documentacao;
- follow-ups vencidos;
- leads esfriando;
- agendamentos confirmados e nao comparecidos;
- dados de pelo menos 2 SDRs e 2 vendedores.

## Observacoes para UX

A visao administrativa deve ser objetiva. O Administrador deve conseguir trocar de modulo rapidamente e entender onde esta o gargalo: SDR, Vendas ou Gestao/Documentacao.

Evitar uma tela pesada demais. A primeira versao pode usar cards numericos, tabelas simples e filtros claros. Graficos podem ser basicos, desde que a contagem por etapa fique evidente.

## Pronto Para Desenvolvimento Quando

- S2-US01, S2-US04 e S2-US05 estiverem aprovadas.
- Etapas dos Kanbans SDR e Vendas estiverem confirmadas.
- Regras de permissao gerencial estiverem aceitas.
- Fontes de dados transacionais estiverem implementadas ou mockadas.