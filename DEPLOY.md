# PostoCash — Guia de Deploy

## Visão Geral

| Componente | Plataforma | Custo |
|---|---|---|
| Backend API | Render (Free) | Grátis |
| Admin/Frontend | Vercel (Free) | Grátis |
| Landing Page | Vercel (Free) | Grátis |
| Banco de dados | Supabase (já configurado) | Grátis |
| App Android | Google Play | R$ 125 (taxa única) |
| Domínio | Registro.br | ~R$ 40/ano |

---

## 1. Backend — Render (Grátis)

### Pelo `render.yaml` (recomendado)
1. Acesse https://render.com e crie conta
2. **New → Blueprint** → conecte o repositório `Giancarlolucca-SP/prt-cashback`
3. O Render detecta o `render.yaml` automaticamente e cria o serviço

### Manual (alternativa)
1. **New → Web Service**
2. Conecte o repositório GitHub: `Giancarlolucca-SP/prt-cashback`
3. Configure:
   - **Root directory:** `.` (raiz)
   - **Environment:** `Node`
   - **Build command:** `npm install && npx prisma generate`
   - **Start command:** `node src/server.js`
4. Adicione as variáveis de ambiente (aba **Environment**):

```
NODE_ENV=production
DATABASE_URL=<string de conexão do Supabase>
JWT_SECRET=<string aleatória de 64 chars>
SUPABASE_URL=https://jjzbqkrxvrrkszwajhqb.supabase.co
SUPABASE_SERVICE_KEY=<sua service key>
SUPABASE_ANON_KEY=<sua anon key>
FRONTEND_URL=https://postocash.vercel.app
ZAPI_INSTANCE_ID=<seu instance id>
ZAPI_TOKEN=<seu token>
```

5. Deploy → URL gerada: `https://postocash-api.onrender.com`

> **Atenção:** No plano grátis o serviço hiberna após 15 min de inatividade.
> O primeiro request após hibernação pode demorar ~30 segundos.

---

## 2. Admin/Frontend — Vercel (Grátis)

1. Acesse https://vercel.com e crie conta
2. **Add New → Project** → importe `Giancarlolucca-SP/prt-cashback`
3. Configure:
   - **Root directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Adicione variável de ambiente:
   ```
   VITE_API_URL=https://postocash-api.onrender.com
   ```
5. Deploy → URL gerada: `https://postocash-admin.vercel.app` (ou similar)

---

## 3. Landing Page — Vercel (Grátis)

### Opção A — Mesmo projeto (monorepo)
No projeto Vercel existente, adicione um segundo deployment apontando para `landing/`.

### Opção B — Projeto separado (recomendado para domínio próprio)
1. **Add New → Project** → importe o mesmo repositório
2. Configure:
   - **Root directory:** `landing`
   - **Framework Preset:** Other
   - **Build command:** *(deixar vazio)*
   - **Output directory:** `.` (ponto)
3. Deploy → URL da landing page gerada

---

## 4. Domínio Personalizado (Registro.br)

1. Compre `postocash.com.br` em https://registro.br (~R$ 40/ano)
2. No painel Vercel do projeto da landing page:
   - **Settings → Domains → Add Domain**
   - Digite: `postocash.com.br` e `www.postocash.com.br`
3. Configure DNS no Registro.br:
   ```
   Tipo    Nome    Valor
   A       @       76.76.21.21
   CNAME   www     cname.vercel-dns.com
   ```
4. Para o admin: adicione `app.postocash.com.br` apontando para o projeto do frontend

---

## 5. App Android — Google Play

### Gerar o APK/AAB de produção
```bash
cd mobile
npx eas-cli build --platform android --profile production
```
- O EAS Build vai compilar na nuvem (grátis até certo limite)
- Download do `.aab` ao final

### Publicar no Google Play
1. Crie conta de desenvolvedor: https://play.google.com/console (~R$ 125 taxa única)
2. **Criar aplicativo → PostoCash**
3. Preencha ficha da loja (descrição, screenshots, ícone)
4. Em **Versões → Produção** → faça upload do `.aab`
5. Aguarde revisão do Google (geralmente 1–3 dias)

---

## 6. Variáveis de Ambiente — Resumo

### Backend (Render)
| Variável | Onde encontrar |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role key |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `JWT_SECRET` | Gere com: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ZAPI_INSTANCE_ID` | Painel Z-API |
| `ZAPI_TOKEN` | Painel Z-API |

### Frontend (Vercel)
| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://postocash-api.onrender.com` |

### Mobile (EAS Build — `eas.json`)
| Variável | Valor |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://postocash-api.onrender.com` |

---

## 7. Checklist de Deploy

- [ ] Backend deployado no Render e respondendo em `/health`
- [ ] Variáveis de ambiente configuradas no Render
- [ ] Frontend deployado no Vercel
- [ ] Landing page deployada no Vercel
- [ ] Domínio configurado no Registro.br + DNS propagado
- [ ] APK de produção gerado com EAS Build
- [ ] Conta Google Play criada
- [ ] App publicado na Google Play

---

## 8. Teste Pós-Deploy

```bash
# Backend health check
curl https://postocash-api.onrender.com/health

# Config pública (branding)
curl https://postocash-api.onrender.com/app/config
```

Acesse o admin em `https://postocash-admin.vercel.app` e faça login com as credenciais do operador cadastrado no banco.
