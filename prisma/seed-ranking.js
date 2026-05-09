/**
 * seed-ranking.js
 * Gera dados demonstrativos de atendentes para o Ranking de Atendentes do PostoCash.
 * Uso: node prisma/seed-ranking.js
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { randomUUID }   = require('crypto');

const prisma = new PrismaClient();

// ── Configuração dos atendentes ───────────────────────────────────────────────

const ATTENDANTS = [
  { name: 'JUNIOR',   code: '27', txCount: 156, recentBias: 0.65 }, // tendência: alta
  { name: 'MARIA',    code: '15', txCount: 98,  recentBias: 0.50 }, // tendência: estável
  { name: 'CARLOS',   code: '08', txCount: 87,  recentBias: 0.57 }, // tendência: alta
  { name: 'PATRICIA', code: '33', txCount: 76,  recentBias: 0.50 }, // tendência: estável
  { name: 'ROBERTO',  code: '42', txCount: 54,  recentBias: 0.38 }, // tendência: queda
  { name: 'AMANDA',   code: '19', txCount: 43,  recentBias: 0.48 }, // tendência: estável
  { name: 'PAULO',    code: '55', txCount: 18,  recentBias: 0.28 }, // abaixo da média, queda
  { name: 'FERNANDA', code: '11', txCount: 12,  recentBias: 0.25 }, // abaixo da média, queda
];

// ── Tipos de combustível com pesos e faixa de preço reais ────────────────────

const FUEL_TYPES = [
  { type: 'gasolina',           label: 'Gasolina Comum',    priceMin: 5.80, priceMax: 6.20, weight: 50 },
  { type: 'etanol',             label: 'Etanol',            priceMin: 3.80, priceMax: 4.50, weight: 25 },
  { type: 'gasolina_aditivada', label: 'Gasolina Aditivada',priceMin: 6.20, priceMax: 7.00, weight: 15 },
  { type: 'diesel',             label: 'Diesel',            priceMin: 5.50, priceMax: 6.00, weight: 10 },
];

const FUEL_WEIGHT_TOTAL = FUEL_TYPES.reduce((s, f) => s + f.weight, 0);

// ── Helpers ───────────────────────────────────────────────────────────────────

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(randFloat(min, max + 1));
}

function pickFuelType() {
  let r = Math.random() * FUEL_WEIGHT_TOTAL;
  for (const f of FUEL_TYPES) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return FUEL_TYPES[0];
}

/**
 * Gera uma data aleatória dentro de 90 dias atrás.
 * recentBias = probabilidade de cair nos últimos 45 dias (simula tendência)
 */
