# Sprint 03: Documentacao, Pagamento, Entrega e Pos-venda Operacional

## Status
Em definicao.

## Objetivo da Sprint
Dar continuidade ao processo de venda apos a confirmacao comercial feita pelo vendedor na Sprint 2.

A Sprint 3 cobre o fluxo administrativo que transforma uma venda fechada em uma entrega segura: conferencia documental do comprador, conferencia de pagamento, contratos, laudos obrigatorios, transferencia/documentacao, garantia, liberacao de entrega, armazenamento do dossie e avisos ao comprador.

## Ponto de Entrada
A Sprint 3 comeca quando:

- O vendedor confirma negocio fechado no Kanban Vendas.
- O card/processo e enviado para Gestao/Documentacao.
- Cliente/comprador, veiculo, vendedor, negociacao e condicoes comerciais basicas ja estao vinculados.

## Ponto de Saida
A Sprint 3 termina quando:

- Documentos do comprador foram conferidos.
- Pagamento foi confirmado ou pendencias foram registradas.
- Contratos/documentos obrigatorios foram gerados, assinados ou anexados.
- Laudo cautelar e laudo de transferencia estao presentes/concluidos.
- Garantia foi emitida conforme data de entrega.
- Entrega tecnica foi liberada ou bloqueada com motivo claro.
- Comprador foi avisado quando documento/veiculo estiver pronto.
- Dossie da venda ficou armazenado no arquivo digital do veiculo.

## Stories Macro Propostas

### S3-US01: Checklist de Documentos do Comprador
Conferir documentos recebidos do comprador antes de emissao de documentos finais, contratos, transferencia e entrega.

Arquivo detalhado: `stories/S3-US01-checklist-documentos-comprador.md`.

Escopo inicial:
- Pessoa fisica: RG ou CNH, CPF quando necessario e comprovante de residencia atualizado nos ultimos 3 meses.
- Pessoa juridica: documentos do representante, CNPJ, contrato social/documento equivalente quando aplicavel e comprovante de endereco conforme regra operacional.
- Quando houver financeira da loja/parceira, destacar comprovantes de renda atualizados solicitados pela financeira: holerite, declaracao de imposto de renda, extrato bancario ou outro documento exigido.
- Quando vendedor confirmar compra/venda na ultima etapa do Kanban Vendas, Administrativo recebe condicoes negociadas: entrada, forma de pagamento, servicos/contratos, valor a ser financiado, financeira usada, garantia/transferencia quando houver e observacoes.
- Status por item: pendente, solicitado, recebido, conferido, anexado, recusado, dispensado por regra.
- Data/hora, responsavel, observacao e anexo/evidencia por item.
- Pendencias obrigatorias bloqueiam ou sinalizam bloqueio para contrato, documentacao, transferencia e entrega.
### S3-US02: Conferencia de Pagamento e Liberacao
Controlar se a venda pode seguir para documentacao/entrega com base no pagamento.

Escopo inicial:
- Registrar forma de pagamento.
- Registrar valor previsto, valor recebido e saldo pendente.
- Anexar comprovante.
- Confirmar recebimento em conta da loja.
- Alertar quando comprador financiar por financeira propria: valor deve cair na conta da loja, nao na conta do cliente/proprietario.
- Bloquear liberacao de documento/entrega quando pagamento nao estiver confirmado.

### S3-US03: Contratos, Assinatura Gov.br e Envio ao Comprador
Gerar, revisar, enviar e acompanhar assinatura de contratos e documentos.

Escopo inicial:
- Contrato de compra e venda.
- Recibo de venda quando aplicavel.
- Campo de observacao obrigatoriamente revisado antes do envio.
- Assinatura Gov.br como fluxo principal gratuito.
- Fluxo manual assistido quando integracao/API nao estiver disponivel.
- Aviso ao comprador quando documento estiver pronto para assinatura/envio.
- Registro de status, responsavel, data/hora, documento original e documento assinado.

### S3-US04: Laudos Obrigatorios e Arquivo Digital
Garantir que laudo cautelar e laudo de transferencia estejam presentes para todos os veiculos antes do envio/assinatura do contrato.

Escopo inicial:
- Anexar PDF do laudo cautelar.
- Anexar PDF do laudo de transferencia.
- Alertar pendencia quando faltar qualquer laudo obrigatorio.
- Bloquear envio/assinatura do contrato se laudos obrigatorios estiverem ausentes ou nao concluidos.
- Permitir vendedor visualizar, baixar/exportar ou compartilhar laudos conforme permissao.
- Retencao do laudo cautelar por 2 anos, com exclusao automatica controlada e log.

