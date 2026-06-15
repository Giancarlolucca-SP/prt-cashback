# S9-US04: Motor de Alertas e Automacoes

## Epic
IA, Automacoes e Integracoes Operacionais

## Objetivo
Criar motor central para alertas e automacoes por regra, gatilho, destinatario, prioridade, canal e log.

## Historia de Usuario
**Como** Gestor/Administrador,
**quero** configurar alertas e automacoes do sistema,
**para** garantir que leads, vendas, documentos, oficina, pos-venda e tarefas criticas nao fiquem parados.

## Escopo Inicial
- Alertas de lead parado, follow-up vencido, aniversario, atraso de OS, custo estourado, documento pendente, entrega tecnica, despachante e pos-venda.
- Destinatarios por perfil e vinculo.
- Canais: aba notificacoes, WhatsApp e e-mail quando configurados.
- Regras configuraveis.
- Logs e historico imutavel.

## Pontos a Decidir
- Quais alertas entram no MVP.
- Quem recebe cada alerta.
- Quais canais serao usados por tipo de alerta.
- Quais automacoes exigem aprovacao humana.

## Criterios de Aceite Iniciais
- Dado que gatilho ocorre, quando regra estiver ativa, entao alerta deve ser criado para destinatario correto.
- Dado que alerta e gerado, quando consultar historico, entao deve existir log.

## Fora de Escopo
- Execucao automatica de acao financeira/juridica sem aprovacao.
