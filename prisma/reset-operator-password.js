/**
 * reset-operator-password.js — safely reset ONE operator's password.
 *
 * Usage:
 *   node prisma/reset-operator-password.js <email> "<new password>"
 *
 * Example:
 *   node prisma/reset-operator-password.js admin@autoposto.com "NovaSenhaForte123"
 *
 * - Updates exactly one Operator row (matched by email, case-insensitive).
 * - Aborts if the email is not found.
 * - Hashes with bcrypt cost 10 (same as the app). Nothing else is touched.
 * - Uses the DIRECT (non-pooled) connection to avoid the Supabase pgBouncer issue.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const newPassword = process.argv[3] || '';

  if (!email || !newPassword) {
    console.error('Uso: node prisma/reset-operator-password.js <email> "<nova senha>"');
    process.exit(1);
  }
  if (newPassword.length < 6) {
    console.error('A nova senha deve ter ao menos 6 caracteres.');
    process.exit(1);
  }

  const op = await prisma.operator.findUnique({ where: { email } });
  if (!op) {
    console.error(`Operador não encontrado para o e-mail: ${email}`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.operator.update({ where: { email }, data: { password: hash } });

  console.log(`[OK] Senha redefinida para ${email} (role=${op.role}).`);
  console.log('     Faça login com a nova senha e troque-a depois, se desejar.');
})()
  .catch((e) => { console.error('Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
