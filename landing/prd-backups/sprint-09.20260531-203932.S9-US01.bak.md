# Sprint 09: IA, Automacoes e Integracoes Operacionais

## Status
Em definicao.

## Objetivo da Sprint
Estruturar as integracoes e automacoes inteligentes do sistema, conectando WhatsApp/Evolution API, e-mail operacional, leitura automatica de documentos, motor de alertas, assistente interno de IA, sugestoes por modulo e auditoria das automacoes.

A Sprint 9 usa os dados estruturados das sprints anteriores para reduzir trabalho manual, acelerar follow-ups, apoiar decisoes operacionais e preparar uma camada de IA segura, auditavel e com permissoes bem definidas.

## Ponto de Entrada
A Sprint 9 usa dados e decisoes anteriores:

- Clientes, leads, kanbans e agendamentos.
- Processo comercial, documentacao e entrega tecnica.
- Pos-venda, aniversarios, recompra e relacionamento.
- DRE, margem, custos, comissoes e dashboard.
- Anuncios, marketplaces e campanhas.
- Avaliacao, compra de veiculos e repasse.
- Prestadores, OS, oficina, NFs/recibos e pasta do veiculo.
- Necessidade de integracao com WhatsApp/Evolution API e e-mail.

## Ponto de Saida
A Sprint 9 termina quando:

- Existe desenho funcional para integracao WhatsApp/Evolution API.
- Existe desenho funcional para integracao de e-mail operacional.
- Leitura automatica/OCR de documentos esta definida por tipo de documento e fluxo de revisao humana.
- Motor de alertas e automacoes esta definido por gatilho, regra, destino, permissao e log.
- Assistente interno de IA esta delimitado por escopo, fontes de dados, permissoes e auditoria.
- Sugestoes inteligentes por modulo estao mapeadas sem permitir acoes automaticas sensiveis sem aprovacao.
- Logs, permissoes e governanca das automacoes estao definidos.

## Stories Macro Propostas

### S9-US01: Integracao WhatsApp / Evolution API
Definir envio, recebimento, templates, instancias, permissao, logs e vinculacao de mensagens por cliente, lead, venda, prestador, despachante e processo.

Arquivo detalhado: `stories/S9-US01-integracao-whatsapp-evolution-api.md`.

Escopo inicial:
- Configurar instancias/canais de WhatsApp.
- Envio por Evolution API quando configurada.
- Registro manual/assistido quando mensagem ocorrer fora do sistema.
- Vincular mensagens a cliente, lead/card, venda, veiculo, OS, prestador, despachante ou processo.
- Separar mensagens comerciais, administrativas, pos-venda, prestadores e despachantes.
- Logs de envio, entrega, erro, responsavel e origem.

### S9-US02: Integracao de E-mail Operacional
Definir recebimento e envio de e-mails ligados a documentos, despachantes, prestadores, contabilidade, clientes e processos internos.

Arquivo detalhado: `stories/S9-US02-integracao-email-operacional.md`.

Escopo inicial:
- Caixa operacional configuravel.
- Envio de e-mails com anexos.
- Recebimento de documentos por e-mail.
- Vinculo com cliente, veiculo, OS, NF/recibo, despachante, contabilidade e processo.
- Status, logs e falhas.

### S9-US03: Leitura Automatica de Documentos e OCR
Definir leitura assistida de documentos, NFs, recibos, RG/CNH, comprovantes, laudos, contratos e anexos relevantes.

Arquivo detalhado: `stories/S9-US03-leitura-automatica-documentos-ocr.md`.

Escopo inicial:
- OCR/IA para extrair campos de documentos.
- Revisao humana obrigatoria quando houver baixa confianca.
- Marcar origem, confianca, campos extraidos e responsavel pela confirmacao.
- Aplicar LGPD e minimizacao de dados.
- Integrar com pastas do veiculo, cliente, venda, OS e contabilidade.

### S9-US04: Motor de Alertas e Automacoes
Criar motor central para alertas e automacoes por regra, gatilho, destinatario, prioridade, canal e log.

Arquivo detalhado: `stories/S9-US04-motor-alertas-automacoes.md`.

Escopo inicial:
- Alertas de lead parado, follow-up vencido, aniversario, atraso de OS, custo estourado, documento pendente, entrega tecnica, despachante e pos-venda.
- Destinatarios por perfil e vinculo.
- Canais: aba notificacoes, WhatsApp, e-mail quando configurados.
- Regras configuraveis por Administrativo/Gestor.
- Logs e historico imutavel.

### S9-US05: Assistente de IA para Consultas Internas
Definir assistente interno para consultar dados do sistema, responder perguntas operacionais e apoiar analises sem executar acoes sensiveis automaticamente.

Arquivo detalhado: `stories/S9-US05-assistente-ia-consultas-internas.md`.

Escopo inicial:
- Perguntas sobre clientes, leads, estoque, vendas, DRE, oficinas, prestadores, documentos e anuncios conforme permissao.
- Respostas com fonte dos dados consultados.
- Bloqueio por RBAC.
- Sem acesso a dados restritos para vendedor/SDR.
- Logs de perguntas, respostas e usuario.

### S9-US06: Sugestoes Inteligentes por Modulo
Mapear sugestoes de IA para leads, vendas, estoque, anuncios, oficina, prestadores, DRE e pos-venda.

Arquivo detalhado: `stories/S9-US06-sugestoes-inteligentes-modulo.md`.

Escopo inicial:
- Sugestoes de proxima acao para lead.
- Sugestoes de follow-up e pos-venda.
- Sugestoes de precificacao/anuncio para Gestor/Admin.
- Sugestoes de prestador com base em prazo/custo/historico.
- Sinalizacao de custo fora do padrao.
- Sugestoes exigem revisao humana antes de acao sensivel.

### S9-US07: Auditoria, Permissoes e Logs de Automacoes
Definir governanca, logs, permissoes, consentimento quando aplicavel e rastreabilidade para integracoes e IA.

Arquivo detalhado: `stories/S9-US07-auditoria-permissoes-logs-automacoes.md`.

Escopo inicial:
- Log de automacoes executadas.
- Log de mensagens enviadas/recebidas.
- Log de leituras OCR/IA.
- Log de sugestoes exibidas e aceitas/ignoradas.
- Permissoes por perfil e modulo.
- Registro de erro, tentativa, origem e responsavel.
- Regras LGPD e minimizacao de dados.

## Fora de Escopo Inicial da Sprint 9
- IA executando decisao financeira ou juridica sem aprovacao humana.
- Bot externo conversando livremente sem supervisao e regras.
- Substituir analise administrativa, gestor ou juridica.
- Integracao definitiva com todo fornecedor externo sem validacao tecnica/comercial.
- Contornar termos de uso, captcha, bloqueios ou validacoes humanas de terceiros.

## Proximo Passo
Revisar a S9-US01 e confirmar como sera estruturada a integracao WhatsApp/Evolution API.
