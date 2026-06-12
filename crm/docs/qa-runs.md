# Rodadas de QA - CRM Automotivo MVP

Este documento registra validacoes executadas durante a consolidacao BMAP da fundacao do CRM.

## 2026-06-11 - Fundacao tecnica Sprint 11

Contexto:

- Etapa BMAP: consolidacao tecnica da fundacao do CRM novo em `crm/`.
- Foco: validar testes automatizados, typecheck e builds antes de avancar para QA funcional manual.
- Escopo: apenas projeto novo `crm/`; alteracoes pendentes fora de `crm/` pertencem ao produto legado e nao entram nesta rodada.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm test` | Passou: 11 testes, 0 falhas |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |

Observacoes:

- `npm test` ainda imprime logs `prisma:error` em cenarios esperados de constraint unica e idempotencia. Os testes passam, mas o ruido deve ser reduzido em uma melhoria futura para facilitar leitura de QA/CI.
- `npm run smoke:local` nao foi executado nesta rodada porque exige API e Web rodando localmente em paralelo.
- Proxima etapa recomendada: subir ambiente local via Docker/setup e executar o smoke funcional/manual do checklist.

## 2026-06-11 - Smoke funcional local

Contexto:

- Etapa BMAP: QA funcional automatizado da fundacao do CRM novo.
- Foco: validar ambiente local com banco seedado, API, Web e rota funcional principal.
- Escopo: apenas projeto novo `crm/`.

Preparacao executada:

| Acao | Resultado |
| --- | --- |
| `npm run dev:check` | Passou apos liberar a porta `3000`, que estava ocupada pelo servidor legado `src/server.js` |
| Docker Desktop | Nao respondeu durante a janela de espera |
| PostgreSQL local `localhost:5432` | Disponivel conforme `.env` local |
| `npm run db:generate` | Passou |
| `npm run db:deploy` | Passou, sem migrations pendentes |
| `npm run db:seed` | Passou |
| `npm run dev:api` | API disponivel em `http://localhost:3333` |
| `npm run dev:web` | Web disponivel em `http://localhost:3000` |

Smoke executado:

| Comando | Resultado |
| --- | --- |
| `npm run smoke:local` | Passou |

Resultado do smoke:

- `health`: ok.
- Sessao autenticada: `dono@gt3.local`.
- Clientes: 5.
- Leads: 5.
- Estoque: 5.
- Vendas: 5.
- Ordens de servico: 5.
- Prestadores: 5.
- Clientes de pos-venda: 5.
- `financeNet`: 7133500.
- Rotas Web navegadas: 26.

Observacoes:

- API e Web ficaram rodando localmente apos a validacao para permitir QA manual.
- Docker deve ser revisitado antes de validar portabilidade completa. A rodada atual prova o fluxo local usando PostgreSQL local existente.

## 2026-06-11 - QA funcional automatizado por perfil

Contexto:

- Etapa BMAP: reforco do QA funcional com roteiro repetivel.
- Foco: validar todos os perfis seedados, permissoes criticas de RBAC, endpoints sensiveis e rotas Web principais.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:functional:local` | Passou |

Resultado:

- Readiness da API: ok.
- Logins validados: Dono/Gestor, Admin, Administrativo, Vendedor, SDR, Avaliador e Servicos.
- Permissoes RBAC validadas: 16.
- Endpoints RBAC validados: 8.
- Rotas Web principais validadas: 13.

Cobertura automatizada desta rodada:

- Vendedor sem acesso a financeiro global e auditoria.
- SDR sem acesso a vendas.
- Avaliador sem acesso a auditoria global.
- Servicos com acesso a OS e sem acesso a auditoria.
- Dono/Gestor com acesso a financeiro, auditoria e usuarios.
- Administrativo com acesso a financeiro operacional e sem acesso a auditoria.

Observacoes:

- Esta rodada nao substitui a inspecao visual de layout, tema, modais e estados vazios.
- Proxima etapa recomendada: QA visual/manual nas telas principais com os perfis do checklist.

## 2026-06-11 - QA visual automatizado desktop/mobile

Contexto:

- Etapa BMAP: QA visual assistido e repetivel.
- Foco: detectar regressao visual basica, overflow horizontal, erros acionaveis de console e gerar screenshots locais.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:visual:local` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |

Resultado:

- Rotas verificadas: 9.
- Viewports: desktop `1440x900` e mobile `390x844`.
- Screenshots gerados em `.qa-screenshots/` e ignorados pelo Git.
- Sem overflow horizontal detectado nas rotas verificadas.
- Sem erros acionaveis de console apos correcoes.

Correcoes feitas durante a rodada:

