# CRM Automotivo MVP

O CRM Automotivo MVP organiza a operacao interna de uma loja de veiculos em um fluxo unico: captacao de leads, atendimento, agenda, estoque, compras, vendas, documentos, financeiro, servicos, anuncios, automacoes e auditoria.

O problema central que ele resolve e tirar a loja de controles espalhados em conversas, planilhas, arquivos soltos e memoria operacional. A equipe passa a enxergar quem e responsavel por cada cliente, veiculo, venda, documento, custo, comissao, pendencia e proxima acao, com permissao por perfil e rastreabilidade.

Esta pasta contem a base tecnica isolada do CRM definida na Sprint 11.

## Decisao de isolamento

O repositorio atual possui um produto existente de cashback/posto. Para preservar esse produto, a fundacao do CRM foi criada em `crm/` como uma area isolada.

Essa decisao evita misturar dominios, rotas, banco, telas e regras de negocio ate que exista uma estrategia explicita de migracao ou separacao de repositorios.

## Stack inicial

- Next.js/React para frontend.
- Node.js/Fastify para backend API.
- PostgreSQL com Prisma.
- Supabase Storage para anexos/documentos.
- pg-boss/PostgreSQL previsto para jobs.
- Docker Compose para PostgreSQL e SMTP local.

## Estado atual da fundacao

- Prisma schema expandido para os dominios principais do CRM.
- Testes de contrato protegem `store_id`, anexos, auditoria, snapshots financeiros e modelos aprovados no preview.
- Frontend Surface com rotas de preview e modulos operacionais para revisao de UX.
- Backend Fastify com auth, RBAC, clientes, leads, agenda, estoque, compras, vendas, financeiro, documentos, servicos, marketing, comunicacao, IA, OCR, auditoria, configuracoes, usuarios, jobs e webhooks.

## Documentacao da API

- [Mapa da API do CRM MVP](docs/api-map.md)
- [OpenAPI inicial](docs/openapi-mvp.yaml)
- [Runbook operacional](docs/ops-runbook.md)
- [Checklist de QA funcional](docs/qa-functional-checklist.md)
- [Registro de rodadas de QA](docs/qa-runs.md)
- [Decisoes de arquitetura](docs/architecture-decisions.md)

## Primeiros comandos

Para preparar o ambiente do zero:

```bash
cd crm
npm run setup
```

O setup cria `.env` quando ainda nao existe, instala dependencias, sobe Docker Compose, gera Prisma, roda migrations e aplica o seed demo. Ele nao sobrescreve `.env` existente.
Quando usa Docker, o setup aguarda o PostgreSQL aceitar conexao TCP antes de rodar migrations e seed.

Se Docker/WSL estiver indisponivel, configure `.env` com PostgreSQL local ou Supabase Postgres de development e rode:

```bash
SETUP_SKIP_DOCKER=true npm run setup
```

No PowerShell:

```powershell
$env:SETUP_SKIP_DOCKER="true"
npm run setup
Remove-Item Env:\SETUP_SKIP_DOCKER
```

Se API/Web ja estiverem rodando e voce precisar reexecutar apenas dependencias, banco e seed, use tambem:

```powershell
$env:SETUP_SKIP_DEV_CHECK="true"
npm run setup
Remove-Item Env:\SETUP_SKIP_DEV_CHECK
```

No Windows, se a API estiver rodando, o Prisma Client pode ficar bloqueado em `node_modules/.prisma`. Nesse caso, pare a API antes do setup ou, se o client ja foi gerado antes, use:

```powershell
$env:SETUP_SKIP_PRISMA_GENERATE="true"
npm run setup
Remove-Item Env:\SETUP_SKIP_PRISMA_GENERATE
```

Depois do setup, suba API e Web em terminais separados:

```bash
npm run dev:api
npm run dev:web
```

`dev:check` valida o ambiente completo. Os scripts `dev:web` e `dev:api` usam checks direcionados (`dev:check:web` e `dev:check:api`) para bloquear apenas conflitos do proprio servico.

## Validacao local

```bash
npm test
npm run typecheck
npm run build:api
npm run build:web
```

Para feedback rapido durante desenvolvimento, rode apenas os testes de contrato/unitarios:

```bash
npm run test:unit
```

