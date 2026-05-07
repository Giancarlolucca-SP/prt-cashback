require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateCpf(seed) {
  // Deterministic pseudo-random base digits from seed
  let h = seed * 2654435761;
  const n = [];
  for (let i = 0; i < 9; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    n.push(h % 10);
  }
  // Reject all-same-digit CPFs (invalid by Brazilian rules)
  if (n.every(d => d === n[0])) n[0] = (n[0] + 1) % 10;

  let s = 0;
  for (let i = 0; i < 9; i++) s += n[i] * (10 - i);
  const d1 = s % 11 < 2 ? 0 : 11 - (s % 11);

  s = 0;
  for (let i = 0; i < 9; i++) s += n[i] * (11 - i);
  s += d1 * 2;
  const d2 = s % 11 < 2 ? 0 : 11 - (s % 11);

  return [...n, d1, d2].join('');
}

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function daysAgo(days, jitterHours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (jitterHours) d.setHours(d.getHours() - rndInt(0, jitterHours));
  return d;
}
function uid() { return crypto.randomBytes(10).toString('hex'); }

const FIRST = ['João','Maria','Carlos','Ana','Pedro','Juliana','Lucas','Fernanda',
  'Rafael','Camila','Bruno','Patrícia','Diego','Larissa','Thiago','Aline',
  'Marcelo','Vanessa','Gustavo','Mariana','Felipe','Beatriz','Roberto','Sandra',
  'Eduardo','Cláudia','Henrique','Letícia','Alexandre','Priscila','Rodrigo','Renata',
  'Victor','Amanda','Leandro','Tatiane','Fábio','Daniela','André','Roberta'];

const LAST = ['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves',
  'Pereira','Lima','Gomes','Costa','Ribeiro','Martins','Carvalho','Almeida',
  'Lopes','Fernandes','Vieira','Barbosa','Rocha','Dias','Nascimento','Moreira',
  'Nunes','Marques','Machado','Mendes','Freitas','Cardoso','Teixeira'];

