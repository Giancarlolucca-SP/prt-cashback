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

### S9-US03: Anexos e Leitura Assistida de Documentos da Venda
Definir anexos manuais e leitura assistida/OCR dos documentos do processo de venda, preservando arquivos originais e exigindo revisao humana para dados sensiveis.

Arquivo detalhado: `stories/S9-US03-anexos-leitura-assistida-documentos-venda.md`.

Escopo inicial:
- Upload manual de documentos da venda em PDF ou JPEG/JPG.
- OCR/leitura assistida ja previsto no MVP, mas como apoio opcional ao anexo/classificacao.
- Documentos: RG/CNH, comprovante de residencia, comprovante de renda, comprovante de pagamento, contrato, termo de garantia, ATPV-e/recibo, laudo de transferencia e documentos de despachante.
- Data de aniversario pode ser lida automaticamente de RG/CNH, sem pedir no cadastro, usada somente para aniversario/relacionamento e respeitando opt-out.
- Arquivo original, confianca, origem, revisao e logs devem ser preservados.

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
- Perguntas operacionais sobre clientes, leads, estoque, vendas, oficinas, prestadores, documentos, alertas e pos-venda conforme permissao.
- Fonte/filtro nao precisa aparecer em toda resposta comum, mas consultas externas e sensiveis devem registrar fonte em log.
- Bloqueio por RBAC.
- Sem acesso a dados restritos para vendedor/SDR; lucro/DRE/margem ficam nas telas proprias de dashboard/relatorios.
- Logs de perguntas, respostas, usuario, bloqueios e consultas externas quando houver.

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

## Decisoes Ja Confirmadas do Produto
- S9-US06 revisada: sugestoes inteligentes aprovadas para leads/comercial, anuncios/estoque, oficina/prestadores, documentacao/venda e pos-venda.
- Leads/comercial: proximo contato sugerido, lead esfriando, melhor horario/canal quando houver historico, cliente com perfil parecido com veiculo em estoque e cliente recorrente com chance de recompra.
- Anuncios/estoque: veiculo parado, anuncio com baixa performance, sugestao de revisar preco/fotos, impulsionar/publicar em marketplace; sugestoes de preco/margem apenas para Gestor/Admin.
- Oficina/prestadores: prestador com melhor historico, custo fora do padrao, prazo provavel de atraso e OS prioritaria por impacto em venda/anuncio.
- Documentacao/venda e pos-venda: documento pendente, risco de atraso na entrega, checklist incompleto, despachante pendente, cliente bom para recompra/top cliente/aniversario/interacao recente.
- Toda sugestao que virar mensagem, alteracao de card, preco, compra, pagamento, contrato ou acao sensivel exige aceite humano e permissao.- S9-US05 revisada: assistente de IA fica focado em consultas operacionais permitidas; lucro, DRE, margem e dados financeiros consolidados devem aparecer nas telas proprias de dashboard/relatorios, nao como resposta livre principal.
- IA pode consultar clientes, leads, kanbans, vendas, estoque, veiculos, OS/oficina, prestadores, documentos, alertas e pos-venda, sempre respeitando permissao.
- IA so responde o que o usuario ja poderia ver na tela; vendedor/SDR nao recebem dados financeiros, documentos sensiveis ou informacoes fora do seu escopo.
- Nao e obrigatorio exibir fonte/filtro/periodo em toda resposta comum, mas consultas externas/sensiveis devem registrar fonte em log.
- IA pode acionar consultas externas em orgaos/TJ de forma automatica quando o fluxo estiver configurado, autorizado e auditado, sem contornar captcha, validacao humana, bloqueio tecnico ou termos de uso.
- Toda pergunta/resposta deve gerar log com usuario, data/hora, escopo consultado e bloqueio por permissao quando houver.- S9-US04 revisada: motor central de alertas/automacoes aprovado com alertas de lead sem continuidade, follow-up vencido, aniversario, agendamento/visita, documentacao pendente, entrega tecnica, atraso de OS/oficina, custo acima do previsto, documento sem classificacao, despachante pendente e pos-venda pendente.
- Canais aprovados: aba de notificacoes sempre, WhatsApp quando configurado e e-mail quando configurado.
- Destinatarios: SDR recebe proprios leads/agendamentos; vendedor recebe proprios clientes/vendas; administrativo recebe documentacao, entrega, despachante, oficina, documentos e contabilidade; gestor/admin ve tudo.
- Alertas podem ser automaticos; mensagens automaticas somente quando regra estiver configurada e for simples/transacional/permitida; acoes sensiveis exigem aprovacao humana.
- Gestor/Admin pode configurar regras, prazos, canais, destinatarios, prioridade e necessidade de aprovacao.
- Toda regra disparada registra gatilho, destinatario, canal, data/hora, status e se foi automatica ou manual.- S9-US03 revisada: foco inicial e anexar documentos do processo de venda, nao OCR obrigatorio para todos os modulos.
- Todos os documentos sao anexados manualmente no sistema, inicialmente em PDF, JPEG/JPG ou imagem escaneada.
- OCR/leitura assistida entra no MVP como apoio opcional para classificar e sugerir campos, preservando sempre o arquivo original.
- Dados sensiveis extraidos por OCR exigem revisao humana antes de alterar cadastro, contrato, DRE, contabilidade ou documento oficial.
- Excecao aprovada: data de aniversario pode ser extraida automaticamente de RG/CNH/documento equivalente sem aprovacao manual previa, usada somente para aniversario/relacionamento e respeitando preferencia de comunicacao/opt-out.
- Data de aniversario nao deve ser solicitada manualmente nem obrigatoria no cadastro.- S9-US02 revisada: MVP usara um e-mail operacional principal da loja para centralizar envio/recebimento operacional.
- E-mails/anexos recebidos podem virar documento de cliente, venda, veiculo, OS, prestador, despachante, contabilidade ou pendencia manual.
- Administrativo/Gestor pode enviar e-mails operacionais com anexos; vendedor nao envia documentos sensiveis por e-mail; SDR nao envia e-mail operacional.
- E-mail/anexo sem identificacao clara gera pendencia para classificacao manual do Administrativo.
- OCR/leitura automatica pode sugerir dados, mas dados sensiveis ou baixa confianca exigem revisao humana.
- E-mails enviados/recebidos ficam no historico do cliente, veiculo, venda, OS, prestador, despachante ou contabilidade conforme vinculo.- S9-US01 revisada: MVP usara uma instancia principal da Evolution API vinculada ao chip/numero oficial da loja.
- Cliente enxergara comunicacao concentrada no numero da loja; divisao por vendedor, SDR, administrativo, prestador, despachante e modulo sera feita internamente pelo sistema.
- Instancia inicial sugerida: `loja-principal`.
- Mensagens devem ser roteadas por modulo, responsavel, entidade/processo, tag/status e origem.
- Multiplas instancias/numeros ficam para evolucao futura em caso de volume, canal dedicado, segregacao operacional ou contingencia.
- Envio automatico deve respeitar permissao, opt-out, LGPD, logs e regras do motor de automacoes.
## Fora de Escopo Inicial da Sprint 9
- IA executando decisao financeira ou juridica sem aprovacao humana.
- Bot externo conversando livremente sem supervisao e regras.
- Substituir analise administrativa, gestor ou juridica.
- Integracao definitiva com todo fornecedor externo sem validacao tecnica/comercial.
- Contornar termos de uso, captcha, bloqueios ou validacoes humanas de terceiros.

## Proximo Passo
Revisar a S9-US07 e confirmar auditoria, permissoes, logs e governanca das automacoes/IA.

