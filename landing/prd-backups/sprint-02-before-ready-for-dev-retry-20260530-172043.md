---
title: 'Sprint 2: Kanban Comercial, Agendamentos e Passagem para Venda'
status: draft
created: 2026-05-29
source_prd: '../../prds/prd-projeto-2-2026-05-25/prd.md'
previous_sprint: '../sprint-01-cadastros-base-clientes-veiculos-estoque/sprint-01-ready-for-dev.md'
---

# Sprint 2: Kanban Comercial, Agendamentos e Passagem para Venda

## Objetivo da Sprint

Transformar a base criada na Sprint 1 em uma operacao comercial utilizavel por SDR, Vendedor, Administrativo e Gestor.

A Sprint 2 deve permitir acompanhar oportunidades no Kanban SDR/vendas, registrar interacoes e follow-ups, controlar agendamentos, identificar leads esfriando, confirmar compra e preparar a passagem para o fluxo futuro de documentacao, pagamento e entrega tecnica.

## Metafora de UX

A interface deve seguir a direcao de **Central de Tracionamento de Vendas / Sales Launchpad**.

O produto nao deve parecer um banco estatico de dados. Ao abrir o sistema, o vendedor/SDR deve enxergar:

- qual lead precisa de acao agora;
- qual agendamento esta proximo;
- qual oportunidade esta esfriando;
- qual negociacao esta pronta para avancar;
- qual card exige follow-up;
- qual compra confirmada precisa ir para documentacao e entrega tecnica.

## Resultado Esperado

Ao final da Sprint 2, um usuario autorizado deve conseguir:

- Visualizar e operar o Kanban comercial SDR/vendas.
- Criar, mover e atualizar cards por etapa.
- Registrar interacoes, observacoes e proximas acoes.
- Criar agendamentos de visita, test drive, retorno/follow-up e entrega tecnica inicial.
- Ver agenda por vendedor/SDR e uma visao administrativa consolidada.
- Identificar leads atrasados, parados ou esfriando.
- Confirmar compra e preparar abertura do fluxo de documentacao.
- Registrar alertas internos para vendedor/administrativo.
- Consultar metricas comerciais basicas.

## Dependencias da Sprint 1

Esta sprint depende de:

- Base de clientes/leads.
- Historico minimo do cliente/lead.
- Cadastro de veiculos.
- Estoque operacional.
- Vinculo cliente/lead x veiculo de interesse.
- Auditoria minima.
- Permissoes basicas por papel.

## Requisitos PRD Cobertos

| FR/NFR | Cobertura na Sprint 2 |
|---|---|
| FR-009 | Leads com origem, canal, intencao, veiculo de interesse e responsavel. |
| FR-010 | Classificacao de intencao do lead. |
| FR-011 | Historico unificado por lead/cliente. |
| FR-012 | Historico com conversas, propostas, acoes, follow-ups, mudancas de etapa e observacoes. |
| FR-013 | Kanban de atendimento e negociacao. |
| FR-014 | Movimentacao de oportunidades entre etapas. |
| FR-015 | Card exibindo status, vendedor, proximo follow-up, ultima interacao e veiculo de interesse. |
| FR-015A | Passo a passo do atendimento ate agendamento, visita, proposta, negociacao, venda, perda ou resgate. |
| FR-015B | Rastreamento de origem, campanha, anuncio e veiculo de interesse quando disponivel. |
| FR-015C | Registro de canais de comunicacao em nivel operacional. |
| FR-015D | Registro de midia, canal, responsavel, data/hora, etapa atual, proxima acao, resultado e observacoes. |
| FR-015E | Base para analise por midia, canal e atendente. |
| FR-015F | Performance de agendamentos: agendada, confirmada, reagendada, comparecida, perdida e convertida. |
| FR-023 | Base futura para centralizacao de conversas. |
| FR-028 | Conversas/interacoes vinculadas a lead, cliente, veiculo, oportunidade e vendedor. |
| FR-029 | Gestor acompanha conversas/interacoes conforme permissao. |
| FR-031 | Historico preservado se lead mudar de vendedor. |
| FR-032 | Base para filas de atendimento. |
| FR-033 | Origem do lead como criterio de fila/filtro. |
| FR-034 | Preparar distribuicao futura de leads. |
| FR-035 | Base para alerta/redistribuicao por SLA. |
| FR-036 | Registrar alteracao de responsavel e motivo. |
| NFR-002 | Consistencia dos dados comerciais. |
| NFR-003 | Auditoria de alteracoes principais. |
| NFR-005 | Permissoes por papel. |

