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

## 2026-06-12 - UI Configuracoes: listagem e desativacao de motivos de lead

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e Configuracoes.
- Foco: permitir ao gestor visualizar motivos cadastrados e desativar motivos ativos sem payload tecnico.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:management:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Configuracoes ganhou painel `Motivos de desfecho de lead`.
- O painel lista motivo, etapa (`WON`, `LOST`, `COLD` humanizados), status e dominio tecnico.
- Motivos ativos podem ser desativados pela propria UI.
- A desativacao usa o endpoint de categorias com `status: INACTIVE`, preservando registro auditavel e evitando exclusao destrutiva.
- Quando nao ha motivo personalizado, a tela informa que os defaults do sistema estao em uso.

Observacoes:

- Edicao de nome ainda deve ser tratada como criar novo motivo e desativar o antigo, para preservar historico operacional.
- Proxima melhoria recomendada: adicionar teste E2E de UI para cadastro/desativacao quando houver harness de navegador autenticado.

## 2026-06-12 - Follow-up Comercial de Leads

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e agenda comercial.
- Foco: garantir que leads ativos tenham proxima acao agendada e auditavel.
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

- Criado `POST /leads/:id/follow-ups`.
- A rota cria `FollowUp`, atualiza `nextActionAt` do lead, gera audit log e emite evento interno `lead.follow_up_scheduled`.
- A tela de Leads ganhou botao `Follow-up` na fila priorizada.
- O modal de follow-up permite escolher tipo, data/hora e observacao.
- Ao salvar, a proxima acao do lead e atualizada na tela.
- Teste de contrato confirma criacao do follow-up e persistencia em banco.

Observacoes:

- A agenda operacional de appointments continua separada; este fluxo cria follow-up comercial leve.
- Proxima melhoria recomendada: consolidar follow-ups pendentes na tela de Agenda ou em uma fila comercial diaria.

## 2026-06-12 - Fila diaria comercial de follow-ups

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rotina diaria do vendedor.
- Foco: listar follow-ups pendentes do periodo para evitar leads parados no funil.
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

- Criado `GET /leads/follow-ups`.
- A rota lista follow-ups pendentes por periodo, com default para o dia atual.
- A listagem respeita escopo de vendedor/SDR por `assignedUserId`.
- Como `FollowUp` nao possui relacao Prisma declarada com `Lead`, a API busca os leads vinculados separadamente e monta a resposta.
- A tela de Leads ganhou painel `Follow-ups comerciais pendentes`.
- O indicador `Follow-ups hoje` foi adicionado aos cards do topo.
- Teste de contrato confirma listagem por periodo e lead vinculado.

Observacoes:

- Follow-up segue separado de appointment; appointment continua sendo agenda operacional formal.
- Proxima melhoria recomendada: permitir concluir follow-up pendente, gravando `completedAt` e audit log.

## 2026-06-12 - Conclusao de follow-ups comerciais

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rotina diaria do vendedor.
- Foco: permitir que a fila diaria tenha fechamento operacional auditavel.
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

- Criado `POST /leads/follow-ups/:id/complete`.
- A rota grava `completedAt`, atualiza observacao opcional, gera audit log e emite evento interno `lead.follow_up_completed`.
- Ownership segue protegido por escopo de loja e responsavel; acesso indevido retorna 404 operacional via guard padrao.
- A fila `GET /leads/follow-ups` continua omitindo concluidos por default e permite auditoria via `include_completed=true`.
- A tela de Leads ganhou acao `Concluir` em cada follow-up pendente.
- Teste de contrato confirma conclusao, retirada da fila pendente e retorno quando `include_completed=true`.

Observacoes:

- O fechamento do follow-up nao altera automaticamente a etapa do lead; mudanca de funil segue no fluxo auditavel de stage.
- Proxima melhoria recomendada: adicionar filtro de periodo na UI para revisar follow-ups vencidos e futuros.

## 2026-06-12 - Filtros de periodo em follow-ups comerciais

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rotina diaria do vendedor.
- Foco: permitir revisao operacional de follow-ups de hoje, vencidos e proximos 7 dias.
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

- A fila `Follow-ups comerciais pendentes` ganhou filtros `Hoje`, `Vencidos` e `Proximos 7 dias`.
- A UI usa os parametros existentes de `GET /leads/follow-ups` (`from` e `to`) sem criar novo contrato backend.
- O titulo e o estado vazio mudam conforme o periodo selecionado.
- O indicador do painel passa a refletir a fila filtrada.

Observacoes:

- Follow-ups concluidos seguem fora da fila padrao; auditoria de concluidos permanece disponivel via API com `include_completed=true`.
- Proxima melhoria recomendada: criar uma visao dedicada de agenda comercial unindo appointments e follow-ups.

## 2026-06-12 - Agenda comercial unificada

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rotina diaria da equipe comercial.
- Foco: aproximar agenda formal (`appointments`) e follow-ups leves de leads sem misturar responsabilidades de banco.
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

- A tela `/agendamentos` passou a buscar `GET /appointments` e `GET /leads/follow-ups` para o mesmo periodo do dia.
- Foi adicionado o card de metrica `Follow-ups` na agenda.
- A tela ganhou a secao `Agenda comercial`, listando follow-ups de leads do dia ao lado da agenda operacional.
- Follow-ups podem ser concluidos tambem pela tela de Agendamentos, usando o endpoint auditavel existente.
- Quando nao ha appointments ou follow-ups, a tela mostra estados vazios explicitos.

Observacoes:

- `Appointment` continua sendo agenda operacional formal; `FollowUp` continua sendo contato comercial leve.
- Proxima melhoria recomendada: permitir converter follow-up em appointment quando o contato virar visita, avaliacao ou entrega.

## 2026-06-12 - Conversao de follow-up em appointment

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e agenda comercial.
- Foco: transformar contato leve em compromisso operacional formal quando o cliente confirma visita.
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

- Criado `POST /leads/follow-ups/:id/appointment`.
- A rota exige permissao de appointments e leads, cria `Appointment`, conclui o `FollowUp`, atualiza `nextActionAt` do lead e grava auditoria cruzada.
- Eventos internos emitidos: `appointment.created` e `lead.follow_up_converted`.
- A tela `/agendamentos` ganhou acao `Virou visita` na agenda comercial.
- O teste de contrato confirma criacao do appointment e conclusao do follow-up original.

Observacoes:

- A conversao usa o horario do follow-up como inicio e a UI cria uma visita de 1 hora por default.
- Proxima melhoria recomendada: abrir modal de conversao para escolher tipo (`Visita`, `Avaliacao`, `Entrega`) e horario antes de criar o appointment.

