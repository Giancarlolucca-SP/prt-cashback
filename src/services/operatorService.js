/**
 * Admin-only management of OPERATOR (frentista) logins, scoped to the admin's
 * establishment. Frentistas share an operador login that is locked to the
 * Painel da Pista (see operatorLockdown middleware).
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function createOperador(admin, { name, email, password }) {
  const establishmentId = admin.establishmentId;
  if (!establishmentId) throw createError('Administrador sem estabelecimento.', 400);
  if (!name || !name.trim()) throw createError('Nome é obrigatório.', 400);

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) throw createError('E-mail inválido.', 400);
  if (!password || String(password).length < 6) throw createError('A senha deve ter ao menos 6 caracteres.', 400);

  const existing = await prisma.operator.findUnique({ where: { email: cleanEmail } });
  if (existing) throw createError('E-mail já cadastrado.', 409);

  const hash = await bcrypt.hash(String(password), 10);
  let op;
  try {
    op = await prisma.operator.create({
      data: { name: name.trim(), email: cleanEmail, password: hash, role: 'OPERATOR', establishmentId },
    });
  } catch (err) {
    if (err.code === 'P2002') throw createError('E-mail já cadastrado.', 409);
    throw err;
  }
  return { mensagem: 'Login de operador criado.', operador: { id: op.id, name: op.name, email: op.email, role: op.role } };
}

async function listOperadores(admin) {
  const establishmentId = admin.establishmentId;
  if (!establishmentId) throw createError('Administrador sem estabelecimento.', 400);
  const ops = await prisma.operator.findMany({
    where:   { establishmentId },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select:  { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return { operadores: ops };
}

async function deleteOperador(admin, id) {
  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op || op.establishmentId !== admin.establishmentId) throw createError('Operador não encontrado.', 404);
  if (op.role !== 'OPERATOR') throw createError('Só é possível remover logins de operador.', 400);
  if (op.id === admin.id) throw createError('Não é possível remover o próprio login.', 400);

  try {
    await prisma.operator.delete({ where: { id } });
  } catch (err) {
    if (err.code === 'P2003') throw createError('Não é possível remover: este operador possui movimentações registradas. Desative-o em vez de remover.', 409);
    throw err;
  }
  return { mensagem: 'Login de operador removido.' };
}

module.exports = { createOperador, listOperadores, deleteOperador };
