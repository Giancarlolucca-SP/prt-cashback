# S3-US08: Documento Pronto e Aviso ao Comprador

## Epic
Documentacao, Pagamento, Entrega e Pos-Venda

## Objetivo
Avisar o comprador quando o documento do veiculo estiver pronto em seu nome e, quando houver arquivo recebido do despachante por e-mail ou WhatsApp, enviar automaticamente esse arquivo ao cliente pelo canal configurado.

## Historia de Usuario
**Como** Administrativo,
**quero** que o sistema receba ou registre o documento pronto vindo do despachante e avise o comprador,
**para** reduzir esquecimento, acelerar a entrega do documento e manter auditoria do envio.

## Contexto Operacional
A loja utiliza despachantes para concluir processos de transferencia/documentacao. O despachante pode enviar o documento pronto por e-mail ou WhatsApp. Quando esse retorno chegar, o sistema deve permitir anexar ou capturar o arquivo, vincular ao processo de venda e enviar ao comprador uma mensagem informando que o documento esta pronto em seu nome.

O envio ao comprador deve respeitar o canal configurado no cadastro do cliente ou no processo da venda. O canal principal sera WhatsApp, mas o fluxo tambem deve suportar e-mail quando configurado ou quando WhatsApp nao estiver disponivel.

## Gatilhos
O aviso de documento pronto pode ser gerado quando:

- Administrativo marca o processo como `documento pronto`.
- Despachante envia arquivo/documento por e-mail integrado.
- Despachante envia arquivo/documento por WhatsApp integrado ou assistido.
- Administrativo anexa manualmente o documento recebido do despachante no card.
- Processo de transferencia muda para status concluido/documento emitido.

## Canais de Entrada do Documento

### E-mail
- Sistema deve permitir receber arquivo enviado pelo despachante por e-mail integrado.
- Arquivo deve ser vinculado ao processo correto por identificadores como placa, cliente, numero do processo, venda ou assunto padronizado.
- Quando nao houver identificacao automatica segura, o arquivo deve ficar em fila de conciliacao manual para o Administrativo vincular ao card correto.
- Registrar remetente, data/hora de recebimento, assunto, nome do arquivo e usuario que confirmou o vinculo, quando manual.

### WhatsApp
- Sistema deve permitir receber arquivo enviado pelo despachante via WhatsApp integrado ou assistido.
- Quando houver integracao oficial/fornecedor autorizado, o arquivo pode ser capturado e vinculado ao processo.
- Quando nao houver integracao automatica, o Administrativo pode anexar o arquivo manualmente no card e marcar a origem como WhatsApp.
- Registrar contato/remetente do despachante, data/hora, arquivo e responsavel pela vinculacao.

## Mensagem ao Comprador
Quando o documento estiver pronto, o sistema deve enviar ou preparar mensagem ao comprador com texto padrao, por exemplo:

`Ola, [NOME]. O documento do veiculo [VEICULO/PLACA] ja esta pronto em seu nome. Segue arquivo em anexo. Qualquer duvida, estamos a disposicao.`

A mensagem deve:

- Usar nome do comprador.
- Identificar veiculo e placa quando permitido.
- Informar que o documento esta pronto em nome do comprador.
- Anexar o arquivo do documento, quando disponivel e permitido.
- Registrar canal usado: WhatsApp ou e-mail.
- Permitir reenvio manual pelo Administrativo se houver falha.

## Comportamento Esperado
- O sistema nao deve enviar automaticamente arquivo sem vinculo seguro ao comprador correto.
- Se houver duvida no vinculo, exige confirmacao manual do Administrativo.
- Se o cliente nao tiver WhatsApp valido, usar e-mail se houver cadastro.
- Se nenhum canal estiver valido, gerar tarefa/alerta para contato manual.
- O status do card deve mostrar se o cliente ja foi avisado.
- O vendedor pode visualizar que o comprador foi avisado, quando a venda for sua.
- Administrativo, gestor e dono visualizam todos os avisos.

## Campos Minimos no Processo