## Escopo da Sprint

### Inclui

- Kanban comercial SDR/vendas.
- Colunas comerciais completas ate confirmacao de compra.
- Agendamentos comerciais.
- Visao de agenda por vendedor/SDR.
- Visao administrativa consolidada de agenda.
- Registro manual/operacional de interacoes.
- Follow-up e proxima acao.
- Identificacao de lead frio/parado/atrasado.
- Alertas internos basicos.
- Confirmacao de compra.
- Preparacao de passagem para fluxo de documentacao.
- Agendamento inicial de entrega tecnica.
- Checklist inicial conceitual de entrega tecnica para sprint futura/detalhamento.
- Metricas comerciais basicas.

### Nao Inclui Nesta Sprint

- Integracao real com WhatsApp/Evolution API.
- Integracao real com Instagram Direct.
- Integracao real com Webmotors, OLX, Mercado Livre, Webcarros ou Mobiauto.
- IA respondendo clientes.
- Distribuicao automatica completa de leads.
- Documentacao completa de venda.
- Conferencia bancaria/financeira completa.
- Contratos finais.
- Impressao automatica da entrega tecnica.
- Assinatura digital completa.
- Dashboard avancado de rentabilidade.
- Modulo de repasse.

## Historias da Sprint

---

## S2-US01: Kanban Comercial SDR/Vendas

**Como** SDR, Vendedor ou Gestor,  
**quero** visualizar, filtrar e mover oportunidades em um Kanban comercial,  
**para** acompanhar cada lead desde a entrada ate a confirmacao de compra, priorizando o que precisa de acao agora.

Arquivo detalhado: `stories/S2-US01-kanban-comercial-sdr-vendas.md`.

### Escopo Inicial

- Colunas: Novo lead, Em contato, Agendado, Visitou loja, Test drive realizado, Em negociacao, Aguardando retorno, Aguardando confirmacao de compra, Perdido/sem interesse.
- Card com cliente/lead, veiculo de interesse, origem, responsavel, status, data de criacao, data do contato, ultima interacao, proxima acao, tempo parado na etapa e alerta de esfriamento.
- Drag and drop ou acao equivalente para mudar etapa.
- Filtros por responsavel, status, origem, veiculo, data de criacao, ultima interacao e lead atrasado/esfriando.
- Auditoria e historico em toda mudanca de etapa.
- Regra inicial de esfriamento: 24h atencao, 48h esfriando, 72h risco alto.

### Regras de Movimentacao

- SDR move cards permitidos ate `Agendado` e `Visitou loja`, ou encaminha para `Em negociacao` quando houver negociacao direta com vendedor.
- Vendedor move todo o fluxo comercial permitido.
- Gestor/Administrador pode mover qualquer card.
- Card perdido/sem interesse sai da visao ativa padrao e preserva historico.
- Card em `Aguardando confirmacao de compra` permanece visivel e fica pronto para S2-US04.

### Criterios Macro

- SDR ve e movimenta cards permitidos dentro das regras de etapa.
- Vendedor ve e movimenta cards da sua base/permissao em todo fluxo comercial.
- Gestor ve e move todos os cards.
- Mudanca de etapa registra historico e auditoria.
- Alertas de lead parado/esfriando aparecem conforme tempo sem interacao.

