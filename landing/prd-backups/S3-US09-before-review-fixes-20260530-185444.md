# S3-US09: Dossie da Venda, Dados e Metricas Gerais

## Epic
Documentacao, Pagamento, Entrega e Pos-Venda

## Objetivo
Gravar todos os dados, documentos, eventos e conclusoes do processo de venda no banco e no dossie digital, para alimentar metricas gerais da loja, auditoria e futuras analises com IA.

## Historia de Usuario
**Como** Gestor/Dono,
**quero** que tudo que acontece no processo de venda fique registrado de forma estruturada,
**para** consultar o historico, medir a operacao da loja e gerar insights futuros.

## Contexto Operacional
O processo de venda gera muitos dados importantes: documentos recebidos, contratos emitidos, pagamentos conferidos, laudos, transferencia, despachante, garantia, entrega tecnica, receitas adicionais, custos, avisos ao comprador e prazos. Esses dados nao devem ficar apenas em arquivos soltos. Devem ser gravados em banco de dados com relacionamento claro entre cliente, veiculo, vendedor, card, venda, arquivos e eventos.

Essa story consolida a regra de que todos os eventos relevantes da Sprint 3 devem alimentar indicadores gerais da loja e, no futuro, permitir leitura por IA para extrair insights operacionais e comerciais.

## Escopo Funcional
- Criar dossie digital da venda vinculado ao veiculo, comprador, vendedor e processo comercial.
- Registrar documentos, arquivos e evidencias do processo.
- Registrar eventos estruturados de cada etapa do card administrativo.
- Registrar datas de entrada, conclusao e pendencias por etapa.
- Registrar responsaveis por cada acao.
- Registrar dados financeiros necessarios para margem, receita adicional e custos.
- Registrar status de envio ao despachante e aviso ao comprador.
- Disponibilizar esses dados para dashboards, relatorios e metricas gerais da loja.

## Dados Que Devem Alimentar Metricas

### Venda e cliente
- Cliente comprador.
- Vendedor responsavel.
- Origem do lead/venda.
- Veiculo vendido.
- Tipo de estoque: proprio, consignado ou outro classificador usado pelo sistema.
- Data da venda/confirmacao.
- Data de passagem para Administrativo.
- Data de entrega tecnica.
- Status final da venda.

### Documentacao
- Documentos obrigatorios recebidos.
- Pendencias documentais.
- Data de conclusao de checklist documental.
- Modalidade de documento/transferencia: ATPV-e/CDT, e-Notariado, recibo verde/manual, ou outra classificacao.
- Contratos emitidos.
- Garantia emitida e assinatura confirmada.
- Laudo cautelar disponivel.
- Laudo de transferencia anexado.

### Financeiro
- Valor de venda.
- Entradas/sinais.
- Valor financiado.
- Retorno de financeira quando houver.
- Receitas adicionais.
- Custos adicionais.
- Spread de transferencia/despachante/vistorias/servicos.
- Status de pagamento conferido/liberado.
- Data de liberacao financeira.

### Transferencia e despachante
- Despachante selecionado.
- Canal de envio ao despachante: e-mail, WhatsApp ou manual/fisico.
- Data de envio ao despachante.
- Data de retorno do documento pronto.
- Status de transferencia.
- Pendencias/correcoes solicitadas.

### Comunicacao
- Aviso de documento pronto ao comprador.
- Canal usado: WhatsApp, e-mail ou manual.
- Status do envio.
- Data/hora do envio.
- Resposta do cliente, quando integrada ou registrada manualmente.

### Operacao
- Tempo total entre venda fechada e entrega tecnica.
- Tempo total entre venda fechada e documento pronto.
- Tempo por etapa do kanban administrativo.
- Quantidade de processos com pendencia.
- Quantidade de processos liberados sem pendencia.
- Gargalos por etapa, responsavel, despachante ou tipo de documento.

## Estrutura Minima do Dossie
O dossie da venda deve organizar:

- Contratos.
- Termo de garantia.
- Documentos do comprador.
- Comprovantes de pagamento.
- ATPV-e, recibo verde ou documentos equivalentes.
- Laudo cautelar.
- Laudo de transferencia.
- Comprovantes de envio ao despachante.
- Documento pronto recebido do despachante.
- Comprovante/log de envio ao comprador.
- Checklist de entrega tecnica.
- Evidencias e observacoes administrativas.

