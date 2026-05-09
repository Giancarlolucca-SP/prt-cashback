const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { createError } = require('../middlewares/errorMiddleware');
const { formatDateBR } = require('../utils/dateFormatter');
const audit = require('./auditService');

const prisma = new PrismaClient();

function formatCnpj(digits) {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

async function create(
  {
    nome, cnpj, telefone, endereco, cidade, estado,
    cashbackPercent, minRedemption,
    operatorName, operatorEmail, operatorPassword,
  },
  createdByOperatorId
) {
  if (!nome?.trim())          throw createError('Nome do estabelecimento é obrigatório.', 400);
  if (!operatorName?.trim())  throw createError('Nome do operador é obrigatório.', 400);
  if (!operatorEmail?.trim()) throw createError('E-mail do operador é obrigatório.', 400);
  if (!operatorPassword)      throw createError('Senha provisória é obrigatória.', 400);

  const cleanCnpj = String(cnpj).replace(/\D/g, '');
  if (cleanCnpj.length !== 14) throw createError('CNPJ inválido.', 400);

  const cleanEmail = operatorEmail.trim().toLowerCase();

  // Uniqueness checks in parallel
  const [existingEst, existingOp] = await Promise.all([
    prisma.establishment.findUnique({ where: { cnpj: cleanCnpj } }),
    prisma.operator.findUnique({ where: { email: cleanEmail } }),
  ]);

  if (existingEst) throw createError('CNPJ já cadastrado.', 409);
  if (existingOp)  throw createError('E-mail do operador já cadastrado.', 409);

  const hashedPassword   = await bcrypt.hash(operatorPassword, 10);
  const parsedCashback   = Math.min(100, Math.max(0, parseFloat(cashbackPercent) || 5));
  const parsedMinRedeem  = minRedemption ? parseFloat(minRedemption) : null;

  const { est, op } = await prisma.$transaction(async (tx) => {
    const est = await tx.establishment.create({
      data: {
        name:           nome.trim(),
        cnpj:           cleanCnpj,
        cashbackPercent: parsedCashback,
        phone:          telefone?.trim()  || null,
        address:        endereco?.trim()  || null,
        city:           cidade?.trim()    || null,
        state:          estado            || null,
        ...(parsedMinRedeem !== null && { minRedemption: parsedMinRedeem }),
      },
    });

    const op = await tx.operator.create({
      data: {
        name:            operatorName.trim(),
        email:           cleanEmail,
        password:        hashedPassword,
        role:            'ADMIN',
        establishmentId: est.id,
      },
    });

    await tx.fraudSettings.create({ data: { establishmentId: est.id } });

    return { est, op };
  });

  await audit.log({
    action:     'ESTABLISHMENT_CREATED',
    entity:     'Establishment',
    entityId:   est.id,
    operatorId: createdByOperatorId,
    metadata:   { cnpj: cleanCnpj, operatorEmail: cleanEmail },
  });

  return {
    mensagem: 'Estabelecimento cadastrado com sucesso.',
    estabelecimento: {
      id:              est.id,
      nome:            est.name,
      cnpj:            formatCnpj(cleanCnpj),
      cidade:          est.city,
      estado:          est.state,
      cashbackPercent: parsedCashback,
      criadoEm:        formatDateBR(est.createdAt),
    },
    operador: {
      nome:            op.name,
      email:           op.email,
      senhaProvisoria: operatorPassword,
    },
  };
}

async function listAll() {
  const establishments = await prisma.establishment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { operators: true, customers: true } },
    },
  });

  return {
    mensagem: 'Estabelecimentos listados com sucesso.',
    total: establishments.length,
    estabelecimentos: establishments.map((e) => ({
      id:              e.id,
      nome:            e.name,
      cnpj:            formatCnpj(e.cnpj),
      telefone:        e.phone,
      cidade:          e.city,
      estado:          e.state,
      logoUrl:         e.logoUrl || null,
      cashbackPercent: parseFloat(e.cashbackPercent),
      minRedemption:   e.minRedemption ? parseFloat(e.minRedemption) : null,
      totalOperadores: e._count.operators,
      totalClientes:   e._count.customers,
      criadoEm:        formatDateBR(e.createdAt),
    })),
  };
}

async function uploadLogo(establishmentId, fileBuffer) {
  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  if (!est) throw createError('Estabelecimento não encontrado.', 404);

  const logosDir = path.join(__dirname, '../uploads/logos');
  if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });

  const outputPath = path.join(logosDir, `${establishmentId}.webp`);

  await sharp(fileBuffer)
    .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 85 })
    .toFile(outputPath);

  const logoUrl = `/uploads/logos/${establishmentId}.webp`;

  await prisma.establishment.update({
    where: { id: establishmentId },
    data:  { logoUrl },
  });

  return { logoUrl };
}

