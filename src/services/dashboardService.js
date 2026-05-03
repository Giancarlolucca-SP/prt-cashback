const { PrismaClient } = require('@prisma/client');
const { createError }  = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

const AVG_FUEL_PRICE_PER_LITER = 5.50;

const PERIOD_DAYS = { '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90 };

function periodStart(period) {
  const days = PERIOD_DAYS[period] || 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function round2(n) { return Math.round(n * 100) / 100; }
function safeDivide(a, b) { return b === 0 ? 0 : round2(a / b); }
function safeFloat(v) { return round2(parseFloat(v) || 0); }

// ── Establishment resolver ────────────────────────────────────────────────────

function resolveEstablishmentId(operator, query) {
  if (operator.role === 'ADMIN' && query.establishmentId) {
    return query.establishmentId;
  }
  return operator.establishmentId;
}

// ── Date range resolver ───────────────────────────────────────────────────────

function parseBRDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y || isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function resolveRange(query = {}) {
  const { period, startDate, endDate } = query;

  if (startDate && endDate) {
    const start = parseBRDate(startDate);
    const end   = parseBRDate(endDate);
    if (!start || !end)   throw createError('Datas inválidas. Use o formato DD/MM/AAAA.', 400);
    if (start > end)      throw createError('A data inicial deve ser anterior à data final.', 400);
    const diffDays = (end - start) / 86400000;
    if (diffDays > 365)   throw createError('O intervalo máximo permitido é de 1 ano.', 400);
    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);
    return { start, end: endOfDay, days: Math.ceil(diffDays) + 1, custom: true };
  }

  const validPeriod = PERIOD_DAYS[period] ? period : '30d';
  const days = PERIOD_DAYS[validPeriod];
  return { start: periodStart(validPeriod), end: new Date(), days, custom: false };
}

// ── Safe fallback response ────────────────────────────────────────────────────

function emptyAnalytics(chartDays, startDate) {
  const chartData = [];
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    chartData.push({ date: d.toISOString().slice(0, 10), totalSales: 0, totalCashback: 0, count: 0 });
  }
  return {
    totalSales: 0, totalInvestment: 0, totalVolumeLiters: 0,
    totalFuelings: 0, avgVolumePerFueling: 0, avgInvestmentPerFueling: 0,
    avgInvestmentPerLiter: 0, avgInvestmentPerCustomer: 0, avgTicketPerFueling: 0,
    uniqueCustomersCount: 0, cashbackToRedeem: 0, customersWithBalance: 0,
    avgRedemptionValue: 0, chartData,
  };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

async function getAnalytics(operator, query = {}) {
  const { start: startDate, end: endDate, days } = resolveRange(query);
  const establishmentId = resolveEstablishmentId(operator, query);

  const where = { establishmentId, createdAt: { gte: startDate, lte: endDate } };

  // ── Core aggregates (critical) ─────────────────────────────────────────────
  let agg, uniqueRows, allTxns;
  try {
    [agg, uniqueRows, allTxns] = await Promise.all([
      prisma.transaction.aggregate({
        where,
        _sum:   { amount: true, cashbackValue: true },
        _count: { id: true },
      }),
      prisma.transaction.findMany({
        where,
        select:   { customerId: true },
        distinct: ['customerId'],
      }),
      prisma.transaction.findMany({
        where,
        select:  { amount: true, cashbackValue: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
  } catch (err) {
    console.error('[dashboard] Erro nas queries principais:', err.message);
    return emptyAnalytics(days, startDate);
  }

  const totalSales           = safeFloat(agg._sum.amount);
  const totalInvestment      = safeFloat(agg._sum.cashbackValue);
  const totalFuelings        = agg._count.id || 0;
  const uniqueCustomersCount = uniqueRows.length;

  const totalVolumeLiters        = round2(totalSales / AVG_FUEL_PRICE_PER_LITER);
  const avgVolumePerFueling      = safeDivide(totalVolumeLiters, totalFuelings);
  const avgInvestmentPerFueling  = safeDivide(totalInvestment, totalFuelings);
  const avgInvestmentPerLiter    = safeDivide(totalInvestment, totalVolumeLiters);
  const avgInvestmentPerCustomer = safeDivide(totalInvestment, uniqueCustomersCount);
  const avgTicketPerFueling      = safeDivide(totalSales, totalFuelings);

  // ── Supplementary aggregates (non-critical — fallback to 0) ───────────────
  let cashbackToRedeem   = 0;
  let customersWithBalance = 0;
  let avgRedemptionValue = 0;
  try {
    const [balanceAgg, custCount, redemptionAgg] = await Promise.all([
      prisma.customer.aggregate({
        where: { establishmentId, balance: { gt: 0 } },
        _sum:  { balance: true },
      }),
      prisma.customer.count({
        where: { establishmentId, balance: { gt: 0 } },
      }),
      prisma.redemption.aggregate({
        where: { establishmentId },
        _avg:  { amountUsed: true },
      }),
    ]);
    cashbackToRedeem    = safeFloat(balanceAgg._sum.balance);
    customersWithBalance = custCount || 0;
    avgRedemptionValue  = safeFloat(redemptionAgg._avg.amountUsed);
  } catch (err) {
    console.error('[dashboard] Erro nas queries suplementares:', err.message);
  }

  // ── Chart data: group by calendar day (UTC) ────────────────────────────────
  const dayMap = new Map();
  for (const t of allTxns) {
    const key = t.createdAt.toISOString().slice(0, 10);
    if (!dayMap.has(key)) {
      dayMap.set(key, { date: key, totalSales: 0, totalCashback: 0, count: 0 });
    }
    const d = dayMap.get(key);
    d.totalSales    += parseFloat(t.amount)        || 0;
    d.totalCashback += parseFloat(t.cashbackValue) || 0;
    d.count         += 1;
  }

  const chartData = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const key   = d.toISOString().slice(0, 10);
    const entry = dayMap.get(key) || { date: key, totalSales: 0, totalCashback: 0, count: 0 };
    chartData.push({
      date:          entry.date,
      totalSales:    round2(entry.totalSales),
      totalCashback: round2(entry.totalCashback),
      count:         entry.count,
    });
  }

  return {
    totalSales,
    totalInvestment,
    totalVolumeLiters,
    totalFuelings,
    avgVolumePerFueling,
    avgInvestmentPerFueling,
    avgInvestmentPerLiter,
    avgInvestmentPerCustomer,
    avgTicketPerFueling,
    uniqueCustomersCount,
    cashbackToRedeem,
    customersWithBalance,
    avgRedemptionValue,
    chartData,
  };
}

// ── Campaign Results ──────────────────────────────────────────────────────────

async function getCampaignResults(operator, query = {}) {
  const { start: startDate, end: endDate } = resolveRange(query);
  const establishmentId = resolveEstablishmentId(operator, query);

  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        establishmentId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ['SENT', 'CLOSED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    return campaigns.map((c) => {
      const name  = c.name  || '';
      const label = name || (c.message.length > 24 ? c.message.slice(0, 24) + '…' : c.message);
      return {
        id:                c.id,
        name,
        label,
        message:           c.message,
        customerCount:     c.customerCount,
        totalCashbackUsed: round2(safeFloat(c.totalCost)),
        status:            c.status,
        createdAt:         c.createdAt.toISOString().slice(0, 10),
      };
    });
  } catch (err) {
    console.error('[dashboard] Erro em getCampaignResults:', err.message);
    return [];
  }
}

// ── Fuel Types ────────────────────────────────────────────────────────────────

const FUEL_LABELS = {
  gasolina:           'Gasolina',
  gasolina_aditivada: 'Gás. Aditivada',
  etanol:             'Etanol',
  diesel:             'Diesel',
  diesel_s10:         'Diesel S-10',
  gnv:                'GNV',
};

async function getFuelTypes(operator, query = {}) {
  const { start: startDate, end: endDate } = resolveRange(query);
  const establishmentId = resolveEstablishmentId(operator, query);

  try {
    const groups = await prisma.transaction.groupBy({
      by: ['fuelType'],
      where: {
        establishmentId,
        createdAt: { gte: startDate, lte: endDate },
        fuelType:  { not: null },
      },
      _sum:    { liters: true, amount: true, cashbackValue: true },
      _count:  { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    return groups.map((g) => {
      const fuelType = g.fuelType || 'outros';
      return {
        fuelType,
        label:             FUEL_LABELS[fuelType] || fuelType,
        totalTransactions: g._count.id || 0,
        totalLiters:       round2(safeFloat(g._sum.liters)),
        totalValue:        round2(safeFloat(g._sum.amount)),
        totalCashback:     round2(safeFloat(g._sum.cashbackValue)),
      };
    });
  } catch (err) {
    console.error('[dashboard] Erro em getFuelTypes:', err.message);
    return [];
  }
}

module.exports = { getAnalytics, getCampaignResults, getFuelTypes };