## 2026-06-13 - Modal de conversao de follow-up

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e agenda comercial.
- Foco: dar controle ao vendedor antes de transformar follow-up em appointment formal.
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

- A acao `Virou visita` agora abre modal antes de converter o follow-up.
- O modal permite escolher tipo, titulo, inicio, fim e observacoes do appointment.
- Os campos sao pre-preenchidos com horario e contexto do follow-up.
- A conversao continua usando o endpoint auditavel `POST /leads/follow-ups/:id/appointment`.

Observacoes:

- A UI ainda sugere `Visita loja` por default, mas permite alterar para avaliacao, vistoria, entrega tecnica ou retorno comercial.
- Proxima melhoria recomendada: listar appointments vinculados no historico do lead/cliente com origem `follow_up`.

## 2026-06-13 - Appointments no historico do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: mostrar compromissos formais no historico do cliente e destacar origem em follow-up quando aplicavel.
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

- `GET /customers/:id/history` passou a retornar `appointments`.
- Appointments criados via conversao de follow-up retornam `origin: "follow_up"` com base no audit log `create_from_follow_up`.
- A tela de Clientes passou a exibir contagem e entradas recentes de agenda no card de historico.
- O smoke test valida appointment comum no historico e appointment convertido com origem `follow_up`.

Observacoes:

- O historico permanece centrado no cliente; historico especifico do lead ainda pode virar uma rota dedicada depois.
- Proxima melhoria recomendada: criar timeline unica ordenada por data combinando vendas, agenda, compras, avaliacoes e eventos.

## 2026-06-13 - Timeline unica do historico do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: reduzir leitura fragmentada do historico do cliente em uma sequencia temporal unica.
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

- `GET /customers/:id/history` passou a retornar `timeline` com vendas, compras, avaliacoes, appointments e eventos.
- A timeline e ordenada por data decrescente e limitada aos 20 itens mais recentes.
- A tela de Clientes passou a renderizar os itens recentes da timeline no card de historico.
- O smoke test valida appointments comuns e appointments originados de follow-up dentro da timeline.

Observacoes:

- Os arrays separados continuam no contrato para contadores e usos especificos.
- Proxima melhoria recomendada: adicionar filtros de timeline por tipo de evento no painel de historico do cliente.

## 2026-06-13 - Filtros da timeline do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: permitir que o usuario leia a timeline por tipo sem perder a visao consolidada.
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

- O painel de historico do cliente ganhou filtros `Todos`, `Vendas`, `Agenda`, `Compras`, `Avaliacoes` e `Eventos`.
- A filtragem acontece localmente usando a `timeline` ja retornada por `GET /customers/:id/history`.
- O painel exibe estado vazio quando nao ha itens para o filtro selecionado.
- O grid de contadores foi ajustado para incluir `Agenda`.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: adicionar detalhes expansíveis por item da timeline.

## 2026-06-13 - Detalhes expansíveis na timeline do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: permitir leitura rapida da timeline com aprofundamento pontual por item.
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

- Cada item da timeline ganhou acao `Detalhes`/`Ocultar`.
- Vendas exibem valor, margem e fechamento.
- Agenda exibe status, origem, fim e observacoes.
- Compras, avaliacoes e eventos exibem dados complementares do proprio historico.
- Ao trocar o filtro da timeline, o detalhe aberto e fechado para evitar leitura fora de contexto.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: mover o historico do cliente para um painel/modal maior quando a densidade da timeline crescer.

## 2026-06-13 - Modal amplo do historico do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: manter o card lateral como resumo e oferecer leitura ampla quando a timeline ficar densa.
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

- O card de historico do cliente ganhou acao `Abrir historico completo`.
- O modal amplo reutiliza os mesmos filtros e detalhes expansíveis da timeline.
- A lista do modal exibe todos os itens filtrados da timeline carregada, enquanto o card lateral segue resumido.
- A leitura extensa ganhou area rolavel para evitar quebrar o layout da tela de clientes.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: adicionar busca textual dentro da timeline do cliente.

## 2026-06-13 - Busca textual na timeline do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e rastreabilidade comercial.
- Foco: encontrar rapidamente eventos dentro da timeline consolidada do cliente.
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

- A timeline do cliente ganhou campo de busca textual no card lateral e no modal completo.
- A busca filtra por titulo, descricao, tipo e data textual do item.
- A busca combina com os filtros por tipo ja existentes.
- Ao abrir historico de outro cliente, a busca e o item expandido sao limpos.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: persistir preferencia de filtro/busca por usuario quando houver perfil de uso.

## 2026-06-13 - Preferencias locais da timeline do cliente

Contexto:

- Etapa BMAP: refinamento do fluxo Clientes/Leads e usabilidade da rastreabilidade.
- Foco: preservar o modo de leitura preferido do usuario na timeline do cliente.
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

- Filtro e busca da timeline do cliente passaram a ser persistidos em `localStorage`.
- A chave de preferencia usa o `user.id` autenticado para evitar misturar usuarios no mesmo navegador.
- Preferencias invalidas ou corrompidas sao descartadas automaticamente.
- Ao abrir outro cliente, o item expandido fecha, mas filtro e busca preferidos sao preservados.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: mover essas preferencias para backend quando houver tela formal de perfil/preferencias.

## 2026-06-13 - Preferencias de usuario no backend

Contexto:

- Etapa BMAP: consolidacao de usabilidade com persistencia autenticada.
- Foco: mover preferencias da timeline do cliente para backend sem perder fallback local.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run db:generate` | Passou apos encerrar API dev que segurava o Prisma Client no Windows |
| `npm run db:deploy` | Passou |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou apos liberar `PUT` no CORS |

Resultado:

- Criado modelo `UserPreference` e tabela `user_preferences` com chave unica por `user_id` e `key`.
- Criados endpoints autenticados `GET /auth/preferences/:key` e `PUT /auth/preferences/:key`.
- Smoke test cobre criacao, leitura e isolamento de preferencia entre dono e vendedor.
- A timeline do cliente passa a sincronizar filtro/busca com backend e mantem `localStorage` como fallback resiliente.
- CORS da API passou a anunciar explicitamente `GET`, `POST`, `PUT`, `PATCH`, `DELETE` e `OPTIONS`.

Observacoes:

- O QA visual detectou e validou a correcao do preflight para `PUT`.
- Proxima melhoria recomendada: criar tela simples de perfil/preferencias para expor e limpar preferencias do usuario.

## 2026-06-13 - Tela de perfil e limpeza de preferencias

Contexto:

- Etapa BMAP: governanca de usabilidade e controle pelo usuario.
- Foco: permitir que o usuario veja e limpe preferencias pessoais salvas no backend.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:api` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou com `/perfil` incluido na regressao visual |