- Agregadas fontes de leads com o mesmo nome humanizado no grafico de distribuicao, evitando fatias duplicadas com chave igual.
- Corrigidas chaves React em cards de configuracoes, blueprint generico e kanban consolidado para tolerar nomes repetidos vindos da massa seed/teste.

Observacoes:

- O script ignora ruidos conhecidos do Next/React em modo development, como avisos de `unsafe-eval`.
- A inspecao humana ainda deve revisar detalhes finos de usabilidade, texto e fluxo de modais.

## 2026-06-11 - QA Comercial automatizado

Contexto:

- Etapa BMAP: QA operacional do primeiro fluxo de negocio.
- Foco: validar fluxo Comercial com perfil Vendedor, cobrindo lead, cliente, agenda, venda em rascunho e bloqueio de areas sensiveis.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:commercial:local` | Passou |

Resultado:

- Readiness da API: ok.
- Perfil usado: `vendedor@gt3.local`.
- Criado cliente + lead minimo com origem `QA Comercial`.
- Lead movido de `NEW` para `CONTACTED`.
- Cliente movido para status operacional `SCHEDULED`.
- Agendamento criado e confirmado.
- Venda criada em `DRAFT` e movida para `PROPOSAL`.
- Historico do cliente retornou eventos e venda vinculada.
- Bloqueios sensiveis confirmados: `/finance/summary` e `/audit/logs`.
- Rotas Web comerciais verificadas: `/leads`, `/clientes`, `/agendamentos`, `/vendas`.

Observacoes:

- O roteiro cria massa QA auditavel com prefixo `QA Comercial` e identificador unico por execucao.
- Proxima etapa recomendada: QA operacional Administrativo, validando atalhos, triagem, prestador/fornecedor e venda de repasse.

## 2026-06-11 - QA Administrativo automatizado

Contexto:

- Etapa BMAP: QA operacional do fluxo administrativo.
- Foco: validar criacao rapida administrativa, triagem, venda de repasse, contrato pendente, prestador/fornecedor, OS e bloqueios sensiveis.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:administrative:local` | Passou |

Resultado:

- Readiness da API: ok.
- Perfil usado: `administrativo@gt3.local`.
- Cliente criado.
- Agendamento criado.
- Venda de repasse criada em `DRAFT` e movida para `DOCUMENTATION`.
- Contrato gerado em `GENERATED` e listado como nao assinado.
- Prestador/fornecedor criado com referencia de segredo mascarada.
- Cliente de pos-venda criado.
- OS criada, com item, custo, nota e status `WAITING_INVOICE`.
- Bloqueios sensiveis confirmados: `/audit/logs` e `/users`.
- Rotas Web administrativas verificadas: `/administrativo`, `/fornecedores`, `/servicos`, `/vendas`, `/documentos`.

Observacoes:

- O roteiro cria massa QA auditavel com prefixo `QA Administrativo` e identificador unico por execucao.
- Proxima etapa recomendada: QA operacional Veiculos/Avaliador, validando compras, avaliacoes e estoque sem financeiro global.

## 2026-06-11 - QA Veiculos/Avaliador automatizado

Contexto:

- Etapa BMAP: QA operacional do fluxo de veiculos e avaliacao.
- Foco: validar compras, avaliacoes, checklist de avaliacao, leitura de estoque e bloqueios sensiveis do perfil Avaliador.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:vehicles:local` | Passou |

Resultado:

- Readiness da API: ok.
- Perfil usado: `avaliador@gt3.local`.
- Estoque listado.
- Oportunidade de compra criada em `OPEN`.
- Oportunidade movida para `EVALUATING`.
- Avaliacao criada com decisao `NEGOTIATING`.
- Checklist de avaliacao criado e recuperado nos detalhes.
- Aprovacao sensivel da avaliacao bloqueada para Avaliador.
- Bloqueios sensiveis confirmados: `/finance/summary`, `/audit/logs`, `/users` e `/sales`.
- Rotas Web de veiculos verificadas: `/compras`, `/avaliacoes`, `/estoque`.

Observacoes:

- O roteiro cria massa QA auditavel com origem `QA Veiculos` e identificador unico por execucao.
- Proxima etapa recomendada: QA operacional Servicos/Pos-venda, validando OS, prestadores, pos-venda e bloqueio de resultado financeiro global.

## 2026-06-11 - QA Servicos/Pos-venda automatizado

Contexto:

- Etapa BMAP: QA operacional do fluxo de servicos e pos-venda.
- Foco: validar cliente de pos-venda, prestador, catalogo, OS, itens, custos, notas, conclusao da OS e bloqueios sensiveis.
- Escopo: apenas projeto novo `crm/`, com API e Web ja rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:services:local` | Passou |

Resultado:

