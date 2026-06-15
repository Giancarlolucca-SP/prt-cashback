# S4-US03: Aniversariantes e Parabens por WhatsApp

## Epic
Pos-venda, Relacionamento, Aniversarios e Recompra

## Objetivo
Identificar aniversariantes da base de clientes sem exigir preenchimento manual no cadastro, registrar mensagens de parabens enviadas por WhatsApp/e-mail ou fluxo assistido e alimentar historico e metricas de relacionamento.

## Historia de Usuario
**Como** Administrativo/Gestor,
**quero** visualizar aniversariantes e acompanhar mensagens de parabens,
**para** manter relacionamento com clientes sem depender de controle manual fora do sistema.

## Decisao de Produto
A data de aniversario nao deve ser obrigatoria no cadastro e nem solicitada diretamente ao usuario no fluxo normal. Quando disponivel, o sistema deve tentar obter a data de nascimento a partir dos documentos do comprador anexados ao processo, com leitura automatica/OCR e validacao humana quando necessario.

Para reduzir risco e respeitar LGPD:

- Nao solicitar aniversario manualmente no cadastro comum.
- Extrair data de nascimento do documento do comprador quando disponivel.
- Exibir operacionalmente apenas dia/mes em dashboards de aniversario.
- Guardar data completa em campo protegido, com permissao restrita.
- Registrar origem da informacao: documento, OCR/agente, usuario que confirmou e data/hora.
- Enviar parabens somente se cliente nao tiver opt-out/bloqueio de comunicacao.
- Permitir correcao ou remocao conforme politica de privacidade/LGPD.

## Leitura por Agente Advanced/OCR
O sistema pode usar um agente advanced para discutir/operar a leitura tecnica, mas a abordagem recomendada para MVP deve ser economica:

- OCR local/open source como primeira tentativa, por exemplo Tesseract + pre-processamento de imagem.
- No app/mobile, quando aplicavel, avaliar OCR no dispositivo, como Google ML Kit Text Recognition.
- Fallback pago apenas em casos de baixa confianca, como Google Cloud Vision ou Azure Document Intelligence.
- Validacao humana pelo Administrativo quando a confianca for baixa ou houver mais de uma data possivel.

O agente/OCR deve tentar diferenciar data de nascimento de data de emissao, validade ou outros campos do documento.

## Dashboard de Aniversariantes
O dashboard deve permitir visualizar:

- Aniversariantes do dia.
- Aniversariantes do mes.
- Proximos 7 dias.
- Clientes sem aniversario conhecido, se o Gestor quiser acompanhar qualidade da base.
- Status de comunicacao: nao enviado, preparado, enviado, respondido, falhou, opt-out.

A tela operacional deve mostrar nome do cliente, dia/mes, telefone/WhatsApp permitido, vendedor relacionado quando houver, ultima compra e status da mensagem.

## Envio de Parabens
- Envio automatico por WhatsApp somente quando houver integracao/provedor aprovado.
- Enquanto nao houver integracao aprovada, o sistema deve preparar mensagem assistida para envio pelo Administrativo ou responsavel.
- Pode haver envio por e-mail se configurado.
- O envio deve respeitar opt-out e preferencias de comunicacao.
- Registrar mensagem, canal, status, data/hora, responsavel/automacao e cliente vinculado.
- Resposta do cliente deve ser registrada automaticamente quando houver integracao ou manualmente quando for fluxo assistido.

## Template de Mensagem
- Template padrao editavel pelo Administrador.
- Pode conter nome do cliente.
- Nesta sprint, foco e mensagem de parabens/relacionamento, sem promocao automatica obrigatoria.
- Alteracoes no template nao devem apagar historico de mensagens ja enviadas; guardar snapshot do texto enviado.

Exemplo de texto:

`Ola, [NOME]. Passando para desejar feliz aniversario! A equipe da loja deseja um excelente dia para voce.`

## Historico do Cliente
Cada mensagem de parabens deve gerar evento no historico do cliente com:

- Data/hora.
- Canal.
- Texto enviado ou snapshot do template.
- Status de envio.
- Responsavel/automacao.
- Resposta do cliente quando houver.
- Origem da data de aniversario.

## Campos Minimos
- `customer_birth_date` campo protegido.
- `customer_birth_day_month` para exibicao operacional.
- `birth_date_source`: documento, OCR, manual_confirmado, importacao, desconhecido.
- `birth_date_confidence`.
- `birth_date_confirmed_by`.
- `birth_date_confirmed_at`.
- `communication_opt_out`.
- `birthday_message_id`.
- `customer_id`.
- `template_id`.
- `message_text_snapshot`.
- `channel`: WhatsApp, e-mail, manual.
- `send_status`.
- `sent_at`.
- `sent_by`.
- `response_text`.
- `response_at`.

## Permissoes
- Administrativo/Gestor visualiza aniversariantes e status das mensagens.
- Administrador configura template, preferencias e regras.
- Vendedor pode visualizar aniversariantes/clientes vinculados a ele se permitido.
- Dados completos de nascimento devem ter acesso restrito; dashboard operacional usa apenas dia/mes.
- SDR nao acessa dados de aniversario por padrao, salvo permissao futura.

## Metricas Alimentadas
- Quantidade de aniversariantes do mes.
- Quantidade de aniversariantes do dia.
- Mensagens preparadas.
- Mensagens enviadas.
- Mensagens respondidas.
- Falhas de envio.
- Opt-outs.
- Clientes com aniversario conhecido vs desconhecido.
- Oportunidades geradas a partir de resposta de aniversario, quando registradas.

## Criterios de Aceite
- Dado que o cadastro do cliente nao possui aniversario informado manualmente, quando houver documento do comprador anexado, entao o sistema pode tentar extrair a data de nascimento automaticamente.
- Dado que a leitura automatica tem baixa confianca, quando o dado for exibido ao Administrativo, entao deve exigir confirmacao humana antes de usar em mensagem.
- Dado que a data foi confirmada, quando abrir dashboard, entao o cliente deve aparecer em aniversariantes do dia/mes/proximos 7 dias conforme a data.
- Dado que o cliente possui opt-out, quando for dia/mes de aniversario, entao o sistema nao deve preparar/enviar mensagem automatica.
- Dado que nao ha provedor WhatsApp aprovado, quando houver aniversariante, entao o sistema deve preparar envio assistido com auditoria.
- Dado que ha provedor aprovado, quando a regra de envio for executada, entao o sistema pode enviar mensagem e registrar status.
- Dado que a mensagem foi enviada, quando consultar historico do cliente, entao deve aparecer canal, texto, status, data/hora e responsavel/automacao.
- Dado que o cliente respondeu, quando houver integracao ou registro manual, entao a resposta deve ficar no historico do cliente.
- Dado que o Administrador altera o template, quando mensagens antigas forem consultadas, entao o texto historico deve permanecer preservado por snapshot.

## Fora de Escopo da S4-US03
- Campanha promocional automatica complexa.
- Segmentacao avancada por perfil de cliente.
- Motor de IA para redacao personalizada.
- Implementacao definitiva de Evolution API.
- Envio em massa sem controle de opt-out.
- Validacao juridica automatica de base legal LGPD.

## Observacoes Tecnicas
- Tratar data de nascimento como dado pessoal protegido.
- Minimizar exibicao: usar dia/mes em telas operacionais.
- Guardar data completa somente quando necessaria e protegida por permissao.
- Registrar origem, confianca e confirmacao humana.
- Preparar estrutura para provedor WhatsApp futuro, possivelmente Evolution API, mas manter envio assistido enquanto nao houver integracao aprovada.
