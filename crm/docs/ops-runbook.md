# Runbook Operacional: Ambientes, Backup e Observabilidade

## Ambientes

- `development`: uso local do desenvolvedor.
- `staging` ou `homologacao`: validacao antes da producao.
- `production`: dados reais da loja.

Cada ambiente deve ter `.env` proprio, banco proprio, segredos proprios e chaves de integracao separadas.

## Healthchecks

- `GET /health`: confirma que a API responde.
- `GET /health/ready`: valida API, banco, storage configurado/adaptador dev e atencao de jobs.
- `GET /ops/summary`: visao protegida para Dono/Gestor/Admin autorizado com jobs, backups e alertas.

## Validacao Local

Fluxo recomendado apos clonar, migrar banco ou alterar contratos de API:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

`dev:check` verifica Web e API em conjunto. Ao iniciar apenas um servico, `dev:web` executa `dev:check:web` e `dev:api` executa `dev:check:api`, evitando bloqueio cruzado quando o outro servico ja esta rodando corretamente.

Com API e Web rodando, executar:

```powershell
npm run smoke:local
```

Para rodar a validacao tecnica completa e depois o smoke local:

```powershell
npm run qa:local
```

O smoke local valida login, sessao, endpoints principais da API e rotas navegaveis do menu. Por padrao usa:

- API: `http://localhost:3333`.
- Web: `http://localhost:3000`.
- Usuario: `dono@gt3.local`.
- Senha: `Gt3@2026dev`.

Variaveis opcionais para outros ambientes: `SMOKE_API_URL`, `SMOKE_WEB_URL`, `SMOKE_EMAIL` e `SMOKE_PASSWORD`.

## Backup PostgreSQL

Gerar backup:

```powershell
npm run db:backup
```

Por padrao o arquivo vai para `BACKUP_DIR` ou `backups/`.
No Windows, o script procura automaticamente `pg_dump` e `pg_restore` em `C:\Program Files\PostgreSQL\<versao>\bin`. Se o PostgreSQL estiver em outro caminho, configure `POSTGRES_BIN_DIR`.

Restaurar backup exige confirmacao explicita:

```powershell
$env:ALLOW_RESTORE="true"
$env:BACKUP_FILE="C:\caminho\crm-postgres-2026-06-05.dump"
npm run db:restore
```

Antes de restaurar em staging/producao, confirmar ambiente, arquivo, data do backup e impacto operacional.

## Logs e Alertas

- Audit logs registram responsabilidade e eventos sensiveis.
- Job logs registram falhas e tentativas de automacao.
- Backup status logs registram execucao, falha ou restore.
- Logs tecnicos nao devem conter senha, token, CPF completo ou conteudo de documento.
- Rate limit registra eventos de seguranca quando ha lockout ou limite excedido.
- Endpoints-isca de checagem de usuario registram eventos de seguranca e nunca confirmam existencia de conta.
- Falha de ownership/escopo em recurso especifico retorna `404`; `403` fica para bloqueio global de perfil/permissao.
- SQL deve usar Prisma Client com filtros estruturados. SQL raw so e permitido com tagged template parametrizado; `queryRawUnsafe`, `executeRawUnsafe` e `Prisma.raw` nao devem ser usados.
- Uploads aceitam somente buckets, MIME types e extensoes permitidas; extensoes executaveis ou nomes duplos perigosos sao bloqueados. O recurso vinculado deve existir e estar no escopo do usuario antes de persistir metadados.
- Antes de producao real, ativar verificacao de conteudo/magic bytes no upload binario e antivirus/quarentena antes de liberar download para documentos externos.

Perfis iniciais de rate limiting:

- `auth_login`: login, lockout de 15 minutos, limite configuravel por `RATE_LIMIT_AUTH_LOGIN_MAX`.
- `honeypot_probe`: falsas checagens de usuario, lockout de 60 minutos, limite configuravel por `RATE_LIMIT_HONEYPOT_MAX`.
- `webhook`: webhooks externos, lockout de 5 minutos, limite configuravel por `RATE_LIMIT_WEBHOOK_MAX`.
- `sensitive_endpoint`: users, settings, finance, files, jobs, ops, audit e compliance, lockout de 10 minutos, limite configuravel por `RATE_LIMIT_SENSITIVE_MAX`.
- `default`: demais rotas, lockout curto de 1 minuto, limite configuravel por `RATE_LIMIT_DEFAULT_MAX`.

Alertas minimos:

- API indisponivel.
- Banco indisponivel.
- Jobs falhos nas ultimas 24h.
- Jobs presos em execucao por mais de 15 minutos.
- Backup falho nos ultimos 7 dias.
- Storage ou integracao critica sem configuracao.
- Eventos repetidos de `rate_limit`.
- Eventos de `honeypot_user_enumeration_probe`.

## Deploy Seguro

Checklist antes de producao:

- `npm test`
- `npm run typecheck`
- `npm run build:api`
- `npm run build:web`
- `npm run smoke:local` em ambiente local/homologacao com API e Web rodando
- ou `npm run qa:local` quando API e Web ja estiverem disponiveis
- migrations validadas em homologacao
- `.env` revisado sem segredos no repositorio
- backup/restore testado
- RBAC basico validado com perfis reais
- novas senhas usando Argon2id
- login com resposta generica para e-mail inexistente, senha errada e usuario inativo/bloqueado
