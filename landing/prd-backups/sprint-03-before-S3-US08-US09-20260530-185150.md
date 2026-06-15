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
### S3-US05: Transferencia, Despachante e Recibo Verde
Controlar envio ou impressao do pacote documental de transferencia para o despachante selecionado pelo Administrativo.

Arquivo detalhado: `stories/S3-US05-transferencia-despachante-recibo-verde.md`.

Escopo inicial:
- Apos contratos, recibos e documentos obrigatorios assinados/separados, Administrativo seleciona qual despachante cadastrado recebera o processo.
- Cadastro do despachante deve indicar preferencia de envio: e-mail, WhatsApp ou manual/fisico.
- Sistema monta pacote documental com comprovante de residencia, ATPV-e assinada quando aplicavel, laudo de transferencia, copia do documento do comprador e demais documentos configuraveis.
- Envio automatico/preparado por e-mail ou WhatsApp conforme preferencia do despachante e integracao disponivel.
- Se for recibo verde/documento fisico, processo e manual: sistema gera impressao automatica de todos os documentos para entrega fisica ao escritorio do despachante.
- Administrativo registra status: enviado, impresso, separado, entregue ao despachante, protocolo recebido, pendente/corrigir ou concluido.
- Vendedor visualiza status da transferencia da propria venda, sem enviar ao despachante.
### S3-US06: Termo de Garantia de 90 Dias
Gerar automaticamente o termo de garantia de 90 dias com os mesmos dados do contrato de compra e venda e controlar assinatura no card.

Arquivo detalhado: `stories/S3-US06-termo-garantia-90-dias.md`.

Escopo inicial:
- Termo de garantia sera preenchido automaticamente com os mesmos dados do contrato de compra e venda.
- Usar exatamente o modelo anexado de garantia, preenchendo apenas campos variaveis permitidos.
- Termo deve ser impresso no mesmo momento/lote da entrega do contrato de compra e venda ao cliente.
- Cliente deve assinar fisicamente o termo de garantia.
- No card do processo/Kanban, Administrativo deve detalhar se houve assinatura do contrato, termo de garantia e demais documentos obrigatorios.
- Administrativo deve confirmar no card quando tudo estiver assinado/conferido.
- Nao precisa anexar arquivo assinado no sistema nesta story; controle principal e status/confirmacao no card.
### S3-US07: Receita Adicional da Venda
Registrar itens adicionais vendidos pelo Vendedor e custos/spreads manuais contabilizados pelo Administrativo, separados da margem principal do veiculo.

Arquivo detalhado: `stories/S3-US07-receita-adicional-venda.md`.

Escopo inicial:
- Vendedor informa no card se houve venda de acessorios/servicos como PPF, insulfilm, vitrificacao, garantia/upgrade, transferencia/documentacao, despachante, vistorias/laudos ou outros servicos configuraveis.
- Administrativo preenche manualmente custos dos servicos vendidos e custos operacionais relacionados.
- Custos manuais incluem honorarios do despachante, taxas Detran, taxas de vistoria, custo loja, custos de terceiros para PPF/insulfilm/vitrificacao e produtos/insumos utilizados.
- Sistema calcula receita adicional, custo adicional e spread/lucro adicional por item.
- Resultado adicional fica separado da margem principal do veiculo e pode ser somado ao lucro total da venda.
- Itens vendidos sem custo preenchido aparecem como custo pendente.
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
