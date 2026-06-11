# Matriz de Controle de Acesso

Este documento consolida as regras explicitas de acesso do MVP. A fonte executavel inicial fica em `packages/db/prisma/seed.mjs`, nas tabelas `roles`, `permissions`, `role_permissions`, `user_permissions` e `permission_scopes`.

## Modelo

Cada permissao e definida por:

- `module`: area funcional.
- `action`: acao permitida.
- `scope`: alcance do dado ou processo.
- `sensitiveArea`: classificacao sensivel.

O backend valida permissao em todas as rotas protegidas via `requirePermission`. O frontend pode ocultar opcoes por perfil, mas nunca e fonte de autorizacao.

## Escopos

| Escopo | Uso |
| --- | --- |
| `ALL` | Acesso global da loja, usado em areas sensiveis como financeiro, auditoria, usuarios e aprovacoes. |
| `STORE` | Acesso operacional da loja, ainda sujeito a filtros de ownership quando aplicavel. |
| `OWN_PORTFOLIO` | Acesso ao proprio portfolio/carteira. |
| `OWN_LEAD` | Acesso a lead proprio. |
| `OWN_SALE` | Acesso a venda propria. |
| `LINKED_VEHICLE` | Acesso quando houver vinculo operacional com veiculo/processo. |
| `NONE` | Sem escopo operacional. |

## Areas Sensiveis

| Area | Exemplos |
| --- | --- |
| `general` | Operacao comum, agenda, leads, estoque permitido. |
| `financial` | Contas, DRE, comissoes globais, pagamentos. |
| `margin` | Custos e margens. |
| `documents` | Anexos, contratos e documentos. |
| `credentials` | Fornecedores e referencias de credenciais. |
| `technical` | Automacoes, jobs, configuracoes tecnicas. |
| `audit` | Logs de auditoria e eventos sensiveis. |
| `security` | Usuarios, perfis, permissoes e sessoes. |
| `sensitive_approval` | Aprovacoes sensiveis de compra/venda. |

## Permissoes por Perfil

| Perfil | Regra |
| --- | --- |
| `OWNER_MANAGER` | Recebe todas as permissoes seedadas. |
| `ADMIN` | Acesso operacional amplo, incluindo custos/margens, aprovacoes, financeiro leitura, comissoes, automacao, settings e usuarios. |
| `ADMINISTRATIVE` | Operacao administrativa ampla, financeiro gerenciavel e fornecedores; sem usuarios, settings tecnicos, auditoria, automacao e custos/margens globais. |
| `SELLER` | Clientes/leads/agendas/vendas/estoque permitido/documentos permitidos e comissoes proprias; sem financeiro global, margens globais, usuarios, settings, auditoria e automacoes. |
| `SDR` | Clientes, leads, comunicacao e agenda para prospeccao/qualificacao; sem vendas, financeiro, documentos sensiveis, estoque gerencial e margens. |
| `APPRAISER` | Clientes, estoque permitido, compras e avaliacoes; sem financeiro global, vendas, documentos sensiveis, usuarios, settings e auditoria. |
| `SERVICE_MANAGER` | Pos-venda, servicos, agenda, comunicacao, documentos permitidos, despachante e comissoes proprias. |

## Matriz por Modulo

| Modulo | Permissoes | Perfis padrao |
| --- | --- | --- |
| `dashboard` | `read:STORE:general` | Todos os perfis seedados. |
| `ai` | `use:STORE:general` | Dono/Gestor, Admin, Administrativo, Vendedor, SDR, Servicos. |
| `customers` | `read/create/update/update_status:STORE:general` | Dono/Gestor e Admin completos; Administrativo quase completo; Vendedor cria/le e atualiza status; SDR le e atualiza status; Avaliador e Servicos leem. |
| `leads` | `read/create/update:STORE:general` | Dono/Gestor, Admin, Vendedor e SDR completos; Administrativo le. |
| `communications` | `manage:STORE:general` | Dono/Gestor, Admin, Administrativo, Vendedor, SDR e Servicos. |
| `appointments` | `manage:STORE:general` | Dono/Gestor, Admin, Administrativo, Vendedor, SDR e Servicos. |
| `inventory` | `read/manage:STORE:general`, `read_costs:ALL:margin` | Dono/Gestor e Admin gerenciam e veem custos; Administrativo le/gerencia sem custos; Vendedor, SDR, Avaliador e Servicos conforme perfil permitido. |
| `purchases` | `read/manage:STORE:general`, `approve:ALL:sensitive_approval` | Dono/Gestor e Admin completos; Administrativo e Avaliador leem/gerenciam; demais sem acesso padrao. |
| `sales` | `read/create/update:STORE:general`, `approve:ALL:sensitive_approval` | Dono/Gestor completo; Admin sem aprovacao sensivel no seed atual; Administrativo e Vendedor criam/leem/atualizam; demais sem acesso padrao. |
| `documents` | `manage:STORE:documents` | Dono/Gestor, Admin, Administrativo, Vendedor e Servicos. Acesso ainda depende do recurso vinculado e ownership. |
| `dispatch` | `manage:STORE:general` | Dono/Gestor, Admin, Administrativo e Servicos. |
| `finance` | `read/manage:ALL:financial` | Dono/Gestor completo; Admin leitura; Administrativo gerencia. |
| `commissions` | `read_all/manage:ALL:financial`, `read_own:OWN_PORTFOLIO:general` | Dono/Gestor e Admin globais; Vendedor e Servicos apenas proprias. |
| `ads` | `manage:STORE:general` | Dono/Gestor, Admin e Administrativo. |
| `repasse` | `manage:STORE:general` | Dono/Gestor, Admin e Administrativo. |
| `services` | `manage:STORE:general` | Dono/Gestor, Admin, Administrativo e Servicos. |
| `suppliers` | `manage:ALL:credentials` | Dono/Gestor, Admin e Administrativo. |
| `automation` | `manage:ALL:technical` | Dono/Gestor e Admin. |
| `audit` | `read:ALL:audit` | Dono/Gestor. |
| `settings` | `manage:ALL:technical` | Dono/Gestor e Admin. |
| `users` | `manage:ALL:security` | Dono/Gestor e Admin. |

## Regras Complementares

- `user_permissions` pode sobrescrever permissao de perfil com `ALLOW` ou `DENY`; `DENY` prevalece sobre permissao do perfil.
- `permission_scopes` permite restringir ou vincular acesso por modulo, entidade e escopo.
- Recursos fora do ownership/escopo retornam `404`, nao `403`, para reduzir IDOR e enumeracao.
- Alteracao sensivel de usuario revoga sessoes ativas do usuario afetado.
- Toda alteracao de usuario, permissao, regra sensivel ou acesso negado relevante deve gerar audit log.
- A matriz deve ser revista antes de producao real e usada como roteiro de pentest/RBAC.