const DEEP_LINK_BASE = 'https://postocash.app/register';

async function getPublicData(establishmentId) {
  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  if (!est) throw createError('Estabelecimento não encontrado.', 404);

  return {
    establishmentId: est.id,
    name:            est.name,
    city:            est.city   || null,
    cashbackPercent: parseFloat(est.cashbackPercent),
    logoUrl:         est.logoUrl || null,
    deepLink:        `${DEEP_LINK_BASE}?e=${est.id}`,
  };
}

async function generateQRCodeBuffer(establishmentId) {
  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  if (!est) throw createError('Estabelecimento não encontrado.', 404);

  const url    = `${DEEP_LINK_BASE}?e=${est.id}`;
  const buffer = await QRCode.toBuffer(url, {
    type:   'png',
    width:  512,
    margin: 2,
    color:  { dark: '#1e3a8a', light: '#ffffff' },
  });

  return { buffer, name: est.name, url };
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

async function updateBranding(establishmentId, { primaryColor, secondaryColor }, operatorId) {
  const est = await prisma.establishment.findUnique({ where: { id: establishmentId } });
  if (!est) throw createError('Estabelecimento não encontrado.', 404);

  if (primaryColor   && !HEX_COLOR.test(primaryColor))   throw createError('Cor primária inválida. Use formato #RRGGBB.', 400);
  if (secondaryColor && !HEX_COLOR.test(secondaryColor)) throw createError('Cor secundária inválida. Use formato #RRGGBB.', 400);

  const data = {};
  if (primaryColor)   data.primaryColor   = primaryColor;
  if (secondaryColor) data.secondaryColor = secondaryColor;

  const updated = await prisma.establishment.update({ where: { id: establishmentId }, data });

  await audit.log({
    action:    'BRANDING_UPDATED',
    entity:    'Establishment',
    entityId:  establishmentId,
    operatorId,
    metadata:  data,
  });

  return {
    mensagem:      'Identidade visual atualizada com sucesso.',
    primaryColor:  updated.primaryColor,
    secondaryColor: updated.secondaryColor,
  };
}

async function createFromStripe({
  nome, cnpj, telefone,
  operatorName, operatorEmail, operatorPassword,
  stripeCustomerId, stripeSubscriptionId,
}) {
  if (!nome?.trim())         throw createError('Nome do estabelecimento é obrigatório.', 400);
  if (!operatorEmail?.trim()) throw createError('E-mail do operador é obrigatório.', 400);

  const cleanCnpj  = String(cnpj).replace(/\D/g, '');
  if (cleanCnpj.length !== 14) throw createError('CNPJ inválido.', 400);

  const cleanEmail = operatorEmail.trim().toLowerCase();

  const [existingEst, existingOp] = await Promise.all([
    prisma.establishment.findUnique({ where: { cnpj: cleanCnpj } }),
    prisma.operator.findUnique({ where: { email: cleanEmail } }),
  ]);

  if (existingEst) throw createError('CNPJ já cadastrado.', 409);
  if (existingOp)  throw createError('E-mail do operador já cadastrado.', 409);

  const hashedPassword = await bcrypt.hash(operatorPassword, 10);

  const { est, op } = await prisma.$transaction(async (tx) => {
    const est = await tx.establishment.create({
      data: {
        name:                 nome.trim(),
        cnpj:                 cleanCnpj,
        cashbackPercent:      5,
        phone:                telefone?.trim() || null,
        stripeCustomerId,
        stripeSubscriptionId,
        subscriptionStatus:   'ACTIVE',
      },
    });

    const op = await tx.operator.create({
      data: {
        name:            (operatorName || nome).trim(),
        email:           cleanEmail,
        password:        hashedPassword,
        role:            'ADMIN',
        establishmentId: est.id,
      },
    });

    await tx.fraudSettings.create({ data: { establishmentId: est.id } });

    return { est, op };
  });

  await audit.log({
    action:   'ESTABLISHMENT_CREATED_STRIPE',
    entity:   'Establishment',
    entityId: est.id,
    metadata: { cnpj: cleanCnpj, operatorEmail: cleanEmail, stripeSubscriptionId },
  });

  return { est, op };
}

module.exports = { create, createFromStripe, listAll, uploadLogo, updateBranding, getPublicData, generateQRCodeBuffer };
