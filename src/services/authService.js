const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
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
    { expiresIn: process.env.JWT_OPERATOR_EXPIRES_IN || '8h' }
  );

  await audit.log({
    action: 'LOGIN',
    entity: 'Operator',
    entityId: operator.id,
    operatorId: operator.id,
    metadata: { operatorId: operator.id },
  });

  const est = operator.establishment;

  return {
    mensagem: 'Login realizado com sucesso.',
    token,
    operador: {
      id:                operator.id,
      nome:              operator.name,
      email:             operator.email,
      perfil:            operator.role,
      cargo:             operator.role,
      estabelecimentoId: operator.establishmentId ?? null,
      estabelecimento:   est?.name               ?? null,
      logoUrl:           est?.logoUrl             ?? null,
      primaryColor:      est?.primaryColor        ?? '#FF6B00',
      secondaryColor:    est?.secondaryColor      ?? '#1e293b',
      cashbackPercent:   est ? parseFloat(est.cashbackPercent) : 0,
    },
    estabelecimento: est ? {
      id:              est.id,
      nome:            est.name,
      logoUrl:         est.logoUrl      || null,
      primaryColor:    est.primaryColor   ?? '#FF6B00',
      secondaryColor:  est.secondaryColor ?? '#1e293b',
      cashbackPercent: parseFloat(est.cashbackPercent),
    } : null,
  };
}

// ── OAuth helpers ──────────────────────────────────────────────────────────────

function signToken(operator) {
  return jwt.sign(
    {
      id:              operator.id,
      name:            operator.name,
      email:           operator.email,
      role:            operator.role,
      establishmentId: operator.establishmentId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_OPERATOR_EXPIRES_IN || '8h' }
  );
}

function buildOperadorPayload(operator, est) {
  return {
    id:                operator.id,
    nome:              operator.name,
    email:             operator.email,
    perfil:            operator.role,
    cargo:             operator.role,
    estabelecimentoId: operator.establishmentId ?? null,
    estabelecimento:   est?.name               ?? null,
    logoUrl:           est?.logoUrl             ?? null,
    primaryColor:      est?.primaryColor        ?? '#FF6B00',
    secondaryColor:    est?.secondaryColor      ?? '#1e293b',
    cashbackPercent:   est ? parseFloat(est.cashbackPercent) : 0,
  };
}

async function findOrCreateOAuthOperator(email, name) {
  let operator = await prisma.operator.findUnique({
    where: { email },
    include: { establishment: true },
  });

  let isNewUser = false;

  if (!operator) {
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    try {
      operator = await prisma.operator.create({
        data: { name, email, password: hash, role: 'OPERATOR', establishmentId: null },
        include: { establishment: true },
      });
      isNewUser = true;
    } catch (err) {
      // Two concurrent first-time OAuth logins for the same brand-new email
      // (double-tap, slow-request retry) can both pass the findUnique above
      // as null — the loser hits this unique violation instead of crashing.
      if (err.code === 'P2002') {
        operator = await prisma.operator.findUnique({ where: { email }, include: { establishment: true } });
      }
      if (!operator) throw err;
    }
  }

  const est   = operator.establishment;
  const token = signToken(operator);

  return {
    mensagem: 'Login realizado com sucesso.',
    token,
    isNewUser,
    operador:        buildOperadorPayload(operator, est),
    estabelecimento: est ? {
      id:              est.id,
      nome:            est.name,
      logoUrl:         est.logoUrl      || null,
      primaryColor:    est.primaryColor   ?? '#FF6B00',
      secondaryColor:  est.secondaryColor ?? '#1e293b',
      cashbackPercent: parseFloat(est.cashbackPercent),
    } : null,
  };
}

async function loginWithGoogle(accessToken) {
  if (!process.env.GOOGLE_CLIENT_ID) throw createError('Google OAuth não configurado.', 503);

  let email, name;
  try {
    const client    = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const tokenInfo = await client.getTokenInfo(accessToken);
    email = tokenInfo.email;

    const { data: userInfo } = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    name = userInfo.name || email;
  } catch {
    throw createError('Token do Google inválido ou expirado.', 401);
  }

  return findOrCreateOAuthOperator(email, name);
}

async function loginWithFacebook(accessToken) {
  let email, name;
  try {
    const { data } = await axios.get('https://graph.facebook.com/me', {
      params: { fields: 'id,name,email', access_token: accessToken },
    });
    if (data.error) throw new Error(data.error.message);
    if (!data.email) throw createError('Permissão de e-mail não concedida pelo Facebook.', 400);
    email = data.email;
    name  = data.name;
  } catch (err) {
    if (err.status) throw err;
    throw createError('Token do Facebook inválido ou expirado.', 401);
  }

  return findOrCreateOAuthOperator(email, name);
}

module.exports = { login, loginWithGoogle, loginWithFacebook };
