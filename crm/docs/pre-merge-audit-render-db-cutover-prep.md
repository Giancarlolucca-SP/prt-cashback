# Pre-merge audit: render db cutover prep

Branch: `chore/render-db-cutover-prep`

## Status

Pronto para abertura/revisao de PR. Nenhum cutover de banco foi executado nesta branch.

## Escopo Conferido

- `render.yaml`
- `scripts/verify-render-db.mjs`
- `package.json`
- `DEPLOY.md`
- `crm/tests/auth-api-smoke.ts`
- `crm/docs/qa-runs.md`
- `crm/docs/pr-render-db-cutover-prep.md`
- `crm/docs/pr-body-render-db-cutover-prep.md`

## Checks Executados

- `git diff --check main...HEAD -- render.yaml scripts/verify-render-db.mjs package.json DEPLOY.md crm`
- `node --check scripts/verify-render-db.mjs`
- Varredura por termos sensiveis em arquivos alterados do PR.

## Resultado

- Sem erro de whitespace no diff relevante.
- Script de verificacao pos-deploy sintaticamente valido.
- `render.yaml` usa `sync: false` para segredos e nao contem URL real de banco.
- `scripts/verify-render-db.mjs` exige `CHECK_EMAIL` e `CHECK_PASSWORD`; nao ha senha padrao commitada.
- Ocorrencias de senha encontradas na varredura sao placeholders de documentacao ou credenciais de teste dos smokes.

## Pendencias Antes do Merge

- Abrir PR no GitHub usando `crm/docs/pr-body-render-db-cutover-prep.md`.
- Decidir se a entrega fica em um PR unico ou se sera dividida em:
  - preparacao Render/Supabase;
  - reforco anti-tracker do CRM.
- Configurar `DATABASE_URL` e `DIRECT_URL` reais apenas no dashboard do Render, depois do merge/aprovacao.