- Readiness da API: ok.
- Perfil usado: `servicos@gt3.local`.
- Cliente de pos-venda criado.
- Prestador criado.
- Item de catalogo criado.
- OS criada em `OPEN`, movida para `SCHEDULED` e depois `DONE`.
- Item, custo e nota vinculados a OS.
- Detalhes da OS retornaram item/custo/nota.
- Lista de pos-venda retornou o cliente criado.
- Bloqueios sensiveis confirmados: `/finance/summary`, `/audit/logs` e `/users`.
- Rotas Web de servicos verificadas: `/servicos`, `/fornecedores`, `/pos-venda`, `/agendamentos`.

Observacoes:

- O roteiro cria massa QA auditavel com prefixo `QA Pos-venda` e identificador unico por execucao.
- Proxima etapa recomendada: QA Gestao/Dono, validando resultados, financeiro, auditoria, configuracoes e operacoes sensiveis.

## 2026-06-12 - QA Gestao/Dono automatizado

Contexto:

- Etapa BMAP: QA operacional do fluxo de gestao.
- Foco: validar visao executiva, financeiro, auditoria, configuracoes, usuarios, permissoes explicitas e revogacao de sessao apos alteracao sensivel.
- Escopo: apenas projeto novo `crm/`, com API e Web rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:management:local` | Passou |

Resultado:

- Readiness da API: ok.
- Perfil usado: `dono@gt3.local`.
- Resultados executivos, funil de vendas e performance de estoque consultados.
- Resumo financeiro consultado.
- Lancamento financeiro criado, baixado como `PAID` e reconsultado.
- Configuracoes atualizadas: store setting, aniversarios, categoria, template de documento, template de mensagem e parametro operacional.
- Usuario QA criado, permissao explicita adicionada, escopo operacional adicionado e alteracao sensivel aplicada.
- Sessao do usuario QA revogada apos desativacao/forca de troca de senha.
- Auditoria e lista de usuarios consultadas apos operacoes sensiveis.
- Rotas Web de gestao verificadas: `/resultados`, `/financeiro`, `/auditoria`, `/configuracoes`.

Observacoes:

- O roteiro cria massa QA auditavel com prefixo `QA Gestao` e identificador unico por execucao.
- Proxima etapa recomendada: rodar suite consolidada de regressao local e revisar portabilidade Docker antes de fechar a sprint tecnica.

## 2026-06-12 - Regressao local consolidada

Contexto:

- Etapa BMAP: fechamento de regressao funcional local.
- Foco: executar em um unico comando smoke, RBAC, fluxos operacionais por perfil e QA visual.
- Escopo: apenas projeto novo `crm/`, com API e Web rodando localmente.

Comando executado:

| Comando | Resultado |
| --- | --- |
| `npm run qa:regression:local` | Passou apos correcao de chave React duplicada |

Resultado:

- Smoke local aprovado, incluindo 26 rotas Web.
- QA funcional/RBAC aprovado para Dono, Admin, Administrativo, Vendedor, SDR, Avaliador e Servicos.
- Fluxos Comercial, Administrativo, Veiculos, Servicos/Pos-venda e Gestao/Dono aprovados.
- QA visual desktop/mobile aprovado em 9 rotas.
- Screenshots gerados em `.qa-screenshots/`.

Correcao feita durante a rodada:

- A fila de triagem administrativa usava `title + meta` como `key`; multiplas OS de QA com mesmo tipo e valor geravam aviso React de chave duplicada.
- A chave passou a usar o tipo da entidade e o `id` real de origem (`sale`, `service-order`, `appointment`, `contract`).

Observacoes:

- `qa:regression:local` exige API e Web ja rodando.
- `qa:local` agora combina QA tecnico (`npm run qa`) e regressao operacional (`npm run qa:regression:local`).
- Proxima etapa recomendada: revisar portabilidade Docker/setup e depois fechar a Sprint 11 tecnica.

## 2026-06-12 - Portabilidade setup/Docker

Contexto:

- Etapa BMAP: validacao de setup e portabilidade local.
- Foco: conferir Docker Compose, `.env.example`, setup idempotente e fallback sem Docker.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check bin/setup` | Passou |
| `docker compose config` | Passou |
| `docker compose up -d` | Falhou por erro 500 do Docker Desktop ao consultar/puxar imagem `axllent/mailpit:latest` |
| `docker version` | Cliente respondeu, engine `desktop-linux` retornou erro 500 |
| `SETUP_SKIP_DOCKER=true SETUP_SKIP_DEV_CHECK=true SETUP_SKIP_PRISMA_GENERATE=true node bin/setup` | Passou |
| `npm test` | Passou |
| `npm run typecheck` | Passou |

Resultado:

