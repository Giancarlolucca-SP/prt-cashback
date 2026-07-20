const sharp = require('sharp');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt   = require('jsonwebtoken');
const { createError } = require('../middlewares/errorMiddleware');
const { formatDateBR } = require('../utils/dateFormatter');
const audit = require('./auditService');

const prisma = new PrismaClient();

// ── Supabase (lazy) — logos must survive redeploys, unlike local disk ────────
// (this backend runs as an ephemeral-filesystem web service on Render, and
// writing to a local uploads/ folder means the file vanishes on the next
// deploy/restart; every other uploaded image in this codebase — selfies,
// receipt photos, attendant photos — already goes through Supabase Storage
// for the same reason).

const LOGO_BUCKET = 'logos';

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

let _bucketEnsured = false;
async function ensureLogoBucket(supabase) {
  if (_bucketEnsured) return;
  try {
    const { data } = await supabase.storage.getBucket(LOGO_BUCKET);
    if (!data) await supabase.storage.createBucket(LOGO_BUCKET, { public: true });
  } catch {
    try { await supabase.storage.createBucket(LOGO_BUCKET, { public: true }); } catch {}
  }
  _bucketEnsured = true;
}

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

  // existingEst/existingOp above is check-then-act, not atomic — a
  // double-submit (double-click on this admin form) can race past it before
  // either commits. Catch the resulting P2002 instead of an unhandled 500.
  let est, op;
  try {
    ({ est, op } = await prisma.$transaction(async (tx) => {
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
    }));
  } catch (err) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target || '');
      if (target.includes('cnpj')) throw createError('CNPJ já cadastrado.', 409);
      if (target.includes('email')) throw createError('E-mail do operador já cadastrado.', 409);
    }
    throw err;
  }

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

  const supabase = getSupabase();
  if (!supabase) throw createError('Armazenamento de imagens não configurado.', 503);
  await ensureLogoBucket(supabase);

  const buf = await sharp(fileBuffer)
    .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .webp({ quality: 85 })
    .toBuffer();

  const path = `${establishmentId}.webp`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, buf, { contentType: 'image/webp', upsert: true });
  if (error) throw createError(`Falha ao enviar a logo: ${error.message}`, 502);

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  // Cache-bust so the admin sees the new logo immediately on re-upload
  const logoUrl = data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : null;

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

  let est, op;
  try {
    ({ est, op } = await prisma.$transaction(async (tx) => {
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
    }));
  } catch (err) {
    // A truly concurrent double-submit (e.g. a double-click) can race past
    // the existingEst/existingOp check above before either commits — since
    // both requests reuse the same Stripe idempotency key when a
    // subscriptionId is involved, this is the SAME logical signup, not two
    // different ones. Treat the loser as a no-op instead of surfacing a raw
    // conflict for a signup that, from the customer's perspective, worked.
    if (err.code === 'P2002' && stripeSubscriptionId) {
      const winner = await prisma.establishment.findFirst({ where: { stripeSubscriptionId } });
      if (winner) {
        const winnerOp = await prisma.operator.findFirst({ where: { establishmentId: winner.id } });
        // alreadyExisted=true tells the caller NOT to send/return `password`
        // — it was generated locally by the losing request and does not
        // match the winner's actual (already-emailed) password.
        return { est: winner, op: winnerOp, alreadyExisted: true };
      }
    }
    throw err;
  }

  await audit.log({
    action:   'ESTABLISHMENT_CREATED_STRIPE',
    entity:   'Establishment',
    entityId: est.id,
    metadata: { cnpj: cleanCnpj, operatorEmail: cleanEmail, stripeSubscriptionId },
  });

  return { est, op, alreadyExisted: false };
}

// ── OAuth registration completion ──────────────────────────────────────────────

async function completarCadastroOAuth({ nome, cnpj, telefone, cidade, estado }, operatorId) {
  if (!nome?.trim()) throw createError('Nome do estabelecimento é obrigatório.', 400);

  const cleanCnpj = String(cnpj || '').replace(/\D/g, '');
  if (cleanCnpj.length !== 14) throw createError('CNPJ inválido (14 dígitos).', 400);

  const [existingEst, operator] = await Promise.all([
    prisma.establishment.findUnique({ where: { cnpj: cleanCnpj } }),
    prisma.operator.findUnique({ where: { id: operatorId } }),
  ]);

  if (!operator)       throw createError('Operador não encontrado.', 404);
  if (existingEst)     throw createError('CNPJ já cadastrado no sistema.', 409);
  if (operator.establishmentId) throw createError('Estabelecimento já cadastrado para este operador.', 409);

  // existingEst above is check-then-act — a double-submit of the "finalizar
  // cadastro" button (a real, plausible UI double-click, not just a
  // theoretical race) can pass it twice before either commits.
  let establishment;
  try {
    establishment = await prisma.establishment.create({
      data: {
        name:  nome.trim(),
        cnpj:  cleanCnpj,
        phone: telefone || null,
        city:  cidade   || null,
        state: estado   || null,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') throw createError('CNPJ já cadastrado no sistema.', 409);
    throw err;
  }

  const updated = await prisma.operator.update({
    where: { id: operatorId },
    data:  { establishmentId: establishment.id, role: 'ADMIN' },
    include: { establishment: true },
  });

  const token = jwt.sign(
    {
      id:              updated.id,
      name:            updated.name,
      email:           updated.email,
      role:            updated.role,
      establishmentId: updated.establishmentId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_OPERATOR_EXPIRES_IN || '8h' }
  );

  const est = updated.establishment;

  return {
    mensagem: 'Cadastro completado com sucesso.',
    token,
    operador: {
      id:                updated.id,
      nome:              updated.name,
      email:             updated.email,
      perfil:            updated.role,
      cargo:             updated.role,
      estabelecimentoId: updated.establishmentId,
      estabelecimento:   est.name,
      logoUrl:           est.logoUrl      || null,
      primaryColor:      est.primaryColor   ?? '#FF6B00',
      secondaryColor:    est.secondaryColor ?? '#1e293b',
      cashbackPercent:   parseFloat(est.cashbackPercent),
    },
  };
}

module.exports = { create, createFromStripe, listAll, uploadLogo, updateBranding, getPublicData, generateQRCodeBuffer, completarCadastroOAuth };
