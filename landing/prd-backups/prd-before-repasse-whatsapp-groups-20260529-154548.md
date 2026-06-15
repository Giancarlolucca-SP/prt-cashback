---
title: 'PRD: GT3 Veiculos - Plataforma Operacional Interna'
status: draft
created: 2026-05-25
updated: 2026-05-26
source_inputs:
  - '../briefs/brief-projeto-2-2026-05-25/brief.md'
  - '../briefs/brief-projeto-2-2026-05-25/addendum.md'
  - '../briefs/brief-projeto-2-2026-05-25/.decision-log.md'
  - '../bmad-kickoff-handoff-crm-whatsapp-used-car-dealer.md'
---

# PRD: GT3 Veiculos - Plataforma Operacional Interna

## 1. Resumo

O sistema da GT3 Veiculos e uma plataforma operacional interna para uma unica loja de veiculos. Ele combina site publico de estoque, CRM inteligente, atendimento omnichannel, agente de IA, gestao comercial, estoque profissional, financeiro, documentos, avaliacao veicular, publicacao de anuncios, fiscal e indicadores executivos.

O produto deve resolver dois problemas centrais:

- Para compradores: encontrar veiculos, confiar na loja e iniciar atendimento rapido.
- Para a GT3 Veiculos: transformar leads em vendas com mais controle, menos perda de oportunidade e melhor visibilidade operacional.

O sistema deve ser especifico para a operacao interna da GT3 Veiculos, nao um CRM generico adaptado.

O CRM nao deve ser tratado como um banco de dados de carros; ele deve funcionar como uma Central de Tracionamento de Vendas (Sales Launchpad), orientando a equipe sobre onde agir agora para aumentar conversao, velocidade de atendimento e recuperacao de oportunidades.

## 2. Regras de Produto e Documentacao

- O PRD deve ser especifico, nao generico.
- Quando uma informacao estiver faltando, marcar como **A validar**.
- Nao inventar integrações, regras fiscais, bancos, portais ou fornecedores sem validacao.
- A documentacao deve seguir **Documentation as Code**.
- Nomenclatura deve usar termos convencionais do dominio.
- Prioridade de produto: simplicidade e flexibilidade acima de rapidez/escalabilidade prematura.
- A solucao deve priorizar a acao do vendedor na UX, exibindo proximas acoes claras, oportunidades relevantes e tarefas de maior impacto antes de informacoes secundarias.
- A arquitetura deve proteger a infraestrutura contra custos abusivos de IA, com limites de uso, filas, cache, logs, monitoramento, fallback e regras de autorizacao para tarefas caras.
- Dados integrados entre CRM, vendas, estoque, anuncios, marketplaces, atendimento, financeiro e IA devem ser tratados como base central do produto, evitando informacoes soltas e permitindo analise confiavel de resultado.
- Site publico deve usar como benchmark visual a pagina da Avantgarde: https://avantgarde.com.br/.
- Na metodologia BMAD/BMAP, antes do Sprint Planning, deve ser analisado o escopo em alto nivel dos 10 epicos mapeados, garantindo entendimento de objetivo, limites, dependencias, riscos e valor de negocio de cada epico.
- A etapa de extracao de epicos e historias macros deve agrupar os mais de 100 requisitos em blocos conceituais logicos orientados a jornadas do usuario, como Onboarding, CRM/Sales Launchpad, Integracao com Marketplaces, Funil de Vendas, Avaliacao Veicular, Consignacao, Contratos/Fiscal, Financeiro/Comissoes, Anuncios/Marketing e Relatorios de Performance.
- Epicos devem ser quebrados depois em sprints menores com checklist tecnico de aceite.
- Sprint Planning deve transformar epicos conceituais em blocos menores de tempo, com historias/tarefas tecnicas, criterios de aceite, dependencias, prioridade e definicao clara de pronto para o desenvolvedor.
- Antes de escrever codigo, a metodologia BMAP deve executar a fase de Verificacao de Prontidao de Implementacao (Implementation Readiness Assessment), usando checagem cruzada automatica do tipo `bmad-check-implementation-readiness` para validar se PRD, epicos, historias, arquitetura, UX, criterios de aceite, dados, permissoes, integracoes e riscos estao coerentes.
- A metodologia deve incluir um Processo de Auditoria e Limpeza de Gaps e Dependencias, no qual a IA varre todos os documentos gerados e valida se 100% dos Requisitos Funcionais do PRD estao contemplados em alguma historia dos epicos.
- A auditoria tambem deve identificar Recursos Fantasmas: historias, tarefas, telas, integracoes ou regras adicionadas pela IA que nao tenham lastro no PRD original, decisoes registradas ou validacao explicita do gestor.
- O sistema e de uso interno da GT3 Veiculos, uma unica loja.

## 3. Objetivos

### 3.1 Objetivos de Negocio

- Aumentar vendas por meio de resposta mais rapida e melhor tratamento de leads.
- Reduzir perda de oportunidades por mensagens espalhadas, follow-ups esquecidos ou leads inativos.
- Aumentar giro de estoque com precificacao, anuncios e IQA melhores.
- Dar ao dono visao completa de vendas, estoque, faturamento, funil e desempenho da equipe.
- Centralizar operacoes da GT3 Veiculos em uma plataforma unica.
- Melhorar controle de custo real e margem por veiculo.

### 3.2 Objetivos de Usuario

- Vendedor deve abrir o sistema e saber a proxima acao de maior impacto.
- Dono deve enxergar saude da loja, gargalos, vendedores e oportunidades rapidamente.
- Cliente final deve conseguir encontrar veiculos, tirar duvidas e agendar atendimento com pouca friccao.
- Avaliador/prestador deve registrar avaliacao, fotos e custos pelo app.
- Administrativo deve assumir o fluxo apos a avaliacao para lancar despesas de oficina por carro e despesas operacionais da loja.
- Financeiro deve conferir duplicatas a pagar e valores recebidos em conta corrente.

## 4. Usuarios e Permissoes

### 4.1 Perfis Principais

- **Cliente final:** comprador, vendedor, interessado em troca ou consignacao.
- **SDR:** filtra potenciais leads, qualifica intencao de compra, valida interesse em veiculo do estoque e agenda visita a loja quando houver potencial.
- **Vendedor:** atende leads, conversa com clientes, agenda visitas/test drives, envia propostas e move negociacoes.
- **Dono/Gestor:** ve todas as atividades, funil, leads, estoque, desempenho, indicadores e financeiro permitido.
- **Gestor de Servicos:** registra e acompanha servicos vendidos ou executados, como polimento, PPF, pintura de roda, vitrificacao, peliculas e peliculas antivandalismo; usa o app no recebimento e entrega do veiculo; executa checklist de chegada do veiculo; coleta visto/aprovacao do cliente; acompanha e cria agendamentos de servicos.
- **Administrativo:** acessa o fluxo apos a avaliacao/aprovacao do veiculo, lanca despesas de oficina vinculadas a cada carro, registra despesas diarias, fixas e variaveis da loja e opera o modulo de repasse de veiculos.
- **Financeiro:** ve duplicatas a pagar e confere valores recebidos em conta corrente. Integracao de saldo bancario sera necessaria.
- **Avaliador:** cadastra e avalia veiculos, registra fotos, custos e condicoes.
- **Prestador de servico:** recebe/atualiza ordens de servico e registros operacionais permitidos.
- **Administrador:** configura usuarios, permissoes, integrações, templates, filas e parametros do sistema.

- **Administrador:** tambem pode acessar o modulo de repasse de veiculos quando a permissao operacional estiver habilitada.

### 4.2 Regra de Visibilidade

- **Vendedor:** ve apenas seus leads, conversas, oportunidades, tarefas e vendas, exceto quando regra de fila/gestao permitir o contrario.
- **Vendedor:** tambem pode ver suas vendas e comissoes acumuladas ate o momento.
- **SDR:** ve leads em qualificacao, origem, intencao, veiculo de interesse e agenda de visitas vinculadas a qualificacao.
- **Gestor de Servicos:** ve apenas tarefas de servico, checklists, agendamentos de servico, veiculos relacionados e registros antes/depois sob sua responsabilidade.
- **Dono/Gestor:** ve todos os leads, conversas, atividades, vendas, estoque, funil e desempenho da equipe.
- **Administrativo:** ve veiculos em preparacao/estoque, lancamentos operacionais e modulo de repasse necessarios para registrar despesas, anunciar veiculos de repasse e acionar compradores cadastrados, sem acesso irrestrito a conversas, leads e configuracoes administrativas.
- **Financeiro:** deve ser restrito a duplicatas a pagar, valores recebidos em conta corrente e dados financeiros necessarios a essa conferencia.
- **Avaliador/Prestador:** ve apenas atividades, veiculos e ordens atribuidas ou permitidas.

## 5. Experiencia e UX

### 5.1 Site Publico

O site publico deve ser uma vitrine de veiculos confiavel, visual e objetiva, inspirada no benchmark Avantgarde.

Diretrizes:

- Busca/filtro de veiculos em destaque no inicio.
- Cards de veiculos com marca, modelo, ano, quilometragem, preco e CTA.
- Pagina de detalhe com fotos, dados, descricao, financiamento/interesse e WhatsApp.
- CTA para contato quando o cliente nao encontrar o modelo desejado.
- O site publico deve focar clientes, estoque e atendimento da GT3 Veiculos.

### 5.2 CRM Interno

O CRM deve ser operacional, denso, escaneavel e orientado a execucao.

### 5.3 UX Orientada a Progresso Real

O vendedor deve ter uma tela inicial que responde:

> Qual e a proxima acao de maior impacto que devo fazer agora?

A home do vendedor deve priorizar:

- Lead quente aguardando resposta.
- Follow-up atrasado.
- Lead com takeover manual da IA.
- Proposta perto do vencimento.
- Test drive ou visita proximos.
- Negociacao pronta para avancar.
- Lead inativo com alto potencial.

Menus genericos e listas sem prioridade devem ser secundarios.

## 6. Escopo Funcional

### 6.1 Site Publico e Captacao

- **FR-001:** O sistema deve permitir publicar uma vitrine publica de veiculos da GT3 Veiculos.
- **FR-002:** O site deve permitir busca e filtro por marca, modelo, ano, preco e outros filtros configuraveis.
- **FR-003:** Cada veiculo publicado deve ter pagina de detalhe com fotos, dados principais, descricao e CTA de contato.
- **FR-004:** O site deve capturar leads interessados em um veiculo especifico.
- **FR-005:** O site deve capturar leads que nao encontraram o veiculo desejado.
- **FR-006:** Leads do site devem entrar no CRM com origem, veiculo de interesse e contexto da interacao.
- **FR-007:** O site deve oferecer CTA para WhatsApp.
- **FR-008:** O site publico deve direcionar clientes para contato, WhatsApp, interesse em veiculos e atendimento da GT3 Veiculos.

### 6.2 CRM, Leads e Funil

- **FR-009:** O sistema deve cadastrar leads com origem, canal, intencao, veiculo de interesse e responsavel.
- **FR-010:** O sistema deve classificar intencao do lead como comprar, vender, trocar, consignar, financiar, avaliar ou outra categoria configuravel.
- **FR-011:** O CRM deve manter historico unificado por lead.
- **FR-012:** O historico do lead deve incluir conversas, propostas, acoes, follow-ups, mudancas de etapa e observacoes.
- **FR-013:** O CRM deve possuir kanban de atendimento e negociacao.
- **FR-014:** O kanban deve permitir arrastar e soltar oportunidades entre etapas.
- **FR-015:** O kanban deve exibir status do cliente, vendedor, proximo follow-up, ultima interacao e veiculo de interesse.
- **FR-015A:** O CRM em formato kanban deve registrar o passo a passo do cliente em todas as etapas do atendimento, desde a entrada do lead ate agendamento, visita, avaliacao, proposta, negociacao, venda, perda ou resgate.
- **FR-015B:** O CRM deve integrar e consolidar midias de origem como portais, redes sociais, campanhas pagas, indicacao, busca organica e offline, mantendo rastreio de origem, campanha, anuncio e veiculo de interesse quando disponivel.
- **FR-015C:** O CRM deve integrar e consolidar canais de comunicacao como formularios do site, WhatsApp, telefone, atendimento na loja fisica, redes sociais e outros canais configuraveis, garantindo que todos os atendimentos fiquem registrados no historico do lead/cliente.
- **FR-015D:** Cada atendimento deve registrar midia de origem, canal de comunicacao, atendente/SDR/vendedor responsavel, data/hora, etapa atual, proxima acao, resultado e observacoes relevantes para follow-up.
- **FR-015E:** O CRM deve permitir analise de resultado por midia, canal e atendente, apoiando decisoes de investimento em marketing, escolha de canais prioritarios, treinamento de equipe e avaliacao de desempenho.
- **FR-015F:** O sistema deve acompanhar performance de agendamentos realizados, incluindo quantidade agendada, confirmada, reagendada, comparecida, perdida e convertida em avaliacao ou venda.
- **FR-015G:** O sistema deve acompanhar conversao de avaliacao por origem, canal, atendente, vendedor, avaliador e etapa do funil, permitindo identificar gargalos no atendimento ao lead.
- **FR-015H:** O CRM deve usar as informacoes registradas no atendimento para sugerir follow-ups, recontatos e proximas acoes contextualizadas conforme interesse, historico, objeções e status do cliente.
- **FR-015I:** A tela principal do vendedor deve funcionar como Sales Launchpad, priorizando a proxima melhor acao (Next Best Action) em vez de apenas listar clientes, carros ou tarefas.
- **FR-015J:** O sistema deve indicar ao vendedor qual cliente ou lead tem maior probabilidade de fechamento naquele momento, considerando origem, tempo de resposta, engajamento, etapa do funil, veiculo de interesse, historico de conversa, visitas, propostas e sinais de urgencia.
- **FR-015K:** Leads vindos de marketplaces como Webmotors, Mercado Livre, OLX e outros portais devem ter alertas de esfriamento quando ficarem sem resposta, sem follow-up, sem agendamento ou parados alem do limite configurado.
- **FR-015L:** O CRM deve exibir uma fila priorizada de leads quentes, leads esfriando, visitas proximas, propostas abertas e resgates recomendados, com acao sugerida, motivo da prioridade e prazo para agir.
- **FR-015M:** O ranking de prioridade/Next Best Action deve ser configuravel e auditavel, permitindo ajustar pesos por canal, marketplace, tempo parado, interacao recente, valor potencial, veiculo de interesse e chance de conversao.
- **FR-015N:** O Next Best Action pode usar score de match calculado pela camada de inteligencia, conectando perfil do lead, historico de compras, interacoes em marketplaces, margem dos veiculos no patio, estoque disponivel e status da negociacao.
- **FR-015O:** A tela do vendedor deve exibir o motivo resumido do score/recomendacao, por exemplo lead interessado em SUV, veio da Webmotors, interagiu recentemente, veiculo no patio tem boa margem e proposta esta aberta ha pouco tempo.
- **FR-016:** O sistema deve registrar propostas, condicoes e contraofertas por negociacao.
- **FR-016A:** Ao informar ao cliente/proprietario que o veiculo consignado foi vendido, o sistema deve exibir ao vendedor um lembrete discreto de boas praticas sobre negociacao de prazo e valores, orientando cuidado, dedicacao e atencao por ser uma etapa sensivel.
- **FR-016B:** O lembrete ao vendedor deve reforcar que, apos comunicar a venda, inicia-se a negociacao de prazo para pagamento e acerto de valores, sem automatizar promessas ou condicoes fora das regras aprovadas.
- **FR-016C:** No modulo do vendedor, durante atendimento/precificacao de veiculo consignado, o sistema deve exibir lembrete discreto de boa pratica com o conceito "Combinado nao sai caro".
- **FR-016D:** O lembrete deve orientar o vendedor a mostrar ao cliente/proprietario todos os reparos necessarios para o veiculo, incluindo fotos, valores e previsao de tempo de preparacao.
- **FR-016E:** O sistema deve orientar o vendedor a explicar que, sem a realizacao dos reparos necessarios, o veiculo pode ter menor facilidade de venda e exigir politica de preco mais agressiva, impactando o valor que o proprietario pretende receber.
- **FR-016F:** O lembrete deve usar informacoes da avaliacao, melhorias necessarias, fotos, custos estimados e prazo de preparacao quando esses dados estiverem disponiveis.
- **FR-016G:** A apresentacao de reparos/melhorias ao cliente deve poder seguir formato de lista por item de avaliacao, agrupada por area do veiculo, exibindo descricao do problema, tipo de servico, valor estimado, status e acao de aprovar/recusar quando aplicavel.
- **FR-016H:** Cada item de reparo/melhoria deve permitir abrir um modal ou visualizacao de "foto do problema", exibindo uma ou mais fotos/evidencias vinculadas ao item.
- **FR-016I:** O formato deve permitir que o vendedor mostre de forma clara o custo de cada reparo e a relacao com a preparacao do veiculo, mantendo historico da decisao do cliente/proprietario sobre aprovar ou recusar itens.
- **FR-016J:** Como referencia de apresentacao ao cliente, a tela deve exibir uma lista vertical de itens de avaliacao com area do veiculo, nome do reparo, descricao do servico, gasto estimado, icone de camera/foto e botao de recusar/aprovar; ao clicar na foto, deve abrir um modal central com titulo "Foto do problema" e imagens do item selecionado.
- **FR-016K:** No momento do atendimento/compra, especialmente quando o cliente deseja vender o carro, o vendedor deve poder apresentar tres propostas: Compra, Troca e Consignacao.
- **FR-016L:** O sistema deve permitir que o vendedor escolha/direcione a proposta principal conforme estrategia do atendimento, mantendo Compra, Troca e Consignacao como opcoes ajustaveis no momento da negociacao.
- **FR-016M:** Para cada uma das tres propostas, o sistema deve permitir registrar valor, condicoes, prazo, observacoes, status e justificativa, mantendo historico do que foi apresentado ao cliente.
- **FR-016N:** Quando o vendedor seguir pelo padrao de consignacao, o sistema deve permitir ajustar facilmente a proposta durante o atendimento sem perder o historico das alternativas apresentadas.
- **FR-016O:** No atendimento de consignacao, o sistema deve detalhar todos os descontos, servicos e custos previstos que serao abatidos ou considerados na negociacao, garantindo transparencia antes da assinatura.
- **FR-016P:** Os descontos/servicos apresentados ao cliente devem ser originados dos itens apontados na avaliacao, exibindo area do veiculo, item, tipo de servico, valor previsto, foto/evidencia, status de aprovacao/recusa e impacto no valor liquido do proprietario quando aplicavel.
- **FR-016Q:** A apresentacao ao cliente pode seguir layout mobile em lista simples, com cabecalhos "Item de avaliacao" e "Gasto", icone de camera para abrir fotos do problema, valor em reais e botao de recusar/aprovar por item, mantendo navegacao de voltar e atualizar.
- **FR-016R:** O sistema deve registrar a ciencia do cliente/proprietario sobre os descontos, servicos e custos apresentados, vinculando essa ciencia ao Termo de Autorizacao de Servicos e ao historico da consignacao.
- **FR-017:** O sistema deve registrar motivo de perda quando uma negociacao for encerrada como perdida.
- **FR-018:** O CRM deve reativar leads inativos por regras configuraveis.
- **FR-019:** O CRM deve gerar lembretes de follow-up.
- **FR-020:** O CRM deve sugerir recontatos em datas estrategicas como aniversario, vencimento de proposta e campanhas sazonais.
- **FR-020A:** O sistema deve enviar automaticamente mensagem de parabens em data de aniversario do cliente, conforme template configuravel, canal permitido e regra de opt-in/consentimento. Canal inicial: WhatsApp.
- **FR-020B:** O envio automatico de aniversario deve registrar historico no cadastro do cliente, incluindo data/hora, canal, template, status de envio e responsavel/automacao.
- **FR-020C:** O Administrador deve poder visualizar, no modulo Administrativo, quais mensagens automaticas de aniversario foram enviadas pelo WhatsApp, com cliente, telefone, data/hora, template, status, automacao responsavel e eventual erro de envio.
- **FR-020D:** Quando houver resposta do cliente a mensagem de aniversario, o sistema deve vincular a resposta ao cadastro do cliente e permitir que o Administrador visualize a conversa/resumo conforme permissao, registrando data/hora, canal e responsavel pelo acompanhamento quando houver.
- **FR-021:** O CRM deve sugerir acoes para transformar contatos antigos em novas oportunidades.
- **FR-022:** O sistema deve calcular e exibir tempo de resposta e tempo parado por etapa.
- **FR-022A:** O sistema deve permitir que SDRs filtrem potenciais leads antes de repassar para vendedores.
- **FR-022B:** O SDR deve poder qualificar intencao de compra, interesse em veiculo do estoque e disposicao para visitar a loja.
- **FR-022C:** O SDR deve poder agendar visita para lead qualificado.
- **FR-022CA:** No atendimento ao lead pelo pre-vendas/SDR, o sistema deve exibir lembretes discretos de boas praticas com foco em abordagem positiva, confirmacao de visita, reagendamento e resgate do atendimento.
- **FR-022CB:** O fluxo do lead deve permitir registrar resultado da abordagem inicial, tentativa de contato, objeções, interesse, visita confirmada, visita reagendada, visita perdida e necessidade de resgate.
- **FR-022CC:** Para visitas agendadas, o sistema deve gerar tarefa de confirmacao antes do horario marcado e registrar status como confirmado, sem resposta, reagendado, cancelado ou compareceu.
- **FR-022CD:** Quando o lead nao responder, cancelar ou nao comparecer, o sistema deve sugerir acao de resgate do atendimento, com proximo follow-up, canal recomendado, responsavel e historico das tentativas anteriores.
- **FR-022CE:** O modulo de pre-vendas deve permitir configurar scripts/templates de atendimento ao lead por etapa, mantendo linguagem positiva e personalizavel por canal, sem impedir ajuste manual pelo atendente.
- **FR-022CF:** O fluxo de pre-vendas deve organizar as atribuicoes dos SDRs em etapas operacionais: abordagem inicial, entendimento da necessidade, agendamento, confirmacao de visita, reagendamento por nao comparecimento e resgate do atendimento.
- **FR-022CG:** Na etapa de abordagem inicial, o sistema deve orientar o SDR com lembretes discretos para atender com brilho na voz, entusiasmo, chamar o cliente pelo nome e manter foco no agendamento.
- **FR-022CH:** Na etapa de entendimento da necessidade, o SDR deve registrar a busca/adversidade do cliente, veiculo desejado ou veiculo que pretende vender/trocar/consignar, perfil de uso, urgencia, faixa de valor e alternativa sugerida para atender sua necessidade.
- **FR-022CI:** Na etapa de agendamento, a missao principal do SDR deve ser conduzir o cliente ate a loja, registrando obrigatoriamente data e hora da visita; quando nao for possivel agendar a visita, o sistema deve exigir agendamento de recontato.
- **FR-022CJ:** Na etapa de confirmacao de visita, o sistema deve gerar tarefa para o SDR contatar o cliente pelo menos 1 hora antes do horario marcado, com objetivo de confirmar a vinda; se o cliente nao puder comparecer, o novo agendamento deve ser registrado no mesmo fluxo.
- **FR-022CK:** Na etapa de nao comparecimento, quando o cliente confirma a visita mas nao comparece, o sistema deve gerar tarefa de contato para entender o motivo, registrar a justificativa e tentar reagendar uma nova visita.
- **FR-022CL:** Na etapa de resgate do atendimento, o sistema deve permitir atribuir a tarefa a outro profissional/operador de resgate, responsavel por contatar clientes que vieram ate a loja mas nao fecharam negociacao, com foco especial em oportunidades de reposicao de estoque por consignacao.
- **FR-022CM:** Todas as etapas dos SDRs devem manter historico de responsavel, data/hora, canal, status, observacoes, proxima acao, prazo e resultado, alimentando relatorios de performance do pre-vendas.

