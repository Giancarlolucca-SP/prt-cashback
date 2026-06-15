# S3-US01: Checklist de Documentos do Comprador

## Status
Aprovada para detalhamento inicial da Sprint 3.

## Objetivo
Garantir que, apos o vendedor confirmar a compra/venda fechada, o Administrativo receba todas as informacoes e documentos necessarios para conferir comprador, condicoes negociadas, financiamento quando houver e liberar corretamente os proximos passos de contrato, pagamento, documentacao e entrega.

## Historia de Usuario
**Como** Administrativo,  
**quero** receber do vendedor o processo de venda com documentos do comprador e condicoes negociadas completas,  
**para** conferir a documentacao, apoiar a financeira quando aplicavel e evitar liberacao de contrato, documentos ou entrega com pendencias.

## Contexto Operacional
Na ultima etapa do Kanban Vendas, quando o vendedor confirmar a compra/venda, ele deve passar para o Administrativo todas as informacoes da negociacao. Essa passagem alimenta o Kanban de Gestao/Documentacao e cria o checklist de documentos do comprador.

O Administrativo nao deve precisar perguntar novamente dados essenciais que ja foram negociados pelo vendedor: entradas, servicos contratados, valor a financiar, condicoes, forma de pagamento e observacoes importantes devem chegar junto com o processo.

## Documentos Obrigatorios do Comprador

### Pessoa Fisica
- RG ou CNH.
- CPF quando nao constar claramente no documento apresentado.
- Comprovante de residencia atualizado, emitido nos ultimos 3 meses.

### Pessoa Juridica
- Documento do representante/responsavel: RG ou CNH.
- CPF do representante quando nao constar claramente no documento apresentado.
- Cartao CNPJ ou documento cadastral equivalente.
- Contrato social/alteracao contratual ou documento equivalente que comprove poderes do representante, quando aplicavel.
- Comprovante de endereco da empresa ou do representante, conforme regra operacional.

## Documentos Condicionais

### Quando houver financiamento pela financeira da loja
Se o veiculo entrar em processo de uso da financeira da loja/parceira, o sistema deve exigir ou destacar documentos de renda atualizados, conforme solicitacao da financeira:

- Holerite atualizado.
- Declaracao de imposto de renda.
- Extrato bancario atualizado.
- Outros comprovantes solicitados pela financeira, quando necessario.

O sistema deve permitir marcar quais comprovantes foram solicitados, recebidos, conferidos e anexados.

### Quando houver financiamento por financeira propria do comprador
- Registrar que a financeira e propria do comprador.
- Exibir alerta operacional de que o valor financiado deve cair na conta da loja, nao na conta do cliente/proprietario.
- Exigir comprovante ou confirmacao de recebimento conforme S3-US02.

### Quando houver seguro, servico, garantia ou transferencia cobrada
- Registrar comprovantes/documentos relacionados quando existirem.
- Vincular itens adicionais a negociacao para composicao posterior de receita/lucro na S3-US07.

## Informacoes que o Vendedor Deve Passar ao Confirmar Compra
Quando o vendedor confirmar a compra/venda fechada no fim do seu fluxo, o sistema deve enviar ao Administrativo, no minimo:

- Cliente/comprador vinculado.
- Veiculo vendido ou veiculo sob encomenda/interesse, quando aplicavel.
- Vendedor responsavel.
- Data/hora da confirmacao.
- Valor total negociado.
- Valor de entrada.
- Forma de pagamento da entrada.
- Valor a ser financiado, quando houver.
- Financeira utilizada: loja/parceira ou financeira propria do comprador.
- Servicos contratados pelo cliente.
- Contratos/documentos previstos.
- Garantia contratada ou upgrade de garantia, quando houver.
- Transferencia/documentacao vendida ou inclusa, quando houver.
- Observacoes comerciais relevantes.
- Comprovantes ou anexos ja recebidos pelo vendedor.

## Checklist por Item
Cada item do checklist deve permitir:

- Status: pendente, solicitado, recebido, conferido, anexado, recusado, dispensado por regra.
- Data/hora da ultima atualizacao.
- Responsavel pela atualizacao.
- Observacao livre.
- Anexo/evidencia.
- Motivo de recusa ou dispensa quando aplicavel.

