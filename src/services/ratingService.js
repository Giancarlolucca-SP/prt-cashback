const { PrismaClient } = require('@prisma/client');
const { createError } = require('../middlewares/errorMiddleware');
const { maskCpf, maskName, formatCpf } = require('../utils/cpfValidator');
const {
  resolveRange,
  resolveEstablishmentId,
  parseAttendantRaw,
} = require('./rankingService');
const attendantService = require('./attendantService');

const prisma = new PrismaClient();

function round2(n) { return Math.round(n * 100) / 100; }

// ── createRating ────────────────────────────────────────────────────────────
// Submitted by an authenticated customer from the mobile app. Scoped to the
// customer's own establishment. One rating per transaction (transactionId is
// @unique in the schema; we also pre-check for a friendly 409).

async function createRating({ transactionId, attendantCode, attendantName, stars, comment }, customerPayload) {
  const customerId      = customerPayload.sub;
  const establishmentId = customerPayload.establishmentId;

  // The attendant reference is the same key the ranking groups by ("code-name").
  // Accept either field name; `attendantCode` is what the mobile client sends.
  const attendantKey = String(attendantName || attendantCode || '').trim();
  if (!attendantKey) throw createError('Selecione o atendente que você deseja avaliar.', 400);

  const parsedStars = Number(stars);
  if (!Number.isInteger(parsedStars) || parsedStars < 1 || parsedStars > 5) {
    throw createError('A avaliação deve ser um número inteiro de 1 a 5 estrelas.', 400);
  }

  const cleanComment = typeof comment === 'string' && comment.trim()
    ? comment.trim().slice(0, 1000)
    : null;

  // If a transaction is referenced, make sure it belongs to this customer and
  // establishment, and that it hasn't been rated yet.
  if (transactionId) {
    const transaction = await prisma.transaction.findUnique({
      where:  { id: transactionId },
      select: { customerId: true, establishmentId: true },
    });
    if (!transaction || transaction.customerId !== customerId
        || transaction.establishmentId !== establishmentId) {
      throw createError('Abastecimento não encontrado.', 404);
    }

    const existing = await prisma.attendantRating.findUnique({
      where:  { transactionId },
      select: { id: true },
    });
    if (existing) throw createError('Este abastecimento já foi avaliado.', 409);
  }

  let rating;
  try {
    rating = await prisma.attendantRating.create({
      data: {
        stars:         parsedStars,
        comment:       cleanComment,
        attendantName: attendantKey,
        customerId,
        transactionId: transactionId || null,
        establishmentId,
      },
    });
  } catch (err) {
    // Unique-constraint race: another request rated the same transaction first
    if (err.code === 'P2002') throw createError('Este abastecimento já foi avaliado.', 409);
    throw err;
  }

  return {
    mensagem: 'Avaliação registrada com sucesso. Obrigado pelo seu feedback!',
    avaliacao: {
      id:        rating.id,
      estrelas:  rating.stars,
      comentario: rating.comment,
      atendente: parseAttendantRaw(rating.attendantName).name,
    },
  };
}

// ── listAttendants ──────────────────────────────────────────────────────────
// Customer-facing list of attendants available for selection on the rating
// screen. Derived from the same source the ranking uses (Transaction.attendantName)
// so both stay in sync.

async function listAttendants(customerPayload) {
  const establishmentId = customerPayload.establishmentId;

  // Union of registered attendants (with photos) and any distinct attendant
  // names seen on transactions, keyed by the same attendantKey.
  const [rows, registered] = await Promise.all([
    prisma.transaction.findMany({
      where:    { establishmentId, attendantName: { not: null }, status: 'CONFIRMED' },
      distinct: ['attendantName'],
      select:   { attendantName: true },
    }),
    prisma.attendant.findMany({ where: { establishmentId, active: true } }),
  ]);

  const byKey = new Map();
  for (const a of registered) {
    byKey.set(a.attendantKey, { key: a.attendantKey, code: a.code || '', name: a.name, photoUrl: a.photoUrl || null });
  }
  for (const r of rows) {
    if (byKey.has(r.attendantName)) continue;
    const { code, name } = parseAttendantRaw(r.attendantName);
    byKey.set(r.attendantName, { key: r.attendantName, code, name, photoUrl: null });
  }

  const atendentes = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  return { mensagem: 'Atendentes disponíveis para avaliação.', atendentes };
}

// ── listRatings (admin/operator) ──────────────────────────────────────────────
// Returns the rating list (newest first, LGPD-masked customer identity) plus
// per-attendant aggregates { attendant, code, avgStars, totalRatings }.

async function listRatings(operator, query = {}) {
  const { start: startDate, end: endDate } = resolveRange(query);
  const establishmentId = resolveEstablishmentId(operator, query);
  const { attendant } = query;

  const where = {
    establishmentId,
    createdAt: { gte: startDate, lte: endDate },
  };
  if (attendant && attendant !== 'todos') {
    where.attendantName = { contains: attendant, mode: 'insensitive' };
  }

  const ratings = await prisma.attendantRating.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true, cpf: true } } },
  });

  // Per-attendant aggregates
  const agg = new Map();
  for (const r of ratings) {
    if (!agg.has(r.attendantName)) {
      agg.set(r.attendantName, { raw: r.attendantName, sum: 0, count: 0 });
    }
    const a = agg.get(r.attendantName);
    a.sum   += r.stars;
    a.count += 1;
  }

  const aggregates = Array.from(agg.values())
    .map((a) => {
      const { code, name } = parseAttendantRaw(a.raw);
      return {
        attendant:    name,
        code,
        avgStars:     round2(a.sum / a.count),
        totalRatings: a.count,
      };
    })
    .sort((a, b) => b.avgStars - a.avgStars || b.totalRatings - a.totalRatings);

  const list = ratings.map((r) => {
    const { code, name } = parseAttendantRaw(r.attendantName);
    return {
      id:            r.id,
      stars:         r.stars,
      comment:       r.comment,
      attendant:     name,
      attendantCode: code,
      // LGPD: never expose the full customer identity in the admin view
      customerName:  maskName(r.customer?.name || ''),
      customerCpf:   maskCpf(r.customer?.cpf || ''),
      createdAt:     r.createdAt.toISOString(),
    };
  });

  return {
    period: {
      startDate: startDate.toISOString().slice(0, 10),
      endDate:   endDate.toISOString().slice(0, 10),
    },
    aggregates,
    ratings: list,
    total:   list.length,
  };
}

module.exports = { createRating, listAttendants, listRatings };