- `.env.example` usa porta Docker `5433`, alinhada com `docker-compose.yml`.
- Setup agora aguarda PostgreSQL aceitar conexao TCP antes de migrations/seed.
- Setup ganhou `SETUP_SKIP_DEV_CHECK=true` para reexecucao controlada quando API/Web ja estao rodando.
- Setup ganhou `SETUP_SKIP_PRISMA_GENERATE=true` para reexecucao no Windows quando a API ativa bloqueia o arquivo do Prisma Client.
- Fallback com PostgreSQL local `localhost:5432` validado com migrations em sync e seed demo aplicado.

Observacoes:

- A portabilidade Docker do arquivo Compose foi validada por `docker compose config`, mas a subida real depende de corrigir/reiniciar Docker Desktop no host.
- Em uma maquina nova com Docker saudavel, o fluxo esperado continua sendo `npm run setup` sem flags.
- Proxima etapa recomendada: corrigir Docker Desktop/WSL do host e repetir `docker compose up -d` seguido de `npm run setup` em `.env` Docker.

## 2026-06-12 - Endurecimento Comercial: desfecho de leads

Contexto:

- Etapa BMAP: inicio da proxima frente de dominio, focada em Clientes/Leads e funil comercial.
- Foco: preservar qualidade do funil e trilha de auditoria quando um lead sai do fluxo ativo.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |

Resultado:

- `POST /leads/:id/stage` passa a exigir `reason` com pelo menos 8 caracteres para as etapas conclusivas `WON`, `LOST` e `COLD`.
- Teste de contrato cobre tentativa de mover lead para `LOST` sem motivo e confirma erro `400`.
- Teste de contrato confirma sucesso com motivo e persistencia em `LeadStageHistory`.
- Tela de Leads pede motivo ao usuario quando a etapa escolhida e conclusiva.
- `docs/api-map.md` e `docs/openapi-mvp.yaml` foram atualizados com a regra.

Observacoes:

- A regra evita funil com perdas/ganhos sem explicacao operacional.
- Proxima melhoria recomendada: substituir o `prompt` simples da tela por modal proprio de desfecho com motivos padronizados e campo livre auditavel.

## 2026-06-12 - UX Comercial: modal de desfecho de lead

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e funil comercial.
- Foco: substituir confirmacao fragil por `prompt` do navegador por um modal proprio, auditavel e consistente com o design system.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Ao mover lead para `WON`, `LOST` ou `COLD`, a tela abre modal de desfecho.
- O modal exibe o lead, etapa de destino, motivo padrao e observacao complementar.
- Motivos padronizados cobrem ganho, perda e esfriamento.
- Motivo final enviado ao backend combina motivo padrao e observacao livre, mantendo limite de 300 caracteres.
- Em falha de API, o modal permanece aberto e mostra erro para nova tentativa.

Observacoes:

- A regra server-side de motivo obrigatorio continua sendo a garantia principal.
- Proxima melhoria recomendada: persistir motivos padronizados em configuracao comercial para permitir personalizacao por loja.

## 2026-06-12 - Configuracao Comercial: motivos de desfecho de lead

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e funil comercial.
- Foco: permitir que motivos de ganho, perda e esfriamento venham de configuracao por loja, mantendo fallback padrao.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Criado `GET /leads/outcome-reasons`.
- A rota exige permissao de leitura de leads e retorna motivos configurados no dominio `lead_outcome_reason`.
- Categorias configuraveis usam `metadata.stage` com `WON`, `LOST` ou `COLD`.
- Quando nao ha configuracao, a API retorna motivos padrao por etapa.
- A tela de Leads carrega os motivos pela API e usa fallback local se necessario.
- Teste de contrato cobre retorno default e retorno configurado via `/settings/categories`.

Observacoes:

- Vendedor/SDR podem consumir os motivos sem acesso direto ao modulo de Configuracoes.
- Proxima melhoria recomendada: criar UI em Configuracoes para gerenciar esses motivos sem depender de payload tecnico.

## 2026-06-12 - UI Configuracoes: motivos de desfecho de lead

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e Configuracoes.
- Foco: permitir cadastro de motivos de desfecho de lead por gestor, sem JSON tecnico.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:management:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Tela de Configuracoes ganhou acao `Motivo lead`.
- O modal dedicado permite escolher etapa `WON`, `LOST` ou `COLD` e informar o motivo.
- O cadastro grava categoria no dominio `lead_outcome_reason` com `metadata.stage`, consumida por `/leads/outcome-reasons`.
- A lateral administrativa mostra quantos motivos de lead estao configurados ou se o sistema esta usando defaults.

Observacoes:

- A UI evita que o gestor precise conhecer dominio tecnico ou metadata JSON.
- Proxima melhoria recomendada: listar/editar/desativar motivos existentes diretamente na tela, mantendo auditoria.
