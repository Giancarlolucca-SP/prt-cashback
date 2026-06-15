# Sprint 10: Configuracoes, Permissoes, Perfis e Administracao do Sistema

## Status
Em definicao.

## Objetivo da Sprint
Definir a central administrativa do sistema, incluindo usuarios, perfis, permissoes, configuracoes da loja, parametros financeiros, canais, categorias, templates, automacoes, seguranca e administracao tecnica.

A Sprint 10 consolida as regras transversais que apareceram nas sprints anteriores e transforma permissoes, parametros e configuracoes em modulos administraveis.

## Ponto de Entrada
A Sprint 10 usa decisoes anteriores:

- Perfis citados nas sprints: Dono/Gestor, Administrador, Administrativo, Vendedor, SDR, Avaliador e possiveis perfis tecnicos.
- Permissoes de clientes, leads, vendas, estoque, financeiro, DRE, documentos, anuncios, oficina, prestadores, IA e logs.
- Necessidade de configuracoes globais de loja, comissoes, impostos, canais, categorias e automacoes.

## Ponto de Saida
A Sprint 10 termina quando:

- Perfis e permissoes ficam definidos por modulo e acao.
- Configuracoes gerais da loja ficam mapeadas.
- Parametros financeiros, impostos e comissoes ficam configuraveis.
- Canais WhatsApp/e-mail ficam configuraveis.
- Categorias, templates e parametros operacionais ficam administraveis.
- Regras de automacao e alertas ficam configuraveis.
- Regras de seguranca, auditoria e administracao tecnica ficam definidas.

## Stories Macro Propostas

### S10-US01: Usuarios, Perfis e Permissoes
Definir usuarios, papeis, permissoes por modulo, escopo de acesso e regras de visibilidade.

Arquivo detalhado: `stories/S10-US01-usuarios-perfis-permissoes.md`.

Escopo inicial:
- Cadastro de usuarios.
- Perfis padrao.
- Permissoes por modulo e acao.
- Escopo por carteira, lead, venda, veiculo e loja.
- Bloqueio de dados financeiros/sensiveis por perfil.
- Logs de alteracao de permissao.

### S10-US02: Configuracoes da Loja
Definir dados cadastrais, unidades, horarios, politicas operacionais e parametros gerais da loja.

### S10-US03: Configuracoes Financeiras, Impostos e Comissoes
Definir aliquotas, regras de comissao, bases de calculo, ajustes e parametros financeiros.

### S10-US04: Configuracao de Canais WhatsApp/E-mail
Definir configuracao de instancia WhatsApp, e-mail operacional, templates e preferencias de canal.

### S10-US05: Categorias, Templates e Parametros Operacionais
Definir categorias editaveis, templates de mensagem/documento e parametros operacionais.

### S10-US06: Configuracao de Regras de Automacao e Alertas
Definir interface administrativa para regras de alertas, automacoes, prazos e destinatarios.

### S10-US07: Seguranca, Auditoria e Administracao Tecnica
Definir seguranca, logs, sessoes, politicas de acesso, retencao e administracao tecnica.

## Proximo Passo
Revisar a S10-US01 e confirmar perfis, permissoes e escopos de acesso.