Resultado:

- Criada pagina `/perfil`, acessivel a qualquer usuario autenticado no menu Sistema.
- A tela mostra dados da conta, controles de seguranca e preferencias pessoais salvas.
- Adicionados endpoints `GET /auth/preferences` e `DELETE /auth/preferences/:key`.
- A limpeza de preferencia e idempotente e auditada como `preference_deleted`.
- Smoke test cobre listagem, exclusao e confirmacao de isolamento por usuario.

Observacoes:

- O contrato OpenAPI e o mapa da API foram atualizados.
- Proxima melhoria recomendada: permitir reset seletivo de preferencias direto dos modais onde elas sao usadas.

## 2026-06-13 - Reset seletivo na timeline do cliente

Contexto:

- Etapa BMAP: refinamento de usabilidade com controle direto no fluxo.
- Foco: permitir limpar a preferencia da timeline no proprio historico do cliente.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Card lateral e modal completo do historico do cliente ganharam acao `Limpar preferencia`.
- A acao remove a preferencia do backend e do `localStorage`.
- O filtro volta para `Todos`, a busca e limpa e o item expandido fecha.
- A sincronizacao automatica e suprimida apenas no reset para nao recriar a preferencia default logo apos excluir.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: adicionar indicador visual discreto quando a timeline estiver usando preferencia salva.

## 2026-06-13 - Indicador de preferencia salva na timeline

Contexto:

- Etapa BMAP: clareza de estado e usabilidade no fluxo de clientes.
- Foco: deixar explicito quando filtro/busca da timeline estao personalizados.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |

Resultado:

- Card lateral e modal completo do historico exibem chip `Preferencia salva` quando filtro ou busca saem do padrao.
- O indicador fica junto da acao `Limpar preferencia`, deixando claro por que a timeline esta filtrada.
- O estado padrao segue sem ruido visual.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: adicionar um teste visual/funcional especifico que interaja com filtro, indicador e limpeza da preferencia.

## 2026-06-13 - QA funcional da preferencia da timeline

Contexto:

- Etapa BMAP: reforco de regressao automatizada para estado persistido.
- Foco: validar ponta a ponta filtro, indicador e limpeza da preferencia da timeline.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run qa:customer-history-preferences:local` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |
| `npm run typecheck` | Passou |

Resultado:

- Criado script `scripts/qa-customer-history-preferences-local.mjs`.
- O QA cria cliente e agendamento via API, abre `/clientes` no navegador, aplica filtro `Agenda`, verifica o chip `Preferencia salva`, confirma persistencia no backend e limpa a preferencia.
- O novo comando `qa:customer-history-preferences:local` entrou na regressao local.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: ampliar esse padrao para outras preferencias quando novas telas persistirem estado do usuario.

## 2026-06-13 - QA funcional da tela de perfil

Contexto:

- Etapa BMAP: reforco de regressao automatizada para preferencias de usuario.
- Foco: validar listagem e limpeza de preferencias pela tela `/perfil`.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run qa:profile-preferences:local` | Passou |
| `npm run qa:customer-history-preferences:local` | Passou |
| `npm run qa:commercial:local` | Passou |
| `npm run qa:visual:local` | Passou |
| `npm run typecheck` | Passou |
| `npm run build:web` | Passou |

Resultado:

- Criado script `scripts/qa-profile-preferences-local.mjs`.
- O QA cria preferencia via API, abre `/perfil`, valida a linha `Timeline do cliente`, limpa pela UI e confirma remocao no backend.
- O novo comando `qa:profile-preferences:local` entrou na regressao local.

Observacoes:

- O contrato da API nao mudou nesta etapa.
- Proxima melhoria recomendada: documentar no README a lista de QAs locais recomendados para desenvolvimento diario.

## 2026-06-14 - README com QAs diarios

Contexto:

- Etapa BMAP: documentacao operacional e reducao de atrito para validacao local.
- Foco: deixar explicitos os QAs recomendados para desenvolvimento diario.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `git diff --check -- crm` | Passou |

Resultado:

- README passou a citar `qa:customer-history-preferences:local` e `qa:profile-preferences:local`.
- Adicionado roteiro de QAs locais recomendados para desenvolvimento diario.
- Documentada a variavel `QA_WEB_URL` para rodar QAs de navegador quando a Web estiver em porta alternativa.

Observacoes:

- Mudanca apenas documental; contrato da API e codigo de produto nao mudaram.
- Proxima melhoria recomendada: criar um comando agregado curto para esses QAs diarios.

## 2026-06-14 - Atalho de QA diario

Contexto:

- Etapa BMAP: automacao operacional para reduzir passos manuais.
- Foco: transformar o roteiro diario de QA em um comando unico.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado comando `npm run qa:daily:local`.
- README passou a recomendar o atalho e manteve a lista expandida dos comandos equivalentes.

Observacoes:

- O comando exige API e Web ja rodando, como os demais QAs de navegador.
- Proxima melhoria recomendada: criar um helper para subir API/Web em portas livres e rodar o QA diario automaticamente.

## 2026-06-14 - Helper automatico de QA diario

Contexto:

- Etapa BMAP: automacao operacional para reduzir preparacao manual de ambiente.
- Foco: subir API/Web em portas livres e executar o conjunto diario de QA.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-daily-auto-local.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run qa:daily:auto:local` | Passou |

Resultado:

- Criado helper `scripts/qa-daily-auto-local.mjs`.
- Criado comando `npm run qa:daily:auto:local`.
- README documenta o atalho automatico.

Observacoes:

- O helper roda typecheck/builds antes de subir os servidores, para evitar conflito entre `next build` e `next dev`.
- Proxima melhoria recomendada: consolidar logs de execucao do helper em `.dev-logs/` quando houver falha.

## 2026-06-14 - Logs de falha do helper diario

Contexto:

- Etapa BMAP: observabilidade operacional do QA local.
- Foco: facilitar diagnostico quando o helper automatico falhar antes, durante ou depois de subir API/Web.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-daily-auto-local.mjs` | Passou |
| `git diff --check -- crm` | Passou |
| `npm run qa:daily:auto:local` | Passou |

Resultado:

- O helper `qa:daily:auto:local` passou a capturar saida dos comandos de preflight, API, Web e QAs executados.
- Em caso de falha, o helper grava `.dev-logs/qa-daily-auto-*.failure.log`.
- O arquivo de falha inclui timestamp, cwd, versao do Node, portas preferidas, stack do erro e saida capturada.
- A documentacao do README passou a indicar onde encontrar o diagnostico.

