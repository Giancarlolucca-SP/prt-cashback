# S9-US01: Integracao WhatsApp / Evolution API

## Epic
IA, Automacoes e Integracoes Operacionais

## Objetivo
Definir a integracao com WhatsApp via Evolution API para envio, recebimento, historico, templates, permissao, logs e vinculacao de mensagens aos processos do sistema.

## Historia de Usuario
**Como** usuario interno autorizado,
**quero** enviar e registrar mensagens de WhatsApp pelo sistema,
**para** centralizar comunicacao com clientes, leads, prestadores, despachantes e processos operacionais.

## Escopo Inicial
- Configuracao de instancia/canal WhatsApp.
- Envio de mensagens via Evolution API quando configurada.
- Registro manual/assistido quando contato ocorrer fora do sistema.
- Vinculo de mensagem com cliente, lead/card, venda, veiculo, OS, prestador, despachante, entrega tecnica ou pos-venda.
- Templates por contexto.
- Logs de envio, entrega, erro, responsavel, data/hora e origem.

## Pontos a Decidir
- Quais perfis podem enviar mensagens por WhatsApp em cada modulo.
- Quais mensagens podem ser automaticas e quais exigem revisao humana.
- Como separar instancia/canal da loja, vendedores, administrativo e prestadores.
- Quais templates iniciais devem existir.
- Quais eventos devem gerar mensagem automatica ou sugestao de envio.

## Criterios de Aceite Iniciais
- Dado que usuario autorizado envia mensagem, quando envio concluir, entao deve registrar historico e vinculo do processo.
- Dado que envio falha, quando consultar logs, entao deve mostrar erro e permitir tratativa.
- Dado que mensagem e registrada manualmente, quando salvar, entao deve manter origem manual/assistida.

## Fora de Escopo
- Bot livre sem regra e sem supervisao.
- Envio sem integracao/autorizacao configurada.
