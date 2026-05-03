const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');

const prisma = new PrismaClient();

async function login(email, password) {
  if (!email || !password) {
    throw createError('E-mail e senha são obrigatórios.', 400);
  }

  const operator = await prisma.operator.findUnique({
    where: { email },
    include: { establishment: true },
  });

  if (!operator) {
    throw createError('Credenciais inválidas.', 401);
  }

  const passwordMatch = await bcrypt.compare(password, operator.password);
  if (!passwordMatch) {
    throw createError('Credenciais inválidas.', 401);
  }

  const token = jwt.sign(
    {
      id: operator.id,
      name: operator.name,
      email: operator.email,
      role: operator.role,
      establishmentId: operator.establishmentId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );

  await audit.log({
    action: 'LOGIN',
    entity: 'Operator',
    entityId: operator.id,
    operatorId: operator.id,
    metadata: { email },
  });

  const est = operator.establishment;

  return {
    mensagem: 'Login realizado com sucesso.',
    token,
    operador: {
      id:               operator.id,
      nome:             operator.name,
      email:            operator.email,
      perfil:           operator.role,
      cargo:            operator.role,
      estabelecimentoId: operator.establishmentId,
      estabelecimento:  est.name,
      logoUrl:          est.logoUrl  || null,
      cashbackPercent:  parseFloat(est.cashbackPercent),
    },
    estabelecimento: {
      id:              est.id,
      nome:            est.name,
      logoUrl:         est.logoUrl  || null,
      cashbackPercent: parseFloat(est.cashbackPercent),
    },
  };
}

module.exports = { login };
