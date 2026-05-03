const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('\n══ ESTABLISHMENTS ══════════════════════════════════');
  const establishments = await prisma.establishment.findMany({
    select: { id: true, name: true, cnpj: true, cashbackPercent: true },
    orderBy: { name: 'asc' },
  });
  if (!establishments.length) {
    console.log('  (nenhum estabelecimento no banco)');
  } else {
    establishments.forEach(e =>
      console.log(`  id=${e.id}  cnpj=${e.cnpj}  name=${e.name}  cashback=${e.cashbackPercent}%`)
    );
  }

  const target = '47248547000174';
  const found = establishments.find(e => e.cnpj.replace(/\D/g, '') === target);

  if (!found) {
    console.log(`\n  ⚠️  Establishment with CNPJ ${target} NOT FOUND — creating...`);
    const created = await prisma.establishment.create({
      data: {
        name:            'AUTO POSTO DILMA LTDA',
        cnpj:            target,
        cashbackPercent: 5,
      },
    });
    console.log(`  ✅ Created: id=${created.id}  cnpj=${created.cnpj}  name=${created.name}`);
  } else {
    console.log(`\n  ✅ Establishment found: id=${found.id}  cnpj=${found.cnpj}  name=${found.name}`);
  }

  console.log('\n══ OPERATORS (per establishment) ═══════════════════');
  const operators = await prisma.operator.findMany({
    select: { id: true, name: true, email: true, role: true, establishmentId: true },
    orderBy: { name: 'asc' },
  });
  if (!operators.length) {
    console.log('  ⚠️  Nenhum operador cadastrado — sem operador, o app não consegue registrar transações.');
  } else {
    operators.forEach(o =>
      console.log(`  estId=${o.establishmentId}  role=${o.role}  email=${o.email}  name=${o.name}`)
    );
  }

  console.log('\n══ CUSTOMERS ════════════════════════════════════════');
  const customers = await prisma.customer.findMany({
    select: { id: true, name: true, cpf: true, establishmentId: true, deviceId: true, balance: true },
    orderBy: { name: 'asc' },
  });
  if (!customers.length) {
    console.log('  (nenhum cliente no banco)');
  } else {
    customers.forEach(c =>
      console.log(`  id=${c.id}  cpf=${c.cpf}  estId=${c.establishmentId}  saldo=${c.balance}  device=${c.deviceId ?? 'null'}  name=${c.name}`)
    );
  }

  console.log('\n══ SUMMARY ══════════════════════════════════════════');
  console.log(`  Establishments : ${establishments.length}`);
  console.log(`  Operators      : ${operators.length}`);
  console.log(`  Customers      : ${customers.length}`);
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
