const { PrismaClient } = require('@prisma/client');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { formatCpf, maskCpf, maskName } = require('../utils/cpfValidator');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');
const messageQueueService = require('./messageQueueService');

const prisma = new PrismaClient();

function getCutoffDate(filterPeriod) {
  const now = new Date();
  switch (filterPeriod) {
    case 'ONE_MONTH':    { const d = new Date(now); d.setMonth(d.getMonth() - 1);       return d; }
    case 'TWO_MONTHS':   { const d = new Date(now); d.setMonth(d.getMonth() - 2);       return d; }
    case 'THREE_MONTHS': { const d = new Date(now); d.setMonth(d.getMonth() - 3);       return d; }
    case 'ONE_YEAR':     { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    default: throw createError('Período inválido.', 400);
  }
}

async function getFilteredCustomers(filterType, filterPeriod, establishmentId) {
  const cutoff = getCutoffDate(filterPeriod);

  if (filterType === 'ACTIVE') {
    const customers = await prisma.customer.findMany({
      where: {
        establishmentId,
        transactions: {
          some: { createdAt: { gte: cutoff }, establishmentId },
        },
      },
      include: {
        transactions: {
          where: { createdAt: { gte: cutoff }, establishmentId },
          select: { amount: true },
        },
      },
    });

    return customers
      .map((c) => ({
        ...c,
        totalSpent: c.transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }

  if (filterType === 'INACTIVE') {
    return prisma.customer.findMany({
      where: {
        establishmentId,
        transactions: {
          none: { createdAt: { gte: cutoff }, establishmentId },
        },
      },
    });
  }

  throw createError('Tipo de filtro inválido.', 400);
}

async function preview({ filterType, filterPeriod, rewardType, rewardValue }, establishmentId) {
  if (!['ACTIVE', 'INACTIVE'].includes(filterType)) {
    throw createError('Tipo de filtro inválido.', 400);
  }
  if (!['ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'ONE_YEAR'].includes(filterPeriod)) {
    throw createError('Período inválido.', 400);
  }
  if (!['FIXED', 'PER_LITER'].includes(rewardType)) {
    throw createError('Tipo de recompensa inválido.', 400);
  }

  const parsedValue = parseFloat(rewardValue);
  if (isNaN(parsedValue) || parsedValue <= 0) {
    throw createError('Valor da recompensa deve ser maior que zero.', 400);
  }

  const customers = await getFilteredCustomers(filterType, filterPeriod, establishmentId);

  const totalCost = rewardType === 'FIXED' ? parsedValue * customers.length : 0;

  return {
    mensagem: 'Prévia da campanha gerada com sucesso.',
    totalClientes: customers.length,
    custoTotal: formatBRL(totalCost),
    custoTotalNumerico: totalCost,
    clientes: customers.map((c) => ({
      id: c.id,
      nome: c.name,
      cpf: formatCpf(c.cpf),
      saldo: formatBRL(c.balance),
      ...(filterType === 'ACTIVE' ? { totalGasto: formatBRL(c.totalSpent) } : {}),
    })),
  };
}

// In-process mutex: create() has no DB-level idempotency key to rely on (no
// natural one exists for a bulk operator action), so the duplicate-submission
// guard below is a check-then-act read that a truly concurrent second request
// (double-click, slow connection firing the POST twice) can still race past
// before either commits. This serializes campaign creation per establishment
// — consistent with the same in-process-mutex assumption pendingRedemptions.js
// already relies on elsewhere in this codebase (single Node process).
const campaignCreationInFlight = new Set();

async function create({ name, filterType, filterPeriod, rewardType, rewardValue, message }, operator) {
  const { id: operatorId, establishmentId } = operator;

  if (campaignCreationInFlight.has(establishmentId)) {
    throw createError('Já existe uma criação de campanha em andamento para este estabelecimento. Aguarde alguns segundos e tente novamente.', 409);
  }
  campaignCreationInFlight.add(establishmentId);
  try {
    return await createInternal({ name, filterType, filterPeriod, rewardType, rewardValue, message }, operator);
  } finally {
    campaignCreationInFlight.delete(establishmentId);
  }
}

async function createInternal({ name, filterType, filterPeriod, rewardType, rewardValue, message }, operator) {
  const { id: operatorId, establishmentId } = operator;

  if (!name || !name.trim()) {
    throw createError('Nome da campanha é obrigatório.', 400);
  }
  if (name.trim().length > 50) {
    throw createError('Nome da campanha deve ter no máximo 50 caracteres.', 400);
  }
  if (!['ACTIVE', 'INACTIVE'].includes(filterType)) {
    throw createError('Tipo de filtro inválido.', 400);
  }
  if (!['ONE_MONTH', 'TWO_MONTHS', 'THREE_MONTHS', 'ONE_YEAR'].includes(filterPeriod)) {
    throw createError('Período inválido.', 400);
  }
  if (!['FIXED', 'PER_LITER'].includes(rewardType)) {
    throw createError('Tipo de recompensa inválido.', 400);
  }

  const parsedValue = parseFloat(rewardValue);
  if (isNaN(parsedValue) || parsedValue <= 0) {
    throw createError('Valor da recompensa deve ser maior que zero.', 400);
  }
  if (!message || !message.trim()) {
    throw createError('Mensagem da campanha é obrigatória.', 400);
  }

  // Duplicate-submission guard: create() has no client-supplied idempotency
  // key, and a FIXED-reward campaign bulk-credits every matched customer's
  // balance and enqueues a WhatsApp message to each of them — an operator
  // re-clicking "criar campanha" after seeing an error (see the post-commit
  // handling below) would otherwise double-credit and double-message every
  // customer at once, a much larger blast radius than any single-customer
  // flow. An identical resubmission (same filters/reward/message) within a
  // short window is treated as a duplicate and returns the original result.
  const CAMPAIGN_DUPLICATE_WINDOW_MS = 60 * 1000;
  const recentDuplicate = await prisma.campaign.findFirst({
    where: {
      establishmentId, name: name.trim(), filterType, filterPeriod, rewardType,
      rewardValue: parsedValue, message: message.trim(),
      createdAt: { gte: new Date(Date.now() - CAMPAIGN_DUPLICATE_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recentDuplicate) {
    // A first attempt can commit the campaign row + credit every matched
    // customer's balance, then fail on the WhatsApp enqueue step (the catch
    // around addToQueue below only logs, it never retries). Blindly
    // returning the cached result here would permanently lose the
    // notification for money that was already credited — check whether
    // anything actually got queued for this campaign, and retry the enqueue
    // now if not.
    const queueStatus = await messageQueueService.getCampaignQueueStatus(recentDuplicate.id);
    if (queueStatus.total === 0 && recentDuplicate.customerCount > 0) {
      try {
        const retryCustomers = await getFilteredCustomers(filterType, filterPeriod, establishmentId);
        await messageQueueService.addToQueue(retryCustomers.map((c) => ({
          establishmentId, campaignId: recentDuplicate.id, customerId: c.id,
          phone: c.phone, name: c.name, message: message.trim(), priority: 0,
        })));
        console.log(`[CAMPANHA] Reenfileiramento de mensagens para campanha ${recentDuplicate.id} (tentativa anterior não enfileirou nada).`);
      } catch (err) {
        console.error(`[campaignService] Retentativa de enfileiramento falhou para campanha ${recentDuplicate.id}:`, err.message);
      }
    }

    return {
      mensagem: 'Campanha criada! As mensagens serão enviadas em breve.',
      clientesAtingidos: recentDuplicate.customerCount,
      mensagensNaFila:   recentDuplicate.customerCount,
      previsaoEnvio:     null,
      campanha: {
        id: recentDuplicate.id,
        totalClientes: recentDuplicate.customerCount,
        custoTotal: formatBRL(recentDuplicate.totalCost),
        status: recentDuplicate.status,
        criadaEm: formatDateBR(recentDuplicate.createdAt),
      },
    };
  }

  const [customers, establishment] = await Promise.all([
    getFilteredCustomers(filterType, filterPeriod, establishmentId),
    prisma.establishment.findUnique({ where: { id: establishmentId }, select: { name: true } }),
  ]);

  if (customers.length === 0) {
    throw createError('Nenhum cliente encontrado com os filtros selecionados.', 400);
  }

  const totalCost = rewardType === 'FIXED' ? parsedValue * customers.length : 0;

  // Campaign row + FIXED-reward credits committed atomically: previously
  // these were two separate writes, so a failure in the credit step left an
  // orphaned Campaign row behind — which the duplicate-guard above would
  // then treat as proof the campaign "already succeeded" on any retry,
  // silently masking that zero customers were ever credited.
  const campaign = await prisma.$transaction(async (tx) => {
    const camp = await tx.campaign.create({
      data: {
        establishmentId,
        operatorId,
        name: name.trim(),
        filterType,
        filterPeriod,
        rewardType,
        rewardValue: parsedValue,
        message: message.trim(),
        customerCount: customers.length,
        totalCost,
        status: 'SENT',
      },
    });

    if (rewardType === 'FIXED') {
      await Promise.all(
        customers.map((c) =>
          tx.customer.update({
            where: { id: c.id },
            data: { balance: { increment: parsedValue } },
          })
        )
      );
    }

    return camp;
  });

  // Everything below is best-effort: the campaign row is created and (for
  // FIXED rewards) every customer's balance already credited above — a
  // failure past this point must not throw, or the caller would see an error
  // for an action that already moved money for potentially hundreds of
  // customers, and might retry (the duplicate guard above only catches a
  // retry with identical filters/reward/message — this avoids relying on it).
  try {
    await Promise.all(
      customers.map((c) =>
        audit.log({
          action: 'CAMPAIGN_REWARD_APPLIED',
          entity: 'Campaign',
          entityId: campaign.id,
          operatorId,
          metadata: {
            customerId: c.id,
            rewardType,
            rewardValue: parsedValue,
            campaignId: campaign.id,
            establishmentId,
          },
        })
      )
    );
  } catch (err) {
    console.error(`[campaignService] Falha ao registrar auditoria da campanha ${campaign.id} (recompensas já aplicadas):`, err.message);
  }

  // Enqueue WhatsApp messages — controlled delivery at 3–6 s intervals
  const queueMessages = customers.map((c) => ({
    establishmentId,
    campaignId:   campaign.id,
    customerId:   c.id,
    phone:        c.phone,
    name:         c.name,
    message:      message.trim(),
    priority:     0,
  }));

  let queueResult = { queued: 0, previsao: null };
  try {
    queueResult = await messageQueueService.addToQueue(queueMessages);
    console.log(`[CAMPANHA] ${queueResult.queued} mensagens adicionadas à fila. Previsão: ${queueResult.previsao}`);
  } catch (err) {
    console.error(`[campaignService] Falha ao enfileirar mensagens da campanha ${campaign.id} (recompensas já aplicadas):`, err.message);
  }

  return {
    mensagem: 'Campanha criada! As mensagens serão enviadas em breve.',
    clientesAtingidos: customers.length,
    mensagensNaFila:   queueResult.queued,
    previsaoEnvio:     queueResult.previsao,
    campanha: {
      id: campaign.id,
      totalClientes: customers.length,
      custoTotal: formatBRL(totalCost),
      status: campaign.status,
      criadaEm: formatDateBR(campaign.createdAt),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFilterPeriodDays(filterPeriod) {
  switch (filterPeriod) {
    case 'ONE_MONTH':    return 30;
    case 'TWO_MONTHS':  return 60;
    case 'THREE_MONTHS': return 90;
    case 'ONE_YEAR':    return 365;
    default: return 30;
  }
}

function computePeriodDates(createdAt, filterPeriod) {
  const end = new Date(createdAt);
  const start = new Date(createdAt);
  start.setDate(start.getDate() - getFilterPeriodDays(filterPeriod));
  return { start, end };
}

function formatLiters(liters) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(liters || 0) + 'L';
}

function formatCampaign(c, stats = {}) {
  const { start, end } = computePeriodDates(c.createdAt, c.filterPeriod);
  const rewardFormatted =
    c.rewardType === 'PER_LITER'
      ? `${formatBRL(c.rewardValue)}/L`
      : formatBRL(c.rewardValue);

  return {
    id: c.id,
    name: c.name || '',
    message: c.message,
    rewardType: c.rewardType,
    rewardFormatted,
    rewardValue: parseFloat(c.rewardValue),
    totalCost: parseFloat(c.totalCost),
    totalCostFormatted: formatBRL(c.totalCost),
    customerCount: c.customerCount,
    status: c.status,
    statusLabel: c.status === 'CLOSED' ? 'encerrada' : 'ativa',
    filterType: c.filterType,
    filterPeriod: c.filterPeriod,
    periodStart: formatDateBR(start),
    periodEnd: formatDateBR(end),
    createdAtFormatted: formatDateBR(c.createdAt),
    operatorName: c.operator?.name || '—',
    // ── Métricas enriquecidas ───────────────────────────────────────────────
    totalLiters:         formatLiters(stats.totalLiters),
    totalCashbackUsed:   formatBRL(stats.totalCashbackUsed ?? parseFloat(c.totalCost)),
    uniqueCustomers:     stats.uniqueCustomers ?? c.customerCount,
    redemptionRate:      `${stats.redemptionRate ?? 0}%`,
    returnedCustomers:   stats.returnedCustomers ?? 0,
    returnRate:          stats.returnRate        ?? 0,
    avgDayToReturn:      stats.avgDayToReturn    ?? 0,
  };
}

async function getCampaignStats(c) {
  const { start, end } = computePeriodDates(c.createdAt, c.filterPeriod);

  const [txnAgg, redeemers, returneeTxns] = await Promise.all([
    // Total de litros abastecidos no período da campanha
    prisma.transaction.aggregate({
      where: {
        establishmentId: c.establishmentId,
        createdAt: { gte: start, lte: end },
      },
      _sum: { liters: true },
    }),
    // Clientes únicos que resgataram no período
    prisma.redemption.findMany({
      where: {
        establishmentId: c.establishmentId,
        status: 'CONFIRMED',
        createdAt: { gte: start, lte: end },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    // Primeiras transações por cliente APÓS o envio da campanha
    prisma.transaction.findMany({
      where: {
        establishmentId: c.establishmentId,
        createdAt: { gt: c.createdAt },
      },
      select: { customerId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const totalLiters     = parseFloat(txnAgg._sum.liters || 0);
  const uniqueRedeemers = redeemers.length;
  const redemptionRate  = c.customerCount > 0
    ? Math.round((uniqueRedeemers / c.customerCount) * 100)
    : 0;

  // Primeira transação por cliente após a campanha
  const firstReturnMap = new Map();
  for (const tx of returneeTxns) {
    if (!firstReturnMap.has(tx.customerId)) {
      firstReturnMap.set(tx.customerId, tx.createdAt);
    }
  }

  const returnedCount = firstReturnMap.size;
  const returnRate    = c.customerCount > 0
    ? Math.round((returnedCount / c.customerCount) * 100)
    : 0;

  let avgDayToReturn = 0;
  if (returnedCount > 0) {
    const campaignMs = new Date(c.createdAt).getTime();
    const totalDays  = [...firstReturnMap.values()].reduce(
      (sum, date) => sum + (new Date(date).getTime() - campaignMs) / 86_400_000,
      0
    );
    avgDayToReturn = Math.round((totalDays / returnedCount) * 10) / 10;
  }

  return {
    totalLiters,
    totalCashbackUsed: parseFloat(c.totalCost),
    uniqueCustomers:   c.customerCount,
    redemptionRate,
    returnedCustomers: returnedCount,
    returnRate,
    avgDayToReturn,
  };
}

async function list({ status, page = 1, limit = 6 }, establishmentId) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const take = parseInt(limit, 10) || 6;
  const skip = (pageNum - 1) * take;

  const where = { establishmentId };
  if (status === 'ativas')          where.status = { in: ['SENT', 'DRAFT'] };
  else if (status === 'encerradas') where.status = 'CLOSED';

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: { operator: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.campaign.count({ where }),
  ]);

  const enriched = await Promise.all(
    campaigns.map(async (c) => {
      const stats = await getCampaignStats(c);
      return formatCampaign(c, stats);
    })
  );

  return {
    campaigns: enriched,
    total,
    page: pageNum,
    pages: Math.ceil(total / take),
  };
}

async function close(campaignId, establishmentId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, establishmentId },
  });

  if (!campaign) throw createError('Campanha não encontrada.', 404);
  if (campaign.status === 'CLOSED') throw createError('Campanha já encerrada.', 400);

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'CLOSED' },
    include: { operator: { select: { name: true } } },
  });

  return {
    mensagem: 'Campanha encerrada com sucesso.',
    campanha: formatCampaign(updated),
  };
}

async function getReturnees(campaignId, establishmentId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, establishmentId },
  });
  if (!campaign) throw createError('Campanha não encontrada.', 404);

  const transactions = await prisma.transaction.findMany({
    where: {
      establishmentId,
      createdAt: { gt: campaign.createdAt },
    },
    include: {
      customer: { select: { name: true, cpf: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Primeira transação por cliente após o envio da campanha
  const firstByCustomer = new Map();
  for (const tx of transactions) {
    if (!firstByCustomer.has(tx.customerId)) {
      firstByCustomer.set(tx.customerId, tx);
    }
  }

  const campaignMs = new Date(campaign.createdAt).getTime();

  const returnees = [...firstByCustomer.values()]
    .map((tx) => {
      const daysToReturn = Math.round(
        ((new Date(tx.createdAt).getTime() - campaignMs) / 86_400_000) * 10
      ) / 10;
      return {
        name:             maskName(tx.customer.name),
        cpf:              maskCpf(tx.customer.cpf),
        returnDate:       tx.createdAt,
        daysToReturn,
        transactionValue: parseFloat(tx.amount),
        cashbackEarned:   parseFloat(tx.cashbackValue),
      };
    })
    .sort((a, b) => a.daysToReturn - b.daysToReturn);

  const returnRate = campaign.customerCount > 0
    ? Math.round((returnees.length / campaign.customerCount) * 100)
    : 0;

  return {
    campaignName:   campaign.name,
    totalReturnees: returnees.length,
    returnRate,
    returnees,
  };
}

module.exports = { preview, create, list, close, getReturnees };