### Documento recebido
- `document_ready_id`.
- `sale_process_id`.
- `vehicle_id`.
- `buyer_id`.
- `dispatcher_id`.
- `source_channel`: e-mail, WhatsApp, manual.
- `received_at`.
- `received_from`.
- `file_id`.
- `file_name`.
- `document_type`.
- `linked_by_user_id`.
- `link_confidence`: automatico, manual, revisado.
- `status`: recebido, em conciliacao, vinculado, rejeitado.

### Aviso ao comprador
- `notification_id`.
- `sale_process_id`.
- `buyer_id`.
- `vehicle_id`.
- `channel`: WhatsApp, e-mail, manual.
- `recipient_contact`.
- `message_template_id`.
- `message_text_snapshot`.
- `attachment_file_id`.
- `sent_at`.
- `sent_by`: automacao ou usuario.
- `status`: pendente, enviado, entregue, falhou, reenviado, cancelado.
- `failure_reason`.
- `retry_count`.
- `audit_log_id`.

## Permissoes
- Administrativo pode anexar documento recebido, confirmar vinculo, disparar/re disparar aviso e alterar status.
- Gestor/dono pode visualizar e auditar todos os documentos e avisos.
- Vendedor pode visualizar avisos das suas vendas, sem alterar o arquivo/documento pronto.
- SDR nao altera documento pronto; visualizacao somente se permitido por regra administrativa.

## Regras de Negocio
- Documento pronto so pode ser marcado quando houver arquivo/documento ou confirmacao administrativa registrada.
- Envio automatico para cliente exige comprador, veiculo, canal valido e arquivo vinculado ao processo correto.
- Para arquivo recebido por e-mail/WhatsApp sem identificacao segura, sistema deve solicitar conciliacao manual.
- O arquivo enviado ao comprador deve ser o mesmo arquivo arquivado no dossie da venda ou uma copia controlada dele.
- Reenvios devem preservar historico, sem apagar tentativas anteriores.
- A mensagem e o arquivo enviado devem ficar vinculados ao card e ao dossie da venda.

## Criterios de Aceite
- Dado que o despachante enviou documento por e-mail, quando o sistema identificar o processo com seguranca, entao deve vincular o arquivo ao card da venda.
- Dado que o despachante enviou documento por WhatsApp, quando o Administrativo confirmar o arquivo, entao deve vincular o documento ao card como origem WhatsApp.
- Dado que o documento foi vinculado ao comprador correto, quando o status mudar para documento pronto, entao o sistema deve enviar ou preparar mensagem ao comprador pelo canal configurado.
- Dado que o comprador possui WhatsApp valido, quando o documento estiver pronto, entao o envio preferencial deve ser WhatsApp com arquivo anexado.
- Dado que o WhatsApp falhou ou nao esta configurado, quando houver e-mail do comprador, entao o sistema deve permitir envio por e-mail.
- Dado que nenhum canal valido existe, quando o documento estiver pronto, entao o sistema deve gerar alerta para contato manual.
- Dado que o arquivo nao tem vinculo seguro, quando recebido, entao nao deve ser enviado automaticamente ao comprador.
- Dado que o aviso foi enviado, quando o Administrativo abrir o card, entao deve ver data/hora, canal, status, arquivo e responsavel/automacao.
- Dado que houve reenvio, quando consultar auditoria, entao o sistema deve exibir todas as tentativas.

## Fora de Escopo da S3-US08
- Integracao definitiva com todos os provedores de WhatsApp/e-mail.
- Assinatura digital dentro do sistema.
- Validacao juridica automatica do documento enviado pelo despachante.
- Atendimento conversacional completo com o comprador.

## Observacoes Tecnicas
- Implementar com desenho compatvel com fila/evento: `DocumentReadyReceived`, `DocumentReadyLinked`, `BuyerDocumentReadyNotificationRequested`, `BuyerDocumentReadyNotificationSent`.
- Separar captura do documento, conciliacao/vinculo e envio ao comprador.
- Guardar snapshot da mensagem enviada, pois templates podem mudar no futuro.
- Preparar estrutura para webhooks de WhatsApp/e-mail, mesmo que na primeira versao parte do fluxo seja manual/assistido.