---

## S2-US02: Agendamentos Comerciais

**Como** SDR, Vendedor, Administrativo ou Gestor,  
**quero** criar e acompanhar agendamentos comerciais vinculados a um card, cliente e veiculo/veiculo de interesse,  
**para** organizar visitas, test drives, retornos, compromissos comerciais e entregas iniciais sem perder contexto do atendimento.

Arquivo detalhado: `stories/S2-US02-agendamentos-comerciais.md`.

### Escopo Inicial

- Tipos: visita na loja, test drive, retorno/follow-up, ligacao, atendimento presencial, confirmacao de visita, reagendamento, resgate de nao comparecimento e entrega tecnica inicial.
- Status: agendado, confirmado, reagendado, compareceu, nao compareceu, cancelado, concluido e sem resposta.
- Todo agendamento comercial deve estar vinculado a um card.
- Todo agendamento comercial deve estar vinculado a cliente/lead.
- Todo agendamento comercial deve estar vinculado a veiculo, veiculo de interesse ou especificacao 0km/encomenda.
- Para veiculo 0km/encomenda, permitir carro de interesse/especificacao desejada sem unidade fisica no estoque.
- Agenda individual para SDR/Vendedor.
- Agenda geral para Gestor, Administrador e Administrativo.
- Registro de origem/canal, inclusive WhatsApp manual sem integracao automatica nesta sprint.
- Agendamentos operacionais de servicos devem seguir Kanban proprio de servicos, separado do Kanban comercial.

### Criterios Macro

- Criar agendamento pelo Kanban/card.
- Agendamento aparece na agenda do responsavel.
- Agendamento aparece no card e no historico do cliente/lead.
- SDR ve somente a propria agenda.
- Vendedor ve somente a propria agenda.
- Gestor/Administrador ve agenda de todos.
- Administrativo ve tudo.
- Mudancas de status geram historico e auditoria.

---

## S2-US03: Registro de Interacoes e Follow-up

**Como** SDR ou Vendedor,  
**quero** registrar interacoes, resultados e proximas acoes em cada card comercial,  
**para** manter o historico do atendimento claro, evitar follow-ups esquecidos e avisar a gestao quando uma oportunidade ficar sem continuidade.

Arquivo detalhado: `stories/S2-US03-registro-interacoes-follow-up.md`.

### Escopo Inicial

- Tipos de interacao: ligacao, WhatsApp manual, visita, test drive, proposta, observacao, retorno prometido, objecao do cliente, tentativa de contato, sem resposta, reagendamento, resgate e outro.
- Campo de resultado da interacao.
- Proxima acao com responsavel e data/hora.
- Ultima interacao visivel no card.
- Proxima acao visivel no card e na agenda/lista de tarefas.
- Follow-up vencido destacado no Kanban.
- Follow-up vencido gera notificacao para Administrador e Dono/Gestor.
- Lead/card sem aviso de continuidade gera notificacao para Administrador e Dono/Gestor conforme limite.
- WhatsApp entra como canal manual nesta sprint, sem integracao automatica.
- Historico unificado no cliente/lead.

### Criterios Macro

- Registrar interacao pelo card.
- Interacao atualiza historico do cliente/lead.
- Proxima acao aparece no card e na agenda/lista de tarefas.
- Follow-up vencido fica destacado e notifica Administrador/Dono/Gestor.
- Lead sem continuidade fica destacado e notifica Administrador/Dono/Gestor.
- Sistema evita notificacoes duplicadas para a mesma pendencia aberta.
- Historico preserva usuario, data/hora, canal, resultado, proxima acao e observacao.

---

## S2-US04: Transicao SDR, Vendas e Gestao/Documentacao

**Como** Vendedor, Gestor ou Administrativo,  
**quero** transferir uma oportunidade do Kanban SDR para o Kanban de Vendas e, quando o negocio for fechado, subir o processo para Gestao/Documentacao,  
**para** separar claramente atendimento, negociacao, fechamento, conferencia documental, pagamento e entrega.

