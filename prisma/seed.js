require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Iniciando seed do banco de dados...');

  // --- Establishments ---
  const alpha = await prisma.establishment.upsert({
    where: { cnpj: '11111111000101' },
    update: {},
    create: {
      name: 'Posto Alpha',
      cnpj: '11111111000101',
      cashbackPercent: 5,
    },
  });
  console.log(`[OK] Estabelecimento criado: ${alpha.name}`);

  const beta = await prisma.establishment.upsert({
    where: { cnpj: '22222222000102' },
    update: {},
    create: {
      name: 'Posto Beta',
      cnpj: '22222222000102',
      cashbackPercent: 3,
    },
  });
  console.log(`[OK] Estabelecimento criado: ${beta.name}`);

  // --- Operators ---
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.operator.upsert({
    where: { email: 'admin@posto.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@posto.com',
      password: adminPassword,
      role: 'ADMIN',
      establishmentId: alpha.id,
    },
  });
  console.log(`[OK] Operador admin criado: ${admin.email} → ${alpha.name}`);

  const operatorPassword = await bcrypt.hash('operador123', 10);
  const operator = await prisma.operator.upsert({
    where: { email: 'operador@posto.com' },
    update: {},
    create: {
      name: 'Carlos Operador',
      email: 'operador@posto.com',
      password: operatorPassword,
      role: 'OPERATOR',
      establishmentId: beta.id,
    },
  });
  console.log(`[OK] Operador comum criado: ${operator.email} → ${beta.name}`);

  // --- Customers (Posto Alpha) ---
  const customer1 = await prisma.customer.upsert({
    where: { cpf_establishmentId: { cpf: '52998224725', establishmentId: alpha.id } },
    update: {},
    create: {
      name: 'João Silva',
      cpf: '52998224725',
      phone: '11999990001',
      balance: 25.0,
      establishmentId: alpha.id,
    },
  });
  console.log(`[OK] Cliente criado: ${customer1.name} (${alpha.name})`);

  const customer2 = await prisma.customer.upsert({
    where: { cpf_establishmentId: { cpf: '87748248800', establishmentId: alpha.id } },
    update: {},
    create: {
      name: 'Maria Souza',
      cpf: '87748248800',
      phone: '11999990002',
      balance: 0.0,
      establishmentId: alpha.id,
    },
  });
  console.log(`[OK] Cliente criado: ${customer2.name} (${alpha.name})`);

  // --- Customers (Posto Beta) ---
  const customer3 = await prisma.customer.upsert({
    where: { cpf_establishmentId: { cpf: '52998224725', establishmentId: beta.id } },
    update: {},
    create: {
      name: 'João Silva',
      cpf: '52998224725',
      phone: '11999990001',
      balance: 10.0,
      establishmentId: beta.id,
    },
  });
  console.log(`[OK] Cliente criado: ${customer3.name} (${beta.name})`);

  console.log('[SEED] Seed concluído com sucesso!');
  console.log('\nCredenciais de acesso:');
  console.log(`   Admin     → admin@posto.com     / admin123    (${alpha.name})`);
  console.log(`   Operador  → operador@posto.com  / operador123 (${beta.name})`);
  console.log('\nEstabelecimentos:');
  console.log(`   ${alpha.name} → CNPJ: 11.111.111/0001-01 | Cashback: 5%`);
  console.log(`   ${beta.name}  → CNPJ: 22.222.222/0001-02 | Cashback: 3%`);
  console.log('\nClientes de teste:');
  console.log(`   João Silva  → CPF: 529.982.247-25  (Alpha: R$ 25,00 | Beta: R$ 10,00)`);
  console.log(`   Maria Souza → CPF: 877.482.488-00  (Alpha: R$ 0,00)`);
}

main()
  .catch((e) => {
    console.error('[ERROR] Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
