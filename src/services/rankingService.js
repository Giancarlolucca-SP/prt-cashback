const { PrismaClient } = require('@prisma/client');
const { createError }  = require('../middlewares/errorMiddleware');

const prisma = new PrismaClient();

const PERIOD_DAYS = { '7d': 7, '15d': 15, '30d': 30, '60d': 60, '90d': 90 };

function periodStart(period) {
  const days = PERIOD_DAYS[period] || 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function round2(n) { return Math.round(n * 100) / 100; }
function safeFloat(v) { return round2(parseFloat(v) || 0); }

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
    if (!start || !end) throw createError('Datas inválidas. Use o formato DD/MM/AAAA.', 400);
    if (start > end)    throw createError('A data inicial deve ser anterior à data final.', 400);
    const diffDays = (end - start) / 86400000;
    if (diffDays > 365) throw createError('O intervalo máximo permitido é de 1 ano.', 400);
    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);
    return { start, end: endOfDay, days: Math.ceil(diffDays) + 1 };
  }

  const validPeriod = PERIOD_DAYS[period] ? period : '30d';
  const days = PERIOD_DAYS[validPeriod];
  return { start: periodStart(validPeriod), end: new Date(), days };
}

function resolveEstablishmentId(operator, query) {
  if (operator.role === 'ADMIN' && query.establishmentId) return query.establishmentId;
  return operator.establishmentId;
}

function parseAttendantRaw(raw) {
  if (!raw) return { code: '', name: raw || '' };
  const dashIdx = raw.indexOf('-');
  if (dashIdx === -1) return { code: '', name: raw };
  return { code: raw.slice(0, dashIdx), name: raw.slice(dashIdx + 1) };
}

function emptyResult(days, startDate, endDate) {
  return {
    attendants: [],
    charts: { transactions: [], liters: [], value: [] },
    period: {
      startDate: startDate.toISOString().slice(0, 10),
      endDate:   endDate.toISOString().slice(0, 10),
      totalDays: days,
    },
  };
}

async function getRanking(operator, query = {}) {
  const { start: startDate, end: endDate, days } = resolveRange(query);
  const establishmentId = resolveEstablishmentId(operator, query);
  const { attendant } = query;

  const where = {
    establishmentId,
    createdAt:     { gte: startDate, lte: endDate },
    attendantName: { not: null },
    status:        'CONFIRMED',
  };

  if (attendant && attendant !== 'todos') {
    where.attendantName = { contains: attendant, mode: 'insensitive' };
  }

  let transactions;
  try {
    transactions = await prisma.transaction.findMany({
      where,
      select: {
        attendantName: true,
        amount:        true,
        cashbackValue: true,
        liters:        true,
        createdAt:     true,
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (err) {
    console.error('[ranking] Erro na query:', err.message);
    return emptyResult(days, startDate, endDate);
  }

  if (!transactions.length) return emptyResult(days, startDate, endDate);

  // ── Group by attendant ────────────────────────────────────────────────────────
  const attendantMap = new Map();

  for (const t of transactions) {
    const raw = t.attendantName;
    if (!attendantMap.has(raw)) {
      const { code, name } = parseAttendantRaw(raw);
      attendantMap.set(raw, {
        raw, name, code,
        totalTransactions: 0,
        totalLiters:       0,
        totalValue:        0,
        totalCashback:     0,
        lastTransaction:   null,
        txns:              [],
      });
    }
    const a = attendantMap.get(raw);
    a.totalTransactions += 1;
    a.totalLiters       += safeFloat(t.liters);
    a.totalValue        += safeFloat(t.amount);
    a.totalCashback     += safeFloat(t.cashbackValue);
    if (!a.lastTransaction || t.createdAt > a.lastTransaction) {
      a.lastTransaction = t.createdAt;
    }
    a.txns.push(t);
  }

  const sorted = Array.from(attendantMap.values()).sort(
    (a, b) => b.totalTransactions - a.totalTransactions,
  );

  // ── Compute trend (first half vs second half of period) ───────────────────────
  const midTime  = (startDate.getTime() + endDate.getTime()) / 2;
  const totalTxns = sorted.reduce((s, a) => s + a.totalTransactions, 0);
  const avgCount  = sorted.length > 0 ? totalTxns / sorted.length : 0;

  const attendants = sorted.map((a, idx) => {
    const firstHalf  = a.txns.filter((t) => t.createdAt.getTime() <  midTime).length;
    const secondHalf = a.txns.filter((t) => t.createdAt.getTime() >= midTime).length;

    let trend = 'stable';
    if (firstHalf === 0 && secondHalf > 0)       trend = 'up';
    else if (secondHalf > firstHalf * 1.1)        trend = 'up';
    else if (secondHalf < firstHalf * 0.9)        trend = 'down';

    return {
      name:              a.name,
      code:              a.code,
      totalTransactions: a.totalTransactions,
      totalLiters:       round2(a.totalLiters),
      totalValue:        round2(a.totalValue),
      totalCashback:     round2(a.totalCashback),
      avgTicket:  a.totalTransactions > 0 ? round2(a.totalValue  / a.totalTransactions) : 0,
      avgLiters:  a.totalTransactions > 0 ? round2(a.totalLiters / a.totalTransactions) : 0,
      lastTransaction: a.lastTransaction ? a.lastTransaction.toISOString().slice(0, 10) : null,
      trend,
      rank:        idx + 1,
      belowAverage: a.totalTransactions < avgCount * 0.5,
    };
  });

  // ── Chart data: group by day, three metrics ───────────────────────────────────
  const maps = {
    transactions: new Map(),
    liters:       new Map(),
    value:        new Map(),
  };

  for (const t of transactions) {
    const dayKey = t.createdAt.toISOString().slice(0, 10);
    const { name } = parseAttendantRaw(t.attendantName);

    for (const metric of ['transactions', 'liters', 'value']) {
      if (!maps[metric].has(dayKey)) maps[metric].set(dayKey, {});
      const entry = maps[metric].get(dayKey);
      if (metric === 'transactions') {
        entry[name] = (entry[name] || 0) + 1;
      } else if (metric === 'liters') {
        entry[name] = round2((entry[name] || 0) + safeFloat(t.liters));
      } else {
        entry[name] = round2((entry[name] || 0) + safeFloat(t.amount));
      }
    }
  }

  function buildChartArray(map) {
    const arr = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      const key   = d.toISOString().slice(0, 10);
      const [, m, dd] = key.split('-');
      arr.push({ date: key, label: `${dd}/${m}`, ...(map.get(key) || {}) });
    }
    return arr;
  }

  return {
    attendants,
    charts: {
      transactions: buildChartArray(maps.transactions),
      liters:       buildChartArray(maps.liters),
      value:        buildChartArray(maps.value),
    },
    period: {
      startDate: startDate.toISOString().slice(0, 10),
      endDate:   endDate.toISOString().slice(0, 10),
      totalDays: days,
    },
  };
}

module.exports = { getRanking };