Arquivo detalhado: `stories/S2-US04-transicao-sdr-vendas-gestao-documentacao.md`.

### Escopo Inicial

- Separar tres fluxos: Kanban SDR, Kanban Vendas e Kanban Gestao/Administrativo.
- SDR pode transferir/encerrar card quando cliente for para visita, ver o carro ou entrar em negociacao direta com vendedor.
- Kanban Vendas inicia quando vendedor assume: cliente pisa na loja, visita, vem ver o carro ou inicia negociacao.
- Vendedor conduz negociacao e recolhe documentacao inicial do cliente/comprador.
- Vendedor marca negocio fechado quando houver acordo comercial.
- Negocio fechado sobe card/processo para Gestao/Administrativo.
- Gestao/Administrativo controla documentacao, conferencia de pagamento, entrega tecnica e liberacao final.
- Confirmar negocio fechado nao libera documento nem entrega.
- Se cliente usar financeira propria, alertar que o valor deve cair na conta da loja; caso contrario, nao liberar documento/entrega.

### Criterios Macro

- SDR transfere card permitido para Vendas, mas nao fecha venda.
- Vendedor recebe ou cria card no Kanban Vendas.
- Vendedor registra documentacao inicial e marca negocio fechado.
- Negocio fechado gera processo/fila inicial para Gestao/Administrativo.
- Gestor/Administrativo visualiza e assume conferencia documental/pagamento.
- Todas as transicoes geram historico e auditoria.

---

## S2-US05: Alertas e Leads Esfriando

**Como** Vendedor, SDR, Administrador ou Dono/Gestor,  
**quero** receber alertas e uma fila simples de prioridades comerciais,  
**para** agir antes de perder leads, follow-ups, visitas e negociacoes importantes.

Arquivo detalhado: `stories/S2-US05-alertas-leads-esfriando.md`.

### Escopo Inicial

- Alerta de lead sem interacao recente.
- Alerta de follow-up vencido.
- Alerta de agendamento proximo.
- Alerta de visita nao confirmada.
- Alerta de proposta/negociacao parada.
- Alerta de card sem proxima acao/continuidade.
- Lista de prioridade simples: proxima melhor acao operacional, sem IA.
- Regras iniciais: 24h atencao, 48h notificacao, 72h risco alto, agendamento em 2h, visita nao confirmada 1h antes e negociacao parada 48h.
- Notificacoes para responsavel e para Administrador/Dono/Gestor quando aplicavel.
- Deduplicacao de alertas para evitar repeticao da mesma pendencia.

### Criterios Macro

- Sistema destaca cards atrasados/esfriando no Kanban.
- Usuario ve lista de proximas acoes e alertas proprios.
- Administrador/Dono/Gestor ve alertas gerenciais.
- Gestor consegue filtrar leads parados por vendedor.
- Resolver a pendencia resolve ou atualiza o alerta.
- Alerta gera ou reutiliza evento de historico quando acionado/concluido.

---

## S2-US06: Entrega Tecnica Inicial e Checklist de Entrega

**Como** Administrativo/Gestao,  
**quero** agendar a entrega tecnica somente apos contrato assinado, documentos do comprador entregues e pagamento conferido,  
**para** controlar a liberacao do veiculo e formalizar a conferencia de entrega junto com o cliente.

### Escopo Inicial

- Entrega tecnica formal, sem uso do nome "Party Mode" nesta sprint.
- Agendamento feito pelo Administrativo no Kanban de Gestao/Documentacao.
- Vendedor acompanha data, horario e status agendados pelo Administrativo.
- Entrega tecnica so pode ser agendada apos: contrato assinado, documentos do comprador entregues/conferidos e pagamento confirmado.
- Conferencia realizada junto com o cliente no momento da entrega.
- Documento gerado/preenchido automaticamente antes da impressao com dados de cliente, veiculo, venda, vendedor, responsavel, data e lista de checklist.
- Impressao com campos de checklist item por item para marcacao manual com X junto com o cliente.
- Cliente e responsavel da loja assinam a via impressa.
- Via assinada deve ser registrada/anexada posteriormente na pasta digital do veiculo e vinculada a venda.

