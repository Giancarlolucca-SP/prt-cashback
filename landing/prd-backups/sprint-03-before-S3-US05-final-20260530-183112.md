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
- Vendedor pode anexar documentos do comprador diretamente no card da venda; ao confirmar compra/venda na ultima etapa do Kanban Vendas, Administrativo recebe anexos e condicoes negociadas: entrada, forma de pagamento, servicos/contratos, valor a ser financiado, financeira usada, garantia/transferencia quando houver e observacoes.
- Status por item: pendente, solicitado, recebido, conferido, anexado, recusado, dispensado por regra.
- Data/hora, responsavel, observacao e anexo/evidencia por item.
- Pendencias obrigatorias bloqueiam ou sinalizam bloqueio para contrato, documentacao, transferencia e entrega.
### S3-US02: Conferencia de Pagamento e Liberacao
Controlar se a venda pode seguir para documentacao/entrega com base na conferencia de entradas e saidas da conta corrente.

Arquivo detalhado: `stories/S3-US02-conferencia-pagamento-liberacao.md`.

Escopo inicial:
- Administrativo checa entradas e saidas da conta corrente relacionadas a venda.
- Registrar forma de pagamento, valor previsto, valor recebido/pago, saldo pendente, data e conta/banco.
- Anexar comprovante enviado pelo vendedor/comprador e evidencia bancaria/extrato usado na conferencia.
- Confirmar recebimento em conta da loja antes de liberar documentacao, transferencia ou entrega.
- Registrar saidas vinculadas a venda quando houver: pagamento ao proprietario, quitacao/gravame, despachante/documentacao ou outros custos autorizados.
- Alertar quando comprador financiar por financeira propria: valor deve cair na conta da loja, nao na conta do cliente/proprietario.
- Bloquear liberacao de documento/entrega quando pagamento obrigatorio estiver pendente, parcial ou divergente.
- Gestor/Administrador pode aprovar excecao apenas com justificativa, evidencia e auditoria.
### S3-US03: Contratos, Assinatura Gov.br e ATPV-e Assistida
Gerar, revisar e acompanhar contratos, assinatura Gov.br e fluxo assistido de ATPV-e/recibo oficial.

Arquivo detalhado: `stories/S3-US03-contratos-assinatura-gov-atpve.md`.

Escopo inicial:
- Com cliente ja cadastrado e documentos/anexos do processo disponiveis, sistema gera pacote de contratos/documentos da venda.
- Emitir contrato de compra e venda, recibo quando aplicavel, documentos para comprador/vendedor e demais contratos definidos no PRD.
- Termo/contrato de garantia entra no pacote quando houver data de entrega ou quando a S3-US06 estiver apta, respeitando o modelo anexado.
- Administrativo revisa dados e observacoes antes de enviar para assinatura.
- Assinatura Gov.br/senha Gov.br tratada como fluxo principal gratuito quando aplicavel, com status, evidencias e documento assinado anexado.
- Antes da assinatura da ATPV-e/recibo oficial, Administrativo segue fluxo guiado: CDT/Venda Digital quando elegivel ou e-Notariado/e-Not Assina quando aplicavel.
- CDT/Venda Digital: comprador e vendedor precisam Gov.br Prata/Ouro e veiculo/documento elegivel para ATPV-e; vendedor inicia venda digital na CDT, comprador assina, e o sistema registra status/evidencia.
- e-Notariado: Administrativo controla emissao/obtencao da ATPV-e no Detran/UF, envio ao e-Notariado, assinatura/reconhecimento digital e anexo final.
- Recibo/DUT verde: quando houver recibo fisico/documento verde, loja deve levar ao cartorio para reconhecimento de firma por autenticidade e anexar evidencia ao processo.
- Sistema avisa comprador quando documento estiver pronto para assinatura/envio e registra canal, data/hora, responsavel e status.
- Regras externas variam por Detran/UF e exigem validacao operacional/juridica antes de automacao real.
### S3-US04: Laudos Obrigatorios e Arquivo Digital
Garantir que laudo cautelar e laudo de transferencia estejam presentes para todos os veiculos antes do envio/assinatura do contrato, transferencia e entrega.

Arquivo detalhado: `stories/S3-US04-laudos-obrigatorios-arquivo-digital.md`.

Escopo inicial:
- Laudo de transferencia deve ser realizado pela loja ou prestador/despachante autorizado.
- Administrativo deve anexar o laudo de transferencia no card/processo da venda.
- Laudo cautelar deve estar salvo no banco de dados/arquivo digital do carro.
- Caso cliente solicite no momento da compra, usuario autorizado pode extrair/baixar PDF da vistoria cautelar e realizar impressao.
- Alertar pendencia quando faltar qualquer laudo obrigatorio.
- Bloquear envio/assinatura do contrato, transferencia ou entrega se laudos obrigatorios estiverem ausentes ou nao concluidos.
- Permitir vendedor visualizar, baixar/exportar, imprimir ou compartilhar laudos conforme permissao, com auditoria.
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