Observacoes:

- Execucoes bem-sucedidas continuam sem gerar arquivo novo em `.dev-logs/`.
- Proxima melhoria recomendada: adicionar um teste automatizado pequeno para exercitar o caminho de falha do helper sem rodar toda a suite.

## 2026-06-14 - Teste automatizado do log de falha do helper

Contexto:

- Etapa BMAP: regressao automatizada da observabilidade operacional.
- Foco: garantir que o helper diario continue gerando diagnostico quando falhar.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-daily-auto-local.mjs` | Passou |
| `node --test tests/qa-daily-auto-local.test.mjs` | Passou |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Adicionado teste `tests/qa-daily-auto-local.test.mjs`.
- O helper aceita `QA_AUTO_FAIL_FAST=true` para exercitar falha controlada antes de builds/servidores.
- O teste usa `QA_AUTO_RUN_ID` para gerar um arquivo previsivel, valida o conteudo diagnostico e remove o log ao final.
- O smoke de auth passou a usar identificadores unicos por execucao para reduzir colisao com massa QA acumulada.
- A listagem de follow-ups concluidos no smoke usa `page_size=100` para nao depender da primeira pagina quando ha historico de rodadas anteriores.

Observacoes:

- O caminho de sucesso do helper nao muda.
- Proxima melhoria recomendada: reduzir ruidos `prisma:error` esperados nos testes de concorrencia/idempotencia, mantendo a validacao de comportamento.

## 2026-06-14 - Reducao de ruido Prisma nos testes

Contexto:

- Etapa BMAP: higiene da regressao automatizada.
- Foco: manter testes de conflito/idempotencia sem imprimir `prisma:error` esperado como falso alerta.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --test tests/prisma-log-level.test.mjs` | Passou |
| `node --test tests/qa-daily-auto-local.test.mjs` | Passou |
| `npm test` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- `apps/api/src/lib/db.ts` passou a aceitar `PRISMA_LOG_LEVEL=silent`.
- O smoke de auth roda com `PRISMA_LOG_LEVEL=silent`, mantendo `LOG_LEVEL=fatal`.
- Adicionado teste de contrato para confirmar logs Prisma silenciosos, defaults de desenvolvimento e defaults fora de desenvolvimento.
- `npm test` passou com 13 testes e sem ruido `prisma:error` na saida.

Observacoes:

- Producao e ambientes sem `PRISMA_LOG_LEVEL=silent` continuam logando erros do Prisma.
- Proxima melhoria recomendada: medir tempo da suite `npm test` e separar smoke pesado de testes unitarios se a regressao local ficar lenta.

## 2026-06-14 - Separacao de testes unitarios e smokes

Contexto:

- Etapa BMAP: ergonomia e estabilidade da regressao local.
- Foco: dar feedback rapido para testes de contrato/unitarios e deixar smokes pesados explicitos.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run test:unit` | Passou: 11 testes, runner ~3,3s na validacao final |
| `npm run test:smoke` | Passou: 2 testes, runner ~104,5s isolado |
| `npm test` | Passou: `test:unit` + `test:smoke`, runner smoke ~92,6s na validacao final |

Resultado:

- Criado script `npm run test:unit` para testes rapidos de contrato, configuracao e guardrails.
- Criado script `npm run test:smoke` para smokes pesados de API e rate-limit.
- `npm test` passou a encadear `test:unit` e `test:smoke`.
- `test:smoke` roda com `--test-concurrency=1` para evitar disputa de seed/estado entre smokes que usam banco.
- README documenta quando usar cada nivel.

Observacoes:

- O auth smoke segue sendo o trecho mais caro da suite.
- Proxima melhoria recomendada: avaliar particionamento do auth smoke por dominio para reduzir tempo de feedback sem perder cobertura.

## 2026-06-14 - Smokes executaveis por alvo

Contexto:

- Etapa BMAP: ergonomia de QA para smokes pesados.
- Foco: permitir rodar apenas o smoke afetado pela mudanca sem perder o agregado completo.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run test:smoke:rate` | Passou: 1 teste, runner ~21,6s |
| `npm run test:smoke:auth` | Passou: 1 teste, runner ~121,3s |
| `npm run test:smoke` | Passou: auth + rate em sequencia |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `npm run test:smoke:auth`.
- Criado `npm run test:smoke:rate`.
- `npm run test:smoke` agora encadeia os dois comandos, mantendo execucao serial.
- README documenta os smokes especificos.

Observacoes:

- Esta etapa separa por alvo de smoke, mas o auth smoke ainda e monolitico internamente.
- Proxima melhoria recomendada: adicionar marcadores ou checkpoints no auth smoke para identificar quais dominios consomem mais tempo antes de particionar o arquivo.

## 2026-06-14 - Checkpoints de tempo do auth smoke

Contexto:

- Etapa BMAP: diagnostico de performance da regressao pesada.
- Foco: medir blocos internos do auth smoke antes de particionar por dominio.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/run-auth-smoke-timed.mjs` | Passou |
| `node --check tests/auth-api-smoke.ts` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run test:smoke:auth:timed` | Passou: runner ~49,6s |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `npm run test:smoke:auth:timed`.
- O comando ativa checkpoints via `AUTH_SMOKE_TIMING=true` sem alterar a saida normal de `test:smoke:auth`.
- Checkpoints medidos nesta rodada:
  - `auth/preferences`: ~2,5s.
  - `ops/session`: ~0,7s.
  - `customers/services-base`: ~3,3s.
  - `leads/follow-ups`: ~3,2s.
  - `communication/ai`: ~2,3s.
  - `appointments/inventory/services`: ~5,0s.
  - `purchases/listings/repasse`: ~2,6s.
  - `sales/finance/contracts/dispatch`: ~1,6s.
  - `files/rbac`: ~1,9s.
  - `ocr/jobs`: ~0,5s.
  - `automations/settings`: ~0,9s.
  - `users/access`: ~1,5s.
  - `analytics/compliance/audit/webhooks`: ~0,8s.

Observacoes:

- Os checkpoints somaram ~26,8s, enquanto o runner reportou ~49,6s; isso indica custo relevante antes do primeiro checkpoint, principalmente seed/bootstrap.
- Proxima melhoria recomendada: medir explicitamente seed/bootstrap do auth smoke e avaliar um modo de seed reutilizavel para desenvolvimento local.

## 2026-06-14 - Medicao de seed/bootstrap do auth smoke

Contexto:

