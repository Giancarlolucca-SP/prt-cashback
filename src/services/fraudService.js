const { PrismaClient } = require('@prisma/client');
const { stripCpf, isValidCpf, formatCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { createError } = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfCurrentWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Week starts on Monday
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// ── 1. getSettings ────────────────────────────────────────────────────────────

async function getSettings(establishmentId) {
  const existing = await prisma.fraudSettings.findUnique({
    where: { establishmentId },
  });

  if (existing) return existing;

  // Create with all defaults on first access. checkTransaction/checkRedemption
  // call this on every transaction, so a brand-new establishment's first
  // concurrent requests can race here — the establishmentId unique
  // constraint is the real guard; on a P2002 just fetch what the winner created.
  try {
    return await prisma.fraudSettings.create({
      data: { establishmentId },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return prisma.fraudSettings.findUnique({ where: { establishmentId } });
    }
    throw err;
  }
}

// ── 2. updateSettings ─────────────────────────────────────────────────────────

// All of these gate whether a customer can fuel/redeem at all — a value of 0
// or less doesn't mean "unlimited", it means every transaction is blocked
// (checkTransaction/checkRedemption compare with >=), so a mistyped 0 would
// silently lock every customer out of the station.
function assertPositiveInt(value, label) {
  if (value == null) return;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    throw createError(`${label} deve ser um número inteiro maior que zero.`, 400);
  }
}

function assertPositiveAmount(value, label) {
  if (value == null) return;
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) {
    throw createError(`${label} deve ser maior que zero.`, 400);
  }
}

async function updateSettings(establishmentId, data) {
  const allowed = [
    'maxFuelsPerDay',
    'maxFuelsPerWeek',
    'maxCashbackPerDay',
    'maxFuelAmount',
    'maxRedeemsPerWeek',
    'alertOnCashbackExceed',
    'alertOnSuspiciousHour',
  ];

  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  if (Object.keys(updates).length === 0) {
    throw createError('Nenhum campo válido para atualizar.', 400);
  }

  assertPositiveInt(updates.maxFuelsPerDay, 'Máximo de abastecimentos por dia');
  assertPositiveInt(updates.maxFuelsPerWeek, 'Máximo de abastecimentos por semana');
  assertPositiveInt(updates.maxRedeemsPerWeek, 'Máximo de resgates por semana');
  assertPositiveAmount(updates.maxCashbackPerDay, 'Máximo de cashback por dia');
  assertPositiveAmount(updates.maxFuelAmount, 'Valor máximo de abastecimento');

  // Ensure the row exists before updating
  await getSettings(establishmentId);

  return prisma.fraudSettings.update({
    where: { establishmentId },
    data: updates,
  });
}

// ── 3. checkTransaction ───────────────────────────────────────────────────────

async function checkTransaction(cpf, amount, cashbackValue, establishmentId) {
  const cleanCpf = stripCpf(cpf);

  // Load settings and blacklist check in parallel
  const [settings, blacklisted] = await Promise.all([
    getSettings(establishmentId),
    prisma.blacklistedCpf.findUnique({
      where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
    }),
  ]);

  // Rule 1 — CPF not blacklisted
  if (blacklisted) {
    throw createError(
      `CPF bloqueado. Motivo: ${blacklisted.reason}`,
      403
    );
  }

  // Rule 2 — Fuel amount limit
  const parsedAmount = parseFloat(amount);
  if (parsedAmount > parseFloat(settings.maxFuelAmount)) {
    throw createError(
      `Valor do abastecimento (${formatBRL(parsedAmount)}) excede o limite permitido de ${formatBRL(settings.maxFuelAmount)}.`,
      400
    );
  }

  // Fetch today's and this week's transactions for the customer at this establishment
  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
    select: { id: true },
  });

  if (!customer) return; // New customer — no history to check yet

  const [todayTxns, weekTxns, todayCashback] = await Promise.all([
    // Rule 3 — max fuels per day
    prisma.transaction.count({
      where: {
        customerId: customer.id,
        establishmentId,
        createdAt: { gte: startOfToday() },
      },
    }),
    // Rule 4 — max fuels per week
    prisma.transaction.count({
      where: {
        customerId: customer.id,
        establishmentId,
        createdAt: { gte: startOfCurrentWeek() },
      },
    }),
    // Rule 5 — max cashback per day
    prisma.transaction.aggregate({
      where: {
        customerId: customer.id,
        establishmentId,
        createdAt: { gte: startOfToday() },
      },
      _sum: { cashbackValue: true },
    }),
  ]);

  // Rule 3 — max fuels per day
  if (todayTxns >= settings.maxFuelsPerDay) {
    throw createError(
      `Limite de ${settings.maxFuelsPerDay} abastecimento(s) por dia atingido para este CPF.`,
      400
    );
  }

  // Rule 4 — max fuels per week
  if (weekTxns >= settings.maxFuelsPerWeek) {
    throw createError(
      `Limite de ${settings.maxFuelsPerWeek} abastecimento(s) por semana atingido para este CPF.`,
      400
    );
  }

  // Rule 5 — max cashback per day
  const cashbackToday = parseFloat(todayCashback._sum.cashbackValue || 0);
  const maxPerDay = parseFloat(settings.maxCashbackPerDay);
  if (cashbackToday + parseFloat(cashbackValue) > maxPerDay) {
    const remaining = Math.max(0, maxPerDay - cashbackToday);
    throw createError(
      `Limite diário de cashback de ${formatBRL(maxPerDay)} atingido. Disponível: ${formatBRL(remaining)}.`,
      400
    );
  }
}

