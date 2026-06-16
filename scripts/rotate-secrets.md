# Rotação de segredos — runbook (PostoCash)

> **NÃO executar antes do deploy confirmado.** Ordem combinada:
> backup → DIRECT_URL → PR/merge (deploy) → conferir prod → **rotação (aqui)**.
> Fonte única de banco = Supabase (`jjzbqkrxvrrkszwajhqb`, us-east-2). Produção (Render) usa o mesmo.

Segredos que vazaram em texto puro durante o desenvolvimento e devem ser girados:

| Segredo | Onde vive | Prioridade |
|--------|-----------|------------|
| Senha do banco Supabase (em `DATABASE_URL`/`DIRECT_URL`) | Supabase, `.env` local, env do Render | **ALTA** |
| `JWT_SECRET` | `.env` local, env do Render | **ALTA** |
| `AGENT_TOKEN` (agente ↔ backend) | env do backend, `pista-agent/.env` | Média (trocado no setup do agente do posto) |
| Senhas de login `admin@autoposto.com` / `frentista@autoposto.com` | tabela Operator (bcrypt) | Média |

Gere valores novos fortes com: `node scripts/gen-secrets.mjs` (só imprime; não aplica).

---

## 1. Senha do banco Supabase  ⚠️ janela coordenada (downtime curto)
Resetar a senha invalida a antiga **na hora** → atualizar local **e** Render quase juntos.

1. Supabase → **Settings → Database → Reset database password** → copie a nova.
2. Monte as duas strings com a nova senha:
   - `DATABASE_URL` = `...@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - `DIRECT_URL`   = `...@aws-1-us-east-2.pooler.supabase.com:5432/postgres`
3. **Render** → `postocash-api` → Environment → atualizar `DATABASE_URL` e `DIRECT_URL` → salvar (redeploya/reconecta).
4. **Local**: atualizar `.env` (linhas `DATABASE_URL` e `DIRECT_URL`).
5. Validar: `node scripts/verify-render-db.mjs` (login 200) e local `npx prisma migrate status`.
   - Obs.: o agente do posto NÃO usa o banco direto (fala só com a API), então não precisa dessa senha.

## 2. `JWT_SECRET`  (invalida sessões → todos relogam)
1. Gerar novo (`gen-secrets.mjs`).
2. **Render** → Environment → `JWT_SECRET` = novo → salvar (redeploy).
   - (No `render.yaml` está `generateValue:true`; ao setar manualmente, passa a ser o valor fixo do dashboard.)
3. **Local**: `.env` → `JWT_SECRET` = novo.
4. Fazer login de novo em prod e local pra confirmar.

## 3. `AGENT_TOKEN`
- Como o agente real do posto ainda não foi instalado, o token antigo já é descartável.
1. Gerar novo (`gen-secrets.mjs`).
2. **Backend** (Render + `.env` local) → `AGENT_TOKEN` = novo.
3. No setup do agente no posto, usar o novo em `pista-agent/.env` (`AGENT_TOKEN=`).
4. Testar ingestão: `POST /pista/abastecimentos` com o token novo (200/201); com o antigo deve dar 401.

## 4. Senhas de login (Operator)
- Trocar via script já existente:
  `node prisma/reset-operator-password.js <email> <novaSenha>`
  (rodar para `admin@autoposto.com` e `frentista@autoposto.com`).
- Atualizar onde estiverem anotadas. Não commitar senhas.

---

### Pós-rotação — verificação final
- [ ] `verify-render-db.mjs` → login 200 em prod.
- [ ] Login admin + operador no frontend de produção.
- [ ] `/pista/dashboard` em prod retorna dados.
- [ ] Ingestão do agente com token novo OK (quando o agente do posto subir).
- [ ] Nenhuma string de segredo antiga em `.env`/Render/anotações.