- Etapa BMAP: diagnostico fino da regressao pesada.
- Foco: separar tempo de startup/imports, seed e bootstrap da aplicacao do tempo dos blocos de dominio.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check tests/auth-api-smoke.ts` | Passou |
| `node --check scripts/run-auth-smoke-timed.mjs` | Passou |
| `npm run test:smoke:auth:timed` | Passou: runner ~10,0s |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- O wrapper `run-auth-smoke-timed.mjs` passou a enviar `AUTH_SMOKE_PROCESS_STARTED_AT`.
- O auth smoke agora registra `module-load`, `db:seed` e `app-bootstrap` antes dos checkpoints de dominio.
- Medicao desta rodada:
  - `module-load`: ~3,1s.
  - `db:seed`: ~1,8s.
  - `app-bootstrap`: ~0,3s.
  - Blocos de dominio juntos: ~4,7s.

Observacoes:

- A rodada foi bem mais rapida que a anterior, indicando variacao relevante do ambiente Windows/banco local.
- Proxima melhoria recomendada: salvar historico dos timings em arquivo opcional para comparar varias rodadas antes de otimizar seed ou particionar o auth smoke.

## 2026-06-14 - Historico local de timings do auth smoke

Contexto:

- Etapa BMAP: diagnostico comparavel da regressao pesada.
- Foco: guardar medicoes locais do auth smoke para comparar varias rodadas antes de otimizar.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check tests/auth-api-smoke.ts` | Passou |
| `node --check scripts/run-auth-smoke-timed.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run test:smoke:auth:timed` | Passou: runner ~20,2s |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- `npm run test:smoke:auth:timed` passou a gravar `.dev-logs/auth-smoke-timings.jsonl`.
- Cada linha contem `finishedAt`, `success`, `totalMs` e os checkpoints com duracao incremental e acumulada.
- `.dev-logs/` segue ignorado pelo Git, mantendo o historico como diagnostico local.
- Medicao desta rodada: total ~20,4s; `module-load` ~6,5s, `db:seed` ~3,9s, `app-bootstrap` ~0,7s.

Observacoes:

- A variacao entre rodadas segue alta, entao a decisao de otimizar seed ou particionar o smoke deve considerar uma serie de medicoes.
- Proxima melhoria recomendada: criar um resumidor simples para ler `.dev-logs/auth-smoke-timings.jsonl` e mostrar medias/min/max por checkpoint.

## 2026-06-14 - Resumo dos timings do auth smoke

Contexto:

- Etapa BMAP: leitura rapida do historico local de performance.
- Foco: transformar o JSONL de timings em media, minimo e maximo por checkpoint.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/summarize-auth-smoke-timings.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run test:smoke:auth:summary` | Passou |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `scripts/summarize-auth-smoke-timings.mjs`.
- Criado comando `npm run test:smoke:auth:summary`.
- O resumo mostra quantidade de rodadas, sucessos/falhas, total medio/min/max e media/min/max por checkpoint.
- O script tolera arquivo ausente e linhas invalidas sem falhar a execucao.

Observacoes:

- A primeira leitura encontrou 1 rodada local registrada em `.dev-logs/auth-smoke-timings.jsonl`.
- Proxima melhoria recomendada: coletar mais rodadas e usar o resumo para decidir entre otimizar seed/bootstrap ou particionar o auth smoke.

## 2026-06-14 - Segunda amostra dos timings do auth smoke

Contexto:

- Etapa BMAP: decisao orientada por dados sobre a regressao pesada.
- Foco: comparar mais de uma execucao antes de otimizar seed/bootstrap ou particionar o auth smoke.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run test:smoke:auth:timed` | Passou: runner ~17,7s |
| `npm run test:smoke:auth:summary` | Passou: 2 rodadas lidas |

Resultado:

- O historico local passou a ter 2 rodadas bem-sucedidas.
- Resumo com 2 rodadas:
  - Total medio: ~19,0s; minimo ~17,6s; maximo ~20,4s.
  - `module-load`: media ~5,7s.
  - `db:seed`: media ~3,8s.
  - `app-bootstrap`: media ~0,7s.
  - Maior bloco de dominio: `sales/finance/contracts/dispatch`, media ~1,4s.

Observacoes:

- Com as duas amostras atuais, particionar o auth smoke por dominio tende a economizar menos que reduzir custo de module-load/seed para feedback local.
- Proxima melhoria recomendada: investigar se `db:seed` pode ter modo rapido/idempotente para testes, ou se o auth smoke pode reutilizar seed validado em ambiente local controlado.

## 2026-06-14 - Seed base para auth smoke

Contexto:

- Etapa BMAP: reduzir preparacao desnecessaria em smokes que criam a propria massa operacional.
- Foco: permitir que testes usem apenas loja, usuarios, roles e permissoes sem semear dados demo completos.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check packages/db/prisma/seed.mjs` | Passou |
| `node --check tests/auth-api-smoke.ts` | Passou |
| `npm run test:smoke:auth:timed` | Passou: runner ~60,2s |
| `npm run test:smoke:auth:summary` | Passou: 3 rodadas lidas |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- `packages/db/prisma/seed.mjs` passou a aceitar `SEED_SKIP_DEMO_DATA=true`.
- O modo base ainda cria loja, configuracao de marca, roles, permissoes, relacoes role-permission, usuarios dev e escopos.
- O auth smoke passou a executar `db:seed` com `SEED_SKIP_DEMO_DATA=true`, validando que ele nao depende da massa demo operacional.
- README documenta a flag para testes que precisam apenas da base de acesso.

Observacoes:

- A terceira rodada de timing foi um outlier geral: total ~60,1s, com aumento em todos os checkpoints; portanto ainda nao ha evidencia suficiente de ganho de performance estavel.
- O valor principal desta etapa e reduzir dependencia implicita da massa demo e deixar o smoke mais autocontido.
- Proxima melhoria recomendada: adicionar teste unitario pequeno para garantir que `SEED_SKIP_DEMO_DATA=true` permanece documentado/ligado no auth smoke, ou coletar mais rodadas em ambiente menos ruidoso.

## 2026-06-14 - Contrato do seed base nos testes

Contexto:

- Etapa BMAP: proteger a melhoria de seed base sem rodar smoke pesado.
- Foco: garantir que o auth smoke continua usando `SEED_SKIP_DEMO_DATA=true` e que a flag segue documentada.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --test tests/seed-contract.test.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `tests/seed-contract.test.mjs`.
- O teste valida que `seed.mjs` reconhece `SEED_SKIP_DEMO_DATA`, que `seedDemoData` fica protegido por `!skipDemoData`, que o auth smoke envia a flag e que o README documenta o uso.
- `test:unit` passou a incluir o novo contrato.

Observacoes:

- A protecao e estatica por leitura de arquivo, intencionalmente rapida e sem dependencia de banco.
- Proxima melhoria recomendada: coletar mais timings em ambiente menos ruidoso ou investigar o custo de module-load com cache/runner dedicado.

## 2026-06-14 - Medidor de bootstrap do auth smoke

Contexto:

- Etapa BMAP: diagnostico especifico do custo de carregamento do auth smoke.
- Foco: medir import da API, import do DB, seed base, `buildApp()` e shutdown sem rodar todos os fluxos de dominio.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/measure-auth-smoke-bootstrap.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run test:smoke:auth:bootstrap` | Passou: total ~12,2s |
| `npm run test:unit` | Passou |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `scripts/measure-auth-smoke-bootstrap.mjs`.
- Criado comando `npm run test:smoke:auth:bootstrap`, executado via `tsx` para resolver imports TypeScript da API.
- Medicao desta rodada:
  - `import-app`: ~4,4s.
  - `import-db`: ~0,1s.
  - `db:seed-base`: ~6,3s.
  - `build-app`: ~1,0s.
  - `shutdown`: ~0,4s.