### 6.2A Clientes

- **FR-022D:** O sistema deve ter uma pagina/base de clientes.
- **FR-022E:** A base de clientes deve incluir pessoas que ja compraram, demonstraram interesse, viraram lead ou visitaram a loja.
- **FR-022F:** O cadastro de cliente deve centralizar historico de compras, interesses, visitas, leads, conversas, propostas e follow-ups.
- **FR-022FA:** No modulo de vendas, a pagina de cadastro do cliente deve registrar a data da compra de cada veiculo adquirido, vinculando cliente, vendedor, veiculo, negociacao e data de entrega quando houver.
- **FR-022FB:** Apos 2 anos da data da compra, o sistema deve gerar notificacao no dashboard do vendedor responsavel para lembrar contato ativo com o cliente, com objetivo de ligar ou enviar mensagem para saber como esta o carro, se o cliente precisa de outro veiculo ou se esta buscando nova compra/troca, sem caracter de cobranca obrigatoria.
- **FR-022FC:** O lembrete pos-venda de 2 anos deve exigir que o vendedor registre o feedback do cliente apos o contato, incluindo resultado do contato, como o cliente avaliou o carro, se ha interesse em troca/compra, proxima acao, interesse atual, observacoes e eventual nova oportunidade aberta no funil de vendas.
- **FR-022FD:** O modulo Administrativo deve permitir acompanhar as notificacoes pos-venda de 2 anos, exibindo quais foram geradas, quais ainda estao pendentes de contato ou feedback, quais foram preenchidas, vendedor responsavel, cliente, veiculo, data da compra, data do lembrete e resultado registrado.
- **FR-022G:** A pagina/base interna de clientes deve permitir busca e filtros por nome, telefone, origem, status, interesse, vendedor, compra realizada, visita realizada e periodo somente no modulo Administrador, com acesso restrito ao Administrador.
- **FR-022GA:** Cliente final nao deve ter acesso a pagina/base de clientes nem a dados de outros clientes; seu acesso publico deve se limitar a visualizar veiculos, detalhes dos anuncios e canais de contato/agendamento permitidos.
- **FR-022H:** Clientes devem poder ser vinculados a veiculos de interesse, negociações, vendas, visitas, test drives e recontatos.

- **FR-022HA:** O sistema deve permitir cadastro de compradores de repasse, com nome/empresa, celular/WhatsApp, cidade/regiao, perfil de interesse, observacoes, status ativo/inativo e historico de envios/interacoes.
- **FR-022HB:** Compradores de repasse devem poder ser agrupados em listas ou redes de transmissao para envio segmentado de oportunidades de veiculos.
- **FR-022HC:** Compradores de repasse devem possuir pagina/base exclusiva, separada da base geral de clientes e separada da base de fornecedores, para evitar mistura entre cliente comprador final, comprador de repasse e fornecedor/origem de veiculos.
- **FR-022HD:** O sistema deve manter dois cadastros distintos no fluxo de repasse: fornecedores de repasse, usados como origem/aquisicao de veiculos, e compradores de repasse, usados como destino para oferta/venda de veiculos de repasse, cada um com historico, filtros, permissoes e vinculos proprios.
- **FR-022HE:** A pagina de compradores de repasse deve permitir vincular comprador, listas/redes de transmissao, veiculos ofertados para repasse, historico de envios, respostas, observacoes e status de interesse, sem transformar esse comprador automaticamente em cliente final da loja.

### 6.2B Fornecedores e Origem de Veiculos

- **FR-022I:** O sistema deve ter uma pagina/base de fornecedores e potenciais origens de veiculos.
- **FR-022J:** A base deve permitir cadastrar contatos de fornecedores de veiculos, fornecedores de repasse, concessionarias e donos/administradores de grupos de WhatsApp.
- **FR-022K:** O cadastro deve armazenar dados de contato, tipo de fornecedor, origem, observacoes, historico de interacoes e potencial de fornecimento.
- **FR-022KA:** O Administrador deve poder cadastrar fornecedores/origens de venda de veiculos, incluindo frota de locadoras, sites de leilao, repasses, concessionarias, parceiros, grupos/canais e outras fontes configuraveis.
- **FR-022KB:** O cadastro de fornecedor/origem deve permitir registrar o link principal do portal/site correspondente e disponibilizar atalho no sistema para abrir o navegador diretamente no respectivo site.
- **FR-022KC:** Quando houver necessidade de guardar acessos de portais de fornecedores, o sistema deve utilizar cofre de credenciais com criptografia, exibicao restrita por permissao, controle de quem pode visualizar/copiar/usar a credencial, historico de acesso e log de auditoria.
- **FR-022KD:** O cadastro de credenciais de fornecedores deve permitir armazenar, de forma segura, identificador de acesso/login, senha, URL de login, observacoes operacionais, responsavel pelo cadastro, data da ultima atualizacao, validade quando aplicavel e status ativo/inativo.
- **FR-022KE:** O sistema nao deve exibir senhas em texto aberto por padrao; qualquer visualizacao, copia ou uso assistido da credencial deve exigir permissao apropriada e registrar data/hora, usuario, fornecedor, portal e finalidade informada quando aplicavel.
- **FR-022L:** O sistema deve permitir vincular fornecedores a veiculos ofertados, oportunidades de compra, avaliacao, negociacao de compra e historico de aquisicoes.
- **FR-022M:** A pagina deve permitir busca e filtros por nome, telefone, tipo, origem, cidade/regiao, grupo/canal, status e data de ultimo contato. Campos finais: **A validar**.

### 6.2C Compras e Veiculos em Negociacao

- **FR-022N:** O sistema deve ter um modulo de compras para acompanhar veiculos em negociacao de aquisicao pela GT3 Veiculos.
- **FR-022O:** Cada veiculo em negociacao deve armazenar o link do anuncio ou origem onde o veiculo foi encontrado/negociado.
- **FR-022P:** O modulo deve registrar ha quanto tempo o veiculo esta anunciado ou em mapeamento, quando essa informacao estiver disponivel.
- **FR-022Q:** O modulo deve permitir acompanhar ha quanto tempo o vendedor/proprietario esta tentando vender o veiculo.
- **FR-022R:** O sistema deve registrar se a GT3 ja fez oferta pelo veiculo, data da oferta, valor ofertado, responsavel e status da resposta.
- **FR-022S:** O sistema deve permitir acompanhar status da negociacao de compra, como mapeado, contatado, oferta feita, em avaliacao, recusado, comprado, vendido por terceiro ou descartado.
- **FR-022SA:** O modulo de compras deve registrar todos os veiculos para os quais a GT3 ja realizou proposta/oferta de compra, mantendo historico mesmo quando a negociacao for recusada, pausada, concluida ou descartada.
- **FR-022SB:** O modulo de compras pode ter visualizacao em kanban para controlar oportunidades de compra por etapa, como mapeado, contatado, oferta feita, contraproposta, aguardando resposta, em avaliacao, aprovado para compra, comprado/concluido, recusado, vendido por terceiro ou descartado.
- **FR-022SC:** Cada oportunidade de compra deve permitir anotar multiplas ofertas e contrapropostas, incluindo valor ofertado, valor pedido pelo vendedor/proprietario, data/hora, responsavel, canal de contato, observacoes, status da resposta e validade da oferta quando aplicavel.
- **FR-022SD:** O sistema deve exibir de forma rapida o ultimo valor ofertado, penultimo valor ofertado quando houver, valor pedido atual, diferenca entre oferta e pedido, responsavel pela ultima oferta e data da ultima movimentacao.
- **FR-022SE:** O historico de ofertas deve ficar vinculado ao veiculo/oportunidade, fornecedor ou proprietario, avaliacao quando houver, conversas, anexos, fotos, links de anuncio e decisao final da negociacao.
- **FR-022SF:** Quando uma oportunidade for marcada como comprada/concluida, o sistema deve converter ou vincular a oportunidade ao cadastro de entrada do veiculo, preservando origem, ofertas realizadas, valor final negociado, responsavel e historico da negociacao de compra.
- **FR-022T:** Negociacoes/oportunidades no processo de compra devem permanecer ativas por ate 6 meses; apos esse periodo, o sistema deve realizar exclusao/arquivamento automatico da lista ativa, mantendo historico/auditoria da oportunidade.
- **FR-022TA:** O comprador ou responsavel pelo modulo de compras deve poder eliminar/arquivar manualmente uma oportunidade antes de 6 meses quando identificar que o veiculo ja foi vendido por terceiro, nao esta mais disponivel, nao tem interesse estrategico ou deve ser descartado por outro motivo registrado.
- **FR-022U:** O sistema deve sugerir exclusao ou arquivamento de oportunidades de compra com base no tempo no banco, ausencia de resposta, anuncio fora do ar, venda identificada, descarte manual pelo comprador ou criterios configuraveis.
- **FR-022V:** O modulo de compras deve permitir filtros por status, origem, fornecedor, tempo anunciado, tempo no banco, valor pedido, valor ofertado e responsavel.
- **FR-022W:** O modulo de compras deve identificar o tipo de aquisicao/oportunidade, incluindo veiculo comprado de repasse, veiculo 0km e encomenda de veiculo 0km.
- **FR-022X:** Veiculos comprados de repasse devem registrar fornecedor/origem, valor de compra, condicoes do repasse, custos previstos e status de entrada no estoque.
- **FR-022Y:** Veiculos 0km devem registrar marca, modelo, versao, cor, prazo previsto, fornecedor/concessionaria, valor negociado e status de recebimento.
- **FR-022YA:** O modulo de compra de veiculo 0km deve ter campo para calculo de frete, incluindo origem, destino, fornecedor/transportadora, valor previsto, valor realizado, responsavel pelo pagamento e impacto no custo total da compra.
- **FR-022Z:** Encomendas de veiculos 0km devem registrar cliente interessado, especificacao desejada, prazo estimado, sinal/pagamento quando houver, fornecedor/concessionaria e status da encomenda.
- **FR-022AA:** O modulo do vendedor deve permitir acompanhar encomendas de veiculos 0km vinculadas aos seus clientes/leads, com status, prazo estimado e proximas acoes.
- **FR-022AB:** O sistema deve ter um modulo de repasse de veiculos acessivel ao Administrativo, Administrador e Dono/Gestor conforme permissao.
- **FR-022AC:** No modulo de repasse, o Administrativo deve poder selecionar um veiculo, preparar o anuncio com dados, fotos, preco de repasse, observacoes e condicoes comerciais, e enviar pelo sistema via WhatsApp.
- **FR-022AD:** O envio de anuncio de repasse deve permitir selecionar uma rede/lista de transmissao e/ou compradores de repasse cadastrados individualmente.
- **FR-022AE:** O sistema deve registrar historico de envio do repasse por veiculo, lista, destinatario, data/hora, responsavel, mensagem enviada e status do envio quando disponivel pela integracao.
- **FR-022AF:** Respostas de compradores de repasse devem poder ser vinculadas ao veiculo anunciado e ao cadastro do comprador, quando tecnicamente possivel pela integracao WhatsApp.
- **FR-022AFA:** Quando houver veiculo recebido na troca, o Administrativo deve poder acessar o modulo de repasse e marcar se existe interesse em repassar o veiculo.
- **FR-022AFB:** Caso o veiculo de troca seja marcado para repasse, o Administrativo deve poder preparar o anuncio de repasse e enviar nas listas/redes de transmissao cadastradas, alem de compradores de repasse individuais quando aplicavel.
- **FR-022AFC:** O veiculo de troca anunciado para repasse deve manter vinculo com a negociacao original, cliente, avaliacao, valor atribuido na troca, preco de repasse, responsavel e historico de envios/respostas.
- **FR-022AG:** O modulo de compras deve permitir uma pesquisa simples por agente de IA para trazer sugestoes de compra de veiculos, considerando historico interno, dados de vendas, estoque, FIPE, giro, margem e criterios configuraveis.
- **FR-022AH:** O agente de IA deve sugerir modelos com maior potencial de compra/revenda, incluindo veiculos que mais venderam, modelos com maior giro, maior margem, menor tempo de estoque e maior procura por leads quando houver dados suficientes.
- **FR-022AI:** Sugestoes de compra geradas pela IA devem apresentar justificativa, dados usados, periodo analisado, nivel de confianca e indicacao de que a decisao final e humana.
- **FR-022AJ:** O sistema deve permitir salvar uma sugestao de compra como oportunidade no modulo de compras, mantendo origem "sugestao de IA" e historico de decisao.
- **FR-022AK:** O modulo de compra de veiculo deve emitir automaticamente o contrato de compra quando a negociacao for aprovada para aquisicao, usando como referencia o arquivo `planning-artifacts/templates/contracts/contrato-compra-veiculo.pdf`.
- **FR-022AL:** O contrato de compra emitido automaticamente deve preencher os dados da GT3 Veiculos, vendedor/proprietario, veiculo, valores, debitos/descontos, condicoes da negociacao, observacoes e anexos aplicaveis.
- **FR-022AM:** A emissao automatica do contrato de compra deve ficar vinculada ao veiculo, avaliacao, proprietario/vendedor, negociacao de compra, usuario responsavel e arquivo digital.

### 6.3 Conversas Omnichannel

- **FR-023:** O sistema deve centralizar conversas em uma unica tela.
- **FR-024:** O sistema deve iniciar com 1 telefone de WhatsApp configurado via Evolution API, mas a arquitetura deve suportar multiplos numeros conectados.
- **FR-025:** O sistema deve integrar Instagram Direct.
- **FR-026:** O sistema deve integrar chats/leads de Webmotors, OLX, Mercado Livre, Webcarros e Mobiauto, priorizando Webmotors primeiro e OLX depois.
- **FR-027:** O site nao deve ter chat proprio; o atendimento deve ser direcionado por CTAs para WhatsApp, formularios de interesse, telefone e agendamento, registrando a origem do lead no CRM.
- **FR-028:** Conversas devem ser vinculadas a lead, cliente, veiculo, oportunidade e vendedor.
- **FR-029:** O gestor deve poder acompanhar conversas conforme permissao.
- **FR-030:** O vendedor deve poder assumir manualmente uma conversa em andamento com IA.
- **FR-031:** O sistema deve preservar historico unificado mesmo se o lead mudar de vendedor.

### 6.4 Filas Inteligentes e Distribuicao

- **FR-032:** O sistema deve permitir criar filas de atendimento.
- **FR-033:** Filas devem poder ser configuradas por origem do lead.
- **FR-034:** O sistema deve distribuir leads automaticamente para vendedor ou fila.
- **FR-035:** O sistema deve redistribuir lead quando ninguem responder dentro de SLA configurado.
- **FR-036:** O sistema deve registrar alteracoes de responsavel e motivo.