### Criterios Macro

- Sistema bloqueia ou sinaliza entrega tecnica quando faltar contrato assinado, documentos do comprador ou pagamento confirmado.
- Administrativo consegue agendar, reagendar e cancelar entrega tecnica conforme permissao.
- Vendedor consegue visualizar a entrega tecnica de suas vendas.
- Documento impresso contem checklist minimo: piscas/setas, luzes, macanetas, travas, vidros, itens eletronicos, painel, multimidia, manual, chave reserva, macaco, triangulo, estepe, ferramentas, conferencia 360, oleo do motor e observacoes.
- Historico registra agendamento, reagendamento, geracao de documento, impressao, conclusao e anexo da via assinada.
- Detalhamento completo: `stories/S2-US06-entrega-tecnica-inicial-checklist.md`.

## S2-US07: Notificacoes Internas Comerciais

**Como** usuario operacional ou gestor,  
**quero** receber notificacoes internas conforme minha permissao e responsabilidade,  
**para** nao perder follow-ups, agendamentos, leads quentes, vendas fechadas, pendencias de documentacao e entregas tecnicas.

Arquivo detalhado: `stories/S2-US07-notificacoes-internas-comerciais.md`.

### Escopo Inicial

- Vendedor recebe notificacoes somente das suas vendas/leads assumidos e de agendamentos feitos pelo SDR para ele.
- SDR recebe notificacoes somente dos proprios leads/cards.
- Administrativo, Dono e Gestor recebem visao geral das notificacoes comerciais e operacionais.
- Notificacoes aparecem na aba de Notificacoes e tambem ficam indicadas no card relacionado.
- Sem badge no menu principal nesta sprint.
- Eventos: follow-up vencido, lead sem continuidade, lead esfriando, agendamento proximo, cliente visitou loja e precisa acao, SDR agendou para vendedor, venda confirmada, documentacao pendente, entrega tecnica agendada e entrega tecnica pendente de assinatura/anexo.
- Acoes: marcar como vista, marcar como resolvida, abrir card relacionado e reatribuir responsavel quando o usuario for Gestor/Administrador.

### Criterios Macro

- Notificacoes respeitam permissao e carteira/responsabilidade de cada usuario.
- Vendedor nao recebe notificacoes de outro vendedor, salvo reatribuicao oficial.
- SDR nao recebe notificacoes de outro SDR, salvo reatribuicao oficial.
- Administrativo/Gestor/Dono visualizam notificacoes gerais e podem filtrar por usuario, etapa, modulo, prioridade, periodo e status.
- Notificacao resolvida nao fica pendente.
- Sistema evita duplicidade de notificacoes iguais para a mesma pendencia ativa.
- Eventos relevantes geram historico/auditoria quando aplicavel.
---

## S2-US08: Metricas Comerciais Basicas e Visao Administrativa dos Kanbans

**Como** Administrador, Dono ou Gestor,  
**quero** acessar todos os Kanbans e escolher qual modulo desejo visualizar, com metricas por etapa e dashboards comerciais basicos,  
**para** acompanhar gargalos de SDR, Vendas e Gestao sem depender de abrir card por card.

Arquivo detalhado: `stories/S2-US08-metricas-comerciais-basicas.md`.

### Escopo Inicial

