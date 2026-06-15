# Sprint 10: Configuracoes, Permissoes, Perfis e Administracao do Sistema

## Status
Em definicao.

## Objetivo da Sprint
Definir a central administrativa do sistema, incluindo usuarios, perfis, permissoes, configuracoes da loja, parametros financeiros, canais, categorias, templates, automacoes, seguranca e administracao tecnica.

A Sprint 10 consolida as regras transversais que apareceram nas sprints anteriores e transforma permissoes, parametros e configuracoes em modulos administraveis.

## Ponto de Entrada
A Sprint 10 usa decisoes anteriores:

- Perfis citados nas sprints: Dono/Gestor, Administrador, Administrativo, Vendedor, SDR, Avaliador e Responsavel por Servicos/Estetica.
- Permissoes de clientes, leads, vendas, estoque, financeiro, DRE, documentos, anuncios, oficina, prestadores, IA e logs.
- Necessidade de configuracoes globais de loja, comissoes, impostos, canais, categorias e automacoes.

## Ponto de Saida
A Sprint 10 termina quando:

- Perfis e permissoes ficam definidos por modulo e acao.
- Configuracoes gerais da loja ficam mapeadas.
- Parametros financeiros, impostos e comissoes ficam configuraveis.
- Canais WhatsApp/e-mail ficam configuraveis.
- Categorias, templates e parametros operacionais ficam administraveis.
- Regras de automacao e alertas ficam configuraveis.
- Regras de seguranca, auditoria e administracao tecnica ficam definidas.

## Stories Macro Propostas

### S10-US01: Usuarios, Perfis e Permissoes
Definir usuarios, papeis, permissoes por modulo, escopo de acesso e regras de visibilidade.

Arquivo detalhado: `stories/S10-US01-usuarios-perfis-permissoes.md`.

Escopo inicial:
- Cadastro de usuarios.
- Perfis padrao.
- Permissoes por modulo e acao.
- Escopo por carteira, lead, venda, veiculo e loja.
- Bloqueio de dados financeiros/sensiveis por perfil.
- Logs de alteracao de permissao.

### S10-US02: Configuracoes Gerais da Loja
Definir dados cadastrais, fiscais, contador, regime tributario, unidade, horarios, politicas operacionais e uso automatico em documentos.

Arquivo detalhado: `stories/S10-US02-configuracoes-gerais-loja.md`.

Escopo inicial:
- Dados cadastrais e fiscais da loja.
- CNAEs, inscricoes, contador e regime tributario.
- Uma loja/unidade no MVP, preparada para multiunidade futura.
- Horarios, dias uteis, feriados, agenda de visitas e entrega tecnica.
- Prazos padrao para lead, follow-up, kanbans, documentacao, entrega, OS, despachante, pos-venda e aniversario.
- Uso automatico dos dados em contratos, termos, entrega tecnica, despachante, mensagens, e-mails, anuncios e site.
### S10-US03: Configuracoes Financeiras, Impostos e Comissoes
Definir aliquotas, regras de comissao, bases de calculo, ajustes e parametros financeiros.

Arquivo detalhado: `stories/S10-US03-configuracoes-financeiras-impostos-comissoes.md`.

### S10-US04: Configuracao de Canais WhatsApp/E-mail
Definir configuracao de instancia WhatsApp, e-mail operacional, templates e preferencias de canal.

Arquivo detalhado: `stories/S10-US04-configuracao-canais-whatsapp-email.md`.

### S10-US05: Categorias, Templates e Parametros Operacionais
Definir categorias editaveis, templates de mensagem/documento e parametros operacionais.

Arquivo detalhado: `stories/S10-US05-categorias-templates-parametros-operacionais.md`.

### S10-US06: Configuracao de Regras de Automacao e Alertas
Definir interface administrativa para regras de alertas, automacoes, prazos e destinatarios.

Arquivo detalhado: `stories/S10-US06-configuracao-regras-automacao-alertas.md`.

### S10-US07: Seguranca, Auditoria e Administracao Tecnica
Definir seguranca, logs, sessoes, politicas de acesso, retencao, backups, LGPD operacional e administracao tecnica.

Arquivo detalhado: `stories/S10-US07-seguranca-auditoria-administracao-tecnica.md`.