### 6.5 Agente de IA

- **FR-037:** O sistema deve oferecer agente de IA 24/7 para nao perder leads e manter o cliente quente ate atendimento humano, usando modelo local para evitar custo recorrente de tokens. Modelo e infraestrutura: **A validar**.
- **FR-038:** A IA deve responder leads de forma imediata nos canais suportados.
- **FR-039:** A IA deve identificar intencao do cliente e qualificar o lead.
- **FR-040:** A IA deve consultar estoque disponivel.
- **FR-041:** A IA deve sugerir veiculos similares quando o solicitado nao estiver disponivel.
- **FR-042:** A IA deve agendar visita ou test drive quando houver disponibilidade.
- **FR-043:** A IA deve entender mensagens de audio. Provedor e acuracia: **A validar**.
- **FR-044:** A IA deve permitir tom de voz configuravel.
- **FR-045:** A IA deve mover o lead no funil quando a regra permitir.
- **FR-046:** A IA deve registrar automaticamente intencao e resumo da interacao.
- **FR-047:** O sistema deve permitir takeover manual com um clique.
- **FR-048:** A IA deve ter guardrails para nao prometer preco, financiamento, termos legais ou fiscais sem regra aprovada.
- **FR-048A:** O agente de IA deve ter modo interno de analise para apoiar compras, permitindo perguntas simples como quais modelos comprar, quais veiculos tiveram maior giro, quais modelos mais venderam e quais oportunidades parecem mais atrativas.
- **FR-048B:** O modo interno de analise da IA deve diferenciar sugestao operacional de decisao automatica; compras, ofertas e precificacao final devem exigir aprovacao humana.

### 6.6 Estoque e Veiculos

- **FR-049:** O sistema deve cadastrar veiculos com dados principais, fotos, status, documentacao e valores.
- **FR-050:** O sistema deve controlar status comercial: parado, em negociacao, pronto para venda, reservado, vendido, em avaliacao, em preparacao, publicado ou nao publicado.
- **FR-051:** O sistema deve exibir estoque em tempo real para dono e usuarios permitidos.
- **FR-051A:** O sistema deve exibir relatorios com principais metricas de estoque, incluindo giro medio, maior lucro, menor lucro e media de giro por modelo de carro.
- **FR-051B:** A vitrine interna/estoque para vendedores pode usar layout em cards com foto grande do veiculo, placa, marca/modelo, versao, ano, quilometragem, preco, origem do estoque, dias em estoque e responsavel/avatar quando aplicavel.
- **FR-051C:** Cards de veiculos em preparacao ou servico devem exibir selo visivel de status, como "Em Servico", junto de data prevista e nome/resumo do prestador ou local onde o veiculo se encontra.
- **FR-051D:** Os cards podem exibir selos comerciais adicionais, como garantia aplicavel, status de consignado/proprio, disponibilidade para oferta e pendencias relevantes.
- **FR-052:** O sistema deve registrar despesas por veiculo.
- **FR-052A:** O usuario Administrativo deve poder lancar despesas de oficina vinculadas a um veiculo especifico, incluindo descricao, categoria, fornecedor/oficina, valor, data, forma de pagamento, status e anexo/comprovante quando houver.
- **FR-052B:** Despesas de oficina lancadas pelo Administrativo devem compor automaticamente o custo real do veiculo e impactar margem estimada/realizada.
- **FR-052C:** O sistema deve diferenciar despesas por veiculo de despesas operacionais da loja, evitando que despesas fixas, variaveis ou diarias sejam vinculadas automaticamente ao custo de um carro.
- **FR-052D:** O Dono/Gestor deve conseguir revisar, aprovar, corrigir ou excluir lancamentos de despesas conforme permissao e trilha de auditoria.
- **FR-052E:** O modulo de vendas deve permitir registrar despesas por carro de funilaria e pintura, com categoria separada, descricao do servico, fornecedor/oficina, valor previsto, valor realizado, data, status, comprovante/anexo e responsavel.
- **FR-052F:** Despesas de funilaria e pintura vinculadas ao carro devem compor o custo real do veiculo e aparecer separadas nos relatorios de margem por veiculo.
- **FR-052G:** O Administrador ou usuario autorizado deve realizar checagem administrativa do veiculo antes de sua entrada na loja, registrando data/hora, responsavel, status de entrada, condicoes gerais, documentos, fotos, pendencias e observacoes.
- **FR-052H:** O Administrador ou usuario autorizado deve realizar nova checagem administrativa do veiculo no momento da venda/saida, comparando com a checagem de entrada e registrando divergencias, pendencias, documentos, itens entregues e fotos quando necessario.
- **FR-052I:** As checagens administrativas de entrada e venda/saida devem ficar vinculadas ao veiculo, negociacao, estoque, contrato e responsaveis, mantendo trilha de auditoria.
- **FR-053:** O sistema deve calcular custo real por veiculo.
- **FR-054:** O sistema deve calcular margem estimada e margem realizada por veiculo.
- **FR-054A:** A composicao de margem do veiculo deve permitir adicionar a garantia como componente especifico, exibindo valor de garantia, impacto no valor sugerido e efeito na margem.
- **FR-054B:** Para veiculo consignado, o valor da garantia pode ser descontado do preco/valor fixo combinado com o proprietario, preservando a margem operacional da loja conforme regra configuravel.
- **FR-054C:** O simulador de margem deve exibir a linha "Garantia" junto de valor de venda previsto, margem, previsao de gastos, reducao de base, aliquotas/impostos, comissoes e valor sugerido, em layout semelhante ao modelo de simulador apresentado.
- **FR-054D:** O sistema deve permitir registrar upgrade de garantia mais completa no momento da negociacao, tratando o valor adicional como receita/rentabilidade de garantia separada da margem principal do veiculo quando configurado.
- **FR-054E:** O calculo de resultado da venda deve considerar receitas adicionais como retorno da financeira/financiamento, seguro, garantia, servicos, acessorios e spread/receita de transferencia como lucro complementar, exibindo esses itens separadamente da margem principal do veiculo e tambem somados no lucro total da venda.
- **FR-055:** O sistema deve vincular ao custo do veiculo somente despesas efetivamente relacionadas ao veiculo. Despesas de almoxarifado nao devem ser rateadas automaticamente.

### 6.7 Avaliacao Veicular e Precificacao