- Administrador pode acessar todos os Kanbans.
- Administrador pode selecionar qual modulo/Kanban deseja visualizar.
- Dashboard geral da operacao comercial.
- Dashboard especifico do Kanban SDR.
- Dashboard especifico do Kanban Vendas.
- Quantidade de leads/cards por etapa no Kanban SDR.
- Quantidade de cards por etapa no Kanban Vendas.
- Leads transferidos do SDR para Vendas.
- Negocios fechados e enviados para Gestao/Documentacao.
- Follow-ups vencidos, leads esfriando e negociacoes paradas por responsavel.
- Notificacoes internas pendentes/resolvidas e entregas tecnicas agendadas/pendentes/realizadas.
- Filtros por vendedor/SDR, periodo, origem/canal, etapa e status.

### Criterios Macro

- Administrador visualiza todos os Kanbans e dashboards.
- Administrador escolhe modulo/Kanban por seletor.
- Dono/Gestor visualiza metricas gerais conforme permissao.
- Dashboard SDR mostra quantos leads estao em cada processo/etapa.
- Dashboard Vendas mostra quantos cards estao em cada processo/etapa.
- Vendedor/SDR visualizam apenas metricas proprias quando permitido.
- Dados batem com Kanban, agenda, alertas e passagem para Gestao/Documentacao.
- Metricas nao expoem dados financeiros sensiveis sem permissao.

## Permissoes Iniciais

| Papel | Kanban | Agenda | Interacoes | Confirmacao Compra | Metricas |
|---|---|---|---|---|---|
| Administrador | todos | todos | todos | sim | geral |
| Dono/Gestor | todos | todos | todos | conforme regra | geral |
| Administrativo | fluxo pos-confirmacao e consultas permitidas | agenda administrativa | conforme permissao | sim/conforme regra | operacional |
| Vendedor | seus cards/base permitida | sua agenda | seus leads/clientes | sim/conforme regra | proprias |
| SDR | leads/cards permitidos | sua agenda | seus leads | nao, salvo permissao | proprias/operacionais |
| Cliente final | nao | nao | nao | nao | nao |

## Dados Minimos Novos

- `pipeline_cards.status`
- `pipeline_cards.next_action_at`
- `pipeline_cards.last_interaction_at`
- `pipeline_cards.temperature_status`
- `appointments`
- `appointment_status`
- `interaction_type`
- `next_actions`
- `notifications`
- `purchase_confirmations`
- `delivery_technical_schedule`

## Checklist Geral de Pronto da Sprint

- Kanban comercial navegavel e filtravel.
- Cards movem etapa com historico e auditoria.
- Agendamentos podem ser criados e atualizados.
- Agenda individual e consolidada existem.
- Interacoes e proximas acoes aparecem no card/historico.
- Leads parados/follow-ups atrasados sao destacados.
- Compra confirmada gera passagem controlada para fluxo futuro.
- Entrega tecnica pode ser agendada em nivel inicial.
- Notificacoes internas basicas funcionam.
- Metricas basicas batem com dados do funil.
- Permissoes sao aplicadas no backend.

## Riscos e Controles

| Risco | Controle |
|---|---|
| Kanban virar complexo demais | Manter colunas controladas e regras claras de passagem. |
| Confundir confirmacao comercial com liberacao documental | Alerta explicito: nao liberar documento/entrega sem fluxo administrativo. |
| Agendamento duplicado ou esquecido | Agenda unica por responsavel e status padronizado. |
| Lead parado sem acao | Alertas por SLA simples e destaque visual no card. |
| WhatsApp real entrar antes da base estar pronta | Registrar WhatsApp manual nesta sprint; integracao real fica fora. |
| Metricas divergentes | Usar as mesmas tabelas do Kanban/agendamentos como fonte. |

## Proxima Etapa

Detalhar as stories uma a uma, comecando por:

1. `S2-US01: Kanban Comercial SDR/Vendas`
2. `S2-US02: Agendamentos Comerciais`
3. `S2-US03: Registro de Interacoes e Follow-up`

Apos detalhamento, gerar `sprint-02-ready-for-dev.md`.