Para os smokes de API mais pesados, com seed e fluxos in-process:

```bash
npm run test:smoke
```

Para rodar apenas um smoke especifico:

```bash
npm run test:smoke:auth
npm run test:smoke:rate
```

Para diagnosticar quais blocos do auth smoke estao mais lentos:

```bash
npm run test:smoke:auth:timed
```

Atalho equivalente:

```bash
npm run qa
```

Com API e Web rodando, valide o caminho funcional principal:

```bash
npm run smoke:local
```

Para validar perfis seedados, permissoes criticas de RBAC, endpoints sensiveis e rotas principais:

```bash
npm run qa:functional:local
```

Para validar o fluxo Comercial com perfil Vendedor:

```bash
npm run qa:commercial:local
```

Para validar a preferencia da timeline do cliente ponta a ponta:

```bash
npm run qa:customer-history-preferences:local
```

Para validar a tela de Perfil listando e limpando preferencias pessoais:

```bash
npm run qa:profile-preferences:local
```

Para validar o fluxo Administrativo com triagem, repasse, documentos e prestadores:

```bash
npm run qa:administrative:local
```

Para validar o fluxo Veiculos/Avaliador com compras, avaliacoes e estoque:

```bash
npm run qa:vehicles:local
```

Para validar o fluxo Servicos/Pos-venda com OS, prestadores e notas:

```bash
npm run qa:services:local
```

Para validar o fluxo Gestao/Dono com resultados, financeiro, auditoria, configuracoes, usuarios e revogacao de sessao:

```bash
npm run qa:management:local
```

Para validar layout desktop/mobile, erros de console acionaveis e capturar screenshots locais:

```bash
npm run qa:visual:local
```

Para rodar a regressao local operacional completa, com API e Web ja rodando:

```bash
npm run qa:regression:local
```

Atalho completo, incluindo QA tecnico e regressao local operacional:

```bash
npm run qa:local
```

O smoke local usa por padrao:

- API em `http://localhost:3333`.
- Web em `http://localhost:3000`.
- Usuario `dono@gt3.local`.
- Senha `Gt3@2026dev`.
- Endpoints principais da API e rotas navegaveis do menu.

Variaveis opcionais: `SMOKE_API_URL`, `SMOKE_WEB_URL`, `SMOKE_EMAIL` e `SMOKE_PASSWORD`.

Atalho recomendado para desenvolvimento diario, com API e Web ja rodando:

```bash
npm run qa:daily:local
```

Para deixar o proprio script subir API/Web em portas livres e executar esse conjunto:

```bash
npm run qa:daily:auto:local
```

Se o helper automatico falhar, ele grava um diagnostico em `.dev-logs/qa-daily-auto-*.failure.log` com erro, portas tentadas e saida capturada dos comandos/servicos.

Ele equivale a:

```bash
npm run typecheck
npm run build:api
npm run build:web
npm run qa:commercial:local
npm run qa:customer-history-preferences:local
npm run qa:profile-preferences:local
npm run qa:visual:local
```

Quando a Web estiver rodando fora da porta padrao, informe a URL nos QAs de navegador. Exemplo no PowerShell:

```powershell
$env:QA_WEB_URL="http://localhost:3001"
npm run qa:commercial:local
npm run qa:customer-history-preferences:local
npm run qa:profile-preferences:local
npm run qa:visual:local
Remove-Item Env:\QA_WEB_URL
```

## Massa demo

`npm run db:seed` cria loja, usuarios, permissoes e dados operacionais de demonstracao para os workspaces live:

- clientes, leads e agendamentos;
- veiculos, estoque, custos, compras e avaliacoes;
- vendas, contratos, financeiro, prestadores, servicos e pos-venda;
- repasse, conversas, automacoes, anexos e auditoria.

O seed foi estruturado para ser reexecutavel sem duplicar os principais registros demo.

## Protocolo BMAP aplicado

- Ler documentacao viva antes de codar.
- Validar ambiente com `dev:check`; para subir servicos isolados, usar os checks direcionados dos scripts `dev:web` e `dev:api`.
- Entregar Frontend Surface quando houver uso operacional.
- Fazer commit/push por micro-historia validada.
- Evitar comandos destrutivos sem aprovacao explicita.
