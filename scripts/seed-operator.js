const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Find the establishment
  const est = await prisma.establishment.findFirst({
    where: { cnpj: '47248547000174' },
  });
  if (!est) {
    console.error('❌ Establishment 47248547000174 not found. Run db-check.js first.');
    process.exit(1);
  }
  console.log(`✅ Establishment: ${est.name} (id=${est.id})`);

  // Create admin operator (upsert by email so it's idempotent)
  const email    = 'admin@autoposto.com';
  const password = 'Admin@1234';
  const hash     = await bcrypt.hash(password, 10);

  const op = await prisma.operator.upsert({
    where: { email },
    create: {
      name:            'Administrador',
      email,
      password:        hash,
      role:            'ADMIN',
      establishmentId: est.id,
    },
    update: {},  // don't overwrite if it already exists
  });

  console.log(`✅ Operator created/found: ${op.email} (role=${op.role} id=${op.id})`);
  console.log('');
  console.log('  Web dashboard login:');
  console.log(`    Email   : ${email}`);
  console.log(`    Password: ${password}`);
  console.log('');
  console.log('  Change the password after first login.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