## Regras de Negocio
- O processo de Gestao/Documentacao deve ser criado com as informacoes recebidas do vendedor quando a compra/venda for confirmada.
- O Administrativo deve conseguir visualizar rapidamente documentos obrigatorios, condicionais e pendentes.
- Comprovante de residencia deve ser considerado atualizado somente se emitido nos ultimos 3 meses.
- Se houver financeira da loja/parceira, os comprovantes de renda devem ser destacados como necessarios para continuidade da analise/contrato de financiamento.
- Se documentos obrigatorios estiverem pendentes, o sistema deve bloquear ou sinalizar bloqueio para emissao/envio de documentos finais, transferencia e entrega.
- Pendencias documentais devem gerar notificacao para responsaveis conforme regras da Sprint 2/S2-US07.
- Alteracoes em documentos, status ou anexos devem manter historico/auditoria.

## Permissoes
- Vendedor pode anexar documentos recebidos durante a negociacao e confirmar as condicoes comerciais ao passar o processo.
- Vendedor pode visualizar pendencias documentais da sua venda.
- Administrativo pode conferir, aprovar, recusar, solicitar ajustes e anexar documentos.
- Gestor/Administrador pode visualizar e corrigir todos os processos, com auditoria.
- SDR nao altera checklist documental da venda, salvo permissao especifica futura.

## Dados Minimos
- `sale_process_id`.
- `buyer_id`.
- `vehicle_id` ou `vehicle_interest_id`.
- `seller_id`.
- `admin_responsible_id`.
- `buyer_type`.
- `document_checklist_id`.
- `document_type`.
- `document_status`.
- `document_file_id`.
- `document_issue_date` quando aplicavel.
- `document_valid_until` quando aplicavel.
- `address_proof_date`.
- `income_proof_type`.
- `financing_type`.
- `finance_company_id` quando houver.
- `down_payment_amount`.
- `financed_amount`.
- `services_contracts_amount` ou itens equivalentes.
- `negotiation_notes`.
- `confirmed_by_seller_at`.
- `checked_by_admin_at`.
- `audit_created_at`, `audit_created_by`, `audit_updated_at`, `audit_updated_by`.

## Criterios de Aceite
- Dado que o vendedor confirma a compra/venda, quando o card subir para Gestao/Documentacao, entao o Administrativo recebe cliente, veiculo, condicoes negociadas e documentos/anexos ja informados.
- Dado que o comprador e pessoa fisica, quando o checklist for criado, entao RG ou CNH e comprovante de residencia de ate 3 meses aparecem como obrigatorios.
- Dado que o comprovante de residencia tem data superior a 3 meses, quando o Administrativo conferir, entao o sistema deve sinalizar documento desatualizado.
- Dado que a venda usa financeira da loja/parceira, quando o checklist for criado, entao holerite, declaracao de imposto de renda ou extrato bancario aparecem como comprovantes de renda possiveis/solicitaveis.
- Dado que a venda possui valor de entrada, servicos contratados, contratos e valor a financiar, quando o vendedor confirmar a compra, entao essas informacoes ficam visiveis para o Administrativo.
- Dado que documento obrigatorio esta pendente, quando tentar liberar contrato/documentacao/entrega, entao o sistema bloqueia ou alerta pendencia obrigatoria.
- Dado que o Administrativo altera status de um documento, quando salvar, entao o sistema registra data/hora, responsavel, novo status e observacao quando informada.
- Dado que um documento e recusado, quando salvar, entao o sistema exige motivo ou observacao.
- Dado que o vendedor acessa a propria venda, quando houver pendencia documental, entao ele consegue visualizar a pendencia sem editar a aprovacao administrativa.

## Checklist Tecnico para Desenvolvimento
- Criar entidade de checklist documental por venda.
- Criar itens de checklist configuraveis por tipo de comprador e condicao de financiamento.
- Criar validacao de comprovante de residencia ate 3 meses.
- Criar passagem estruturada de dados do Kanban Vendas para Gestao/Documentacao.
- Criar campos de condicoes negociadas: entrada, servicos/contratos, valor financiado e observacoes.
- Criar upload/anexo por item de documento.
- Criar historico/auditoria por item alterado.
- Criar bloqueio/alerta para documentos obrigatorios pendentes.
- Integrar notificacoes de pendencia com a central da S2-US07.
- Testar permissao de Vendedor, Administrativo e Gestor/Administrador.

## Fora de Escopo da S3-US01
- Conferencia bancaria completa do pagamento.
- Envio real para financeira.
- Integracao automatica com financeira.
- Assinatura Gov.br.
- Geracao de contrato final.
- Validacao documental juridica automatizada.