- **FR-056:** O sistema deve permitir cadastro de avaliacao com dados do cliente e veiculo.
- **FR-057:** O app deve permitir avaliacao item a item do veiculo.
- **FR-058:** O app deve permitir fotos da avaliacao.
- **FR-058AA0:** Todos os campos de avaliacao que exigirem nota devem usar escala de 0 a 10, onde 0 representa condicao pessima/inaceitavel e 10 representa condicao excelente, com criterios detalhados por item quando necessario.
- **FR-058A:** No mobile de avaliacao, o avaliador deve registrar fotos especificas dos parafusos e pontos internos do capo, porta-malas e portas.
- **FR-058B:** O avaliador deve registrar observacao quando houver marca de chave, sinal de desmontagem, ajuste, troca de peca ou outro indicio relevante nos pontos vistoriados.
- **FR-058C:** O avaliador deve avaliar se existe repintura e, quando houver, indicar se o servico aparenta estar bem feito ou se apresenta problemas visiveis.
- **FR-058D:** O avaliador deve atribuir uma nota de 0 a 10 para repinturas identificadas, conforme escala padrao da avaliacao.
- **FR-058E:** O formulario de avaliacao deve ter campo/check para indicar se o veiculo e de leilao, com status "sim", "nao" ou "a confirmar".
- **FR-058F:** O formulario de avaliacao deve registrar se o veiculo esta no nome da pessoa que esta apresentando/mostrando o carro.
- **FR-058G:** O formulario de avaliacao deve registrar o motivo da venda e se a pessoa pretende buscar outro veiculo na GT3 Veiculos.
- **FR-058H:** O formulario de avaliacao deve registrar placa e RENAVAM quando disponivel para consultas internas e externas, consolidando como fontes de consulta: Informcar, Renainf completa, DETRAN/SP, IPVA/Fazenda SP (`ipva.fazenda.sp.gov.br`), divida ativa pelo RENAVAM no ambiente/site da Fazenda SP, multas PRF (`cpag.prf.gov.br/multas`), multas do interior/DCC Transito (`dcctransito.com.br`) e consulta processual e-SAJ/TJSP (`esaj.tjsp.jus.br`).
- **FR-058I:** O checklist de avaliacao deve incluir teste visual de motor com o carro ligado: elevar para aproximadamente 3.000 giros, soltar o acelerador e observar/anotar a cor da fumaca. Procedimento final e seguranca operacional: **A validar**.
- **FR-058J:** Quando houver fumaca preta, o sistema deve permitir registrar possiveis indicios como filtro, excesso de combustivel ou filtro de ar saturado.
- **FR-058K:** Quando houver fumaca azul, o sistema deve permitir registrar possiveis indicios como desgaste do motor, oleo contaminado ou valvula PCV.
- **FR-058L:** Quando houver fumaca branca, o sistema deve permitir registrar possiveis indicios como combustivel adulterado, junta do cabecote ruim ou bico injetor aberto.
- **FR-058M:** Os indicios do teste de fumaca devem ser apresentados como sinais para analise/confirmacao tecnica, nao como diagnostico definitivo automatico.
- **FR-058N:** O checklist deve orientar novo teste/acionamento do veiculo apos cerca de 20 minutos de conversa ou aquecimento, para observar comportamento do motor novamente. Procedimento final: **A validar**.
- **FR-058O:** Para veiculo manual, o checklist deve registrar altura/percepcao da embreagem com o carro parado, indicando se esta muito baixa, normal ou muito alta.
- **FR-058P:** Para veiculo automatico, o checklist deve registrar se ha tranco ao mudar posicoes/marchas, delay para engatar ou comportamento anormal parado ou em movimento.
- **FR-058Q:** Em teste de rodagem, o checklist deve registrar se o veiculo apresenta trancos, atrasos ou falhas nas trocas de marcha.
- **FR-058R:** Quando houver tranco ou delay em cambio automatico, o sistema deve permitir registrar possiveis indicios como coxim ou cambio, sempre como indicio a confirmar.
- **FR-058S:** O checklist deve incluir verificacao visual de vazamentos na parte inferior do veiculo.
- **FR-058T:** O checklist deve incluir verificacao do liquido de arrefecimento, registrando se esta nivelado, abaixo do nivel ou com aspecto anormal.
- **FR-058U:** Quando o liquido de arrefecimento estiver abaixo do nivel, o sistema deve permitir registrar possivel indicio de problema de cabecote ou vazamento, sempre como indicio a confirmar.
- **FR-058V:** O checklist de direcao deve incluir avaliacao de folga, preferencialmente em rua irregular/esburacada, observando se o volante mexe ou transmite comportamento anormal.
- **FR-058W:** O checklist de suspensao deve incluir teste de rodagem para registrar ruidos, batidas, instabilidade ou comportamento anormal percebido.
- **FR-058WA:** O checklist de avaliacao deve incluir verificacao do estado dos pneus, com nota de 0 a 10, observacao e indicacao de necessidade de troca quando aplicavel.
- **FR-058WB:** O avaliador deve avaliar o alinhamento do veiculo com nota de 0 a 10, observacao e indicacao de comportamento percebido em rodagem ou sinais visuais de desalinhamento.
- **FR-058WC:** O checklist deve registrar se o veiculo possui estepe, avaliando condicao do estepe com nota de 0 a 10, observacao, calibragem aparente, desgaste e necessidade de troca quando aplicavel.
- **FR-058X:** O checklist deve incluir avaliacao estrutural de alinhamentos de capo, porta-malas, lanternas, portas e demais vãos visiveis.
- **FR-058Y:** O avaliador deve registrar observacao/foto das longarinas e do painel do capo, verificando sinais de originalidade, reparo, troca ou desalinhamento.
- **FR-058Z:** O checklist deve orientar verificacao de plaquetas/etiquetas da montadora, incluindo cor, presenca, estado e sinais de adulteracao ou substituicao.
- **FR-058ZA:** O checklist deve orientar verificacao de plaquetas/etiquetas originais da montadora, incluindo cor, presenca, estado, posicao, sinais de adulteracao, remocao ou substituicao.
- **FR-058ZB:** O avaliador deve avaliar com nota de 0 a 10 a condicao dos frisos, molduras e acabamentos externos, registrando ausencia, quebra, desalinhamento, reparo, desgaste ou necessidade de troca quando aplicavel.
- **FR-058ZC:** O avaliador deve verificar se o veiculo possui manual do proprietario e registrar ausencia, estado, fotos/anexos e observacoes.
- **FR-058ZD:** Quando houver manual, o avaliador deve verificar se constam revisoes realizadas em concessionaria/autorizada, registrando quilometragem, data, carimbo/registro, consistencia aparente e observacoes.
- **FR-058ZE:** O avaliador deve registrar se o veiculo possui nota fiscal ou documento fiscal de origem quando apresentado, anexando evidencia/foto quando possivel.
- **FR-058ZF:** O avaliador deve registrar a quilometragem atual do veiculo, com foto do hodometro e observacao quando houver divergencia, suspeita ou incoerencia com estado geral/manutencoes.
- **FR-058ZG:** O avaliador deve avaliar com nota de 0 a 10 o estado dos bancos, incluindo desgaste, rasgos, manchas, costuras, espuma, regulagens, trilhos e necessidade de reparo/higienizacao.
- **FR-058ZH:** O avaliador deve verificar desgaste dos pedais de freio, acelerador e embreagem quando aplicavel, registrando observacao, foto e coerencia aparente com a quilometragem.
- **FR-058AA:** O avaliador deve verificar se os parafusos do porta-malas estao integros e sem marcas anormais de ferramenta, remocao ou ajuste.
- **FR-058AB:** O avaliador deve observar calafetacao no fundo do porta-malas, buscando diferenca de acabamento, remendo, ausencia, excesso ou padrao divergente.
- **FR-058AC:** O avaliador deve observar vestigios de cola, massa, selante, solda, pintura irregular ou acabamento divergente em regioes estruturais.
- **FR-058AD:** O checklist deve incluir observacao de calafetacao em paineis laterais e regioes internas acessiveis.
- **FR-058AE:** O avaliador deve verificar colunas, removendo/afastando borrachas quando operacionalmente permitido, para observar soldas, cortes, emendas ou marcas de funilaria.
- **FR-058AF:** O avaliador deve observar regioes proximas as travas das portas para identificar desalinhamento, marcas de funilaria, solda, repintura ou ajuste anormal.
- **FR-058AG:** Achados estruturais devem ser registrados somente em campo livre de observacoes.
- **FR-058AH:** A avaliacao de repintura/funilaria deve orientar o avaliador a observar risco de funilaria, marca de fita, diferenca de granulado/textura entre pecas, diferenca de cor, vestigio de tinta em borrachas ou canaletas, marca de chave em parafusos, falta de verniz, escorrido de verniz e outros sinais visiveis.
- **FR-058AI:** O checklist deve exigir conferencia do numero do chassi com marcacao simples de OK e campo livre de observacao quando houver algo a registrar.
- **FR-058AJ:** A avaliacao deve incluir uma etapa de consulta veicular pela Informcar, registrando o resultado da consulta no cadastro da avaliacao.
- **FR-058AK:** O formulario da consulta deve registrar se o veiculo consta como de leilao, se possui restricoes, se possui sinistro, quem e o proprietario atual retornado na consulta e observacoes relevantes.
- **FR-058AL:** O avaliador deve conferir se o documento apresentado corresponde ao mesmo proprietario retornado na consulta, registrando divergencia quando houver.
- **FR-058AM:** A integracao automatica com Informcar esta aprovada e deve ser realizada por RPA em computador remoto ou virtual, consultando o site, capturando os resultados e preenchendo automaticamente os campos correspondentes da avaliacao.
- **FR-058AN:** A consulta deve contemplar opcao de Renainf completa, registrando o resultado no cadastro da avaliacao quando disponivel.
- **FR-058AO:** O formulario de consulta deve registrar se o veiculo possui gravame/financiamento ativo.
- **FR-058AP:** O formulario de consulta deve registrar se o veiculo possui comunicado de venda ativo.
- **FR-058AQ:** O app do avaliador deve ter etapa para registrar o resultado da consulta no DETRAN/SP, incluindo multas, valor total das multas, licenciamento, valor do licenciamento e eventuais restricoes financeiras ou tributarias.
- **FR-058AR:** O app do avaliador deve orientar consulta de IPVA no site ipva.fazenda.sp.gov.br, registrando valor devido, status e observacoes.
- **FR-058AS:** O avaliador deve registrar se o veiculo e PCD ou possui enquadramento que altere calculo/isencao de IPVA, pois o valor pode ser diferente.
- **FR-058AT:** O app deve orientar consulta de divida ativa pelo RENAVAM no mesmo ambiente/site da Fazenda SP, registrando se ha debitos e valores quando encontrados.
- **FR-058AU:** O app deve orientar consulta de multas PRF no site cpag.prf.gov.br/multas, registrando resultado, existencia de multas e valores quando encontrados.
- **FR-058AV:** O app deve orientar consulta no site dcctransito.com.br para verificar multas do interior, registrando resultado, existencia de multas e valores quando encontrados.
- **FR-058AW:** As consultas em DETRAN/SP, Fazenda SP/IPVA, divida ativa, PRF, DCC Transito e demais sites informados no fluxo de avaliacao devem poder ser realizadas por automacao/RPA em computador remoto ou maquina virtual, consultando os sites, trazendo os resultados e preenchendo automaticamente os campos de resultado, valor, data da consulta, responsavel/automacao e evidencia/anexo quando possivel.
- **FR-058AWA:** No modulo mobile de avaliacao, o avaliador deve poder acionar a rotina automatica de consultas externas a partir dos dados do veiculo e da pessoa vinculada, como placa, RENAVAM, CPF/CNPJ ou nome quando aplicavel, enviando a solicitacao para uma fila assincrona executada pelo computador remoto/VM.
- **FR-058AWB:** A automacao de consultas externas deve registrar para cada site consultado: origem/site, parametros usados, data/hora de inicio e fim, status, resultado resumido, valores encontrados, evidencias/anexos, erro quando houver e responsavel/automacao.
- **FR-058AWC:** Caso algum site solicite captcha, autenticacao, validacao humana ou apresente instabilidade, a automacao deve pausar ou marcar pendencia para intervencao de usuario autorizado, sem tentar burlar mecanismos de protecao, mantendo log e permitindo preenchimento manual assistido.
- **FR-058AX:** Valores de multas/debitos preenchidos pelo avaliador devem ser lancados automaticamente no modulo de emissao do contrato de compra e venda, para uso no calculo/acerto do negocio, desconto, responsabilidade e exibicao no contrato.
- **FR-058AY:** Durante o processo de avaliacao, o sistema deve poder acionar automacao/RPA em computador remoto ou maquina virtual para consultar fontes processuais publicas permitidas, como e-SAJ/TJSP (esaj.tjsp.jus.br), pelo nome/CPF/CNPJ da pessoa vinculada a avaliacao/negociacao quando necessario para analise de risco operacional.
- **FR-058AZ:** A automacao de consulta processual deve registrar se foram encontrados processos, especialmente indicios de penhora, bloqueio, execucao, busca e apreensao, disputa de propriedade, insolvencia, fraude, restricoes ou outros riscos relevantes para a negociacao.
- **FR-058BA:** Para processos encontrados, o sistema deve registrar numero do processo, classe/assunto quando disponivel, valor da acao, partes do processo, comarca/vara, resumo das movimentacoes relevantes, data da consulta, origem/site, responsavel/automacao e evidencia/anexo quando possivel.
- **FR-058BB:** O sistema pode gerar uma triagem preliminar de risco juridico com classificacao como baixo, medio, alto ou pendente de analise, explicando os sinais encontrados; essa triagem nao deve substituir parecer juridico humano e deve ser marcada como apoio operacional.
- **FR-058BBA:** Quando a consulta processual indicar risco medio, alto ou duvida relevante, o sistema deve abrir pendencia para revisao de usuario autorizado, juridico/compliance ou gestor definido, permitindo registrar parecer juridico/manual, decisao, justificativa, responsavel, data/hora e impacto na continuidade da avaliacao/compra/consignacao.
- **FR-058BBB:** Consultas processuais devem ter acesso restrito, trilha de auditoria, finalidade registrada, base/fonte consultada, regras de LGPD, guarda e uso operacional controlado, por envolver dados pessoais e informacoes sensiveis para a negociacao.
- **FR-058BC:** O app do avaliador deve permitir marcar servicos de preparacao necessarios para o veiculo, incluindo pintura de roda, polimento, higienizacao e polimento de farois.
- **FR-058BD:** Servicos de preparacao marcados na avaliacao devem gerar uma projecao de gasto vinculada ao veiculo; os valores reais devem ser inputados posteriormente, quando os terceirizados emitirem nota fiscal.
- **FR-058BDA:** O avaliador deve estipular melhorias necessarias para o veiculo ficar apto a ser comercializado pela loja, discriminando item por item, area do veiculo, descricao do problema, melhoria recomendada, prioridade, custo estimado, responsavel sugerido e evidencia/foto quando aplicavel.
- **FR-058BDB:** Melhorias necessarias devem poder ser classificadas por tipo, como mecanica, funilaria, pintura, interior, pneus/rodas, documentacao, estetica, higienizacao, acessorios, eletrica ou outro tipo configuravel.
- **FR-058BDC:** A avaliacao deve reunir todas as informacoes necessarias para indicar se o veiculo esta apto para comercializacao imediata, apto com ressalvas ou nao apto ate concluir melhorias obrigatorias; quando o veiculo nao tiver observacoes pendentes, ele deve ser liberado para o Administrativo subir para estoque e anuncios.
- **FR-058BDD:** A tela de melhorias/reparos deve permitir visualizacao em formato semelhante a uma lista de itens de avaliacao, com area do veiculo, titulo do item, descricao do servico, gasto estimado, foto/evidencia e acao de aprovar/recusar quando aplicavel.
- **FR-058BDE:** Ao clicar na foto/evidencia de um item, o sistema deve abrir uma visualizacao ampliada com as fotos do problema vinculadas ao reparo/melhoria.
- **FR-058BDF:** A visualizacao para cliente/proprietario deve priorizar clareza e transparencia, mostrando fotos do problema ao lado do custo estimado para facilitar a decisao sobre aprovacao ou recusa de cada reparo.
- **FR-058BE:** O checklist do avaliador deve permitir registrar acessorios, opcionais e itens agregados relevantes para avaliacao e precificacao, com lista inicial organizada por performance/mecanica premium, acabamento externo/fibra de carbono, interior/tecnologia/conforto e itens agregados/tecnologias de protecao.
- **FR-058BEA:** Na categoria performance, escapamento e mecanica premium, o checklist deve contemplar freios de carbono-ceramica, sistema de escapamento esportivo de fabrica, eixo traseiro estercante, sistema de elevacao do eixo dianteiro e pacotes de performance de fabrica, como Porsche Chrono, McLaren Track Pack e Weissach Package.
- **FR-058BEB:** Na categoria acabamento externo e fibra de carbono, o checklist deve contemplar pacote de carbono externo completo, capo/teto em fibra de carbono, rodas especiais ou forjadas, rodas center lock quando aplicavel e pintura especial de fabrica, como Porsche PTS, Ferrari Historical Colors e acabamentos foscos/Magno.
- **FR-058BEC:** Na categoria interior, tecnologia e conforto, o checklist deve contemplar bancos de confeccao especial, sistema de som premium/high-end, pacote de carbono interno, volante esportivo com seletores de conducao, teto solar panoramico/teto de vidro, teto estrelado e telas de entretenimento traseiro.
- **FR-058BED:** Na categoria itens agregados e tecnologias de protecao instalados posteriormente ou agregados ao veiculo, o checklist deve contemplar PPF completo ou frente total, blindagem completa com empresa blindadora, nivel e delaminacao, wallbox para hibridos plug-in, carregador portatil de fabrica, capa protetora original e rastreador/sistema de telemetria ativo.
- **FR-058BEE:** Para cada acessorio selecionado, o app deve exigir marcacao rapida de tipo (original de fabrica ou upgrade de grife), estado de conservacao (perfeito, apresenta riscos/avarias ou necessita substituicao) e comprovacao (consta na nota fiscal/ficha tecnica ou instalado posteriormente sem NF), com observacao e foto quando necessario.
- **FR-058BF:** Acessorios registrados devem poder impactar observacoes, precificacao, anuncio e ficha do estoque quando aprovados pelo responsavel.
- **FR-058BFA:** No modulo mobile de avaliacao, o sistema deve exibir uma pequena observacao ao avaliador informando que veiculos sem opcionais relevantes podem valer aproximadamente 10% a menos que o mesmo modelo em versao completa, usando esse aviso como apoio de analise e nao como desconto automatico obrigatorio.
- **FR-058BG:** O avaliador deve poder indicar se o veiculo precisa ser enviado para mecanico, informando motivo, prioridade e observacoes.
- **FR-058BH:** O avaliador deve poder indicar se sera necessario encomendar pecas, registrando peca, quantidade estimada, urgencia, fornecedor sugerido e status da encomenda quando aplicavel.
- **FR-058BI:** Indicacoes de mecanico e encomenda de pecas devem poder gerar pendencias ou ordens de servico vinculadas ao veiculo. Regras de aprovacao e responsabilidade: **A validar**.
- **FR-058BJ:** Apos a avaliacao e aprovacao para compra/preparacao, o veiculo deve entrar em uma etapa operacional acessivel ao Administrativo para controle de despesas de oficina, pecas, preparacao e demais custos vinculados ao carro.
- **FR-058BK:** O Administrativo deve visualizar pendencias originadas na avaliacao, como mecanico, pecas e servicos de preparacao, para lancar custos reais quando forem executados ou faturados.
- **FR-059:** O sistema deve registrar previsao de gastos antes da preparacao/venda pela GT3 Veiculos.
- **FR-060:** O sistema deve ter FIPE integrada para apoiar precificacao.
- **FR-060A:** O sistema deve extrair e armazenar dados da Tabela FIPE mensalmente, mantendo historico por mes/ano, marca, modelo, ano modelo, combustivel, codigo FIPE, tipo e valor.
- **FR-060B:** A primeira abordagem para extracao mensal da FIPE deve considerar o projeto open source `rafaelgou/fipe-crawler` (https://github.com/rafaelgou/fipe-crawler), que realiza download dos dados da Tabela FIPE por linha de comando e pode exportar/salvar dados em banco/CSV.
- **FR-060C:** A rotina mensal de FIPE deve registrar data/hora da execucao, periodo de referencia, status, quantidade de registros importados, erros e responsavel/automacao.
- **FR-060D:** Como o `fipe-crawler` depende de disponibilidade do site da FIPE e pode ter execucao demorada, o sistema deve tratar falhas, retentativas, logs e alertas sem bloquear o uso operacional.
- **FR-060E:** O uso do projeto open source `rafaelgou/fipe-crawler` para extracao mensal da Tabela FIPE fica condicionado a validacao previa de juridico/compliance quanto a licenca do codigo, termos de uso vigentes da FIPE, permissao para coleta automatizada, armazenamento, finalidade de uso e eventual redistribuicao dos dados. A licenca do crawler nao deve ser interpretada como autorizacao de uso dos dados da FIPE. Antes da implementacao definitiva, deve ser avaliada preferencialmente fonte oficial, autorizacao formal ou fornecedor licenciado. Caso aprovado, a rotina deve ser assincrona, limitar frequencia e volume de coleta ao necessario, registrar auditoria da execucao e impedir publicacao, revenda ou compartilhamento da base fora do escopo autorizado.
- **FR-060F:** Como alternativa ao crawler, o sistema pode utilizar RPA em computador remoto ou maquina virtual para executar consultas FIPE pelo navegador, seguindo o fluxo manual de pesquisa do site oficial e trazendo os resultados para preencher os campos do sistema. Essa abordagem tambem fica condicionada a validacao juridica/compliance dos termos de uso da FIPE e deve registrar logs, data/hora, origem, responsavel/automacao e evidencia da consulta. Por ser uso interno e de baixo volume, caso o site solicite captcha ou validacao humana, o RPA deve pausar o fluxo e permitir que um usuario autorizado conclua manualmente a validacao na maquina remota, sem tentativa de burlar ou resolver automaticamente mecanismos de protecao do site.
- **FR-061:** O sistema deve comparar o preco sugerido do veiculo com a media de anuncios/classificados equivalentes, priorizando Webmotors e OLX como fontes de mercado, desde que a coleta/consulta ocorra por API, produto oficial, fornecedor autorizado/licenciado, exportacao contratada ou outro meio previamente aprovado por juridico/compliance.
- **FR-061A:** A comparacao de mercado deve considerar filtros minimos de equivalencia, incluindo marca, modelo, ano modelo, versao quando disponivel, combustivel, cambio, quilometragem aproximada, estado/cidade ou raio geografico, estado de conservacao quando informado e periodo de coleta.
- **FR-061B:** O sistema deve armazenar somente os dados necessarios para justificar a media de mercado e apoiar a precificacao interna, evitando replicar bases completas de terceiros ou redistribuir conteudo dos portais fora do escopo autorizado.
- **FR-061C:** Cada consulta de media de anuncios deve registrar fonte, data/hora, parametros pesquisados, quantidade de anuncios considerados, criterios de exclusao, media, mediana, menor valor, maior valor, faixa recomendada, responsavel/automacao e evidencia/auditoria da origem dos dados.
- **FR-061D:** Quando Webmotors ou OLX disponibilizarem recursos oficiais aplicaveis, como integracao de anuncios, leads, chat, estoque, produto de inteligencia de mercado ou dados contratados para revendas, esses canais devem ser preferidos a qualquer automacao de navegador ou crawler.
- **FR-061E:** Qualquer uso de RPA, crawler ou leitura automatizada de paginas publicas de Webmotors, OLX ou outros portais para fins de precificacao fica condicionado a validacao juridica/compliance dos termos vigentes, limites de volume, finalidade interna, forma de armazenamento e permissao de uso, sendo vedado bypass de captcha, login indevido, rotacao de IP, simulacao enganosa de usuario, coleta massiva ou contorno de mecanismos de protecao.
- **FR-061F:** Caso nao exista fonte autorizada ou contratada para media de mercado, o sistema deve permitir lancamento manual assistido da pesquisa realizada pelo usuario, exigindo origem, data/hora, filtros usados, quantidade de anuncios avaliados, observacoes e evidencia anexada.
- **FR-062:** O sistema deve sugerir preco de venda considerando FIPE, mercado, custos e margem desejada.
- **FR-063:** O sistema deve manter historico da avaliacao para auditoria e negociacao.

### 6.8 Anuncios, Portais e IQA

- **FR-064:** O sistema deve integrar com os principais portais de anuncios de veiculos, iniciando por Webmotors e depois OLX. Tambem devem ser configurados Mercado Livre, Webcarros e Mobiauto.
- **FR-064A:** O modulo administrativo de anuncios deve permitir preparar um unico cadastro de anuncio do veiculo e publicar/sincronizar simultaneamente no site da loja e nos marketplaces configurados.
- **FR-064B:** A publicacao simultanea deve permitir selecionar canais de destino antes do envio, incluindo site da loja, Webmotors, OLX, Mercado Livre, Webcarros, Mobiauto e outros portais habilitados conforme permissao e integracao disponivel.
- **FR-064C:** O modulo administrativo deve controlar campos comuns do anuncio, como titulo, descricao, preco, fotos, videos, ficha tecnica, opcionais, status comercial, condicoes, destaque e observacoes, reaproveitando os dados do cadastro do veiculo sempre que possivel.
- **FR-064D:** Quando cada marketplace exigir campos, formatos, limites de fotos, regras de titulo, categorias ou atributos proprios, o sistema deve exibir pendencias por canal e permitir ajustes especificos sem alterar indevidamente o anuncio base do site da loja.
- **FR-064E:** Cada publicacao/sincronizacao deve registrar status individual por canal, data/hora, responsavel/automacao, id/url externa do anuncio quando disponivel, erros, pendencias, ultima atualizacao e historico de alteracoes.
- **FR-064F:** No momento de preparar ou alterar um anuncio, o modulo administrativo deve calcular e exibir a margem de lucro prevista do veiculo com base no preco anunciado, custo de aquisicao/entrada do carro, despesas de preparacao previstas e realizadas, despesas vinculadas ao veiculo, garantia, impostos/comissoes quando configurados e demais custos aplicaveis.
- **FR-064G:** O calculo de margem no anuncio deve exibir pelo menos custo total estimado, preco anunciado, lucro bruto previsto, margem percentual, despesas pendentes de confirmacao e alerta quando o preco anunciado ficar abaixo da margem minima configurada pela loja.
- **FR-065:** O sistema deve planejar suporte aos portais relevantes para a GT3 Veiculos ao longo do tempo, sem exigir que usuarios externos tenham acesso ao estoque interno.
- **FR-066:** O sistema deve apoiar publicacao em Facebook e Instagram. Formato: **A validar**.
- **FR-067:** O sistema deve controlar status de publicacao por veiculo e canal.
- **FR-068:** O sistema deve exibir erros ou pendencias de publicacao por canal.
- **FR-068A:** O modulo de anuncios deve permitir anunciar veiculo 0km que ainda nao esta fisicamente na loja, vinculando o anuncio a uma encomenda, oportunidade de compra 0km ou cadastro comercial sem unidade em estoque.
- **FR-068B:** Para anuncio de veiculo 0km sem unidade fisica na loja, o usuario deve poder anexar foto ilustrativa, marcando a imagem e o anuncio como ilustrativos para evitar confusao com fotos reais do estoque.
- **FR-069:** O sistema deve calcular IQA de 0% a 100% para anuncios.
- **FR-070:** O IQA deve avaliar quantidade/qualidade de fotos.
- **FR-071:** O IQA deve avaliar competitividade de preco.
- **FR-072:** O IQA deve avaliar completude da ficha tecnica.
- **FR-073:** O IQA deve avaliar dias sem modificacao.
- **FR-074:** O IQA deve sugerir melhorias acionaveis para aumentar a nota.
- **FR-074A:** O app do vendedor deve permitir preparar e disparar/postar divulgacao de carros no Instagram usando dados, fotos e texto do cadastro do veiculo, com possibilidade de apoio por agente de IA para sugerir legenda, hashtags, chamada comercial, variacoes de texto e melhor horario de postagem.
- **FR-074AA:** O sistema deve registrar cada postagem/divulgacao vinculada ao veiculo, incluindo canal, formato, conteudo usado, fotos/videos, data/hora, responsavel, agente/automacao quando aplicavel, status, URL/id externo da postagem e origem da publicacao.
- **FR-074AB:** O sistema deve exibir no cadastro do veiculo e no modulo de anuncios quantas vezes o veiculo foi postado/divulgado por canal, incluindo Instagram, Facebook, grupos do Facebook, WhatsApp/catalogo quando aplicavel e demais portais configurados.
- **FR-074AC:** O sistema deve importar ou registrar metricas de performance das postagens organicas por veiculo, incluindo visualizacoes/reproducoes quando disponiveis, alcance, impressoes, curtidas/reacoes, comentarios, compartilhamentos, salvamentos, cliques, mensagens iniciadas e leads atribuiveis.
- **FR-074AD:** As metricas de Instagram e Facebook devem ser obtidas preferencialmente por APIs oficiais da Meta e permissoes da conta conectada; quando alguma metrica nao estiver disponivel por API, o sistema deve permitir registro manual assistido com evidencia, data/hora, usuario responsavel e observacao.
- **FR-074AE:** O agente de IA pode preparar sugestoes de postagens por carro, incluindo texto, fotos sugeridas, hashtags e canais recomendados, mas o disparo/publicacao externa deve ocorrer preferencialmente por acao manual do usuario autorizado, respeitando permissoes, limites das plataformas e regras de aprovacao configuradas.
- **FR-074AF:** Para postagens no Instagram, o sistema deve permitir definir thumbnail/capa da publicacao de forma automatizada ou manual; o Gestor Administrativo deve poder decidir se a capa sera gerada/sugerida automaticamente pelo sistema/agente de IA ou escolhida manualmente pelo usuario antes da postagem.
- **FR-074B:** O sistema deve apoiar integracao com catalogo do WhatsApp para divulgar veiculos disponiveis, usando recursos/API disponiveis do provedor adotado e registrando veiculo, fotos, descricao, preco, status, responsavel, data/hora e resultado da publicacao/sincronizacao.
- **FR-074C:** O app do vendedor deve apoiar publicacao/divulgacao integrada com Facebook, incluindo posts de veiculos usando dados e fotos do estoque.
- **FR-074D:** O sistema deve apoiar uma rotina manual/assistida para divulgar veiculos em ate 20 grupos de anuncio de veiculos no Facebook, controlando grupos-alvo, texto, veiculo, data, responsavel, quantidade de postagens realizadas e status de postagem.
- **FR-074E:** Considerando o baixo volume de movimentacoes/postagens, a publicacao em grupos do Facebook deve ser tratada inicialmente como acao manual assistida pelo vendedor ou usuario autorizado, com o sistema preparando o conteudo, registrando a execucao e permitindo marcar cada grupo como postado, pendente, recusado ou nao aplicavel.
- **FR-074EAA:** O modulo de anuncios pode oferecer um modo avancado para usuarios administradores/tecnicos verificarem viabilidade de integracao, permissoes, limites de API, IDs externos, payloads, logs, erros, ultima sincronizacao e evidencias tecnicas de publicacao/metricas por canal, sem tornar a automacao requisito obrigatorio do MVP.
- **FR-074EA:** O sistema deve ter um modulo de gerenciamento de anuncios integrado com Meta, contemplando Facebook e Instagram Ads quando a conta/permissao estiver configurada.
- **FR-074EB:** O modulo de Meta Ads deve permitir vincular anuncios/campanhas a veiculos do estoque, campanhas da loja, vendedores ou origens de lead quando aplicavel.
- **FR-074EC:** O sistema deve importar metricas de resultado dos anuncios pagos da Meta, separadas das metricas de postagens organicas, incluindo quando disponivel impressoes, alcance, cliques, CTR, mensagens/conversas iniciadas, leads, custo, investimento, CPC, CPL, CPM, status da campanha e resultado atribuido.
- **FR-074ECA:** As metricas de Meta Ads devem ser vinculadas ao veiculo, campanha, conjunto de anuncios, criativo, canal, periodo, objetivo configurado, responsavel e origem do lead quando houver atribuicao no CRM.
- **FR-074ECB:** Caso alguma metrica de Meta Ads nao esteja disponivel por API, permissao, limite da conta ou configuracao de atribuicao, o sistema deve indicar a indisponibilidade e permitir lancamento manual assistido com evidencia, data/hora, usuario responsavel e observacao.
- **FR-074ECC:** O sistema deve evitar misturar investimento pago com divulgacao organica; relatorios devem permitir visualizar separadamente postagens organicas, anuncios pagos e consolidado por veiculo/canal quando houver criterio de atribuicao claro.
- **FR-074ED:** As metricas dos anuncios da Meta devem ser exibidas no cadastro do veiculo, no modulo de anuncios e nos relatorios de performance.
- **FR-074EE:** O sistema deve registrar periodo, campanha, conjunto de anuncios, criativo, status, responsavel e ultima sincronizacao das metricas da Meta.
- **FR-074EF:** A integracao com Meta Ads deve considerar permissoes da conta, limites da API, mapeamento de conversoes e regras de atribuicao, com configuracao tecnica no modo avancado, logs de sincronizacao e indicacao clara quando uma metrica ou permissao nao estiver disponivel.
- **FR-074EG:** O modulo de gestao de anuncios deve gerar analise de Custo/Investimento x Objetivo por campanha, midia, canal, periodo e responsavel.
- **FR-074EH:** O usuario deve poder configurar objetivos de campanha, como leads, visitas, avaliacoes, consignacoes, vendas, mensagens iniciadas ou outros objetivos configuraveis.
- **FR-074EI:** A analise deve comparar investimento total, quantidade realizada por objetivo, percentual de conversao e custo por resultado, por exemplo investimento de R$4.000,00, 400 leads com CPL de R$10,00, 100 visitas com 25% e 20 consignacoes com 20%.
- **FR-074EJ:** O relatorio deve permitir visualizar funil de campanha conectando investimento, leads, visitas, avaliacoes, consignacoes e vendas, com perdas por etapa e taxa de conversao.
- **FR-074EK:** As metricas de objetivo devem poder ser cruzadas com dados do CRM para atribuir resultados reais aos leads originados por anuncios, evitando analisar apenas metricas de plataforma.
- **FR-074EL:** O sistema deve integrar Google Analytics/GA4 as campanhas, capturando origem, midia, campanha, conteudo, termo/UTM, pagina de entrada, eventos e conversoes quando disponiveis.
- **FR-074EM:** Leads gerados pelo site/formularios devem manter vinculo com parametros UTM e dados de campanha do Google Analytics para permitir atribuicao entre trafego, campanha, canal e resultado comercial no CRM.
- **FR-074EN:** O dashboard de anuncios deve cruzar metricas de Google Analytics/GA4 com Meta Ads, CRM e vendas, exibindo sessoes, usuarios, eventos, conversoes, leads, custo quando disponivel, taxa de conversao e resultado por campanha.
- **FR-074EO:** Integracao com Google Analytics/GA4, consentimento de cookies, privacidade, limites de API, mapeamento de eventos e padrao de UTMs permanecem **A validar**.
- **FR-074EP:** A aba/modulo de anuncios deve exibir ranking dos anuncios que geraram mais leads, por veiculo, campanha, canal, periodo, responsavel, custo quando houver e taxa de conversao.
- **FR-074EQ:** A aba/modulo de anuncios deve exibir ranking dos anuncios com mais visualizacoes/alcance, separando visualizacoes organicas e pagas quando aplicavel.
- **FR-074ER:** Cada campanha/anuncio deve registrar informacoes fundamentais da campanha, incluindo tipo de campanha, objetivo, publico-alvo, segmentacao do publico, canal, periodo, investimento, criativo utilizado, veiculo vinculado, mensagem/oferta, responsavel, status e resultados principais.
- **FR-074ES:** O dashboard de anuncios deve permitir comparar leads, visualizacoes, custo por lead, conversao, mensagens iniciadas e vendas atribuiveis por campanha, publico, canal e veiculo.
- **FR-074ET:** O cadastro da campanha deve registrar o publico utilizado, incluindo descricao do publico, localizacao/regiao, faixa etaria quando aplicavel, interesses, fonte do publico, segmentacao personalizada/lookalike quando houver e observacoes relevantes para analise futura.
- **FR-074F:** O app do vendedor deve ter camera integrada para capturar fotos e videos do veiculo diretamente no sistema.
- **FR-074FA:** No app, o modulo de anuncio de veiculos deve permitir anexar videos do veiculo ja existentes no aparelho ou em fonte autorizada, alem de capturar novos videos pela camera integrada.
- **FR-074FB:** Videos anexados ao anuncio devem ficar vinculados ao veiculo, anuncio, vendedor/responsavel, origem do arquivo, data/hora, status de aprovacao/publicacao e canal de divulgacao quando aplicavel.
- **FR-074FC:** O sistema deve validar tamanho, formato, duracao e qualidade minima dos videos conforme regras configuraveis e limites dos canais de publicacao, informando pendencias antes do envio/publicacao.
- **FR-074G:** Fotos e videos capturados pelo app do vendedor nao devem ser gravados na galeria local do celular quando o sistema operacional permitir; devem ser enviados/salvos preferencialmente somente no sistema, com fallback seguro e aviso ao usuario quando houver limitacao tecnica do aparelho ou permissao.
- **FR-074H:** Antes de iniciar a sessao de fotos, o app deve lembrar o vendedor de posicionar a placa da loja sobre a placa de identificacao do veiculo.
- **FR-074I:** O app deve orientar o vendedor a capturar no minimo 15 fotos do carro, destacando detalhes importantes do veiculo, com checklist configuravel de fotos obrigatorias como frente, traseira, laterais, rodas, painel, bancos, porta-malas, motor, documento/etiquetas quando aplicavel e detalhes de avarias.
- **FR-074J:** O app deve orientar o vendedor a filmar a parte interna do veiculo.
- **FR-074K:** O app deve orientar o vendedor a filmar o veiculo em 360 graus.
- **FR-074L:** Antes de acionar o modo foto, o app deve permitir preparar ajustes de camera/preset visual para a sessao, incluindo definicao 45, brilho da cor 10, contraste 17 e brilho -17 quando suportado pelo aparelho; quando nao for possivel aplicar os ajustes diretamente na camera, o app deve sugerir o preset ao usuario ou aplicar tratamento equivalente apos a captura.
- **FR-074M:** Fotos e videos capturados devem ficar vinculados ao veiculo, anuncio, estoque, vendedor responsavel, data/hora e status de aprovacao/publicacao.

### 6.9 Financeiro, Fiscal e Comissoes

- **FR-075:** O sistema deve controlar contas a pagar.
- **FR-076:** O sistema deve controlar contas a receber.
- **FR-077:** O sistema deve controlar fluxo de caixa diario.
- **FR-078:** O sistema deve integrar conciliacao bancaria diretamente com o banco/provedor adotado para conferir contas de despesas, identificando se uma conta a pagar foi efetivamente paga no banco e, no sentido inverso, se um debito/pagamento encontrado no extrato corresponde a uma despesa registrada no sistema.
- **FR-078A:** A conciliacao bancaria deve apoiar baixa/conferencia de contas de despesas, com status como pendente, conciliada, divergente, paga no banco sem despesa vinculada e despesa registrada sem pagamento encontrado, sem gerar ordens de pagamento ou executar pagamentos automaticamente pelo sistema.
- **FR-078B:** O sistema deve importar ou consultar movimentacoes bancarias relevantes, incluindo data, valor, tipo, descricao/historico, identificador da transacao quando disponivel, conta bancaria, origem/provedor e data/hora da sincronizacao.
- **FR-078C:** O sistema deve avisar o administrador/Financeiro quando houver recebimento de valores na conta bancaria, permitindo conferir origem, valor, data, conta, possivel cliente/negociacao vinculada e status de conciliacao.
- **FR-078D:** Divergencias entre despesas registradas e movimentacoes bancarias devem gerar alerta para revisao manual, mantendo logs de auditoria, responsavel pela conciliacao, data/hora e observacoes.
- **FR-079:** O sistema deve suportar DRE gerencial.
- **FR-080:** O sistema deve permitir categorias e contas bancarias configuraveis.
- **FR-081:** O sistema deve controlar comissoes de vendedores, obrigatorias em qualquer venda.
- **FR-082:** Comissoes devem ter status pendente, aprovada, paga e cancelada.
- **FR-083:** Regra de comissao deve ser configuravel, podendo usar percentual, margem ou regra mista.
- **FR-083A:** O modulo de venda deve ter campo para preencher o retorno da financeira, ou seja, lucro/comissao sobre contratos de financiamento de veiculos, vinculado a negociacao, veiculo, comprador, vendedor, contrato/proposta de financiamento e instituicao financeira quando aplicavel.
- **FR-083B:** O modulo de venda deve ter campo para preencher comissao de venda de seguro, vinculada a negociacao, veiculo, comprador, vendedor e seguradora/corretora quando aplicavel.
- **FR-083C:** Comissoes/lucros de financiamento e seguro devem compor a visao financeira da venda e poder ser separados da margem do veiculo em relatorios, conforme regra gerencial configuravel.
- **FR-083D:** Os campos de financiamento e seguro devem permitir registrar valor previsto, valor realizado, status, data de recebimento, responsavel e observacoes.
- **FR-083E:** O modulo de venda deve permitir oferecer e registrar upgrade de garantia, com tipo de garantia, valor cobrado, custo quando houver, receita/margem gerada, responsavel pela venda e status.
- **FR-083F:** Receitas de upgrade de garantia devem aparecer nos relatorios de venda e margem como receita adicional, separadas de financiamento, seguro e margem do veiculo.
- **FR-083FA:** Cada processo de venda deve especificar os itens de lucro que compoem o resultado, incluindo margem do veiculo, retorno da financeira/financiamento, comissao de seguro, receita de garantia, spread/receita de transferencia, servicos adicionais, acessorios e outros itens configuraveis.
- **FR-083FB:** O sistema deve exibir a soma total do lucro da venda, separando resultado do veiculo e receitas adicionais, e permitindo visualizar valor previsto, valor realizado, status de recebimento e responsavel por cada item de lucro.
- **FR-083FC:** Quando a transferencia/documentacao for vendida ou cobrada do cliente com valor superior ao custo operacional, o sistema deve registrar o valor cobrado, custo da transferencia, spread/lucro gerado, status de recebimento, responsavel e vinculo com veiculo, comprador e negociacao, exibindo essa receita de forma discriminada acima/separada da margem principal do veiculo e somada ao lucro total da venda.
- **FR-083G:** O sistema deve permitir configurar uma tabela de comissao da Equipe de Vendas por tipo de operacao, usando como referencia inicial: compra de veiculo Carro Patio com R$350,00 e Carro Repasse com R$200,00.
- **FR-083H:** A comissao de consignacao da equipe de vendas deve permitir faixas por quantidade de carros vendidos no periodo, usando como referencia inicial: 01 a 03 carros com 6% sobre o lucro da venda e acima de 4 carros com 9% sobre o lucro da venda.
- **FR-083I:** O sistema deve permitir configurar Premio Dezena por metas de vendas dentro do mes, usando como referencia inicial: 5 carros do dia 01 a 10 com R$500,00, 5 carros do dia 11 a 20 com R$500,00, 5 carros do dia 21 a 31 com R$500,00 e extra de R$500,00 ao fechar 3 dezenas.
- **FR-083J:** As regras de comissao e premio devem registrar vigencia, responsavel pela configuracao, tipo de venda elegivel, vendedor/equipe elegivel, status de aprovacao e historico de alteracoes.
- **FR-083K:** O sistema deve calcular e exibir comissoes e premios previstos e realizados por vendedor, separando compra de veiculo, repasse, consignacao, premio dezena e demais receitas/comissoes configuradas.
- **FR-083L:** O sistema deve permitir cadastrar e ajustar planos de remuneracao de funcionarios por equipe, funcao e periodo de vigencia, contemplando salario fixo, comissoes, premios, bonus por meta, bonus por visita, bonus por sucesso e regras mistas configuraveis.
- **FR-083M:** O plano de remuneracao deve permitir criar tabelas diferentes para equipes como Pre Vendas, Resgate, Carteira, Vendas, Avaliadores, Administrativo e outras funcoes configuraveis.
- **FR-083N:** Como referencia inicial, o plano de remuneracao deve suportar regras de Time Web com faixas de premio por visita, premio por negocio, bonus por volume de visitas e bonus por percentual de sucesso.
- **FR-083O:** Como referencia inicial, o plano de remuneracao deve suportar regras de Equipe Resgate com salario fixo, premio por sucesso e bonus por faixas de quantidade de sucessos.
- **FR-083P:** Como referencia inicial, o plano de remuneracao deve suportar regras de Equipe Carteira com salario fixo, premio por visita aniversario, premio por visita de clientes da carteira e premio por sucesso.
- **FR-083Q:** Alteracoes no plano de remuneracao devem manter historico, usuario responsavel, motivo da alteracao, data de vigencia, aprovacao gerencial e impacto previsto nos calculos.
- **FR-083R:** O sistema deve calcular remuneracao prevista e realizada por funcionario com base no plano vigente, metas atingidas, eventos registrados no CRM, vendas, visitas, sucessos, avaliacoes e demais indicadores configurados.
- **FR-084:** O sistema deve emitir documentos fiscais atraves de SAT/integracao fiscal adotada quando houver operacao fiscal aplicavel, mantendo configuracao, logs, status de emissao, retorno do provedor e vinculo com veiculo, cliente/fornecedor, venda, compra, consignacao ou despesa relacionada.
- **FR-084A:** No momento do cadastro do veiculo, informar ou nao a entrada oficial/fiscal deve ser opcional; quando o usuario optar por cadastrar apenas o veiculo operacionalmente, o sistema deve permitir seguir sem emitir documento fiscal de entrada naquele momento, mantendo status claro de pendencia ou nao aplicabilidade.
- **FR-084B:** Quando o usuario optar pela entrada oficial/fiscal do veiculo, o sistema deve seguir todos os tramites configurados e exigidos para a operacao, incluindo validacoes de dados obrigatorios, emissao/armazenamento de documentos fiscais, DANFE/XML quando aplicavel, status fiscal, auditoria e bloqueios de continuidade se houver erro critico.
- **FR-085:** O sistema deve armazenar DANFE e XML.
- **FR-086:** O sistema deve calcular impostos conforme integracao/regra fiscal validada.
- **FR-087:** O sistema deve enviar documentos fiscais por email.
- **FR-088:** O sistema deve suportar casos de veiculos consignados, permitindo informar opcionalmente no cadastro se a consignacao tera entrada oficial/fiscal/regulatoria naquele momento; quando aplicavel e selecionado pelo usuario, o sistema deve informar a consignacao aos orgaos reguladores pelo sistema/BNDV ou integracao adotada e permitir dar sequencia ao processo de transferencia por esse fluxo.
- **FR-088A:** A NF de entrada de consignacao deve ser emitida quando a entrada oficial/fiscal da consignacao for selecionada e os documentos/assinaturas obrigatorios estiverem concluidos, para formalizar a entrada do veiculo consignado no estoque da loja.
- **FR-088B:** A NF de entrada de consignacao deve preencher dados da GT3 Veiculos, proprietario/consignante, veiculo, contrato de consignacao, valor/base fiscal aplicavel, data de entrada, observacoes fiscais, CFOP, natureza da operacao e tributacao conforme configuracao fiscal aprovada.
- **FR-088C:** A NF de entrada de consignacao, DANFE/XML e status fiscal devem ficar vinculados ao veiculo, contrato de consignacao, proprietario e arquivo digital.
- **FR-088D:** Quando houver entrada oficial/fiscal de consignacao registrada, a NF de devolucao de consignacao deve ser emitida quando houver cancelamento/devolucao do veiculo consignado ao proprietario.
- **FR-088E:** Quando um veiculo consignado com entrada oficial/fiscal registrada for vendido, a NF de devolucao de consignacao deve anteceder a confeccao/emissao da NF de compra do veiculo pela loja, respeitando a sequencia fiscal aplicavel.
- **FR-088F:** A NF de devolucao de consignacao deve preencher dados da GT3 Veiculos, proprietario/consignante, veiculo, contrato de consignacao, NF de entrada vinculada, motivo da devolucao ou venda, data e observacoes fiscais. Regras fiscais, CFOP, natureza da operacao e tributacao: **A validar**.
- **FR-088G:** A NF de devolucao de consignacao, DANFE/XML e status fiscal devem ficar vinculados ao veiculo, contrato de consignacao, NF de entrada, proprietario e arquivo digital.

### 6.10 Documentos, Contratos e Recibos

- **FR-089:** O sistema deve gerar contratos de compra e venda como template obrigatorio do primeiro release, incluindo contrato de compra de veiculo com referencia em `planning-artifacts/templates/contracts/contrato-compra-veiculo.pdf`.
- **FR-090:** O sistema deve gerar contratos de consignacao como template obrigatorio do primeiro release, usando como referencia o arquivo `planning-artifacts/templates/contracts/contrato-consignacao.pdf`.
- **FR-091:** O sistema deve gerar procuracoes para venda de veiculo com texto customizavel e campos/espacos editaveis.
- **FR-092:** O sistema deve manter arquivo digital de documentos.
- **FR-093:** O sistema deve permitir impressao personalizada de documentos.
- **FR-094:** O sistema deve gerar recibo de venda.
- **FR-095:** O sistema deve permitir assinatura eletronica de contratos digitais utilizando como solucao principal a Assinatura Eletronica Gov.br, gratuita para usuarios com conta Gov.br habilitada, priorizando o fluxo por CPF/senha Gov.br e os requisitos oficiais do servico.
- **FR-095A:** O sistema deve gerar o contrato em formato compativel com a assinatura Gov.br, orientar o usuario/cliente sobre o fluxo de assinatura, registrar status, data/hora, responsavel pelo envio, signatarios, documento original e documento assinado.
- **FR-095B:** Quando houver integracao tecnica disponivel e aprovada para uso, o sistema pode integrar com a API/servico de Assinatura Eletronica Gov.br; caso contrario, deve permitir fluxo manual assistido, com envio do PDF para assinatura no portal Gov.br e posterior upload/anexo do documento assinado.
- **FR-095C:** O sistema deve armazenar evidencia da assinatura, arquivo assinado, hash/identificador quando disponivel, data/hora de conclusao e validacao do documento, mantendo rastreabilidade no contrato, veiculo, cliente/proprietario e negociacao.
- **FR-095D:** Caso o cliente/proprietario nao consiga utilizar a assinatura Gov.br por nivel de conta, acesso, validacao ou indisponibilidade do servico, o sistema deve permitir alternativa manual aprovada pela loja, mantendo justificativa, evidencia e auditoria.
- **FR-096:** O sistema deve rastrear status de assinatura.
- **FR-096A:** O preenchimento de contratos digitais deve ser simples de editar no desktop e no mobile, com campos claros, revisao antes do envio e possibilidade de corrigir dados sem recriar o contrato.
- **FR-096AA:** Todo contrato deve possuir campo de observacao livre e destacado para registrar situacoes pontuais, ressalvas, combinados, divergencias, pendencias ou condicoes especificas da negociacao.
- **FR-096AB:** Antes do envio/assinatura do contrato, o sistema deve exigir revisao do campo de observacao pelo responsavel, permitindo confirmar que nao ha observacoes ou registrar as situacoes que devem constar para ciencia do cliente.
- **FR-096AC:** Observacoes registradas no contrato devem aparecer na versao final do documento e no fluxo de assinatura/envio, para que o cliente tenha ciencia expressa antes de concluir a assinatura.
- **FR-096AD:** Alteracoes no campo de observacao apos geracao/revisao do contrato devem gerar historico de auditoria com data/hora, usuario e versao do documento.
- **FR-096B:** O sistema deve ter uma aba/fluxo de envio do contrato preenchido via WhatsApp.
- **FR-096BA:** Quando o contrato/documento estiver pronto para envio ou assinatura, o sistema deve avisar o comprador automaticamente, gerando mensagem de alerta pelo canal configurado, preferencialmente WhatsApp, informando que o documento esta pronto e registrando data/hora, destinatario, responsavel, status de envio e vinculo com a negociacao.
- **FR-096C:** O sistema deve suportar dois fluxos/modelos de contrato diferentes: contrato para vendedor do veiculo e contrato para comprador do veiculo.
- **FR-096D:** O envio via WhatsApp deve permitir escolher destinatario conforme o tipo de contrato, incluindo vendedor do veiculo ou comprador. Texto padrao da mensagem: **A validar**.
- **FR-096DA:** No processo de conferencia de pagamento e liberacao de documentos da venda, o sistema deve exibir pequeno aviso ao vendedor/Administrativo informando que, quando o comprador financiar por financeira propria, o valor do financiamento deve cair na conta da loja e nao na conta do cliente/proprietario; caso contrario, a documentacao nao deve ser entregue/liberada.
- **FR-096DB:** Quando houver financiamento por financeira propria do comprador, a liberacao de documentos deve exigir confirmacao de recebimento do valor na conta da loja, por conciliacao bancaria ou comprovante aprovado pelo Financeiro/Administrador, registrando data/hora, valor, conta, responsavel e evidencia.
- **FR-096E:** No processo de emissao do contrato de compra e venda, o sistema deve permitir anexar o comprovante de pagamento do boleto de quitacao da financeira quando houver financiamento/gravame a quitar.
- **FR-096F:** O comprovante de quitacao da financeira deve ficar vinculado ao contrato, ao veiculo, ao proprietario/vendedor e ao arquivo digital da negociacao.
- **FR-096FA:** O modulo de contratos deve permitir anexar PDF do laudo cautelar do veiculo ao contrato, ao veiculo e ao arquivo digital da negociacao.
- **FR-096FB:** O modulo de contratos deve permitir anexar PDF do laudo de transferencia do veiculo ao contrato, ao veiculo e ao arquivo digital da negociacao.
- **FR-096FC:** Laudo cautelar e laudo de transferencia devem estar presentes para todos os veiculos; o sistema deve alertar pendencia e bloquear o envio/assinatura do contrato quando qualquer um desses laudos obrigatorios nao estiver anexado ou marcado como concluido no arquivo do veiculo.
- **FR-096FD:** No modulo de vendas, o vendedor deve poder acessar os arquivos do laudo cautelar e do laudo de transferencia vinculados ao veiculo, conforme permissao, para visualizar, baixar/exportar ou compartilhar quando necessario no atendimento/negociacao.
- **FR-096FE:** O acesso, download/exportacao ou compartilhamento de laudos pelo vendedor deve poder ser realizado tambem pelo app mobile, registrando data/hora, usuario, veiculo, negociacao, tipo de laudo e acao executada.
- **FR-096FF:** O laudo cautelar deve permanecer armazenado no sistema por 2 anos a partir da data de emissao ou vinculacao ao veiculo, o que ocorrer por ultimo; apos esse prazo, o sistema deve executar exclusao automatica do arquivo, salvo bloqueio por pendencia legal/compliance, preservando apenas metadados e log de auditoria da exclusao.
- **FR-096G:** O modulo de contratos deve permitir emitir modelo de procuracao para que o vendedor/proprietario autorize a transferencia direta do veiculo para a pessoa compradora.
- **FR-096H:** No momento do cadastro da compra/entrada do veiculo, o sistema deve exigir a escolha de apenas uma modalidade de transferencia: via procuracao ou via recibo normal, impedindo que as duas opcoes fiquem selecionadas simultaneamente.
- **FR-096HA:** Quando a modalidade escolhida for via procuracao, o sistema deve emitir/coletar a procuracao de transferencia direta, coletar assinatura do vendedor/proprietario e vincular o documento ao veiculo, comprador, vendedor/proprietario e negociacao.
- **FR-096HB:** Quando a modalidade escolhida for via recibo normal, o sistema deve seguir o fluxo documental de recibo/transferencia normal, vinculando comprovantes, recibo/documento correspondente, responsavel, data/hora e status ao veiculo e a negociacao.
- **FR-096I:** A procuracao de transferencia direta pode ser aceita com reconhecimento de firma ou assinatura Gov.br, conforme documento apresentado; o sistema deve anexar a procuracao e registrar evidencia, data/hora, responsavel e status, sem exigir que o usuario informe no sistema qual modalidade de formalizacao foi utilizada.
- **FR-096J:** Ao informar a data de entrega do veiculo, o sistema deve emitir automaticamente o contrato/termo de garantia de 90 dias vinculado ao contrato de compra e venda, utilizando exatamente o modelo anexado do contrato de garantia.
- **FR-096K:** O contrato/termo de garantia deve preservar a redacao, estrutura, clausulas e condicoes do modelo anexado, permitindo apenas o preenchimento dos campos variaveis necessarios, como dados da loja, comprador, veiculo, data de entrega, vigencia, numero da negociacao e assinaturas.
- **FR-096L:** O contrato/termo de garantia deve seguir o modelo de garantia anexado, sem alterar texto juridico, clausulas, coberturas, exclusoes, prazos ou condicoes, permitindo apenas preencher os campos variaveis previstos no proprio modelo.
- **FR-096M:** O contrato/termo de garantia emitido deve ficar vinculado ao veiculo, comprador, contrato de compra e venda, entrega, arquivo digital da negociacao e status de assinatura/envio.

### 6.11 Agenda, Test Drive e Ordens de Servico

- **FR-097:** O sistema deve permitir agenda de test drives.
- **FR-098:** O sistema deve permitir agenda de visitas.
- **FR-099:** O sistema deve permitir agenda de servicos.
- **FR-099D:** No modulo Administrativo, deve existir menu/opcao de Agenda Geral para visualizar compromissos de todos os vendedores e responsaveis, conforme permissao.
- **FR-099E:** A Agenda Geral deve consolidar agendamentos realizados na loja, incluindo visitas, test drives, entregas, recontatos, compromissos comerciais e agendamentos de servicos como polimento, higienizacao, mecanica, pintura, vitrificacao e demais servicos configuraveis.
- **FR-099F:** A Agenda Geral deve permitir visualizacao por dia, semana e mes, com filtros por vendedor/responsavel, tipo de compromisso, cliente, veiculo, status, origem, horario, prestador de servico e local/patio quando aplicavel.
- **FR-099G:** O Administrador deve poder abrir cada compromisso da Agenda Geral para consultar detalhes, cliente, veiculo, responsavel, observacoes, historico, status e vinculos com lead, venda, ordem de servico ou entrega.
- **FR-099H:** Agendamentos de visitas, test drives, entregas, recontatos e servicos podem ser criados, confirmados, reagendados ou cancelados a partir de conversas pelo WhatsApp, conforme integracao disponivel e permissao do usuario.
- **FR-099I:** Quando um agendamento for realizado pelo WhatsApp, o sistema deve registrar canal de origem, cliente, telefone, conversa vinculada, data/hora solicitada, responsavel, status de confirmacao, mensagem enviada/recebida e historico de alteracoes.
- **FR-099J:** O sistema deve permitir enviar pelo WhatsApp mensagens de confirmacao, lembrete, reagendamento e cancelamento dos compromissos da agenda, usando templates editaveis e vinculando cada mensagem ao cliente, veiculo, vendedor/responsavel e evento da agenda.
- **FR-099A:** O sistema de agendamento de servicos deve gerar link compartilhavel para o cliente abrir uma agenda com horarios disponiveis e solicitar/agendar servico.
- **FR-099B:** O link de agenda disponivel deve respeitar disponibilidade configurada, tipo de servico, duracao estimada, responsavel/recurso, bloqueios de agenda e limite de vagas por horario.
- **FR-099C:** Quando o cliente escolher um horario pelo link, o sistema deve registrar a solicitacao/agendamento, vincular cliente, veiculo e servico, e notificar o responsavel interno para confirmacao quando a regra exigir.
- **FR-100:** O sistema deve enviar lembretes automaticos para visita, carro pronto, agendamento de servicos e documentacao/veiculo pronto, usando WhatsApp como canal principal e registrando destinatario, data/hora, evento vinculado, status de envio, responsavel/automacao e historico da mensagem.
- **FR-101:** O sistema deve enviar ou sugerir comunicacoes via WhatsApp.
- **FR-102:** O sistema deve controlar ordens de servico.
- **FR-103:** Ordens de servico devem ter status, prazo, responsavel, cliente, veiculo e acoes contextuais.
- **FR-104:** Ordens de servico devem poder se vincular a custos do veiculo.
- **FR-104A:** O sistema deve permitir ao Gestor de Servicos registrar vendas/execucao de servicos como polimento, PPF, pintura de roda, vitrificacao, peliculas e peliculas antivandalismo.
- **FR-104B:** O app deve permitir ao Gestor de Servicos registrar checklist de chegada do veiculo.
- **FR-104C:** O app deve permitir registros antes/depois da entrega do veiculo.
- **FR-104D:** O sistema deve coletar visto/aprovacao do cliente no fluxo de servico, permitir impressao do checklist, manter uma via com o cliente e permitir fotos do veiculo pelo app no mesmo fluxo, registrando data/hora, responsavel, cliente, veiculo, status de aprovacao e evidencia vinculada.
- **FR-104E:** O Gestor de Servicos deve poder criar e acompanhar agendamentos de servico.
- **FR-104F:** O vendedor deve conseguir visualizar no seu modulo os servicos de preparacao pendentes/concluidos do veiculo em negociacao ou venda, incluindo pintura de roda, polimento, higienizacao e polimento de farois.
- **FR-104G:** O vendedor deve conseguir conferir se o servico foi realizado, com status, data de conclusao, responsavel e evidencia/fotos quando disponivel.
- **FR-104H:** Ordens de servico devem poder incluir encaminhamento para mecanico e necessidade de encomenda de pecas originados na avaliacao.
- **FR-104HA:** Para veiculo consignado, a conducao da preparacao deve funcionar igual ao fluxo de veiculo proprio: apos avaliacao e entrada de consignacao fechada, o sistema deve gerar ordens de servico para os reparos/preparacoes aprovados.
- **FR-104HB:** A criacao/atualizacao das ordens de servico de preparacao deve poder ser feita pelo celular, registrando responsavel, prestador de servico, status, prazo previsto, fotos/evidencias e observacoes.
- **FR-104HC:** Toda equipe autorizada deve conseguir visualizar em qual prestador de servico o veiculo se encontra, quais servicos estao pendentes/em andamento/concluidos e a previsao de quando o carro ficara pronto.
- **FR-104HCA:** O menu Administrativo/Estoque deve possuir pagina de acompanhamento dos veiculos que estao em oficina ou prestador de servico, exibindo placa, marca/modelo, data de entrada na oficina, oficina/prestador atual, servicos solicitados, o que ja foi feito, status, previsao de conclusao, responsavel e observacoes.
- **FR-104HCB:** A pagina de veiculos em oficina deve permitir filtros por oficina/prestador, tipo de servico, status, periodo de entrada, responsavel, veiculo e previsao de conclusao, com acesso ao historico da ordem de servico e evidencias/fotos quando houver.
- **FR-104HD:** A partir do momento em que a entrada da consignacao estiver fechada, o veiculo deve poder ser oferecido por todo o time de vendas, mesmo que ainda esteja em preparacao, desde que o status e previsao estejam visiveis.
- **FR-104HE:** Na vitrine interna, veiculos em servico/preparacao devem destacar no topo do card o status, a data prevista e o prestador/local atual, permitindo ao vendedor informar disponibilidade com seguranca.
- **FR-104I:** O vendedor deve ter modulo de agendamento de entrega de veiculo apos a venda.
- **FR-104J:** Antes da entrega, o vendedor deve realizar checklist de entrega do veiculo pelo sistema/app.
- **FR-104JA:** O app do vendedor deve possuir fluxo de entrega tecnica do veiculo, podendo ser chamado de "Party Mode", para conduzir vendedor e cliente juntos durante a conferencia final do carro.
- **FR-104JB:** O checklist de entrega tecnica deve ser executado junto com o cliente e registrar a confirmacao de itens como piscas/setas, luzes, macanetas, travas, vidros, itens eletronicos, painel, multimidia quando houver, manual, chave reserva, macaco, triangulo, estepe, ferramentas, nivel/condicao aparente do oleo do motor e demais itens configuraveis.
- **FR-104JC:** O fluxo de entrega tecnica deve permitir registrar fotos/video ou visao 360 do veiculo junto com o cliente, vinculando as evidencias ao checklist, ao veiculo, ao comprador, ao vendedor e a negociacao.
- **FR-104JD:** Ao finalizar o checklist pelo app, o sistema deve gerar automaticamente um documento/PDF de entrega tecnica com os itens conferidos, observacoes, evidencias, data/hora, vendedor, cliente, veiculo e status final.
- **FR-104JE:** Quando houver impressora configurada, o sistema deve enviar automaticamente o documento de entrega tecnica para impressao ao finalizar o checklist; caso contrario, deve disponibilizar o PDF para impressao manual ou envio pelo canal autorizado.
- **FR-104JF:** O cliente deve assinar uma via do documento de entrega tecnica apos a impressao ou assinatura digital/coletada no app quando disponivel, e o sistema deve registrar a confirmacao de assinatura.
- **FR-104JG:** A via assinada do documento de entrega tecnica deve ser armazenada no arquivo digital do veiculo, permitindo anexar foto/scan pelo app ou salvar assinatura digital, com vinculo ao cliente, venda, vendedor, veiculo, data/hora e identificador do documento.
- **FR-104K:** O checklist de entrega deve conferir documentos, garantias, chave reserva/copia, manuais, acessorios e outros itens do carro. Lista final: **A validar**.
- **FR-104L:** O checklist de entrega deve confirmar se o brinde de entrega foi separado/entregue ao cliente. Tipo de brinde e regra operacional: **A validar**.
- **FR-104M:** O vendedor deve conferir se o veiculo possui adesivo da loja instalado no vidro antes da entrega.
- **FR-104N:** O checklist de entrega deve registrar responsavel, data/hora, status, observacoes e evidencia/foto quando necessario.
- **FR-104O:** O vendedor deve informar a data de entrega do veiculo no modulo de entrega; essa data deve alimentar automaticamente a emissao e vigencia do termo de garantia.
- **FR-104P:** O sistema deve permitir cadastro de prestadores de servicos/oficinas utilizados pela loja, incluindo nome/razao social, contato, telefone/WhatsApp, endereco, responsavel, observacoes, status ativo/inativo e historico de servicos vinculados.
- **FR-104Q:** Prestadores de servicos devem poder ser separados por categoria, com categorias iniciais como funilaria, mecanica, pintura, rodas, tapeceiro, vidros, vitrificacao, pintura de bancos, polimento, higienizacao, eletrica, pecas, despachantes/servicos documentais e outros servicos configuraveis.
- **FR-104R:** O Administrador ou Gestor de Servicos deve poder criar, editar, ativar, inativar e reordenar categorias de prestadores de servicos, permitindo adaptar a lista a novos tipos de servico sem alteracao de codigo.
- **FR-104S:** Um prestador de servico pode pertencer a uma ou mais categorias, permitindo que a mesma oficina/prestador seja selecionada em ordens de servico diferentes conforme o tipo de reparo ou preparacao.
- **FR-104T:** Ao criar uma ordem de servico, o sistema deve permitir filtrar prestadores por categoria, selecionar o prestador responsavel, registrar previsao de conclusao, valor previsto/realizado, status, fotos/evidencias e vinculo com veiculo, despesa e etapa de preparacao.
- **FR-104TA:** O sistema deve permitir cadastrar despachantes como prestadores de servicos, com dados de contato, documentos/credenciais operacionais quando aplicavel, categorias, tipos de servico atendidos, status ativo/inativo, observacoes e historico de servicos vinculados.
- **FR-104TB:** Servicos de despachante devem poder ser vinculados a veiculo, venda, compra, consignacao, transferencia, documentacao, despesa e arquivo digital, registrando tipo de servico, valor previsto, valor realizado, prazo, status, responsavel, comprovantes, protocolos e evidencias.
- **FR-104TC:** O sistema deve permitir acompanhar pendencias de despachante, como transferencia, regularizacao documental, comunicacao de venda, baixa/gravame quando aplicavel, segunda via, licenciamento ou outros servicos configuraveis, com alertas de prazo e historico de andamento.
- **FR-104U:** O sistema deve permitir enviar mensagem diretamente para prestadores de servicos cadastrados, preferencialmente via WhatsApp, a partir do cadastro do prestador, da ordem de servico ou do veiculo em preparacao.
- **FR-104V:** Mensagens enviadas a prestadores devem poder usar templates com dados do veiculo, servico solicitado, prazo, endereco/local, fotos/anexos e observacoes, mantendo possibilidade de edicao manual antes do envio.
- **FR-104W:** Todo envio de mensagem para prestador deve ficar registrado no historico do prestador, ordem de servico e veiculo, incluindo destinatario, canal, conteudo/resumo, data/hora, responsavel/automacao, status de envio e resposta quando disponivel.
- **FR-104X:** O sistema deve automatizar o recebimento de notas fiscais de servicos enviadas por prestadores via e-mail ou WhatsApp, capturando anexos como PDF, XML, imagem ou arquivo equivalente quando disponivel e vinculando a nota ao prestador, ordem de servico, veiculo e despesa correspondente.
- **FR-104Y:** Ao receber uma nota fiscal de servico, o sistema deve tentar identificar automaticamente prestador, CNPJ/CPF, numero da nota, data, valor, descricao do servico, veiculo/placa quando informado, canal de recebimento e anexos, deixando o lancamento pendente de conferencia manual quando houver baixa confianca ou conflito de dados.
- **FR-104Z:** Notas fiscais de servicos recebidas devem ser armazenadas no arquivo digital do veiculo, em pasta/secao de servicos realizados, junto com garantias, laudos, comprovantes, fotos, ordens de servico e demais documentos relacionados ao carro.

### 6.12 Almoxarifado

- **FR-105:** O sistema deve cadastrar itens de almoxarifado.
- **FR-106:** O sistema deve registrar entradas e saidas.
- **FR-107:** O sistema deve controlar quantidade em estoque.
- **FR-108:** O sistema deve gerar alerta de estoque baixo.
- **FR-109:** O sistema deve vincular consumo de item a veiculo ou ordem de servico quando aplicavel.

### 6.13 Consignacao

- **FR-110:** O sistema deve cadastrar veiculos consignados.
- **FR-110A:** Veiculos consignados devem passar por avaliacao previa com fotos e checklist antes de serem cadastrados como consignados ativos, publicados ou enviados para contrato.
- **FR-110B:** A avaliacao previa de veiculo consignado deve ficar vinculada ao proprietario, veiculo, contrato de consignacao, fotos, checklist, observacoes e responsavel pela avaliacao.
- **FR-110C:** O sistema deve alertar pendencia quando houver tentativa de ativar/publicar veiculo consignado sem avaliacao previa concluida. Regras de excecao: **A validar**.
- **FR-110D:** No checklist do veiculo consignado, o Administrador ou usuario autorizado deve consultar se existe financiamento/gravame e registrar o saldo de quitacao do veiculo quando houver.
- **FR-110E:** A consulta de saldo de quitacao deve registrar financeira, contrato quando disponivel, valor de quitacao, data de validade do saldo, data/hora da consulta, responsavel e comprovante/anexo quando houver.
- **FR-110F:** Caso exista saldo de quitacao pendente, o sistema deve alertar essa informacao no contrato de consignacao, na negociacao e antes da venda/transferencia, registrando valor, validade, financeira, responsavel pela conferencia e definicao operacional de quem ficara responsavel pelo pagamento conforme combinado registrado na negociacao.
- **FR-110G:** Ao veiculo entrar na consignacao, o proprietario deve assinar um TERMO DE AUTORIZACAO DE SERVICOS antes da execucao de qualquer servico no carro.
- **FR-110H:** O TERMO DE AUTORIZACAO DE SERVICOS deve discriminar item por item o que sera realizado no veiculo, incluindo descricao do servico, area do veiculo, valor previsto ou regra de cobranca, responsavel/oficina, prazo estimado e observacoes, usando como referencia o arquivo `planning-artifacts/templates/contracts/termo-autorizacao-servicos-consignacao.md`.
- **FR-110I:** O termo assinado deve ficar vinculado ao proprietario, veiculo, contrato de consignacao, avaliacao/checklist, ordens de servico, custos e arquivo digital da negociacao.
- **FR-110J:** Ordens de servico e cobranças na retirada do veiculo consignado devem referenciar a autorizacao de servicos correspondente quando houver custo para o proprietario.
- **FR-110JA:** Custos de vistoria cautelar/laudo cautelar realizados para o veiculo consignado devem poder ser incluidos na autorizacao de servicos e vinculados ao veiculo, proprietario e contrato de consignacao.
- **FR-110K:** A emissao do TERMO DE AUTORIZACAO DE SERVICOS deve ser realizada automaticamente apos a emissao do contrato de consignacao, utilizando os servicos/melhorias discriminados na avaliacao e aprovados para execucao.
- **FR-110L:** Caso nao existam servicos a autorizar apos o contrato de consignacao, o sistema deve permitir registrar "sem servicos autorizados no momento" e manter o historico no arquivo digital da consignacao.
- **FR-110M:** O termo de autorizacao de servicos deve conter dados do proprietario, dados completos do veiculo, tabela com colunas Itens, Servicos, Autorizado e Valor, valor total dos servicos, clausula de desconto dos servicos no valor a receber em caso de venda e clausula de pagamento na retirada se a venda nao for concretizada.
- **FR-110N:** Apos avaliacao e fechamento da entrada da consignacao, o sistema deve iniciar a preparacao do veiculo consignado com o mesmo fluxo operacional de um veiculo proprio, gerando ordens de servico a partir dos itens aprovados.
- **FR-110O:** O cadastro do consignado deve exibir status de preparacao, prestador atual, previsao de conclusao e permissao para que o time de vendas ofereca o veiculo enquanto acompanha essas informacoes.
- **FR-110P:** Todos os servicos, descontos e custos aceitos ou recusados na apresentacao ao proprietario devem ser refletidos no Termo de Autorizacao de Servicos, com os mesmos itens, valores, fotos/evidencias quando aplicavel e registro de ciencia do cliente.
- **FR-110Q:** Antes de concluir a entrada da consignacao, o sistema deve bloquear ou alertar quando houver itens de desconto/servico da avaliacao sem decisao registrada, sem justificativa ou sem reflexo no termo correspondente.
- **FR-111:** O sistema deve controlar contrato de consignacao.
- **FR-111A:** A assinatura do contrato de consignacao deve disparar automaticamente a emissao da NF de entrada de consignacao e a formalizacao da entrada do veiculo no estoque, quando nao houver pendencia bloqueante.
- **FR-111B:** Caso a NF de entrada de consignacao falhe, o sistema deve manter o veiculo com pendencia fiscal visivel e permitir retentativa/correcao conforme permissao.
- **FR-112:** O sistema deve controlar comissao de consignacao.
- **FR-112A:** No cadastro do veiculo consignado, o sistema deve utilizar o modelo de precificacao por sobrepreco como regra operacional principal, evitando depender de percentual fixo engessado.
- **FR-112B:** O cadastro do consignado deve permitir informar o valor liquido fixo acordado com o proprietario, que representa o valor minimo a repassar ao cliente/proprietario em caso de venda.
- **FR-112C:** O sistema deve permitir adicionar a comissao/sobrepreco da loja acima do valor liquido acordado, calculando preco anunciado, margem prevista da loja e espaco de negociacao.
- **FR-112D:** O sistema deve permitir flexibilizar a negociacao com o comprador dentro do sobrepreco/margem definida pela loja, sem exigir autorizacao do proprietario para cada desconto que nao reduza o valor liquido acordado com ele.
- **FR-112E:** Quando uma proposta ou desconto reduzir o valor liquido acordado com o proprietario, o sistema deve exigir aprovacao/anuencia do proprietario ou autorizacao gerencial conforme regra configuravel.
- **FR-112F:** O cadastro do consignado deve registrar valor liquido do proprietario, sobrepreco/comissao da loja, preco anunciado, desconto maximo permitido sem nova autorizacao, preco minimo operacional, responsavel pela precificacao e historico de alteracoes.
- **FR-113:** O sistema deve controlar prazo de venda.
- **FR-114:** O sistema deve gerar relatorios de consignados.
- **FR-114A:** O sistema deve permitir baixa/retirada de veiculo consignado a qualquer momento por solicitacao do cliente/proprietario, sem cobranca de custo de retirada.
- **FR-114B:** Na baixa/retirada de veiculo consignado, o sistema deve verificar automaticamente todos os custos e ordens de servico vinculados ao veiculo.
- **FR-114C:** Caso existam servicos realizados no carro, o sistema deve informar ao cliente/proprietario os valores devidos apenas dos servicos executados e autorizados, conforme autorizacao de servicos vinculada.
- **FR-114CA:** Em caso de retirada do veiculo consignado, custos de vistoria cautelar/laudo cautelar realizados e autorizados tambem devem ser cobrados do cliente/proprietario, junto dos demais servicos executados.
- **FR-114D:** O fluxo de baixa deve gerar demonstrativo de custos do veiculo para ciencia do cliente/proprietario, incluindo servico, data, fornecedor/responsavel, valor, status de pagamento e comprovantes/anexos quando houver.
- **FR-114E:** O sistema deve impedir cobranca de servicos nao autorizados ou nao executados no fluxo de retirada, salvo excecoes aprovadas pelo gestor e registradas em auditoria, com justificativa, responsavel, data/hora e evidencia vinculada ao veiculo e ao termo de devolucao/cancelamento.
- **FR-114F:** Ao retirar veiculo consignado, o sistema deve emitir automaticamente um TERMO DE DEVOLUCAO E CANCELAMENTO DE CONSIGNACAO para assinatura do proprietario.
- **FR-114G:** O termo de devolucao/cancelamento deve usar como referencia o arquivo `planning-artifacts/templates/contracts/termo-devolucao-cancelamento-consignacao.md`, preenchendo dados da GT3 Veiculos, proprietario, veiculo, contrato de consignacao, data, observacoes e demonstrativo de custos quando houver.
- **FR-114H:** O termo assinado deve cancelar/baixar a consignacao no sistema, registrar a devolucao do veiculo ao proprietario e vincular o documento ao contrato de consignacao, veiculo, proprietario e arquivo digital.
- **FR-114I:** Antes da assinatura do termo de devolucao/cancelamento, o sistema deve exigir revisao de pendencias, custos autorizados, ordens de servico e observacoes para ciencia do proprietario.
- **FR-114IA:** O termo de devolucao/cancelamento deve conter data e hora em que o cliente/proprietario retirou o carro.
- **FR-114IB:** O termo deve conter declaracao de que o veiculo esta nas mesmas condicoes de quando foi deixado em consignacao, exceto pelos reparos/servicos realizados e autorizados.
- **FR-114IC:** O termo deve conter campo de assinatura do cliente/proprietario e registrar status de assinatura, data/hora e responsavel pela coleta.
- **FR-114J:** No cancelamento/devolucao de consignacao, a baixa deve disparar a emissao da NF de devolucao de consignacao quando aplicavel, antes de concluir o status final do veiculo.
- **FR-114K:** Na venda de veiculo consignado, o fluxo deve emitir NF de devolucao de consignacao antes da NF de compra e bloquear a sequencia fiscal seguinte enquanto houver pendencia nessa etapa.
- **FR-114L:** Na venda de veiculo consignado, apos valor acertado com o proprietario, o sistema deve exibir lembrete discreto ao Administrativo para programar o pagamento do veiculo.
- **FR-114M:** O lembrete ao Administrativo deve informar como boa pratica que a loja costuma buscar prazo medio de 7 a 10 dias para concluir o pagamento, sem impedir configuracao de prazo diferente conforme negociacao aprovada.
- **FR-114N:** O sistema deve permitir registrar prazo negociado, data prevista de pagamento, responsavel pelo acordo, observacoes e status do pagamento ao proprietario do veiculo consignado.
- **FR-114NA:** No momento de realizar ou programar pagamento/deposito ao proprietario ou vendedor do veiculo, o sistema deve exibir pequeno alerta ao Administrativo informando que os dados do recebedor do deposito devem ser exatamente os mesmos dados do proprietario do veiculo cadastrados/confirmados na documentacao e consultas; divergencias devem bloquear ou exigir aprovacao gerencial com justificativa e evidencia.
- **FR-114NB:** A conferencia dos dados de pagamento deve registrar nome/razao social, CPF/CNPJ, banco, agencia, conta/chave Pix quando aplicavel, valor, data prevista, responsavel pela conferencia, status e evidencia/comprovante, mantendo vinculo com o veiculo, proprietario, contrato e negociacao.
- **FR-114O:** O modulo de consignado deve ter checklist de documentacoes entregues pelo comprador quando houver venda do veiculo consignado.
- **FR-114P:** O checklist de documentacoes do comprador deve permitir marcar documentos recebidos, pendentes, conferidos e anexados, incluindo documento de identificacao, CPF/CNPJ, comprovante de endereco, comprovante de pagamento/sinal, ficha/proposta de financiamento quando aplicavel, comprovante de seguro quando aplicavel e outros documentos configuraveis.
- **FR-114Q:** Cada item do checklist de documentacao do comprador deve registrar data/hora, responsavel pela conferencia, status, observacoes e anexo/evidencia quando houver.
- **FR-114R:** Pendencias no checklist de documentacao do comprador devem ser exibidas antes da emissao dos documentos finais, NF/contratos aplicaveis e entrega/transferencia do veiculo consignado.

### 6.14 Relatorios e Dashboard Executivo

- **FR-115:** O sistema deve exibir dashboard executivo para o dono/gestor.
- **FR-116:** Dashboard deve exibir vendas, faturamento, estoque, margem e indicadores de funil.
- **FR-116A:** Dashboard e relatorios de venda devem exibir resultado adicional por financiamento, seguro, garantia e transferencia, separando retorno da financeira/lucro de financiamento, comissao de seguro, receita/margem de garantia, spread/receita de transferencia, outros itens de lucro e margem do veiculo, alem da soma total do lucro por venda.
- **FR-116B:** Dashboard e relatorios da equipe de vendas devem exibir comissoes e premios por vendedor, incluindo comissao por compra de veiculo, repasse, consignacao, premio dezena, valores previstos, valores aprovados e valores pagos.
- **FR-116C:** Dashboard e relatorios gerenciais devem exibir plano de remuneracao, remuneracao prevista, remuneracao realizada, metas, bonus, premios e comissoes por funcionario, equipe, funcao e periodo.
- **FR-116D:** O dashboard administrativo/global deve apresentar venda bruta e margem media dos veiculos, considerando todos os carros do estoque/vendas conforme filtros aplicados, com visao consolidada para o Administrador/Dono.
- **FR-116E:** A visao global de margem deve permitir filtros por periodo, status do veiculo, vendedor, origem do estoque, tipo de venda, canal e categoria, exibindo quantidade de carros, valor total vendido, custo total estimado/realizado, lucro bruto total, margem media percentual e ticket medio.
- **FR-116F:** O dashboard administrativo deve exibir metricas de clientes, incluindo total de clientes cadastrados, total de clientes compradores, clientes que compraram mais de uma vez/retornaram a comprar, percentual de recompra e filtros por periodo, vendedor, origem e status.
- **FR-116G:** O dashboard administrativo deve exibir a quantidade de aniversariantes do mes, com possibilidade de visualizar lista de clientes, data de aniversario, vendedor responsavel, status de consentimento/opt-in, status do envio de parabens e retorno/resposta quando houver.
- **FR-116H:** O Administrador deve poder acompanhar no dashboard o resultado da automacao de parabens por WhatsApp, incluindo mensagens programadas, enviadas, falhas, respostas recebidas, clientes sem telefone valido ou sem consentimento e pendencias de acompanhamento pela equipe.
- **FR-116I:** O dashboard administrativo deve exibir resumo do estoque com total de veiculos, quantidade de veiculos proprios, quantidade de veiculos consignados e percentuais por tipo de estoque.
- **FR-116J:** O resumo de estoque deve permitir filtros por status, origem, tipo de entrada, vendedor/responsavel, patio/localizacao, data de entrada e periodo, mantendo drill-down para a lista de veiculos que compoe cada indicador.
- **FR-116K:** O menu/dashboard de estoque deve exibir tempo medio de giro do estoque, considerando data de entrada e data de venda/baixa dos veiculos, com filtros por periodo, tipo de estoque, origem, modelo, vendedor/responsavel e status.
- **FR-116L:** No acesso individual de cada veiculo, o sistema deve exibir ha quantos dias o veiculo esta no estoque, calculado a partir da data de entrada ate a data atual ou ate a data de venda/baixa quando aplicavel.
- **FR-116M:** O dashboard de estoque deve exibir ranking dos veiculos com mais tempo na loja, incluindo placa, marca/modelo, ano, tipo de estoque, data de entrada, dias em estoque, preco anunciado, responsavel e status atual.
- **FR-116N:** O modulo/dashboard de estoque deve exibir grafico de evolucao do estoque ao longo do tempo, com barras empilhadas ou visual equivalente mostrando, dentro da mesma barra, a composicao entre veiculos proprios e veiculos consignados.
- **FR-116O:** O grafico de evolucao do estoque deve permitir alternar granularidade por dia, semana ou mes e aplicar filtros por periodo, status, origem, tipo de entrada, patio/localizacao e vendedor/responsavel.
- **FR-117:** Dashboard deve exibir desempenho por vendedor.
- **FR-117AA:** O dashboard deve exibir ranking de vendedores com nome do vendedor, quantidade de veiculos vendidos, valor total vendido, margem/lucro gerado quando aplicavel, ticket medio e posicao no ranking, permitindo ordenar por quantidade vendida, valor vendido ou lucro.
- **FR-117A:** O sistema deve exibir ranking de vendas de servicos por vendedor, considerando quantidade de servicos vendidos, valor previsto, valor realizado, performance em reais e performance percentual.
- **FR-117B:** O ranking de servicos por vendedor deve permitir filtros por periodo, tipo de servico, vendedor, veiculo, placa, canal de venda e status.
- **FR-117C:** O relatorio de performance de servicos pode seguir layout tabular semelhante a "Avaliacao - Performance de Servicos", com busca por placa/marca/modelo, filtro de tipo, periodo, total de registros e acoes de exportar/imprimir quando aplicavel.
- **FR-117D:** A tabela de performance de servicos deve conter colunas como vendido em, placa, veiculo, fab/mod, tipo de venda, vendedor/avaliador responsavel, previsto (R$), realizado (R$), performance (R$) e performance (%).
- **FR-117E:** Valores positivos e negativos de performance devem ter diferenciacao visual discreta, permitindo identificar rapidamente servicos com resultado acima ou abaixo do previsto.
- **FR-117F:** O sistema deve exibir ranking de acompanhamento de avaliacoes por vendedor, avaliador e profissional cadastrado, permitindo comparar solicitacoes, avaliacoes realizadas, avaliacoes aprovadas e percentual de aproveitamento.
- **FR-117G:** O ranking de avaliacoes deve permitir filtros por periodo, unidade/equipe quando aplicavel, tipo de profissional, vendedor, avaliador, origem da solicitacao, status da avaliacao e resultado comercial.
- **FR-117H:** O relatorio pode seguir layout tabular semelhante a "Solicitacoes de Avaliacao por Vendedor", com colunas como vendedor/profissional, aprovadas, realizadas e percentual, ordenacao por desempenho e exportacao/impressao quando aplicavel.
- **FR-117I:** O dashboard deve permitir visualizar profissionais ativos e inativos no ranking, mantendo identificacao clara de status para acompanhamento historico sem distorcer indicadores atuais.
- **FR-118:** Dashboard deve exibir leads por origem e conversao.
- **FR-118A:** Dashboard deve exibir performance por midia e canal, comparando volume de leads, agendamentos, visitas, avaliacoes, propostas, vendas, perdas, custo quando disponivel e conversao por etapa.
- **FR-118B:** Dashboard deve exibir performance por atendente/SDR/vendedor, incluindo tempo de resposta, agendamentos realizados, confirmacoes, comparecimentos, conversao de avaliacao, conversao de venda e follow-ups pendentes.
- **FR-118C:** Relatorios de CRM devem permitir cruzar midia, canal, atendente, campanha, veiculo de interesse, periodo e etapa do funil para apoiar decisoes de marketing, treinamento e gestao de equipe.
- **FR-119:** Dashboard deve exibir veiculos parados e aging de estoque.
- **FR-120:** Dashboard deve exibir contas a pagar/receber relevantes.
- **FR-120A:** Dashboard deve exibir metricas de anuncios da Meta por periodo, campanha, veiculo e origem, incluindo investimento, leads/mensagens, custo por lead e resultado comercial quando houver atribuicao.
- **FR-120B:** Dashboard deve exibir metricas de postagens organicas por veiculo e canal, incluindo quantidade de postagens, visualizacoes/reproducoes, alcance, impressoes, curtidas/reacoes, comentarios, compartilhamentos, mensagens iniciadas, leads gerados e ultima data de divulgacao.
- **FR-121:** O sistema deve gerar relatorios de vendas e margens.
- **FR-121A:** O menu Relatorios deve possuir botao/opcao de Analise de Rentabilidade, com acesso restrito ao Administrador/Dono e usuarios autorizados.
- **FR-121B:** A Analise de Rentabilidade deve trazer metricas consolidadas de vendas, incluindo quantidade vendida, venda bruta, ticket medio, custo dos veiculos, despesas de preparacao, despesas operacionais atribuiveis, lucro bruto, lucro liquido gerencial quando configurado e margem percentual.
- **FR-121C:** A Analise de Rentabilidade deve exibir previsoes/projecoes de resultado para mes e ano, considerando vendas realizadas, estoque atual, margem media, giro de estoque, funil de oportunidades e parametros configuraveis pelo Administrador.
- **FR-121D:** A Analise de Rentabilidade deve calcular lucro sobre o capital investido em estoque, exibindo valor investido em veiculos proprios, despesas acumuladas de preparacao, lucro realizado, lucro previsto e percentual de retorno sobre o estoque/investimento.
- **FR-121E:** A tela de Analise de Rentabilidade deve permitir filtros por periodo, vendedor, tipo de estoque, origem, status, modelo, canal de venda e unidade/local quando aplicavel, com exportacao/impressao quando autorizado.
- **FR-122:** O sistema deve gerar relatorios financeiros.
- **FR-123:** O sistema deve gerar relatorios de veiculos e clientes.
- **FR-123A:** O menu Relatorios deve permitir gerar relatorio discriminado de todos os veiculos da loja, exibindo um veiculo por linha, com placa, marca/modelo, ano, status atual, tipo de estoque indicando se e proprio, consignado ou outro tipo configuravel, data de entrada, dias em estoque, responsavel, preco anunciado e observacoes quando houver.
- **FR-123B:** O relatorio discriminado de veiculos deve permitir filtros por status, tipo de estoque, origem, periodo de entrada, vendedor/responsavel, patio/localizacao e ordenacao por dias em estoque, preco, modelo ou status.
- **FR-124:** O sistema deve exibir demonstrativo anual, graficos de performance e comparativos mensais.
- **FR-124A:** O Administrativo deve poder lancar despesas diarias da loja, como pequenas compras, manutencoes, servicos avulsos e outros custos operacionais recorrentes ou pontuais.
- **FR-124B:** O Administrativo deve poder cadastrar despesas fixas e variaveis da loja, com categoria, competencia, vencimento, valor previsto, valor realizado, status, forma de pagamento e comprovante quando houver.
- **FR-124C:** Relatorios financeiros e dashboard executivo devem separar despesas por veiculo, despesas fixas, despesas variaveis e despesas diarias da loja.
- **FR-124D:** O sistema deve permitir filtros de despesas por periodo, categoria, responsavel, status, veiculo, fornecedor/oficina e tipo de despesa.
- **FR-124E:** Notas fiscais de servicos recebidas automaticamente por e-mail ou WhatsApp devem gerar ou atualizar lancamento financeiro correspondente, alimentando a DRE da loja e, quando vinculadas a um veiculo, tambem a DRE/margem do carro.
- **FR-124F:** O sistema deve separar uma via/registro da nota fiscal de servico para a contabilidade, com status de envio ou disponibilizacao, data/hora, responsavel/automacao, arquivo anexado, veiculo vinculado quando houver e historico de conferencias.
- **FR-124G:** O arquivo digital deve organizar documentos por veiculo em pastas/secoes, incluindo contratos, garantias, laudos, notas fiscais de servicos, comprovantes, ordens de servico, fotos, anexos contabeis e documentos de venda/transferencia.
- **FR-124H:** Apos 3 meses da venda do veiculo e baixa concluida no sistema, o sistema deve executar rotina automatica de baixa/arquivamento/exclusao do dossie operacional ativo do veiculo conforme politica de retencao configurada, preservando documentos fiscais, contabeis, contratos, auditoria e demais registros que precisem ser mantidos por exigencia legal, fiscal ou contabil.
- **FR-124I:** Antes da exclusao/arquivamento automatico do dossie operacional ativo, o sistema deve alertar Administrador/Financeiro, permitir revisao de pendencias e registrar log com data/hora, criterio aplicado, arquivos afetados e responsavel/automacao.

## 7. Requisitos Nao Funcionais

- **NFR-001:** O sistema deve priorizar simplicidade e flexibilidade na primeira versao.
- **NFR-002:** O sistema deve usar permissoes por papel e escopo de dados.
- **NFR-003:** O sistema deve manter trilha de auditoria para mudancas criticas.
- **NFR-004:** O sistema deve proteger dados pessoais de clientes e conversas.
- **NFR-005:** O sistema deve registrar origem de leads e eventos comerciais importantes.
- **NFR-006:** O sistema deve separar claramente operacao publica do site e area interna autenticada.
- **NFR-007:** O sistema deve suportar documentacao versionada em Markdown.
- **NFR-008:** O sistema deve ter estados de carregamento, vazio, erro e permissao negada nas telas principais.
- **NFR-009:** Integracoes externas devem falhar de forma visivel e recuperavel, sem corromper dados internos.
- **NFR-010:** Regras fiscais, bancos, portais e WhatsApp devem ser configuraveis pela area de settings do portal. Fornecedores, parametros e regras especificas permanecem **A validar** ate definicao operacional.
- **NFR-011:** O sistema deve suportar instalacao/configuracao de certificado digital e sincronizacao com APIs fiscais/financeiras necessarias.
- **NFR-012:** O banco relacional PostgreSQL/Supabase deve guardar os dados transacionais seguros do sistema, incluindo veiculos, clientes, leads, propostas, vendas, contratos, status de pagamento, despesas, comissoes, permissoes, configuracoes operacionais e logs de auditoria.
- **NFR-013:** PostgreSQL/Supabase deve ser a fonte confiavel para operacoes criticas e auditaveis, mantendo integridade relacional, historico de alteracoes, rastreabilidade e consistencia dos dados usados nas telas e documentos.
- **NFR-014:** O sistema deve prever uma camada de inteligencia baseada em Banco de Grafos (Neo4j) ou camada relacional avancada equivalente para conectar perfil do lead, historico de compras, interacoes em marketplaces, veiculos de interesse, estoque disponivel, margem dos veiculos no patio e eventos comerciais.
- **NFR-015:** A camada de inteligencia deve permitir calcular rapidamente score de match entre cliente/lead, proposta e veiculo, apoiando Next Best Action, recomendacao de veiculos, priorizacao de leads e sugestoes comerciais sem sobrecarregar o banco transacional tradicional.
- **NFR-016:** As historias macros e requisitos mapeados devem gerar fatos para o grafo/camada de inteligencia, classificando cada fato em tres tipos: Fatos Declarados, Fatos Observados e Fatos Inferidos.
- **NFR-017:** Cada fato no grafo deve registrar origem do dado, entidade relacionada, peso, data de atualizacao, confianca, validade temporal e justificativa resumida, permitindo auditoria das recomendacoes exibidas ao vendedor.
- **NFR-018:** Fatos Declarados representam o que o lead informa explicitamente, como "procuro um SUV de ate R$ 120k", devendo alimentar preferencias, filtros e contexto da negociacao.
- **NFR-019:** Fatos Observados representam comportamentos reais do lead, como cliques, respostas, visitas a anuncios, tempo de navegacao, mensagens, simulacoes ou recorrencia de interesse; esses fatos devem ter peso maior nas recomendacoes por demonstrarem comportamento concreto.
- **NFR-020:** Fatos Inferidos representam deducoes do sistema baseadas em conexoes do grafo, como inferir interesse em categoria Premium/Sport quando o lead interage com BMW M3 e Mercedes C63; inferencias devem registrar justificativa, confianca e possibilidade de revisao.
- **NFR-021:** O sistema deve armazenar dados operacionais de forma estruturada e reutilizavel por IA no futuro, com entidades bem definidas, identificadores estaveis, relacionamentos entre cliente, lead, veiculo, atendimento, proposta, venda, anuncio, despesa, documento, servico e evento comercial.
- **NFR-022:** Eventos importantes devem ser registrados em formato consultavel por maquina, incluindo tipo do evento, entidade relacionada, origem, canal, usuario/automacao, data/hora, payload resumido, status, resultado e referencia ao registro transacional original.
- **NFR-023:** Dados textuais relevantes, como conversas, observacoes, justificativas, objecoes, descricoes de veiculos, comentarios de avaliacao e historico de negociacao, devem ser armazenados com contexto suficiente para posterior sumarizacao, classificacao, busca semantica e extracao de insights por IA.
- **NFR-024:** A arquitetura deve permitir criar read models, views analiticas, embeddings ou camada de consulta propria para IA sem comprometer a fonte transacional da verdade, mantendo separacao entre operacao critica, relatorios e processamento analitico/inteligencia.
- **NFR-025:** Todo dado consumido por IA deve preservar metadados de origem, permissao de acesso, data de atualizacao, confianca, status de validade e trilha de auditoria, permitindo explicar por que um insight, score ou recomendacao foi gerado.
- **NFR-026:** O sistema deve evitar armazenamento de dados soltos sem dono ou sem vinculo operacional; informacoes capturadas por formularios, mensagens, anexos, integracoes, RPA ou lancamentos manuais devem ser vinculadas a entidades e eventos para permitir analise historica confiavel.
- **NFR-027:** O processo de auditoria documental deve gerar um mapa de cobertura entre Requisitos Funcionais, epicos, historias, criterios de aceite e dependencias, indicando requisitos cobertos, parcialmente cobertos, duplicados, conflitantes ou sem historia associada.
- **NFR-028:** Nenhuma sprint deve ser liberada para desenvolvimento quando houver requisito funcional critico sem cobertura em historia, dependencia bloqueante nao mapeada ou criterio de aceite insuficiente.
- **NFR-029:** O processo de auditoria documental deve identificar Recursos Fantasmas, ou seja, historias, tarefas, telas, automacoes, integracoes, regras de negocio ou criterios de aceite que adicionem escopo nao previsto no PRD original nem aprovado em decisao registrada.
- **NFR-030:** Recursos Fantasmas devem ser marcados para remocao, revisao ou aprovacao explicita do gestor antes de entrarem no backlog, evitando que a IA aumente o escopo do produto sem autorizacao.
- **NFR-031:** Todo Recurso Fantasma deve passar por decisao de escopo: Corte ou Promocao. Se for perfumaria, baixa prioridade ou nao essencial para o fluxo validado, deve ser cortado do backlog/sprint.
- **NFR-032:** Se o Recurso Fantasma for considerado crucial para a operacao, ele deve ser promovido retroativamente ao PRD com novos IDs de requisitos funcionais/nao funcionais, justificativa de negocio, impacto, prioridade, criterio de aceite e atualizacao do mapa de cobertura.
- **NFR-033:** Exemplo de promocao: uma tela de gerenciamento de templates de mensagens dinamicas para o vendedor enviar via WhatsApp, caso validada como essencial, deve virar requisito formal do PRD antes de aparecer como historia ou tarefa de desenvolvimento.

## 8. Hipoteses Tecnicas Confirmadas e Pontos A Validar

- PostgreSQL/Supabase como fonte transacional da verdade para o "feijao com arroz" seguro: dados dos veiculos, clientes, leads, propostas, pagamentos, contratos, despesas, configuracoes e logs de auditoria.
- Neo4j/Knowledge Graph ou camada relacional avancada como camada de inteligencia para conectar perfil do lead, historico de compras, interacoes em marketplaces, margem dos veiculos no patio e calcular score de match/proposta em baixa latencia.
- Modelo de dados deve registrar entidades, eventos, relacionamentos, textos relevantes e metadados de origem de forma preparada para consumo futuro por IA, extracao de insights, busca semantica, recomendacoes e relatorios analiticos.
- IA com modelo local para evitar gasto recorrente de tokens.
- Integração WhatsApp via Evolution API.
- Integração com Instagram, OLX, Mercado Livre, Webmotors, Webcarros, Mobiauto e portais relevantes.
- Integração FIPE.
- Emissao fiscal atraves de SAT. Forma de integracao: **A validar**.
- Integração com bancos/simuladores de financiamento, iniciando por Santander e BV Financeira.
- Integração com Assinatura Eletronica Gov.br gratuita como solucao principal.
- App mobile com quatro experiencias separadas e layouts diferentes: vendedor, avaliador, prestador de servico e dono do negocio.

### 8.1 Escopo do App Mobile

- **Vendedores:** acompanhar suas vendas, ver carros disponiveis no estoque, checar se um veiculo ja esta em negociacao, acompanhar leads e proximas acoes, acompanhar encomendas de veiculos 0km vinculadas aos seus clientes/leads, e divulgar veiculos em Instagram, catalogo WhatsApp, Facebook e grupos de anuncio conforme permissoes.
- **Avaliadores:** realizar avaliacao veicular, checklist de avaliacao, fotos, previsao de gastos, FIPE/media de anuncios e apoio a precificacao.
- **Prestadores de servico:** realizar checklist, lancar execucao/venda de servicos, acompanhar agendamentos e registrar evidencias antes/depois quando aplicavel.
- **Dono do negocio:** acompanhar indicadores principais, funil, desempenho da equipe, estoque, vendas, alertas e decisoes pendentes.

Cada experiencia mobile deve ter layout proprio e totalmente diferente das demais, porque cada perfil tem tarefas, contexto e prioridades diferentes.

## 9. Metricas de Sucesso

- Tempo medio ate primeiro atendimento.
- Percentual de leads respondidos dentro do SLA.
- Taxa de conversao por etapa do funil.
- Leads reativados por mes.
- Vendas geradas por base antiga.
- Taxa de follow-up concluido.
- Quantidade de leads esquecidos/inativos.
- Tempo medio de ciclo de venda.
- Giro de estoque.
- Dias medios em estoque.
- Margem bruta e liquida por veiculo.
- IQA medio dos anuncios.
- Leads por canal.
- Conversao por vendedor.
- Propostas enviadas e aprovadas.
- Test drives agendados e comparecidos.

## 10. Fora de Escopo Inicial A Validar

Os itens abaixo nao estao descartados; precisam de priorizacao antes da implementacao:

- Todos os portais possiveis na primeira versao.
- Envio automatico de mensagens pela IA sem aprovacao.
- Emissao fiscal SAT sem forma de integracao definida.
- Integracao bancaria completa.
- Assinatura ICP-Brasil paga ou fornecedor privado de assinatura eletronica como dependencia obrigatoria do MVP.
- Unificar layouts mobile entre perfis diferentes.
- Todas as regras de consignacao e fiscalidade regional.

## 11. Open Questions

- Qual sera o recorte do MVP?
- Canais iniciais resolvidos: Webmotors primeiro, depois OLX; configurar Evolution API, OLX, Mercado Livre, Webcarros, Mobiauto e Webmotors.
- Provedor WhatsApp resolvido: Evolution API.
- Portais obrigatorios resolvidos: Webmotors, OLX, Mercado Livre, Webcarros e Mobiauto.
- Como sera feita a integracao fiscal via SAT?
- Assinatura eletronica resolvida: usar Assinatura Eletronica Gov.br gratuita como solucao principal, com alternativa manual auditada quando necessario.
- Bancos/simuladores iniciais resolvidos: Santander e BV Financeira.
- Regra resolvida: comissao e obrigatoria em qualquer venda; detalhes de calculo seguem configuraveis.
- Quais etapas oficiais do kanban serao adotadas?
- Quais KPIs sao obrigatorios no dashboard executivo de dia 1?
- Qual modelo local de IA sera usado e qual infraestrutura minima sera necessaria?
- Como sera feita a integracao com SAT?
- Quais recursos mobile entram primeiro para vendedor, avaliador, prestador de servico e dono?
- Knowledge Graph resolvido como necessario para extrair insights de vendas, leads e melhores horarios.
- Templates obrigatorios no primeiro release: contrato de consignacao e contrato de compra e venda.

## 12. Proximos Passos na Metodologia BMAD/BMAP

1. Validar este PRD draft.
2. Definir MVP e fases.
3. Finalizar o escopo em alto nivel dos 10 epicos mapeados, documentando para cada epico: objetivo, escopo, fora de escopo, usuarios impactados, dependencias, riscos, integracoes, dados principais e valor de negocio.
4. Extrair epicos e historias macros, agrupando os requisitos em blocos conceituais logicos por jornada do usuario e capacidade do sistema.
5. Classificar os fatos que alimentarao o grafo/camada de inteligencia em tres niveis de peso, vinculando cada fato a historias, entidades, origem do dado e impacto esperado no score.
6. Rodar `bmad-create-ux-design` para UX do site, vendedor e dono.
7. Rodar `bmad-create-architecture` para validar arquitetura e integracoes.
8. Rodar `bmad-create-epics-and-stories`.
9. Sprint Planning: rodar `bmad-sprint-planning` para quebrar os epicos conceituais em blocos menores de tempo, sprints, historias e tarefas tecnicas com checklists de aceite tecnico bem definidos para o desenvolvedor.
10. Executar Processo de Auditoria e Limpeza de Gaps e Dependencias, no qual a IA varre PRD, epicos, historias, arquitetura e UX para validar cobertura de 100% dos Requisitos Funcionais em historias dos epicos.
11. Gerar mapa de cobertura com requisitos cobertos, parcialmente cobertos, sem cobertura, duplicados, conflitantes, dependencias pendentes e Recursos Fantasmas sem lastro no PRD.
12. Para cada Recurso Fantasma, aplicar decisao de escopo: cortar quando for perfumaria/nao essencial ou promover retroativamente ao PRD com novos IDs de requisito quando for crucial, reajustando o mapa de cobertura.
13. Para cada sprint, validar criterios de aceite, dados de entrada/saida, regras de permissao, integracoes, eventos, logs, erros esperados, testes minimos e definicao de pronto.
14. Executar a Fase 2: Verificacao de Prontidao de Implementacao (Implementation Readiness Assessment), antes de escrever codigo, rodando `bmad-check-implementation-readiness` para checagem cruzada automatica entre PRD, epicos, historias, UX, arquitetura, dados, permissoes, integracoes, riscos e criterios de aceite.
15. Corrigir lacunas encontradas na verificacao de prontidao antes de liberar a sprint para desenvolvimento.
16. Iniciar a etapa de desenvolvimento de codigo com base nas historias priorizadas, permitindo que a IA implemente as telas, fluxos, regras e integracoes conforme os criterios de aceite definidos.
17. Durante o desenvolvimento, o papel do gestor deve ser auditar funcionalmente o codigo entregue pela IA, verificando se a funcionalidade realmente abre, funciona na tela, respeita o fluxo operacional, grava/consulta os dados corretos e atende ao comportamento esperado.
18. O Code Review funcional deve validar a experiencia real do usuario, incluindo navegacao, permissoes, mensagens de erro, calculos, documentos gerados, estados vazios, responsividade, persistencia de dados e aderencia ao checklist de aceite da sprint.
19. Uma entrega so deve ser considerada pronta quando passar pelos testes tecnicos minimos do desenvolvedor e pelo aceite funcional do gestor na interface.
