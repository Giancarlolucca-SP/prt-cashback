/**
 * seed-ratings.js
 * Gera avaliações (ratings) fictícias de atendentes para testar a UI de Avaliações
 * do PostoCash. Usa os MESMOS atendentes/códigos e o MESMO estabelecimento do
 * seed-ranking.js, para que as avaliações casem com o ranking existente.
 *
 * Uso:
 *   node prisma/seed-ratings.js            → cria ~40 avaliações demo
 *   node prisma/seed-ratings.js --clear    → remove SOMENTE as avaliações demo criadas aqui
 *
 * As linhas demo são identificadas pelo prefixo de id "seed-rating-", então o
 * --clear nunca toca em avaliações reais.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

// Conexão direta (porta 5432) — evita o erro do pooler pgBouncer da Supabase
// ("prepared statement already exists") em scripts pontuais de manutenção.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const ID_PREFIX = 'seed-rating-';
const TOTAL_RATINGS = 40;

// ── Mesmos atendentes do seed-ranking.js (name + code) ────────────────────────
const ATTENDANTS = [
  { name: 'JUNIOR',   code: '27' },
  { name: 'MARIA',    code: '15' },
  { name: 'CARLOS',   code: '08' },
  { name: 'PATRICIA', code: '33' },
  { name: 'ROBERTO',  code: '42' },
  { name: 'AMANDA',   code: '19' },
  { name: 'PAULO',    code: '55' },
  { name: 'FERNANDA', code: '11' },
];

// ── Pools de comentários naturais por faixa de nota ───────────────────────────
const COMMENTS = {
  high: [
    'Atendimento rápido e educado!',
    'Frentista muito atencioso, encheu certinho.',
    'Excelente, sempre sou bem atendido aqui.',
    'Muito simpático e ágil, recomendo!',
    'Serviço impecável, conferiu tudo direitinho.',
  ],
  mid: [
    'Demorou um pouco mas foi gentil.',
    'Atendimento ok, nada de especial.',
    'Razoável, poderia ser mais rápido.',
  ],
  low: [
    'Não conferiu o valor na bomba, fiquei na dúvida.',
    'Demorou demais para me atender.',
    'Pouco atencioso, mal me cumprimentou.',
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pick(arr)         { return arr[Math.floor(Math.random() * arr.length)]; }

// Distribuição de estrelas: maioria 4–5, algumas 3, poucas 1–2
function pickStars() {
  const r = Math.random();
  if (r < 0.45) return 5;
  if (r < 0.75) return 4;
  if (r < 0.88) return 3;
  if (r < 0.95) return 2;
  return 1;
}

// Data aleatória nos últimos 60 dias
function randDateLast60() {
  const now = Date.now();
  const msAgo = Math.random() * 60 * 24 * 60 * 60 * 1000;
  const d = new Date(now - msAgo);
  d.setHours(randInt(7, 21), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

// Comentário para a nota (≈50% das avaliações ficam sem comentário → null)
function pickComment(stars) {
  if (Math.random() < 0.5) return null;
  if (stars >= 4) return pick(COMMENTS.high);
  if (stars === 3) return pick(COMMENTS.mid);
  return pick(COMMENTS.low);
}

// ── Modo --clear ──────────────────────────────────────────────────────────────
async function clearDemo() {
  console.log('\n[SEED-RATINGS] Removendo avaliações demo (id começa com "%s")...', ID_PREFIX);
  const { count } = await prisma.attendantRating.deleteMany({
    where: { id: { startsWith: ID_PREFIX } },
  });
  console.log(`[OK] ${count} avaliação(ões) demo removida(s).\n`);
}

// ── Modo seed ─────────────────────────────────────────────────────────────────
async function seed() {
  // Mesmo estabelecimento do seed-ranking.js (o mais antigo)
  const establishment = await prisma.establishment.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!establishment) {
    console.error('[ERRO] Nenhum estabelecimento encontrado. Cadastre um antes de rodar o seed.');
    process.exit(1);
  }

  const customers = await prisma.customer.findMany({
    where:  { establishmentId: establishment.id },
    select: { id: true },
  });
  if (!customers.length) {
    console.error('[ERRO] Nenhum cliente encontrado para este estabelecimento. Cadastre ao menos um.');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  [SEED] PostoCash — Avaliações demo de atendentes  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`Estabelecimento : ${establishment.name} (${establishment.id})`);
  console.log(`Clientes        : ${customers.length} disponíveis`);
  console.log(`Avaliações      : gerando ${TOTAL_RATINGS}...\n`);

  const rows = [];
  for (let i = 0; i < TOTAL_RATINGS; i++) {
    const att      = pick(ATTENDANTS);
    const customer = pick(customers);
    const stars    = pickStars();
    rows.push({
      id:              `${ID_PREFIX}${randomUUID()}`,
      stars,
      comment:         pickComment(stars),
      attendantName:   `${att.code}-${att.name}`, // mesma chave do ranking
      customerId:      customer.id,
      transactionId:   null,                       // demo: sem vínculo de transação
      establishmentId: establishment.id,
      createdAt:       randDateLast60(),
    });
  }

  await prisma.attendantRating.createMany({ data: rows });

  // ── Resumo: média de estrelas por atendente ─────────────────────────────────
  const byAtt = new Map();
  for (const r of rows) {
    if (!byAtt.has(r.attendantName)) byAtt.set(r.attendantName, { sum: 0, count: 0 });
    const a = byAtt.get(r.attendantName);
    a.sum += r.stars; a.count += 1;
  }

  console.log(`[OK] ${rows.length} avaliações criadas.\n`);
  console.log('Média de estrelas por atendente:');
  console.log('─'.repeat(46));
  Array.from(byAtt.entries())
    .sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count))
    .forEach(([name, a]) => {
      const avg = (a.sum / a.count).toFixed(1);
      console.log(`  ${name.padEnd(14)} ⭐ ${avg}  (${String(a.count).padStart(2)} avaliações)`);
    });
  console.log('─'.repeat(46));
  const totalStars = rows.reduce((s, r) => s + r.stars, 0);
  console.log(`  GERAL          ⭐ ${(totalStars / rows.length).toFixed(1)}  (${rows.length} avaliações)\n`);
  console.log('Para remover esta massa de teste depois:');
  console.log('  node prisma/seed-ratings.js --clear\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────
const isClear = process.argv.includes('--clear');

(isClear ? clearDemo() : seed())
  .catch((err) => {
    console.error('\n[ERRO] Falha no seed de avaliações:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