## Regras de Banco de Dados
- Todo arquivo deve ter metadados: tipo, origem, usuario/automacao, data/hora, venda, veiculo e cliente vinculados.
- Todo evento importante deve ser registrado como evento estruturado e nao apenas texto livre.
- Observacoes livres podem existir, mas nao substituem campos estruturados essenciais.
- Alteracoes de status devem gerar historico com antes/depois.
- Exclusoes futuras devem respeitar retencao definida por tipo de documento.
- Dados sensiveis devem respeitar permissoes, LGPD e politica interna de acesso.

## Metricas Iniciais Para Dashboard Geral
- Total de vendas em andamento no Administrativo.
- Vendas por status documental.
- Vendas aguardando pagamento.
- Vendas aguardando assinatura.
- Vendas aguardando laudo de transferencia.
- Vendas aguardando despachante.
- Documentos prontos aguardando aviso ao comprador.
- Tempo medio de conclusao documental.
- Tempo medio ate entrega tecnica.
- Receita adicional total por periodo.
- Custo adicional total por periodo.
- Spread adicional total por periodo.
- Ranking de gargalos por etapa.
- Processos com pendencia vencida.

## Preparacao Para IA e Insights Futuros
Os dados devem ser armazenados de forma que futuras rotinas de IA possam consumir:

- Historico de eventos por venda.
- Linha do tempo do processo.
- Campos estruturados de financeiro, documento e operacao.
- Observacoes normalizadas e com contexto.
- Relacao entre veiculo, cliente, vendedor, despachante e resultado.
- Evidencias e arquivos com metadados.

Exemplos de insights futuros:

- Qual etapa mais atrasa a entrega.
- Qual despachante tem menor tempo medio de retorno.
- Quais tipos de venda geram mais pendencias.
- Qual vendedor tem mais processos completos sem retrabalho.
- Quais servicos adicionais geram mais spread.
- Quais custos adicionais reduzem margem.

## Permissoes
- Administrativo pode anexar, classificar e atualizar documentos do dossie.
- Gestor/dono pode visualizar todos os dossies, dashboards e metricas gerais.
- Vendedor visualiza dossie das suas vendas conforme permissao, principalmente status e documentos liberados.
- SDR nao acessa dados financeiros/documentais sensiveis, salvo permissao especifica.

## Criterios de Aceite
- Dado que uma venda entra no kanban administrativo, quando o processo for criado, entao deve existir dossie vinculado a venda, veiculo, comprador e vendedor.
- Dado que um documento e anexado, quando salvo, entao deve registrar tipo, origem, data/hora, responsavel e vinculos obrigatorios.
- Dado que o status de uma etapa muda, quando a alteracao for confirmada, entao deve gerar evento estruturado com antes/depois.
- Dado que uma receita adicional e cadastrada, quando concluida, entao deve alimentar metricas de receita, custo e spread adicional.
- Dado que documento pronto foi enviado ao comprador, quando concluido, entao deve alimentar metricas de comunicacao e prazos.
- Dado que o gestor abre dashboard geral, quando houver dados da Sprint 3, entao deve visualizar indicadores consolidados da loja.
- Dado que um processo possui pendencia vencida, quando o dashboard for calculado, entao deve aparecer nas metricas de gargalo/pendencia.
- Dado que uma futura rotina de IA consulta dados, quando acessar o banco, entao deve encontrar eventos e campos estruturados suficientes para analise.

## Fora de Escopo da S3-US09
- Modelo de IA em producao.
- Data warehouse completo.
- BI avancado com previsoes estatisticas.
- Exportacao fiscal/contabil definitiva.
- Politica final de retencao de todos os documentos, que deve ser detalhada por tipo documental.

## Observacoes Tecnicas
- Preferir modelo orientado a entidades + eventos: `sale_process`, `sale_document`, `sale_process_event`, `sale_financial_item`, `sale_notification`, `sale_task`.
- Preparar eventos com timestamps confiaveis para calculo de SLA e gargalos.
- Evitar depender apenas de nomes de arquivos/pastas para gerar metrica.
- Garantir indices por venda, veiculo, cliente, vendedor, status, data e tipo de documento.
- Registrar origem dos dados: manual, automacao, e-mail, WhatsApp, integracao bancaria ou importacao.
