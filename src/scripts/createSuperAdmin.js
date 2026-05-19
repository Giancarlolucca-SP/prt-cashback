const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('PostoCash2026', 10);
  await prisma.operator.upsert({
    where: { email: 'admin@tgrtech.com.br' },
    update: { role: 'SUPERADMIN' },
    create: {
      name: 'Giancarlo - TGR Tech',
      email: 'admin@tgrtech.com.br',
      password: hash,
      role: 'SUPERADMIN',
      establishmentId: null,
    },
  });
  console.log('SUPERADMIN criado com sucesso!');
}

main().finally(() => prisma.$disconnect());
