# S10-US01: Usuarios, Perfis e Permissoes

## Epic
Configuracoes, Permissoes, Perfis e Administracao do Sistema

## Objetivo
Definir usuarios, perfis, permissoes por modulo, escopo de acesso e regras de visibilidade para garantir que cada usuario acesse apenas o que faz sentido para sua funcao.

## Historia de Usuario
**Como** Dono/Gestor ou Administrador,
**quero** cadastrar usuarios e configurar perfis/permissoes,
**para** controlar acesso a clientes, leads, vendas, documentos, financeiro, estoque, oficina, anuncios, IA e logs com seguranca.

## Perfis Iniciais Propostos
- Dono/Gestor.
- Administrador.
- Administrativo.
- Vendedor.
- SDR.
- Avaliador.
- Tecnico/Operacional quando necessario.

## Dimensoes de Permissao
As permissoes devem considerar:

- Modulo.
- Acao: visualizar, criar, editar, excluir/inativar, aprovar, exportar, configurar.
- Escopo: todos, propria carteira, propria venda, proprio lead, veiculo vinculado, unidade/loja ou nenhum.
- Dados sensiveis: financeiro, DRE, margem, NF financeira, documentos pessoais, consultas externas, logs e prestadores financeiros.

## Modulos que Precisam de Permissao
- Clientes.
- Leads/kanban SDR.
- Kanban vendas.
- Documentacao/venda.
- Entrega tecnica.
- Estoque/veiculos.
- Anuncios/marketplaces.
- Avaliacao/compra de veiculos.
- Repasse.
- Financeiro/DRE/margem/comissoes.
- Prestadores/oficina/OS.
- NFs/recibos/contabilidade.
- Pasta de arquivos do veiculo.
- Pos-venda/relacionamento.
- IA/automacoes.
- Logs/auditoria.
- Configuracoes administrativas.

## Pontos a Decidir
- Quais perfis padrao entram no MVP.
- Se Administrador e Dono/Gestor possuem diferenca pratica de permissao.
- Quem pode criar/editar/inativar usuarios.
- Quem pode alterar permissoes.
- Se vendedor pode criar clientes/leads mas editar apenas campos limitados.
- Se vendedor visualiza somente propria carteira/clientes/vendas.
- Se SDR visualiza somente proprios leads/agendamentos.
- Se Avaliador tera acesso separado apenas para avaliacao de veiculos.
- Como tratar usuario desligado/inativo e transferencia de carteira.
- Quais dados devem ser sempre bloqueados para vendedor/SDR.

## Criterios de Aceite Iniciais
- Dado que Administrador cria usuario, quando salvar, entao usuario deve receber perfil e permissoes iniciais.
- Dado que usuario tenta acessar modulo sem permissao, quando solicitar, entao sistema deve bloquear.
- Dado que vendedor acessa clientes, quando consultar, entao deve ver apenas propria carteira/clientes permitidos.
- Dado que SDR acessa leads, quando consultar, entao deve ver apenas proprios leads/agendamentos permitidos.
- Dado que perfil sem permissao tenta acessar financeiro/DRE/margem/NF financeira, quando solicitar, entao sistema deve bloquear.
- Dado que permissao e alterada, quando salvar, entao deve gerar log de auditoria.

## Fora de Escopo
- SSO corporativo avancado.
- Permissoes extremamente granulares por campo antes de validar necessidade real.
- Portal externo para cliente/prestador.

## Observacoes Tecnicas
- Permissoes devem ser aplicadas no backend.
- Preferir RBAC com escopos por entidade.
- Manter logs de criacao, alteracao, inativacao e troca de permissao.
- Usuario inativo nao deve conseguir acessar o sistema.
