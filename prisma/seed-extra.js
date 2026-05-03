require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function receiptCode() {
  return 'TXN-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Iniciando seed extra...\n');

  // ── Buscar estabelecimentos e operadores existentes ────────────────────────
  const alpha = await prisma.establishment.findUnique({ where: { cnpj: '11111111000101' } });
  const beta  = await prisma.establishment.findUnique({ where: { cnpj: '22222222000102' } });

  if (!alpha || !beta) {
    console.error('❌ Estabelecimentos não encontrados. Execute prisma/seed.js primeiro.');
    process.exit(1);
  }

  const adminOp = await prisma.operator.findUnique({ where: { email: 'admin@posto.com' } });
  const operOp  = await prisma.operator.findUnique({ where: { email: 'operador@posto.com' } });

  if (!adminOp || !operOp) {
    console.error('❌ Operadores não encontrados. Execute prisma/seed.js primeiro.');
    process.exit(1);
  }

  console.log(`✅ Dados base carregados: ${alpha.name}, ${beta.name}\n`);

  // ── 1. Configurações de cashback ───────────────────────────────────────────
  console.log('⚙️  Criando configurações de cashback...');

  await prisma.cashbackSettings.upsert({
    where: { establishmentId: alpha.id },
    update: {},
    create: {
      establishmentId:           alpha.id,
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
  console.log(`   ✅ CashbackSettings → ${alpha.name} (5% padrão, bônus hora do rush 8%)`);

  await prisma.cashbackSettings.upsert({
    where: { establishmentId: beta.id },
    update: {},
    create: {
      establishmentId:           beta.id,
      mode:                      'PERCENTAGE',
      defaultPercent:            3,
      defaultCentsPerLiter:      0.03,
      fuelTypes:                 { gasolina: 4, etanol: 3, diesel: 3 },
      minFuelAmount:             30,
      maxCashbackPerTransaction: 30,
      doubleBonus:               false,
      rushHourBonus:             false,
      rushHourStart:             '06:00',
      rushHourEnd:               '10:00',
      rushHourPercent:           5,
    },
  });
  console.log(`   ✅ CashbackSettings → ${beta.name} (3% padrão)\n`);

  // ── 2. Configurações antifraude ────────────────────────────────────────────
  console.log('🛡️  Criando configurações antifraude...');

  await prisma.fraudSettings.upsert({
    where: { establishmentId: alpha.id },
    update: {},
    create: {
      establishmentId:       alpha.id,
      maxFuelsPerDay:        2,
      maxFuelsPerWeek:       5,
      maxCashbackPerDay:     80,
      maxFuelAmount:         600,
      maxRedeemsPerWeek:     3,
      alertOnCashbackExceed: true,
      alertOnSuspiciousHour: true,
    },
  });
  console.log(`   ✅ FraudSettings → ${alpha.name}`);

  await prisma.fraudSettings.upsert({
    where: { establishmentId: beta.id },
    update: {},
    create: {
      establishmentId:       beta.id,
      maxFuelsPerDay:        1,
      maxFuelsPerWeek:       3,
      maxCashbackPerDay:     50,
      maxFuelAmount:         400,
      maxRedeemsPerWeek:     2,
      alertOnCashbackExceed: true,
      alertOnSuspiciousHour: false,
    },
  });
  console.log(`   ✅ FraudSettings → ${beta.name}\n`);

  // ── 3. Clientes adicionais ─────────────────────────────────────────────────
  console.log('👤 Criando clientes adicionais...');

  const clientesAlpha = [
    { nome: 'Carlos Pereira',   cpf: '04965581060', phone: '11999990010', balance: 45.50 },
    { nome: 'Ana Beatriz Lima', cpf: '71428793860', phone: '11999990011', balance: 12.00 },
    { nome: 'Roberto Alves',    cpf: '06731508050', phone: '11999990012', balance: 0.00  },
    { nome: 'Fernanda Costa',   cpf: '94271564072', phone: '11999990013', balance: 87.25 },
    { nome: 'Marcos Oliveira',  cpf: '29662868084', phone: '11999990014', balance: 5.75  },
    { nome: 'Patricia Santos',  cpf: '15158114098', phone: '11999990015', balance: 33.00 },
    { nome: 'Lucas Rodrigues',  cpf: '55641815063', phone: '11999990016', balance: 120.00},
    { nome: 'Juliana Ferreira', cpf: '83582454068', phone: '11999990017', balance: 0.00  },
  ];

  const custAlpha = {};
  for (const c of clientesAlpha) {
    const cust = await prisma.customer.upsert({
      where: { cpf_establishmentId: { cpf: c.cpf, establishmentId: alpha.id } },
      update: {},
      create: { name: c.nome, cpf: c.cpf, phone: c.phone, balance: c.balance, establishmentId: alpha.id },
    });
    custAlpha[c.cpf] = cust;
    console.log(`   ✅ ${c.nome} → ${alpha.name} (saldo: R$ ${c.balance.toFixed(2)})`);
  }

  const clientesBeta = [
    { nome: 'Carlos Pereira',  cpf: '04965581060', phone: '11999990010', balance: 18.50 },
    { nome: 'Tatiane Moreira', cpf: '41898428007', phone: '11999990018', balance: 9.00  },
    { nome: 'Edson Gomes',     cpf: '31721519070', phone: '11999990019', balance: 0.00  },
  ];

  const custBeta = {};
  for (const c of clientesBeta) {
    const cust = await prisma.customer.upsert({
      where: { cpf_establishmentId: { cpf: c.cpf, establishmentId: beta.id } },
      update: {},
      create: { name: c.nome, cpf: c.cpf, phone: c.phone, balance: c.balance, establishmentId: beta.id },
    });
    custBeta[c.cpf] = cust;
    console.log(`   ✅ ${c.nome} → ${beta.name} (saldo: R$ ${c.balance.toFixed(2)})`);
  }
  console.log();

  // ── 4. Transações históricas ───────────────────────────────────────────────
  console.log('⛽ Criando transações históricas...');

  const txns = [
    // Carlos Pereira — Alpha
    { cust: custAlpha['04965581060'], op: adminOp, estab: alpha, amount: 150.00, pct: 5, fuel: 'gasolina', liters: 30.0, dias: 45 },
    { cust: custAlpha['04965581060'], op: adminOp, estab: alpha, amount: 200.00, pct: 5, fuel: 'gasolina', liters: 40.0, dias: 30 },
    { cust: custAlpha['04965581060'], op: adminOp, estab: alpha, amount: 180.00, pct: 5, fuel: 'gasolina', liters: 36.0, dias: 15 },
    // Ana Beatriz Lima — Alpha
    { cust: custAlpha['71428793860'], op: adminOp, estab: alpha, amount: 80.00,  pct: 4, fuel: 'etanol',   liters: 50.0, dias: 20 },
    { cust: custAlpha['71428793860'], op: adminOp, estab: alpha, amount: 60.00,  pct: 4, fuel: 'etanol',   liters: 37.5, dias: 5  },
    // Roberto Alves — Alpha (sem saldo — já resgatou tudo)
    { cust: custAlpha['06731508050'], op: adminOp, estab: alpha, amount: 120.00, pct: 5, fuel: 'diesel',   liters: 80.0, dias: 60 },
    // Fernanda Costa — Alpha (saldo alto)
    { cust: custAlpha['94271564072'], op: adminOp, estab: alpha, amount: 300.00, pct: 5, fuel: 'gasolina', liters: 60.0, dias: 40 },
    { cust: custAlpha['94271564072'], op: adminOp, estab: alpha, amount: 250.00, pct: 5, fuel: 'gasolina', liters: 50.0, dias: 25 },
    { cust: custAlpha['94271564072'], op: adminOp, estab: alpha, amount: 400.00, pct: 5, fuel: 'gasolina', liters: 80.0, dias: 10 },
    // Marcos Oliveira — Alpha
    { cust: custAlpha['29662868084'], op: adminOp, estab: alpha, amount: 55.00,  pct: 5, fuel: 'gasolina', liters: 11.0, dias: 7  },
    // Patricia Santos — Alpha
    { cust: custAlpha['15158114098'], op: adminOp, estab: alpha, amount: 220.00, pct: 5, fuel: 'gasolina', liters: 44.0, dias: 35 },
    { cust: custAlpha['15158114098'], op: adminOp, estab: alpha, amount: 180.00, pct: 5, fuel: 'gasolina', liters: 36.0, dias: 12 },
    // Lucas Rodrigues — Alpha (saldo muito alto, cliente VIP)
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 500.00, pct: 5, fuel: 'gasolina', liters: 100.0, dias: 50 },
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 480.00, pct: 5, fuel: 'gasolina', liters: 96.0,  dias: 35 },
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 520.00, pct: 5, fuel: 'gasolina', liters: 104.0, dias: 20 },
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 450.00, pct: 5, fuel: 'gasolina', liters: 90.0,  dias: 8  },
    // Juliana Ferreira — Alpha (nunca teve saldo / cancelou)
    { cust: custAlpha['83582454068'], op: adminOp, estab: alpha, amount: 70.00,  pct: 5, fuel: 'etanol',   liters: 43.75, dias: 90 },
    // Carlos Pereira — Beta
    { cust: custBeta['04965581060'],  op: operOp,  estab: beta,  amount: 200.00, pct: 3, fuel: 'gasolina', liters: 40.0, dias: 28 },
    { cust: custBeta['04965581060'],  op: operOp,  estab: beta,  amount: 150.00, pct: 3, fuel: 'gasolina', liters: 30.0, dias: 7  },
    // Tatiane Moreira — Beta
    { cust: custBeta['41898428007'],  op: operOp,  estab: beta,  amount: 90.00,  pct: 4, fuel: 'gasolina', liters: 18.0, dias: 14 },
    // Edson Gomes — Beta
    { cust: custBeta['31721519070'],  op: operOp,  estab: beta,  amount: 130.00, pct: 3, fuel: 'diesel',   liters: 86.7, dias: 55 },
  ];

  let txnCount = 0;
  for (const t of txns) {
    const cashbackValue = parseFloat(((t.amount * t.pct) / 100).toFixed(2));
    await prisma.transaction.create({
      data: {
        customerId:      t.cust.id,
        operatorId:      t.op.id,
        establishmentId: t.estab.id,
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

  // ── 5. Resgates ────────────────────────────────────────────────────────────
  console.log('💰 Criando resgates...');

  const resgates = [
    // Roberto Alves — Alpha (resgatou tudo, saldo zerado)
    { cust: custAlpha['06731508050'], op: adminOp, estab: alpha, amount: 6.00,  dias: 55 },
    // Lucas Rodrigues — Alpha (resgate parcial)
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 25.00, dias: 22 },
    { cust: custAlpha['55641815063'], op: adminOp, estab: alpha, amount: 30.00, dias: 5  },
    // Carlos Pereira — Alpha
    { cust: custAlpha['04965581060'], op: adminOp, estab: alpha, amount: 8.00,  dias: 14 },
    // Carlos Pereira — Beta
    { cust: custBeta['04965581060'],  op: operOp,  estab: beta,  amount: 4.50,  dias: 6  },
    // Juliana Ferreira — Alpha (resgatou tudo logo depois)
    { cust: custAlpha['83582454068'], op: adminOp, estab: alpha, amount: 3.50,  dias: 85 },
  ];

  let redCount = 0;
  for (const r of resgates) {
    await prisma.redemption.create({
      data: {
        customerId:      r.cust.id,
        operatorId:      r.op.id,
        establishmentId: r.estab.id,
        amountUsed:      r.amount,
        status:          'CONFIRMED',
        receiptCode:     receiptCode(),
        createdAt:       daysAgo(r.dias),
      },
    });
    redCount++;
  }
  console.log(`   ✅ ${redCount} resgates inseridos\n`);

  // ── 6. CPFs bloqueados ─────────────────────────────────────────────────────
  console.log('🚫 Criando CPFs bloqueados...');

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
        where: { cpf_establishmentId: { cpf: b.cpf, establishmentId: alpha.id } },
        update: {},
        create: {
          establishmentId: alpha.id,
          cpf:             b.cpf,
          reason:          b.reason,
          blockedBy:       adminOp.id,
        },
      });
      blCount++;
      console.log(`   🚫 CPF ${b.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')} bloqueado`);
    } catch (e) {
      console.log(`   ⚠️  CPF ${b.cpf} já bloqueado, ignorado`);
    }
  }
  console.log(`   ✅ ${blCount} CPFs bloqueados inseridos\n`);

  // ── 7. Alertas de fraude ───────────────────────────────────────────────────
  console.log('⚠️  Criando alertas de fraude...');

  const alertas = [
    { cust: custAlpha['04965581060'], estab: alpha, type: 'VELOCITY_ANOMALY',      resolved: true,  dias: 28 },
    { cust: custAlpha['55641815063'], estab: alpha, type: 'DAILY_LIMIT_EXCEEDED',  resolved: true,  dias: 20 },
    { cust: custAlpha['83582454068'], estab: alpha, type: 'WRONG_DEVICE',          resolved: false, dias: 90 },
    { cust: custAlpha['06731508050'], estab: alpha, type: 'DUPLICATE_QR',          resolved: true,  dias: 55 },
    { cust: custBeta['31721519070'],  estab: beta,  type: 'LOCATION_MISMATCH',     resolved: false, dias: 10 },
    { cust: custAlpha['94271564072'], estab: alpha, type: 'SELFIE_MISMATCH',       resolved: false, dias: 3  },
  ];

  let alertCount = 0;
  for (const a of alertas) {
    await prisma.fraudAlert.create({
      data: {
        customerId:      a.cust.id,
        establishmentId: a.estab.id,
        type:            a.type,
        resolved:        a.resolved,
        metadata:        { origem: 'seed-extra', observacao: 'Alerta de demonstração' },
        createdAt:       daysAgo(a.dias),
      },
    });
    alertCount++;
    console.log(`   ⚠️  ${a.type} → ${a.cust.name} (${a.resolved ? 'resolvido' : 'pendente'})`);
  }
  console.log(`   ✅ ${alertCount} alertas inseridos\n`);

  // ── 8. Campanhas ───────────────────────────────────────────────────────────
  console.log('📣 Criando campanhas...');

  const campanhas = [
    {
      estab: alpha, op: adminOp,
      filterType:   'INACTIVE',
      filterPeriod: 'TWO_MONTHS',
      rewardType:   'FIXED',
      rewardValue:  5.00,
      message:      'Sentimos sua falta! Volte ao Posto Alpha e ganhe R$ 5,00 de cashback no próximo abastecimento.',
      customerCount: 3,
      totalCost:    15.00,
      status:       'SENT',
      dias:         20,
    },
    {
      estab: alpha, op: adminOp,
      filterType:   'ACTIVE',
      filterPeriod: 'ONE_MONTH',
      rewardType:   'PER_LITER',
      rewardValue:  0.10,
      message:      'Clientes fiéis ganham R$ 0,10 extra por litro este mês. Válido até 30/04.',
      customerCount: 6,
      totalCost:    18.00,
      status:       'SENT',
      dias:         10,
    },
    {
      estab: beta, op: operOp,
      filterType:   'INACTIVE',
      filterPeriod: 'THREE_MONTHS',
      rewardType:   'FIXED',
      rewardValue:  3.00,
      message:      'Volte ao Posto Beta! Te esperamos com R$ 3,00 de bônus.',
      customerCount: 2,
      totalCost:    6.00,
      status:       'DRAFT',
      dias:         2,
    },
  ];

  let campCount = 0;
  for (const c of campanhas) {
    await prisma.campaign.create({
      data: {
        establishmentId: c.estab.id,
        operatorId:      c.op.id,
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
    console.log(`   📣 ${c.estab.name} → "${c.message.slice(0, 50)}..." [${c.status}]`);
  }
  console.log(`   ✅ ${campCount} campanhas inseridas\n`);

  // ── Resumo final ───────────────────────────────────────────────────────────
  console.log('═'.repeat(55));
  console.log('🎉 Seed extra concluído com sucesso!');
  console.log('═'.repeat(55));
  console.log('\n📊 Resumo do que foi inserido:');
  console.log(`   ⚙️  Configurações de cashback : 2 estabelecimentos`);
  console.log(`   🛡️  Configurações antifraude  : 2 estabelecimentos`);
  console.log(`   👤 Clientes novos            : ${clientesAlpha.length + clientesBeta.length}`);
  console.log(`   ⛽ Transações                : ${txnCount}`);
  console.log(`   💰 Resgates                  : ${redCount}`);
  console.log(`   🚫 CPFs bloqueados           : ${blCount}`);
  console.log(`   ⚠️  Alertas de fraude         : ${alertCount}`);
  console.log(`   📣 Campanhas                 : ${campCount}`);
  console.log('\n👤 Clientes com mais saldo:');
  console.log('   Lucas Rodrigues  → R$ 120,00 (Posto Alpha)');
  console.log('   Fernanda Costa   → R$  87,25 (Posto Alpha)');
  console.log('   Carlos Pereira   → R$  45,50 (Posto Alpha) | R$ 18,50 (Posto Beta)');
  console.log('   Patricia Santos  → R$  33,00 (Posto Alpha)');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed extra:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