### S3-US05: Modalidade de Transferencia e Procuracao/Recibo
Controlar a modalidade documental definida no cadastro/entrada do veiculo.

Escopo inicial:
- Escolher apenas uma modalidade: procuracao ou recibo normal.
- Impedir selecao simultanea das duas opcoes.
- Se procuracao: emitir/coletar procuracao e anexar ao veiculo, comprador, proprietario/vendedor e negociacao.
- A procuracao pode ser aceita com reconhecimento de firma ou assinatura Gov.br; o sistema nao precisa exigir qual modalidade foi usada, apenas anexar evidencia/status.
- Se recibo normal: seguir fluxo documental de recibo/transferencia normal.

### S3-US06: Termo de Garantia de 90 Dias
Emitir automaticamente o contrato/termo de garantia ao informar a data de entrega.

Escopo inicial:
- Usar exatamente o modelo anexado de garantia.
- Permitir preencher somente campos variaveis previstos no modelo.
- Preservar texto juridico, clausulas, coberturas, exclusoes, prazos e condicoes.
- Vincular garantia ao veiculo, comprador, contrato de compra e venda, entrega, arquivo digital e status de assinatura/envio.

### S3-US07: Receita Adicional da Venda
Registrar itens adicionais que compoem o lucro total da venda, sem misturar com a margem principal do veiculo.

Escopo inicial:
- Retorno da financeira/financiamento.
- Comissao de seguro.
- Receita/margem de garantia.
- Spread/receita de transferencia.
- Servicos adicionais, acessorios e outros itens configuraveis.
- Valor previsto, valor realizado, status de recebimento, responsavel e observacoes.
- Exibir soma total do lucro da venda separando margem do veiculo e receitas adicionais.

### S3-US08: Documento/Veiculo Pronto e Aviso ao Comprador
Avisar comprador quando documento, contrato, transferencia ou entrega estiver pronto.

Escopo inicial:
- Gerar aviso para comprador quando documento estiver pronto.
- Canal preferencial: WhatsApp, conforme canal configurado.
- Registrar data/hora, destinatario, responsavel/automacao, status de envio e vinculo com negociacao.
- Manter template editavel de mensagem em sprint futura.

### S3-US09: Dossie da Venda no Arquivo Digital
Organizar todos os documentos do processo em pasta digital do veiculo/venda.

Escopo inicial:
- Contratos.
- Garantias.
- Laudos.
- Comprovantes de pagamento.
- Recibos.
- Documentos de transferencia.
- Documentos assinados.
- Evidencias e anexos.
- Logs/auditoria dos arquivos.

## Ordem Recomendada de Detalhamento
1. S3-US01: Checklist de Documentos do Comprador.
2. S3-US02: Conferencia de Pagamento e Liberacao.
3. S3-US03: Contratos, Assinatura Gov.br e Envio ao Comprador.
4. S3-US04: Laudos Obrigatorios e Arquivo Digital.
5. S3-US05: Modalidade de Transferencia e Procuracao/Recibo.
6. S3-US06: Termo de Garantia de 90 Dias.
7. S3-US07: Receita Adicional da Venda.
8. S3-US08: Documento/Veiculo Pronto e Aviso ao Comprador.
9. S3-US09: Dossie da Venda no Arquivo Digital.

## Decisoes Ja Confirmadas do Produto
- Assinatura Gov.br sera usada como solucao principal gratuita.
- Documento pronto deve avisar o comprador e enviar/gerar mensagem de alerta.
- Laudo cautelar e laudo de transferencia devem estar presentes em todos os veiculos.
- Na compra/entrada do veiculo deve ser escolhida somente uma modalidade: procuracao ou recibo normal.
- Procuracao pode ter reconhecimento de firma ou assinatura Gov.br, sem necessidade de registrar qual modalidade no sistema.
- Contrato/termo de garantia deve seguir exatamente o modelo anexado.
- Transferencia pode gerar spread/receita adicional, separada da margem principal do veiculo.
- Se comprador financiar por financeira propria, valor deve cair na conta da loja; caso contrario, nao liberar documento/entrega.

## Fora de Escopo Inicial da Sprint 3
- Conciliacao bancaria completa automatica.
- Integracao fiscal completa SAT/NF.
- BI financeiro completo de margem/DRE.
- Automacao real de WhatsApp em producao sem provedor definido.
- Assinatura digital integrada via API Gov.br se ainda nao houver integracao aprovada; usar fluxo manual assistido.

## Proxima Decisao
Detalhar a S3-US01: quais documentos do comprador serao obrigatorios em todos os casos e quais serao condicionais por tipo de venda, financiamento ou pessoa fisica/juridica.