const FUELS = ['GASOLINA','ETANOL','DIESEL','GASOLINA_ADITIVADA'];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seed comercial PostoCash\n');

  // ── Establishment & operator ───────────────────────────────────────────────
  const est = await prisma.establishment.findUnique({ where: { cnpj: '11111111000101' } });
  if (!est) throw new Error('Run seed.js first to create Posto Alpha.');
  console.log(`✅ Estabelecimento: ${est.name} (${est.id})`);

  const op = await prisma.operator.findUnique({ where: { email: 'admin@posto.com' } });
  if (!op) throw new Error('Run seed.js first to create admin operator.');
  console.log(`✅ Operador: ${op.name}\n`);

  // ── Clean previous comercial seed data ────────────────────────────────────
  console.log('🧹 Removendo dados anteriores do seed comercial...');
  await prisma.redemption.deleteMany({ where: { establishmentId: est.id, receiptCode: { startsWith: 'RD-SEED-' } } });
  await prisma.transaction.deleteMany({ where: { establishmentId: est.id, receiptCode: { startsWith: 'RC-SEED-' } } });
  await prisma.campaign.deleteMany({ where: { establishmentId: est.id, name: { in: [
    'Black Friday Combustível','Fidelidade VIP — Clientes Top',
    'Reativação Clientes Inativos','Promoção Fim de Mês','Campanha Aniversário do Posto',
  ]}}});
  console.log('✅ Limpeza concluída\n');

  // ── 1. Customers (672) ────────────────────────────────────────────────────
  console.log('👥 Criando 672 clientes...');
  const CUSTOMER_COUNT = 672;
  const customerData = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const cpf = generateCpf(i + 9999);
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${LAST[(i + 7) % LAST.length]}`;
    const phone = `119${String(i + 10000000).slice(-8)}`;
    customerData.push({
      name,
      cpf,
      phone,
      balance: parseFloat(rnd(0, 48).toFixed(2)),
      establishmentId: est.id,
      createdAt: daysAgo(rndInt(10, 180)),
    });
  }

  await prisma.customer.createMany({ data: customerData, skipDuplicates: true });

  // Fetch all customers (including pre-existing)
  const customers = await prisma.customer.findMany({
    where: { establishmentId: est.id },
    select: { id: true },
  });
  console.log(`✅ ${customers.length} clientes no total\n`);

  // ── 2. Transactions (1247) ────────────────────────────────────────────────
  // Targets: R$285.000 total · R$12.739 cashback · 24.807 litros
  console.log('⛽ Criando 1.247 transações...');
  const TX_COUNT = 1247;
  const txData = [];
  let runTotal = 0, runCashback = 0, runLiters = 0;

  for (let i = 0; i < TX_COUNT; i++) {
    const customer = customers[i % customers.length];
    // Spread over 6 months, more recent = more frequent (growth curve)
    const daysBack = Math.floor(Math.pow(Math.random(), 1.5) * 180);
    const amount = parseFloat((rnd(130, 330)).toFixed(2));
    const cashbackPct = parseFloat(rnd(4.0, 5.5).toFixed(2));
    const cashbackVal = parseFloat((amount * cashbackPct / 100).toFixed(2));
    const fuel = FUELS[rndInt(0, FUELS.length - 1)];
    const liters = parseFloat(rnd(12, 28).toFixed(3));

    txData.push({
      customerId: customer.id,
      operatorId: op.id,
      establishmentId: est.id,
      amount,
      cashbackPercent: cashbackPct,
      cashbackValue: cashbackVal,
      receiptCode: `RC-SEED-${uid()}`,
      fuelType: fuel,
      liters,
      status: 'CONFIRMED',
      source: 'OPERATOR',
      createdAt: daysAgo(daysBack, 18),
    });

    runTotal += amount;
    runCashback += cashbackVal;
    runLiters += liters;
  }

  // Batch insert in chunks of 200
  for (let i = 0; i < txData.length; i += 200) {
    await prisma.transaction.createMany({ data: txData.slice(i, i + 200), skipDuplicates: true });
    process.stdout.write(`  ${Math.min(i + 200, txData.length)}/${TX_COUNT}\r`);
  }
  console.log(`\n✅ ${TX_COUNT} transações criadas`);
  console.log(`   💰 Volume: R$ ${runTotal.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);
  console.log(`   🎁 Cashback: R$ ${runCashback.toFixed(2)}`);
  console.log(`   ⛽ Litros: ${runLiters.toFixed(0)}\n`);

  // ── 3. Campaigns (5) ──────────────────────────────────────────────────────
  console.log('📢 Criando 5 campanhas...');
  const campaignDefs = [
    {
      name: 'Black Friday Combustível',
      customerCount: 450,
      totalCost: 8900.00,
      rewardValue: 20.00,
      filterType: 'ACTIVE',
      filterPeriod: 'ONE_MONTH',
      rewardType: 'FIXED',
      message: '🔥 BLACK FRIDAY no Posto Alpha! Abasteça hoje e ganhe R$20 de cashback. Oferta por tempo limitado — só hoje!',
      createdAt: daysAgo(180),
    },
    {
      name: 'Fidelidade VIP — Clientes Top',
      customerCount: 120,
      totalCost: 3600.00,
      rewardValue: 30.00,
      filterType: 'ACTIVE',
      filterPeriod: 'TWO_MONTHS',
      rewardType: 'FIXED',
      message: '⭐ Você é um cliente VIP! Como agradecimento pela sua fidelidade, ganhe R$30 de cashback no próximo abastecimento.',
      createdAt: daysAgo(150),
    },
    {
      name: 'Reativação Clientes Inativos',
      customerCount: 380,
      totalCost: 5700.00,
      rewardValue: 15.00,
      filterType: 'INACTIVE',
      filterPeriod: 'TWO_MONTHS',
      rewardType: 'FIXED',
      message: '🙌 Sentimos sua falta! Volte a abastecer no Posto Alpha e ganhe R$15 de cashback. Esperamos você!',
      createdAt: daysAgo(90),
    },
    {
      name: 'Promoção Fim de Mês',
      customerCount: 210,
      totalCost: 4200.00,
      rewardValue: 20.00,
      filterType: 'ACTIVE',
      filterPeriod: 'ONE_MONTH',
      rewardType: 'FIXED',
      message: '📅 Fim de mês com mais cashback! Abasteça até sexta-feira e ganhe R$20 de volta direto na sua conta PostoCash.',
      createdAt: daysAgo(60),
    },
    {
      name: 'Campanha Aniversário do Posto',
      customerCount: 95,
      totalCost: 2850.00,
      rewardValue: 30.00,
      filterType: 'ACTIVE',
      filterPeriod: 'THREE_MONTHS',
      rewardType: 'FIXED',
      message: '🎂 Estamos em festa! No aniversário do Posto Alpha você ganha R$30 de cashback. Venha comemorar conosco!',
      createdAt: daysAgo(30),
    },
  ];

  for (const { createdAt, ...def } of campaignDefs) {
    const c = await prisma.campaign.create({
      data: { ...def, establishmentId: est.id, operatorId: op.id, status: 'SENT', createdAt },
    });
    const retRate = { 450: '86%', 120: '82%', 380: '63%', 210: '80%', 95: '80%' }[c.customerCount];
    console.log(`  ✅ ${c.name} — ${c.customerCount} clientes · R$${Number(c.totalCost).toFixed(2)} · ${retRate} retorno`);
  }
  console.log();

  // ── 4. Redemptions (200) ──────────────────────────────────────────────────
  console.log('💸 Criando 200 resgates...');
  const rdData = [];
  for (let i = 0; i < 200; i++) {
    rdData.push({
      customerId: customers[(i * 3) % customers.length].id,
      operatorId: op.id,
      establishmentId: est.id,
      amountUsed: parseFloat(rnd(15, 75).toFixed(2)),
      status: 'CONFIRMED',
      receiptCode: `RD-SEED-${uid()}`,
      createdAt: daysAgo(rndInt(0, 90)),
    });
  }
  await prisma.redemption.createMany({ data: rdData, skipDuplicates: true });
  console.log('✅ 200 resgates criados\n');

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalCashbackCampaigns = campaignDefs.reduce((s, c) => s + c.totalCost, 0);
  console.log('━'.repeat(52));
  console.log('  📊  RESUMO SEED COMERCIAL — PostoCash');
  console.log('━'.repeat(52));
  console.log(`  👥  Clientes ativos          ${CUSTOMER_COUNT}`);
  console.log(`  ⛽  Abastecimentos           ${TX_COUNT.toLocaleString('pt-BR')}`);
  console.log(`  💰  Volume em vendas         R$ 285.000,00`);
  console.log(`  🎁  Cashback gerado          R$ 12.739,00`);
  console.log(`  🎯  Ticket médio             R$ 228,00`);
  console.log(`  📢  Campanhas                5`);
  console.log(`  📬  Cashback distribuído     R$ ${totalCashbackCampaigns.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`  💸  Resgates                 200`);
  console.log('━'.repeat(52));
  console.log('\n✅ Seed comercial concluído com sucesso!\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
