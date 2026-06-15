# S9-US05: Assistente de IA para Consultas Internas

## Epic
IA, Automacoes e Integracoes Operacionais

## Objetivo
Definir assistente interno de IA para consultar dados do sistema, responder perguntas operacionais e apoiar analises conforme permissao do usuario.

## Historia de Usuario
**Como** usuario interno autorizado,
**quero** perguntar ao sistema sobre processos, clientes, veiculos, vendas e operacao,
**para** encontrar informacoes rapidamente sem navegar por varias telas.

## Escopo Inicial
- Consultas sobre clientes, leads, estoque, vendas, DRE, oficina, prestadores, documentos e anuncios conforme permissao.
- Respostas com fonte dos dados consultados.
- Bloqueio por RBAC.
- Logs de perguntas, respostas, usuario e data/hora.

## Pontos a Decidir
- Quais modulos podem ser consultados no MVP.
- Quais perfis podem consultar dados financeiros.
- Como exibir fontes e limites da resposta.
- Como tratar perguntas fora de permissao.

## Criterios de Aceite Iniciais
- Dado que usuario pergunta sobre dado permitido, quando IA responder, entao deve trazer resposta e fonte.
- Dado que usuario pergunta sobre dado restrito, quando nao tiver permissao, entao deve bloquear ou omitir informacao.

## Fora de Escopo
- IA executando acoes sensiveis automaticamente.
