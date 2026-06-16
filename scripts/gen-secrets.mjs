/**
 * Gera valores NOVOS e fortes para rotação de segredos.
 * NÃO aplica nada — só imprime no terminal pra você colar onde precisar.
 *
 * Uso:  node scripts/gen-secrets.mjs
 *
 * Ver runbook: scripts/rotate-secrets.md
 */
import { randomBytes } from 'node:crypto';

const jwt = randomBytes(48).toString('hex');     // 96 hex chars
const agent = randomBytes(24).toString('hex');   // 48 hex chars

console.log('# Valores novos (copie e cole; NÃO commitar)\n');
console.log(`JWT_SECRET=${jwt}`);
console.log(`AGENT_TOKEN=${agent}`);
console.log('\n# Senhas de login: use node prisma/reset-operator-password.js <email> <novaSenha>');
console.log('# Senha do banco: gerar pelo dashboard do Supabase (Reset database password).');