## Decisoes Ja Confirmadas do Produto
- S10-US07 revisada: sessao nao expira por inatividade no MVP; Dono/Gestor pode forcar troca de senha; usuario inativo perde acesso imediatamente; auditoria/logs imutaveis aprovados; documentos do cliente podem ser excluidos do sistema com log; cadastros, dados transacionais, contratos, financeiro e logs seguem retencao quando houver obrigacao; backup e administracao tecnica aprovados.
- S10-US06 revisada: Dono/Gestor pode ativar/desativar e ajustar regras de lead sem continuidade, follow-up vencido, aniversario, agendamento/visita, documentacao pendente, entrega tecnica, OS/oficina atrasada, custo acima do previsto, documento sem classificacao, despachante pendente e pos-venda pendente.
- Cada regra configura prazo/limite, prioridade, destinatarios, canal, template, aprovacao humana e se gera apenas alerta ou tambem mensagem.
- Dono/Gestor configura tudo; Administrativo visualiza e pode ajustar regras operacionais se autorizado; Vendedor/SDR nao configuram regras.
- Regras nao executam preco, compra, pagamento, contrato, aprovacao juridica/financeira ou alteracao critica sem aprovacao humana.
- Toda alteracao gera log e deve existir teste de regra/template antes de ativar.
- Alterar regra nao apaga historico; cada disparo mantem versao/regra usada.
- S10-US05 revisada: categorias configuraveis aprovadas para origem do lead, status/motivo de perda, prestadores, servicos, financeiras, receitas adicionais, documentos, laudos/vistorias, despachante/servico documental e anuncios/campanhas.
- Templates configuraveis aprovados para WhatsApp/e-mail, contrato de compra e venda, termo de garantia, checklist de entrega tecnica, OS, solicitacao de documentos, despachante, prestador e pos-venda/aniversario.
- Parametros operacionais aprovados: colunas/prazos dos kanbans, tipos de agendamento, tipos de OS, prioridades, motivos de cancelamento, arquivamento e ajuste manual financeiro/comissao.
- Dono/Gestor altera tudo; Administrativo pode alterar listas/templates operacionais se autorizado; Vendedor/SDR nao alteram.
- Edicao de categoria/template nao apaga historico; registros antigos preservam valor/template usado.
- Toda criacao, edicao, inativacao e reativacao gera log.
- S10-US04 revisada: configurar instancia principal `loja-principal` com numero oficial da loja via Evolution API.
- Tela de canal deve exibir conectado, desconectado, QR code/pareamento, erro, ultima sincronizacao e logs basicos.
- Configurar e-mail operacional principal da loja para envio/recebimento.
- Dono/Gestor altera canais; Administrativo visualiza e pode reconectar/testar envio somente se autorizado.
- Templates de WhatsApp/e-mail sao configuraveis no sistema para agendamento, follow-up, aniversario, documento pronto, entrega tecnica, solicitacao de documento, despachante, prestador e pos-venda.
- Canal padrao por tipo de comunicacao pode ser configurado conforme interesse da loja: WhatsApp, e-mail, ambos ou notificacao interna.
- Toda alteracao, teste, reconexao, erro e troca de template gera log.
- S10-US03 revisada: imposto sobre lucro padrao de 15%, configuravel pelo Dono/Gestor.
- Regime tributario cadastrado na loja deve poder impactar calculos financeiros quando aplicavel e ser ajustavel conforme orientacao da loja/contador.
- Comissoes globais configuraveis por tipo de venda: proprio, consignado, repasse quando houver participacao comercial e receitas adicionais quando a loja decidir.
- Base de comissao pode ser percentual sobre faturamento, percentual sobre lucro ou valor fixo.
- Dono/Gestor pode ajustar comissao no fechamento da venda/card com justificativa e log.
- Vendedor ve apenas suas proprias comissoes; Dono/Gestor ve tudo; Administrativo apura/lanca conforme permissao.
- Categorias financeiras padrao incluem receitas, custos, despesas, impostos, comissoes, taxas, servicos, despachante, vistorias, repasse, retorno de financeira e outros.
- S10-US02 revisada: configuracoes gerais incluem nome fantasia, razao social, CNPJ, CNAEs cadastrados, inscricao estadual quando houver, inscricao municipal quando houver, endereco, telefone, e-mail, WhatsApp oficial, site, logo, dados do contador e regime tributario.
- MVP tera uma loja/unidade principal, preparado para multiplas unidades no futuro.
- Configurar horarios de funcionamento, dias uteis, feriados e horarios disponiveis para agendamentos, visitas/test drive e entrega tecnica.
- Configurar prazos padrao para lead sem continuidade, follow-up vencido, kanban SDR, kanban vendas, documentacao pendente, entrega tecnica, OS/oficina, retorno de despachante, pos-venda e aniversario/relacionamento.
- Dados da loja devem preencher automaticamente contrato de compra e venda, termo de garantia, entrega tecnica, documentos enviados ao despachante, e-mails/mensagens institucionais, anuncios/site quando aplicavel.
- Dono/Gestor altera configuracoes gerais; Administrativo visualiza e edita campos operacionais somente se autorizado; Vendedor/SDR/Avaliador/Servicos nao alteram configuracoes da loja.
- S10-US01 revisada: perfis do MVP incluem Dono/Gestor, Administrador, Administrativo, Vendedor, SDR, Avaliador e Responsavel por Servicos/Estetica.
- Responsavel por Servicos/Estetica cuida de lancamentos e agendamentos de servicos como polimento, PPF, insulfilm, vitrificacao e similares.
- Dono/Gestor fica acima do Administrativo e visualiza metricas financeiras, resultados da loja, DRE, margem, custos, dashboards, logs e configuracoes.
- Administrativo pode visualizar custo do veiculo e conciliacoes bancarias conforme permissao, mas nao necessariamente todos os resultados estrategicos da loja.
- Dono/Gestor pode criar, editar, inativar usuarios e alterar permissoes.
- Vendedor cria clientes/leads, mas visualiza apenas propria carteira/clientes/vendas permitidas; SDR visualiza somente proprios leads/agendamentos.
- Avaliador acessa apenas avaliacao de veiculos, sem financeiro, clientes e vendas fora do necessario.
- Usuario inativo perde acesso imediatamente e Dono/Gestor pode transferir carteira/responsabilidades.
## Proximo Passo
Revisar a S10-US07 e confirmar seguranca, auditoria e administracao tecnica.