Observacoes:

- O seed base continua sendo a maior fatia nesta amostra, seguido pelo carregamento da API.
- Proxima melhoria recomendada: medir o seed base isolado em multiplas rodadas e avaliar se vale criar um modo de seed que pule rehash de senhas quando usuarios dev ja existem.

## 2026-06-14 - Medicao isolada do seed base

Contexto:

- Etapa BMAP: diagnostico de performance do seed base usado pelos smokes de autenticacao.
- Foco: medir `db:seed` com `SEED_SKIP_DEMO_DATA=true` em multiplas rodadas, sem carregar a API.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/measure-base-seed.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run db:seed:base:measure` | Passou: media ~14,3s |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `scripts/measure-base-seed.mjs`.
- Criado comando `npm run db:seed:base:measure`, com suporte a argumento de rodadas via `npm run db:seed:base:measure -- 5`.
- README documenta o uso do medidor junto da massa demo.
- Medicao desta rodada:
  - rodada 1: 10.696ms.
  - rodada 2: 17.111ms.
  - rodada 3: 14.989ms.
  - media: 14.265ms.

Observacoes:

- O custo do seed base isolado e material para um smoke frequente, mesmo sem massa demo operacional.
- Proxima melhoria recomendada: investigar um modo seguro para reutilizar hashes de senha dos usuarios dev quando eles ja existem, evitando rehash Argon2 desnecessario em seeds repetidos.

## 2026-06-14 - Reutilizacao segura de hash dev no seed repetido

Contexto:

- Etapa BMAP: otimizacao de feedback loop dos smokes sem alterar comportamento padrao de seguranca.
- Foco: evitar recalculo Argon2 dos usuarios dev quando o seed e repetido em ambiente local/smoke e os usuarios ja existem.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check packages/db/prisma/seed.mjs` | Passou |
| `node --check scripts/measure-base-seed.mjs` | Passou |
| `node --check scripts/measure-auth-smoke-bootstrap.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `npm run db:seed:base:measure` | Passou: media ~1,0s |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |
| `npm run test:smoke:auth:bootstrap` | Passou: total ~3,0s |
| `npm run test:smoke:auth:timed` | Passou: total ~11,7s |

Resultado:

- Criada flag `SEED_REUSE_DEV_PASSWORD_HASH=true` para seed repetido de desenvolvimento/smoke.
- Quando a flag esta ativa e o usuario dev ja existe, o seed reutiliza `passwordHash` salvo; quando nao existe, calcula Argon2 normalmente.
- O auth smoke e os medidores de seed/bootstrap passaram a ativar a flag junto de `SEED_SKIP_DEMO_DATA=true`.
- README documenta a flag como otimizacao de desenvolvimento/smoke.

Medicoes:

- Seed base isolado antes: media ~14.265ms.
- Seed base isolado depois: media ~1.041ms.
- Bootstrap auth smoke depois:
  - `import-app`: ~930ms.
  - `import-db`: ~20ms.
  - `db:seed-base`: ~1.661ms.
  - `build-app`: ~263ms.
  - `shutdown`: ~96ms.
  - total: ~2.969ms.
- Auth smoke completo depois:
  - `module-load`: ~3.971ms.
  - `db:seed`: ~1.993ms.
  - `app-bootstrap`: ~261ms.
  - total: ~11.714ms.

Observacoes:

- O comportamento padrao do seed continua recalculando hash; a reutilizacao exige flag explicita.
- Proxima melhoria recomendada: revisar o custo de `module-load` do auth smoke, que agora e maior que o seed base no fluxo completo.

## 2026-06-15 - Runner local de TSX nos smokes

Contexto:

- Etapa BMAP: reduzir overhead de inicializacao dos smokes sem alterar cobertura funcional.
- Foco: remover `npx tsx` dos wrappers de smoke e chamar o TSX local diretamente via Node.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check tests/auth-api.test.mjs` | Passou |
| `node --check tests/rate-limit.test.mjs` | Passou |
| `rg -n "npx tsx" tests scripts` | Passou: sem ocorrencias |
| `npm run test:smoke:auth:timed` | Passou: total ~11,2s |
| `npm run test:smoke:rate` | Passou |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |
| `npm run test:smoke` | Passou |

Resultado:

- `tests/auth-api.test.mjs` e `tests/rate-limit.test.mjs` passaram a usar `execFileSync(process.execPath, [node_modules/tsx/dist/cli.mjs, ...])`.
- A execucao deixou de depender de `npx` para resolver o runner TSX em cada smoke.

Medicoes:

- Auth smoke completo antes desta etapa: total ~11.714ms, `module-load` ~3.971ms.
- Auth smoke completo depois desta etapa: total ~11.179ms, `module-load` ~1.754ms.

Observacoes:

- A reducao de `module-load` foi clara nesta amostra, embora o total do smoke dependa tambem da variacao dos fluxos de dominio.
- Proxima melhoria recomendada: consolidar a execucao local de smokes em helpers compartilhados para evitar divergencia entre wrappers.

## 2026-06-15 - Helper compartilhado para smokes TSX

Contexto:

