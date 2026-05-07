/**
 * seed-demo.js — Dados de demonstração para o PostoCash
 *
 * Usa o estabelecimento e operador já existentes no banco.
 * Garante balances consistentes com update: { balance } após limpeza.
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function receiptCode() {
  return 'TXN-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function daysAgo(n, hourOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() + hourOffset);
  return d;
}

async function main() {
  console.log('🌱 Iniciando seed de demonstração...\n');

  // ── Buscar base existente ─────────────────────────────────────────────────
  const estab = await prisma.establishment.findFirst();
  if (!estab) {
    console.error('❌ Nenhum estabelecimento encontrado no banco.');
    process.exit(1);
  }

  const op = await prisma.operator.findFirst();
  if (!op) {
    console.error('❌ Nenhum operador encontrado no banco.');
    process.exit(1);
  }

  console.log(`✅ Usando: ${estab.name} / ${op.email}\n`);

  // ── 1. Configurações de cashback ──────────────────────────────────────────
  console.log('⚙️  Configurações de cashback...');

  await prisma.cashbackSettings.upsert({
    where:  { establishmentId: estab.id },
    update: {},
    create: {
      establishmentId:           estab.id,
      mode:                      'PERCENTAGE',
      defaultPercent:            5,
      defaultCentsPerLiter:      0.05,
      fuelTypes:                 { gasolina: 5, etanol: 4, diesel: 3, gnv: 3 },
      minFuelAmount:             20,
      maxCashbackPerTransaction: 50,
      doubleBonus:               false,
      rushHourBonus:             true,
      rushHourStart:             '06:00',
      rushHourEnd:               '09:00',
      rushHourPercent:           8,
    },
  });
  console.log(`   ✅ ${estab.name} — 5% padrão, bônus hora do rush 8%\n`);

  // ── 2. Configurações antifraude ───────────────────────────────────────────
  console.log('🛡️  Configurações antifraude...');

  await prisma.fraudSettings.upsert({
    where:  { establishmentId: estab.id },
    update: {},
    create: {
      establishmentId:       estab.id,
      maxFuelsPerDay:        2,
      maxFuelsPerWeek:       5,
      maxCashbackPerDay:     80,
      maxFuelAmount:         600,
      maxRedeemsPerWeek:     3,
      alertOnCashbackExceed: true,
      alertOnSuspiciousHour: true,
    },
  });
  console.log(`   ✅ ${estab.name}\n`);

  // ── 3. Clientes ───────────────────────────────────────────────────────────
  console.log('👤 Criando/atualizando clientes...');

  const clientes = [
    { nome: 'Carlos Pereira',   cpf: '04965581060', phone: '11999990010', balance: 45.50 },
    { nome: 'Ana Beatriz Lima', cpf: '71428793860', phone: '11999990011', balance: 12.00 },
    { nome: 'Roberto Alves',    cpf: '06731508050', phone: '11999990012', balance: 0.00  },
    { nome: 'Fernanda Costa',   cpf: '94271564072', phone: '11999990013', balance: 87.25 },
    { nome: 'Marcos Oliveira',  cpf: '29662868084', phone: '11999990014', balance: 5.75  },
    { nome: 'Patricia Santos',  cpf: '15158114098', phone: '11999990015', balance: 33.00 },
    { nome: 'Lucas Rodrigues',  cpf: '55641815063', phone: '11999990016', balance: 120.00},
    { nome: 'Juliana Ferreira', cpf: '83582454068', phone: '11999990017', balance: 0.00  },
    { nome: 'Tatiane Moreira',  cpf: '41898428007', phone: '11999990018', balance: 9.00  },
    { nome: 'Edson Gomes',      cpf: '31721519070', phone: '11999990019', balance: 0.00  },
  ];

  const custs = {};
  for (const c of clientes) {
    const cust = await prisma.customer.upsert({
      where:  { cpf_establishmentId: { cpf: c.cpf, establishmentId: estab.id } },
      update: { balance: c.balance },
      create: { name: c.nome, cpf: c.cpf, phone: c.phone, balance: c.balance, establishmentId: estab.id },
    });
    custs[c.cpf] = cust;
    console.log(`   ✅ ${c.nome} (saldo: R$ ${c.balance.toFixed(2)})`);
  }
  console.log();

  // ── 4. Transações históricas ──────────────────────────────────────────────
  console.log('⛽ Criando transações históricas...');

  const txns = [
    { cpf: '04965581060', amount: 150.00, pct: 5, fuel: 'gasolina', liters: 30.0,  dias: 45 },
    { cpf: '04965581060', amount: 200.00, pct: 5, fuel: 'gasolina', liters: 40.0,  dias: 30 },
    { cpf: '04965581060', amount: 180.00, pct: 5, fuel: 'gasolina', liters: 36.0,  dias: 15 },
    { cpf: '71428793860', amount: 80.00,  pct: 4, fuel: 'etanol',   liters: 50.0,  dias: 20 },
    { cpf: '71428793860', amount: 60.00,  pct: 4, fuel: 'etanol',   liters: 37.5,  dias: 5  },
    { cpf: '06731508050', amount: 120.00, pct: 5, fuel: 'diesel',   liters: 80.0,  dias: 60 },
    { cpf: '94271564072', amount: 300.00, pct: 5, fuel: 'gasolina', liters: 60.0,  dias: 40 },
    { cpf: '94271564072', amount: 250.00, pct: 5, fuel: 'gasolina', liters: 50.0,  dias: 25 },
    { cpf: '94271564072', amount: 400.00, pct: 5, fuel: 'gasolina', liters: 80.0,  dias: 10 },
    { cpf: '29662868084', amount: 55.00,  pct: 5, fuel: 'gasolina', liters: 11.0,  dias: 7  },
    { cpf: '15158114098', amount: 220.00, pct: 5, fuel: 'gasolina', liters: 44.0,  dias: 35 },
    { cpf: '15158114098', amount: 180.00, pct: 5, fuel: 'gasolina', liters: 36.0,  dias: 12 },
    { cpf: '55641815063', amount: 500.00, pct: 5, fuel: 'gasolina', liters: 100.0, dias: 50 },
    { cpf: '55641815063', amount: 480.00, pct: 5, fuel: 'gasolina', liters: 96.0,  dias: 35 },
    { cpf: '55641815063', amount: 520.00, pct: 5, fuel: 'gasolina', liters: 104.0, dias: 20 },
    { cpf: '55641815063', amount: 450.00, pct: 5, fuel: 'gasolina', liters: 90.0,  dias: 8  },
    { cpf: '83582454068', amount: 70.00,  pct: 5, fuel: 'etanol',   liters: 43.75, dias: 90 },
    { cpf: '41898428007', amount: 90.00,  pct: 4, fuel: 'gasolina', liters: 18.0,  dias: 14 },
    { cpf: '31721519070', amount: 130.00, pct: 3, fuel: 'diesel',   liters: 86.7,  dias: 55 },
    { cpf: '31721519070', amount: 200.00, pct: 3, fuel: 'gasolina', liters: 40.0,  dias: 28 },
    { cpf: '04965581060', amount: 150.00, pct: 5, fuel: 'gasolina', liters: 30.0,  dias: 7  },
  ];

  let txnCount = 0;
  for (const t of txns) {
    const cashbackValue = parseFloat(((t.amount * t.pct) / 100).toFixed(2));
    await prisma.transaction.create({
      data: {
        customerId:      custs[t.cpf].id,
        operatorId:      op.id,
        establishmentId: estab.id,
        amount:          t.amount,
        cashbackPercent: t.pct,
        cashbackValue,
        receiptCode:     receiptCode(),
        fuelType:        t.fuel,
        liters:          t.liters,
        createdAt:       daysAgo(t.dias),
      },
    });
    txnCount++;
  }
  console.log(`   ✅ ${txnCount} transações inseridas\n`);

  // ── 5. Resgates ───────────────────────────────────────────────────────────
  console.log('💰 Criando resgates...');

  const resgates = [
    { cpf: '06731508050', amount: 6.00,  dias: 55 },
    { cpf: '55641815063', amount: 25.00, dias: 22 },
    { cpf: '55641815063', amount: 30.00, dias: 5  },
    { cpf: '04965581060', amount: 8.00,  dias: 14 },
    { cpf: '83582454068', amount: 3.50,  dias: 85 },
    { cpf: '94271564072', amount: 15.00, dias: 9  },
  ];

  let redCount = 0;
  for (const r of resgates) {
    await prisma.redemption.create({
      data: {
        customerId:      custs[r.cpf].id,
        operatorId:      op.id,
        establishmentId: estab.id,
        amountUsed:      r.amount,
        status:          'CONFIRMED',
        receiptCode:     receiptCode(),
        createdAt:       daysAgo(r.dias),
      },
    });
    redCount++;
  }
  console.log(`   ✅ ${redCount} resgates inseridos\n`);

  // ── 6. CPFs bloqueados ────────────────────────────────────────────────────
  console.log('🚫 CPFs bloqueados...');

  const blacklist = [
    { cpf: '12345678901', reason: 'Tentativa de fraude: múltiplos cadastros com mesmo CPF em dispositivos diferentes' },
    { cpf: '98765432100', reason: 'Comportamento suspeito: 8 abastecimentos em 24 horas' },
    { cpf: '11122233344', reason: 'Uso indevido de QR code de resgate de terceiros' },
    { cpf: '55566677788', reason: 'CPF informado por associação a esquema de pontos falsos' },
    { cpf: '22233344455', reason: 'Conta duplicada: CPF já registrado com dados divergentes' },
    { cpf: '66677788899', reason: 'Estorno fraudulento solicitado após resgate confirmado' },
    { cpf: '33344455566', reason: 'Tentativa de resgate acima do saldo disponível (manipulação de API)' },
    { cpf: '77788899900', reason: 'Selfie inconsistente: rosto não corresponde ao cadastro' },
    { cpf: '44455566677', reason: 'Denúncia de cliente: CPF utilizado sem autorização do titular' },
    { cpf: '88899900011', reason: 'Bloqueio preventivo: investigação em andamento por autofraude' },
  ];

  let blCount = 0;
  for (const b of blacklist) {
    try {
      await prisma.blacklistedCpf.upsert({
        where:  { cpf_establishmentId: { cpf: b.cpf, establishmentId: estab.id } },
        update: {},
        create: { establishmentId: estab.id, cpf: b.cpf, reason: b.reason, blockedBy: op.id },
      });
      blCount++;
    } catch { /* já existe */ }
  }
  console.log(`   ✅ ${blCount} CPFs bloqueados\n`);

  // ── 7. Alertas de fraude ──────────────────────────────────────────────────
  console.log('⚠️  Alertas de fraude...');

  const alertas = [
    { cpf: '04965581060', type: 'VELOCITY_ANOMALY',     resolved: true,  dias: 28 },
    { cpf: '55641815063', type: 'DAILY_LIMIT_EXCEEDED', resolved: true,  dias: 20 },
    { cpf: '83582454068', type: 'WRONG_DEVICE',         resolved: false, dias: 90 },
    { cpf: '06731508050', type: 'DUPLICATE_QR',         resolved: true,  dias: 55 },
    { cpf: '31721519070', type: 'LOCATION_MISMATCH',    resolved: false, dias: 10 },
    { cpf: '94271564072', type: 'SELFIE_MISMATCH',      resolved: false, dias: 3  },
  ];

  let alertCount = 0;
  for (const a of alertas) {
    await prisma.fraudAlert.create({
      data: {
        customerId:      custs[a.cpf].id,
        establishmentId: estab.id,
        type:            a.type,
        resolved:        a.resolved,
        metadata:        { origem: 'seed-demo' },
        createdAt:       daysAgo(a.dias),
      },
    });
    alertCount++;
  }
  console.log(`   ✅ ${alertCount} alertas inseridos\n`);

  // ── 8. Campanhas ──────────────────────────────────────────────────────────
  console.log('📣 Campanhas...');

  const campanhas = [
    {
      name:          'Reativação Clientes Inativos — Abr',
      filterType:    'INACTIVE',
      filterPeriod:  'TWO_MONTHS',
      rewardType:    'FIXED',
      rewardValue:   5.00,
      message:       'Sentimos sua falta! Volte e ganhe R$ 5,00 de cashback no próximo abastecimento.',
      customerCount: 3,
      totalCost:     15.00,
      status:        'SENT',
      dias:          20,
    },
    {
      name:          'Fidelidade Melhores Clientes — Abr',
      filterType:    'ACTIVE',
      filterPeriod:  'ONE_MONTH',
      rewardType:    'PER_LITER',
      rewardValue:   0.10,
      message:       'Clientes fiéis ganham R$ 0,10 extra por litro este mês. Válido até 30/04.',
      customerCount: 6,
      totalCost:     18.00,
      status:        'SENT',
      dias:          10,
    },
    {
      name:          'Promoção de Retorno — Mai',
      filterType:    'INACTIVE',
      filterPeriod:  'THREE_MONTHS',
      rewardType:    'FIXED',
      rewardValue:   3.00,
      message:       'Volte e receba R$ 3,00 de bônus no seu próximo abastecimento!',
      customerCount: 2,
      totalCost:     6.00,
      status:        'DRAFT',
      dias:          2,
    },
  ];

  let campCount = 0;
  for (const c of campanhas) {
    await prisma.campaign.create({
      data: {
        name:            c.name,
        establishmentId: estab.id,
        operatorId:      op.id,
        filterType:      c.filterType,
        filterPeriod:    c.filterPeriod,
        rewardType:      c.rewardType,
        rewardValue:     c.rewardValue,
        message:         c.message,
        customerCount:   c.customerCount,
        totalCost:       c.totalCost,
        status:          c.status,
        createdAt:       daysAgo(c.dias),
      },
    });
    campCount++;
    console.log(`   📣 ${c.name} [${c.status}]`);
  }
  console.log(`   ✅ ${campCount} campanhas inseridas\n`);

  // ── Contagem final ────────────────────────────────────────────────────────
  const [
    estabCount, opCount, custCount,
    txCount2, redCount2, campCount2, auditCount,
  ] = await Promise.all([
    prisma.establishment.count(),
    prisma.operator.count(),
    prisma.customer.count(),
    prisma.transaction.count(),
    prisma.redemption.count(),
    prisma.campaign.count(),
    prisma.auditLog.count(),
  ]);

  console.log('═'.repeat(48));
  console.log('✅ Seed de demonstração concluído!');
  console.log('═'.repeat(48));
  console.log('\n📊 Totais no banco após seed:');
  console.log(`   🏪 Estabelecimentos : ${estabCount}`);
  console.log(`   👤 Operadores       : ${opCount}`);
  console.log(`   🙍 Clientes         : ${custCount}`);
  console.log(`   ⛽ Transações       : ${txCount2}`);
  console.log(`   💰 Resgates         : ${redCount2}`);
  console.log(`   📣 Campanhas        : ${campCount2}`);
  console.log(`   📋 Audit logs       : ${auditCount}`);
  console.log(`\n🔑 Acesso: ${op.email} → ${estab.name}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
