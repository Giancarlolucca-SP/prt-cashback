# Checklist de QA Funcional - GT3 CRM MVP

Use este roteiro depois de `npm run db:seed`, com API e Web rodando localmente.

## Preparacao

```powershell
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
npm run smoke:local
npm run qa:functional:local
npm run qa:commercial:local
npm run qa:administrative:local
npm run qa:vehicles:local
npm run qa:services:local
npm run qa:management:local
npm run qa:visual:local
```

Atalho equivalente para a regressao operacional completa:

```powershell
npm run qa:regression:local
```

URLs padrao:

- Web: `http://localhost:3000`
- API: `http://localhost:3333`

Senha dev para todos os perfis:

- `Gt3@2026dev`

## Perfis Dev

| Perfil | E-mail | Foco do QA |
| --- | --- | --- |
| Dono/Gestor | `dono@gt3.local` | Visao completa, financeiro, resultados, auditoria e configuracoes. |
| Admin | `admin@gt3.local` | Operacao ampla sem foco exclusivo de dono. |
| Administrativo | `administrativo@gt3.local` | Cadastros, agenda, vendas, documentos, financeiro operacional e fornecedores. |
| Vendedor | `vendedor@gt3.local` | Leads, clientes, agenda, vendas e comissoes proprias. |
| SDR | `sdr@gt3.local` | Leads, clientes, conversas e agendamentos. |
| Avaliador | `avaliador@gt3.local` | Compras, avaliacoes, estoque e historico operacional. |
| Servicos | `servicos@gt3.local` | Servicos, pos-venda, prestadores, agenda e documentos. |

## Smoke Visual Obrigatorio

Com `dono@gt3.local`:

- Acessar `/preview` e confirmar que os grupos e cards aparecem.
- Abrir pelo menos uma tela por grupo: `/resultados`, `/leads`, `/estoque`, `/administrativo`, `/configuracoes`.
- Confirmar que indicadores carregam dados da massa demo, nao apenas estados vazios.
- Confirmar que botoes e filtros nao quebram layout em desktop.
- Alternar tema claro/escuro pelo controle visual.

## Fluxos Funcionais

### Comercial

- Login como `vendedor@gt3.local`.
- Abrir `/leads`, criar ou mover um lead quando permitido.
- Abrir `/clientes`, criar cliente simples.
- Abrir `/agendamentos`, criar agendamento vinculado a cliente.
- Abrir `/vendas`, criar venda em rascunho com cliente.
- Confirmar que menus financeiros sensiveis nao aparecem ou ficam bloqueados para Vendedor.

### Administrativo

- Login como `administrativo@gt3.local`.
- Abrir `/administrativo`.
- Criar cliente pelo atalho rapido.
- Criar agendamento pelo atalho rapido.
- Criar venda de repasse pelo atalho rapido.
- Inserir fornecedor/prestador.
- Confirmar que a fila de triagem reflete vendas sem vendedor, OS com pendencia e contratos sem assinatura.

### Veiculos

- Login como `avaliador@gt3.local`.
- Abrir `/compras` e `/avaliacoes`.
- Criar oportunidade de compra ou avaliacao quando permitido.
- Abrir `/estoque` e confirmar separacao entre proprio, consignado e repasse.
- Confirmar que dados financeiros sensiveis aparecem apenas quando a permissao permitir.

### Servicos e Pos-venda

- Login como `servicos@gt3.local`.
- Abrir `/servicos`, criar OS e mudar status.
- Abrir `/fornecedores`, confirmar prestadores e credenciais mascaradas.
- Abrir `/pos-venda`, criar cliente de pos-venda e agendamento/OS.
- Confirmar que catalogo e prestadores aparecem com dados seed.

### Gestao

- Login como `dono@gt3.local`.
- Abrir `/resultados`, validar DRE, fluxo e balanco gerencial.
- Abrir `/financeiro`, criar lancamento e conferir impacto em resumo.
- Abrir `/auditoria`, confirmar logs recentes.
- Abrir `/configuracoes`, confirmar usuarios, regras e parametros.
- Executar `npm run qa:management:local` para validar resultados, financeiro, auditoria, configuracoes, usuarios e revogacao de sessao por alteracao sensivel.

## RBAC e Dados Sensiveis

Validar pelo menos:

- Vendedor nao deve acessar financeiro global.
- SDR nao deve acessar estoque gerencial, vendas sensiveis ou financeiro.
- Avaliador deve acessar compras/avaliacoes, mas nao auditoria global.
- Servicos deve acessar OS/pos-venda, mas nao resultado financeiro global.
- Dono/Gestor deve acessar financeiro, resultados, auditoria e configuracoes.
- Credenciais de fornecedores devem mostrar referencia/mascara, nunca segredo em claro.

## Regressao de UI

Em cada tela principal:

- Sem texto sobreposto.
- Sem cards estourando largura.
- Menu lateral rolavel quando houver muitos itens.
- Estados vazios, fallback ou bloqueio por permissao com mensagem compreensivel.
- Modais fecham com botao de fechar/cancelar.
- Inputs obrigatorios exibem erro do navegador ou erro da API.

## Fechamento

Antes de considerar QA local aprovado:

```powershell
npm run smoke:local
npm run qa:functional:local
npm run qa:commercial:local
npm run qa:administrative:local
npm run qa:vehicles:local
npm run qa:services:local
npm run qa:management:local
npm run qa:visual:local
npm test
npm run typecheck
npm run build:api
npm run build:web
```

Ou, com API e Web ja rodando:

```powershell
npm run qa:local
```

Registrar no artefato da sprint:

- data da rodada;
- perfil usado;
- fluxos testados;
- erros encontrados;
- validacoes automatizadas executadas.
