# Render DB cutover runbook

## Objetivo

Orientar o merge, deploy e verificacao da troca do banco do Render para Supabase externo, sem commitar credenciais.

## Pre-requisitos

- PR `chore/render-db-cutover-prep` revisado e aprovado.
- Usuario de teste existente no banco alvo.
- Atendente esperado existente no banco alvo.
- Valores reais guardados fora do repositorio:
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `CHECK_EMAIL`
  - `CHECK_PASSWORD`
  - `CHECK_ATTENDANT`

## Antes do Merge

- Confirmar que o PR nao executa migracao nem cutover sozinho.
- Confirmar que `render.yaml` usa `sync: false` em `DATABASE_URL` e `DIRECT_URL`.
- Confirmar que `scripts/verify-render-db.mjs` nao possui credenciais padrao.
- Conferir se a entrega ficara em um PR unico ou sera separada entre infraestrutura e CRM.

## Merge

1. Abrir o PR:

```text
https://github.com/Giancarlolucca-SP/prt-cashback/compare/main...chore/render-db-cutover-prep?expand=1
```

2. Usar o corpo salvo em:

```text
crm/docs/pr-body-render-db-cutover-prep.md
```

3. Aguardar os checks do GitHub.
4. Fazer merge apenas se os checks estiverem verdes.

## Configuracao no Render

No dashboard do Render, configurar manualmente:

- `DATABASE_URL`: connection string pooler/runtime do Supabase.
- `DIRECT_URL`: connection string direta para migrations.

Nao colocar esses valores em arquivos do repositorio.

## Verificacao Pos-Deploy

Depois do deploy do Render ficar ativo:

```sh
CHECK_EMAIL=<email-de-teste> CHECK_PASSWORD=<senha-de-teste> CHECK_ATTENDANT=<nome-atendente> npm run verify:render-db
```

Resultado esperado:

- Login `200`.
- `GET /attendants` `200`.
- Atendente esperado encontrado.

## Criterios de Sucesso

- API do Render responde `/health`.
- Login de teste autentica no banco esperado.
- Atendente esperado aparece na API.
- Fluxos criticos do CRM seguem funcionando apos deploy.

## Rollback

Se o deploy falhar:

1. Reverter no Render os valores de `DATABASE_URL` e `DIRECT_URL` para o banco anterior.
2. Fazer redeploy do servico.
3. Validar `/health`.
4. Reexecutar a verificacao com credenciais do banco anterior.
5. Registrar o incidente e nao prosseguir com cutover ate entender a causa.

## Alertas

- Nao executar migracoes contra o banco errado.
- Nao commitar credenciais reais.
- Nao usar usuario pessoal para verificacao automatizada.
- Nao seguir se a verificacao pos-deploy retornar `401` ou `500`.
