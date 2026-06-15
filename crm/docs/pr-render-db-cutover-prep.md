# PR: render db cutover prep e trilha anti-tracker

Branch: `chore/render-db-cutover-prep`

## Escopo

- Preparacao externa ao `crm/` para Render/Supabase:
  - `render.yaml`
  - `scripts/verify-render-db.mjs`
- No projeto `crm/`, reforco de QA contra recursos remotos carregaveis em entradas de usuario.
- Esta branch nao executa cutover de banco; ela prepara e valida.

## Mudancas no CRM

- Smoke de API passou a testar negativos anti-tracker em:
  - follow-ups de leads;
  - estoque;
  - custos de veiculo;
  - itens de servico;
  - custos de servico;
  - templates de documento;
  - templates de mensagem;
  - observacoes de contador.
- `docs/qa-runs.md` registra as rodadas de QA da trilha anti-tracker.
- A rotina diaria automatica passou completa apos os novos negativos.

## Validacoes Executadas

- `npm run test:smoke:auth`
- `npm run test:unit`
- `npm run typecheck`
- `npm run qa:daily:auto:local`

Resultado da rotina diaria:

- `typecheck`: passou
- `build:api`: passou
- `build:web`: passou
- `qa:commercial:local`: passou
- `qa:customer-history-preferences:local`: passou
- `qa:lead-history:local`: passou
- `qa:profile-preferences:local`: passou
- `qa:visual:local`: passou

## Pontos de Atencao

- A branch contem um commit de infraestrutura fora de `crm/` e commits de seguranca/QA dentro de `crm/`.
- A API local existente em `http://localhost:3333` foi reutilizada durante o `qa:daily:auto:local`.
- O Web temporario foi iniciado em `http://localhost:3001` e encerrado ao final do QA.
- Antes do merge, revisar se o PR deve entrar como uma unica entrega ou ser separado em:
  - preparacao Render/Supabase;
  - reforco anti-tracker do CRM.
