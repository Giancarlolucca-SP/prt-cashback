const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const targetCnpj = process.env.SEED_ESTABLISHMENT_CNPJ || '00000000000000';
  const email = process.env.SEED_OPERATOR_EMAIL || 'admin@example.test';
  const password = process.env.SEED_OPERATOR_PASSWORD;

  if (!password) {
    console.error('Set SEED_OPERATOR_PASSWORD in your local environment before creating an operator.');
    process.exit(1);
  }

  // Find the establishment
  const est = await prisma.establishment.findFirst({
    where: { cnpj: targetCnpj },
  });
  if (!est) {
    console.error(`Establishment ${targetCnpj} not found. Run db-check.js first or set SEED_ESTABLISHMENT_CNPJ.`);
    process.exit(1);
  }
  console.log(`✅ Establishment: ${est.name} (id=${est.id})`);

  // Create admin operator (upsert by email so it's idempotent)
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
  console.log('    Password: (provided by SEED_OPERATOR_PASSWORD)');
  console.log('');
  console.log('  Change the password after first login.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