// ── 4. checkRedemption ────────────────────────────────────────────────────────

async function checkRedemption(cpf, establishmentId) {
  const cleanCpf = stripCpf(cpf);

  const [settings, blacklisted] = await Promise.all([
    getSettings(establishmentId),
    prisma.blacklistedCpf.findUnique({
      where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
    }),
  ]);

  if (blacklisted) {
    throw createError(
      `CPF bloqueado. Motivo: ${blacklisted.reason}`,
      403
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
    select: { id: true },
  });

  if (!customer) return;

  const weekRedeems = await prisma.redemption.count({
    where: {
      customerId: customer.id,
      establishmentId,
      status: 'CONFIRMED',
      createdAt: { gte: startOfCurrentWeek() },
    },
  });

  if (weekRedeems >= settings.maxRedeemsPerWeek) {
    throw createError(
      `Limite de ${settings.maxRedeemsPerWeek} resgate(s) por semana atingido para este CPF.`,
      400
    );
  }
}

// ── 5. addToBlacklist ─────────────────────────────────────────────────────────

async function addToBlacklist(cpf, reason, operatorId, establishmentId) {
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  if (!reason || !reason.trim()) throw createError('Motivo do bloqueio é obrigatório.', 400);

  const cleanCpf = stripCpf(cpf);

  try {
    const entry = await prisma.blacklistedCpf.create({
      data: {
        cpf: cleanCpf,
        reason: reason.trim(),
        blockedBy: operatorId,
        establishmentId,
      },
    });

    return {
      mensagem: `CPF ${formatCpf(cleanCpf)} bloqueado com sucesso.`,
      bloqueio: {
        id: entry.id,
        cpf: formatCpf(entry.cpf),
        motivo: entry.reason,
        bloqueadoEm: formatDateBR(entry.createdAt),
      },
    };
  } catch (err) {
    if (err.code === 'P2002') {
      throw createError(`CPF ${formatCpf(cleanCpf)} já está na lista de bloqueios.`, 409);
    }
    throw err;
  }
}

// ── 6. removeFromBlacklist ────────────────────────────────────────────────────

async function removeFromBlacklist(cpf, establishmentId) {
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const cleanCpf = stripCpf(cpf);

  const entry = await prisma.blacklistedCpf.findUnique({
    where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
  });

  if (!entry) {
    throw createError(`CPF ${formatCpf(cleanCpf)} não está na lista de bloqueios.`, 404);
  }

  await prisma.blacklistedCpf.delete({
    where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
  });

  return { mensagem: `CPF ${formatCpf(cleanCpf)} removido da lista de bloqueios.` };
}

// ── 7. getBlacklist ───────────────────────────────────────────────────────────

async function getBlacklist(establishmentId) {
  const entries = await prisma.blacklistedCpf.findMany({
    where: { establishmentId },
    orderBy: { createdAt: 'desc' },
    include: {
      operator: { select: { name: true, email: true } },
    },
  });

  return {
    mensagem: 'Lista de bloqueios obtida com sucesso.',
    total: entries.length,
    bloqueios: entries.map((e) => ({
      id: e.id,
      cpf: formatCpf(e.cpf),
      motivo: e.reason,
      bloqueadoPor: e.operator.name,
      bloqueadoEm: formatDateBR(e.createdAt),
    })),
  };
}

module.exports = {
  getSettings,
  updateSettings,
  checkTransaction,
  checkRedemption,
  addToBlacklist,
  removeFromBlacklist,
  getBlacklist,
};