function randDate(recentBias) {
  const now   = Date.now();
  const MS_45 = 45 * 24 * 60 * 60 * 1000;

  const msAgo = Math.random() < recentBias
    ? Math.random() * MS_45               // últimos 45 dias
    : MS_45 + Math.random() * MS_45;      // 45–90 dias atrás

  const d = new Date(now - msAgo);
  d.setHours(randInt(6, 21), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

// ── Barras de progresso para o console ───────────────────────────────────────

function progressBar(count, max, width = 20) {
  const filled = Math.round((count / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ── Script principal ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  🌱 PostoCash — Seed de Atendentes (Ranking)  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // ── Busca estabelecimento ─────────────────────────────────────────────────
  const establishment = await prisma.establishment.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!establishment) {
    console.error('❌ Nenhum estabelecimento encontrado no banco.');
    console.error('   Execute o cadastro de estabelecimento antes de rodar este seed.');
    process.exit(1);
  }
  console.log(`🏪 Estabelecimento : ${establishment.name}`);
  console.log(`   ID              : ${establishment.id}`);

  // ── Busca operador ────────────────────────────────────────────────────────
  const operator = await prisma.operator.findFirst({
    where: { establishmentId: establishment.id },
    orderBy: { createdAt: 'asc' },
  });
  if (!operator) {
    console.error(`\n❌ Nenhum operador encontrado para o estabelecimento "${establishment.name}".`);
    process.exit(1);
  }
  console.log(`👤 Operador        : ${operator.name} (${operator.role})`);

  // ── Busca clientes ────────────────────────────────────────────────────────
  const customers = await prisma.customer.findMany({
    where:  { establishmentId: establishment.id },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!customers.length) {
    console.error('\n❌ Nenhum cliente encontrado para este estabelecimento.');
    console.error('   Cadastre ao menos um cliente antes de rodar este seed.');
    process.exit(1);
  }
  console.log(`👥 Clientes        : ${customers.length} disponíveis para distribuição`);

  // ── Verifica dados de seed existentes ─────────────────────────────────────
  const existing = await prisma.transaction.count({
    where: { source: 'SEED', establishmentId: establishment.id },
  });
  if (existing > 0) {
    console.log(`\n⚠️  Atenção: já existem ${existing} transações de seed neste estabelecimento.`);
    console.log('   Continuando irá adicionar mais dados sobre os existentes.\n');
  } else {
    console.log('');
  }

  // ── Geração das transações ────────────────────────────────────────────────
  const CASHBACK_PCT  = 5;
  const maxCount      = Math.max(...ATTENDANTS.map((a) => a.txCount));
  const now           = new Date();
  const start90       = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  console.log('📊 Gerando transações:\n');

  let totalCreated = 0;
  const summary    = [];

  for (const att of ATTENDANTS) {
    const attendantName = `${att.code}-${att.name}`;
    const txData        = [];

    for (let i = 0; i < att.txCount; i++) {
      const customer       = customers[i % customers.length];
      const amount         = round2(randFloat(80, 500));
      const fuel           = pickFuelType();
      const pricePerLiter  = randFloat(fuel.priceMin, fuel.priceMax);
      const liters         = round3(amount / pricePerLiter);
      const cashbackValue  = round2(amount * CASHBACK_PCT / 100);
      const createdAt      = randDate(att.recentBias);

      txData.push({
        id:              randomUUID(),
        customerId:      customer.id,
        operatorId:      operator.id,
        establishmentId: establishment.id,
        amount,
        cashbackPercent: CASHBACK_PCT,
        cashbackValue,
        receiptCode:     `SEED-${att.code}-${randomUUID()}`,
        fuelType:        fuel.type,
        liters,
        source:          'SEED',
        status:          'CONFIRMED',
        attendantName,
        createdAt,
      });
    }

    await prisma.transaction.createMany({ data: txData, skipDuplicates: true });
    totalCreated += att.txCount;

    const bar = progressBar(att.txCount, maxCount);
    console.log(
      `  ${attendantName.padEnd(12)} ${bar} ${String(att.txCount).padStart(3)} transações`
    );

    summary.push({ raw: attendantName, name: att.name, code: att.code, count: att.txCount });
  }

  // ── Relatório final ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║               📦 RESUMO FINAL               ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Total de transações criadas : ${String(totalCreated).padStart(4)}          ║`);
  console.log(`║  Período coberto             : 90 dias      ║`);
  console.log(`║  Início                      : ${start90.toLocaleDateString('pt-BR').padEnd(12)} ║`);
  console.log(`║  Fim                         : ${now.toLocaleDateString('pt-BR').padEnd(12)} ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  ATENDENTE       CÓD   TRANSAÇÕES           ║');
  console.log('╠══════════════════════════════════════════════╣');
  for (const s of summary) {
    const line = `║  ${s.name.padEnd(16)} ${s.code.padEnd(6)} ${String(s.count).padStart(3)}`;
    console.log(line.padEnd(46) + '  ║');
  }
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n✨ Seed de atendentes concluído com sucesso!\n');
  console.log('💡 Acesse /ranking no painel para visualizar os dados.\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Erro durante o seed:', err.message);
    if (err.code === 'P2002') {
      console.error('   Código de recibo duplicado — tente rodar novamente.');
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