- Etapa BMAP: consolidacao de infraestrutura de testes apos otimizar os wrappers de smoke.
- Foco: evitar duplicacao na resolucao do TSX local e padronizar variaveis de ambiente dos smokes.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check tests/helpers/run-tsx-smoke.mjs` | Passou |
| `node --check tests/auth-api.test.mjs` | Passou |
| `node --check tests/rate-limit.test.mjs` | Passou |
| `rg -n "execFileSync\\(|node_modules/tsx/dist/cli|npx tsx" tests` | Passou: chamada centralizada no helper |
| `npm run test:smoke` | Passou |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |

Resultado:

- Criado `tests/helpers/run-tsx-smoke.mjs`.
- `tests/auth-api.test.mjs` e `tests/rate-limit.test.mjs` passaram a usar `runTsxSmoke`.
- A resolucao de `node_modules/tsx/dist/cli.mjs`, `cwd`, `stdio` e merge de `env` ficou centralizada.

Observacoes:

- A cobertura dos smokes nao mudou; a alteracao reduziu duplicacao e risco de divergencia entre wrappers.
- Proxima melhoria recomendada: iniciar QA funcional/manual dos fluxos centrais do CRM usando a base de smoke estabilizada.

## 2026-06-15 - Agregador de QA central do CRM

Contexto:

- Etapa BMAP: preparar QA funcional/manual dos fluxos centrais do CRM.
- Foco: agrupar validacoes ja existentes de RBAC, clientes, negociacao, veiculos e avaliacoes em um comando unico.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-core-local.mjs` | Passou |
| `node scripts/qa-core-local.mjs --list` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `rg -n "qa:core:local|qa-core-local" README.md package.json scripts docs` | Passou |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |

Resultado:

- Criado `scripts/qa-core-local.mjs`.
- Criado comando `npm run qa:core:local`.
- A trilha central executa, em ordem: `qa:functional:local`, `qa:commercial:local` e `qa:vehicles:local`.
- README passou a documentar o comando como QA central com API e Web rodando.

Observacoes:

- A execucao completa de `npm run qa:core:local` nao foi rodada nesta etapa porque exige API e Web locais ativos.
- O modo `--list` valida a composicao do agregador sem depender dos servicos.
- Proxima melhoria recomendada: subir API/Web pelo fluxo local e executar `npm run qa:core:local` de ponta a ponta.

## 2026-06-15 - QA central ponta a ponta

Contexto:

- Etapa BMAP: validacao funcional/manual assistida dos fluxos centrais do CRM.
- Foco: executar a trilha central agrupada com API e Web locais ativos.
- Escopo: apenas projeto novo `crm/`.

Ambiente:

- API existente em `http://localhost:3333`.
- Porta `3000` estava ocupada por outro servidor local que nao era o Web do CRM.
- Web do CRM iniciado temporariamente em `http://localhost:3001`.
- Docker Desktop nao estava disponivel nesta maquina durante a rodada, mas a API local respondeu `200` em `/health/ready`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run dev:check` | Bloqueou corretamente por API/Web ja presentes nas portas padrao |
| `Invoke-WebRequest http://localhost:3333/health/ready` | Passou: 200 |
| `Invoke-WebRequest http://localhost:3001/preview` | Passou: 200 |
| `QA_API_URL=http://localhost:3333 QA_WEB_URL=http://localhost:3001 npm run qa:core:local` | Passou |

Resultado:

- `qa:functional:local` passou: 7 perfis seedados logaram, 16 permissoes RBAC e 8 endpoints sensiveis foram validados, 13 rotas Web responderam.
- `qa:commercial:local` passou: cliente/lead minimo, mudanca de etapa, kanban de cliente, agenda, proposta de venda, historico de cliente e bloqueios de financeiro/auditoria.
- `qa:vehicles:local` passou: estoque, lead de compra, avaliacao, checklist, detalhes da avaliacao, bloqueio de aprovacao indevida e bloqueios de financeiro/auditoria/usuarios/vendas.

Observacoes:

- O Web temporario em `3001` foi encerrado ao final da rodada.
- `apps/web/next-env.d.ts` foi restaurado para o import estavel de build apos o Next dev alterar o caminho para `.next/dev`.
- Proxima melhoria recomendada: criar um helper de QA que suba Web em porta alternativa quando `3000` estiver ocupada por outro app.

## 2026-06-15 - Runner automatico do QA central

Contexto:

- Etapa BMAP: reduzir atrito para repetir o QA central local quando a porta Web padrao esta ocupada.
- Foco: subir o Web do CRM em porta livre, apontar o QA central para essa porta e encerrar o processo temporario ao final.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-core-auto-local.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `rg -n "qa:core:auto:local|qa-core-auto-local" README.md package.json scripts` | Passou |
| `npm run qa:core:auto:local` | Passou |
| `npm run test:unit` | Passou: 12 testes |
| `npm run typecheck` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `scripts/qa-core-auto-local.mjs`.
- Criado comando `npm run qa:core:auto:local`.
- O runner valida a API existente em `QA_API_URL` ou `http://localhost:3333`.
- O runner escolhe uma porta Web livre a partir de `WEB_PORT`/`QA_AUTO_WEB_PORT` ou `3000`; nesta rodada, detectou `3000` ocupado e usou `3001`.
- O runner executou `qa:core:local` com `QA_WEB_URL=http://localhost:3001` e encerrou o Web temporario ao final.

Observacoes:

- A primeira tentativa revelou que checar apenas `127.0.0.1` nao detectava conflito em `::3000`; a checagem foi corrigida para testar a porta sem fixar host.
- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: centralizar helpers comuns de `qa-core-auto-local` e `qa-daily-auto-local` quando houver nova duplicacao real.

## 2026-06-15 - Helper compartilhado para runners automaticos de QA

Contexto:

- Etapa BMAP: reduzir duplicacao tecnica entre runners automaticos de QA local.
- Foco: centralizar utilitarios ja repetidos de npm, porta livre, espera por URL, binarios locais e encerramento de processos.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/helpers/qa-runner.mjs` | Passou |
| `node --check scripts/qa-core-auto-local.mjs` | Passou |
| `node --check scripts/qa-daily-auto-local.mjs` | Passou |
| `rg -n "function npmCli|function npmRunArgs|function localBin|findFreePort|waitForUrl|stopService" scripts/qa-core-auto-local.mjs scripts/qa-daily-auto-local.mjs scripts/helpers/qa-runner.mjs` | Passou |
| `rg -n "127\\.0\\.0\\.1|server\\.listen\\(port" scripts/qa-core-auto-local.mjs scripts/qa-daily-auto-local.mjs scripts/helpers/qa-runner.mjs` | Passou |
| `node --test tests/qa-daily-auto-local.test.mjs` | Passou |
| `node --test tests/qa-runner.test.mjs` | Passou |
| `npm run test:unit` | Passou: 13 testes |
| `npm run qa:core:auto:local` | Passou |
| `npm run typecheck` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |

Resultado:

- Criado `scripts/helpers/qa-runner.mjs`.
- `qa-core-auto-local` e `qa-daily-auto-local` passaram a reutilizar `findFreePort`, `waitForUrl`, `stopService`, `localBin` e helpers de npm.
- A checagem de porta compartilhada testa a porta sem fixar `127.0.0.1`, preservando a correcao para conflitos em IPv6.
- Criado `tests/qa-runner.test.mjs` para proteger a deteccao de porta ocupada por listener sem host explicito.

Observacoes:

- A logica especifica de cada runner permaneceu no proprio script para evitar abstracao prematura.
- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: manter `qa:core:auto:local` como comando padrao de verificacao central antes de novas historias funcionais.

## 2026-06-15 - Gate local pre-story

Contexto:

- Etapa BMAP: formalizar a verificacao padrao antes de iniciar ou fechar novas historias funcionais.
- Foco: combinar testes unitarios/contratos, typecheck e QA central automatico em um comando unico.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `rg -n "qa:pre-story:local" README.md package.json` | Passou |
| `npm run qa:pre-story:local` | Passou |

Resultado:

- Criado comando `npm run qa:pre-story:local`.
- O gate executa `test:unit`, `typecheck` e `qa:core:auto:local`.
- README passou a recomendar o gate antes de novas historias funcionais quando houver API local disponivel.

Validacao da rodada:

- `test:unit` passou com 13 testes.
- `typecheck` passou.
- `qa:core:auto:local` subiu o Web temporario em `http://localhost:3001`, executou `qa:core:local` e encerrou ao final.
- `qa:functional:local`, `qa:commercial:local` e `qa:vehicles:local` passaram dentro do gate.

Observacoes:

- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: usar `npm run qa:pre-story:local` como primeiro passo antes da proxima historia funcional de produto.

## 2026-06-15 - Historico operacional do lead

Contexto:

- Etapa BMAP: primeira micro-historia funcional apos estabilizar o gate pre-story.
- Foco: dar visao historica propria ao lead, sem depender apenas do historico consolidado do cliente.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run test:smoke:auth` | Passou |
| `npm run test:unit` | Passou: 13 testes |
| `npm run qa:pre-story:local` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- Criado `GET /leads/:id/history`.
- A rota retorna `lead`, `stageHistory`, `followUps`, `appointments` e `events` do lead.
- A rota respeita o mesmo ownership/escopo de leitura do lead e retorna 404 auditavel quando o lead nao pertence ao usuario.
- O auth smoke passou a validar a rota usando um lead com mudanca de etapa, follow-up concluido e appointment convertido.
- O gate `qa:pre-story:local` passou completo apos a mudanca.

Observacoes:

- A UI ainda nao exibe esse historico; a API ficou pronta e protegida para a proxima etapa de frontend.
- Proxima melhoria recomendada: adicionar painel/modal de historico do lead na tela `/leads`, reaproveitando o padrao visual do historico do cliente.

## 2026-06-15 - Modal de historico do lead na UI

Contexto:

- Etapa BMAP: expor na UI a rota de historico operacional do lead.
- Foco: permitir ao vendedor revisar etapas, follow-ups, agenda e eventos recentes sem sair da tela `/leads`.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run qa:pre-story:local` | Passou |
| `git diff --check -- crm` | Passou |

Resultado:

- A fila priorizada de `/leads` ganhou acao `Historico`.
- A acao abre modal com contadores de etapas, follow-ups, agenda e eventos.
- O modal consome `GET /leads/:id/history` e reaproveita o padrao visual de historico do cliente.
- Estados de carregamento, erro e vazio foram tratados no proprio modal.

Observacoes:

- O gate confirmou que `/leads` continua renderizando dentro de `qa:functional:local` e `qa:commercial:local`.
- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: adicionar QA funcional de UI que clique em `Historico` na tela `/leads` e confirme o modal carregado.

## 2026-06-15 - QA funcional do historico do lead

Contexto:

- Etapa BMAP: proteger o modal de historico do lead com validacao funcional de UI.
- Foco: garantir que a tela `/leads` abre o historico de um lead real com etapas, follow-ups e agenda.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-lead-history-local.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `rg -n "qa:lead-history:local\|qa-lead-history-local\|modal de historico do lead" README.md package.json scripts` | Passou |
| `npm run typecheck` | Passou |
| `QA_WEB_URL=http://localhost:3001 QA_API_URL=http://localhost:3333 npm run qa:lead-history:local` | Passou |
| `npm run test:unit` | Passou: 13 testes |

Resultado:

- Criado `scripts/qa-lead-history-local.mjs`.
- O QA cria um lead pelo perfil Vendedor, muda a etapa, agenda follow-up e cria compromisso vinculado.
- O navegador acessa `/leads`, localiza o lead na fila priorizada, clica em `Historico` e valida o modal carregado.
- README passou a documentar o comando `npm run qa:lead-history:local`.

Observacoes:

- O Web do CRM foi iniciado temporariamente em `http://localhost:3001` porque a porta `3000` esta ocupada por outro servico local.
- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: decidir se `qa:lead-history:local` entra no `qa:daily:local` ou fica como QA funcional sob demanda da historia de leads.

## 2026-06-15 - Historico do lead na rotina diaria de QA

Contexto:

- Etapa BMAP: promover o QA funcional do historico do lead para a rotina diaria/regressao.
- Foco: evitar regressao silenciosa no modal de historico de leads depois de novas historias comerciais.
- Escopo: apenas projeto novo `crm/`.

Comandos executados:

| Comando | Resultado |
| --- | --- |
| `node --check scripts/qa-daily-auto-local.mjs` | Passou |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package ok')"` | Passou |
| `node --test tests/qa-daily-auto-local.test.mjs` | Passou |
| `npm run typecheck` | Passou |
| `npm run qa:daily:auto:local` | Passou |

Resultado:

- `qa:daily:local` passou a executar `qa:lead-history:local`.
- `qa:regression:local` passou a executar `qa:lead-history:local`.
- `qa:daily:auto:local` passou a executar o QA do historico do lead entre a timeline do cliente e as preferencias de perfil.
- README foi atualizado para refletir o novo conjunto diario e o exemplo com `QA_WEB_URL`.

Observacoes:

- O runner diario automatico executou o novo `qa:lead-history:local` com sucesso em `http://localhost:3001`.
- A API `http://localhost:3333` ja estava rodando no ambiente; por isso o processo temporario registrou `EADDRINUSE`, mas o health check usou a API existente e o runner concluiu OK.
- `apps/web/next-env.d.ts` foi restaurado apos o Next dev alterar o import para `.next/dev`.
- Proxima melhoria recomendada: corrigir o helper automatico para detectar processo API existente antes de tentar subir outro em `3333`, reduzindo ruido no log.
