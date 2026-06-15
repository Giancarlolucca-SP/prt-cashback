/**
 * pistaService.js — "Painel da Pista": frentista-driven INTERNAL cashback.
 * Accrual by CPF (with stub customer for unregistered CPFs), a live redemption
 * request queue, non-fiscal comprovantes, and a caixa closing report.
 *
 * Reuses: transactionService.computeCashback, redemptionService.redeem
 * (all redemption rules), receiptService.generateComprovante, fraudService, audit.
 * Does NOT touch NFC-e / fiscal / Petros.
 */
const { PrismaClient } = require('@prisma/client');
const { isValidCpf, stripCpf, formatCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { generateReceiptCode } = require('../utils/receiptCode');
const { createError } = require('../middlewares/errorMiddleware');
const { computeCashback } = require('./transactionService');
const redemptionService = require('./redemptionService');
const receiptService = require('./receiptService');
const fraudService = require('./fraudService');
const audit = require('./auditService');

const prisma = new PrismaClient();

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// ── PHASE 1: accrual by CPF (frentista) ───────────────────────────────────────

async function accrueByCpf({ cpf, amount, fuelType, liters, bomba }, operator) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor do abastecimento deve ser maior que zero.', 400);
  }

  const { id: operatorId, establishmentId, name: frentista } = operator;
  const strippedCpf = stripCpf(cpf);

  // Find or create a stub customer (CPF without account yet)
  let customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId } },
  });
  let stubCreated = false;
  if (!customer) {
    customer = await prisma.customer.create({
      data: { cpf: strippedCpf, establishmentId, name: '(não cadastrado)', phone: '', registered: false },
    });
    stubCreated = true;
  }

  const { cashbackValue, effectivePercent } = await computeCashback(parsedAmount, fuelType, liters, establishmentId);
  await fraudService.checkTransaction(strippedCpf, parsedAmount, cashbackValue, establishmentId);

  const receiptCode = generateReceiptCode('PST');
  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId:      customer.id,
        operatorId,
        establishmentId,
        amount:          parsedAmount,
        cashbackPercent: effectivePercent,
        cashbackValue,
        receiptCode,
        fuelType:        fuelType || null,
        liters:          liters ? parseFloat(liters) : null,
        source:          'PISTA',
        status:          'CONFIRMED',
        metadata:        { pista: true, bomba: bomba || null, frentista: frentista || null },
      },
    }),
    prisma.customer.update({ where: { id: customer.id }, data: { balance: { increment: cashbackValue } } }),
  ]);

  const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
  const newBalance = parseFloat(updated.balance);

  await audit.log({
    action: 'PISTA_ACCRUAL', entity: 'Transaction', entityId: transaction.id, operatorId,
    metadata: { cpf: strippedCpf, amount: parsedAmount, cashbackValue, fuelType: fuelType || null, bomba: bomba || null, stubCreated, establishmentId },
  });

  const reference = bomba ? `${formatBRL(parsedAmount)} - ${bomba}` : formatBRL(parsedAmount);
  const comprovante = receiptService.generateComprovante({
    type: 'acumulo', controlNumber: receiptCode, date: transaction.createdAt,
    frentista, customerName: customer.name, cpf: customer.cpf,
    value: cashbackValue, balance: newBalance, reference,
  });

  return {
    mensagem: 'Cashback acumulado com sucesso.',
    novoCliente: stubCreated,
    transacao: {
      id: transaction.id,
      controle: receiptCode,
      valorAbastecimento: formatBRL(parsedAmount),
      percentual: `${effectivePercent.toFixed(2)}%`,
      cashback: formatBRL(cashbackValue),
      saldo: formatBRL(newBalance),
      saldoNum: newBalance,
      clienteNome: customer.name,
    },
    comprovante,
  };
}

// ── PHASE 2: redemption request queue ─────────────────────────────────────────

function serializeRequestForCustomer(r) {
  return {
    id: r.id,
    valor: parseFloat(r.amount),
    valorFormatado: formatBRL(r.amount),
    status: r.status, // PENDING | CONFIRMED | CANCELLED
    criadoEm: r.createdAt.toISOString(),
    resolvidoEm: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

// Customer (app): create/replace a pending redemption request
async function createRequest({ amount }, customerPayload) {
  const customerId = customerPayload.sub;
  const establishmentId = customerPayload.establishmentId;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const balance = parseFloat(customer.balance);
  const parsed = amount != null ? parseFloat(amount) : balance; // default: full balance
  if (isNaN(parsed) || parsed <= 0) throw createError('Valor de resgate inválido.', 400);
  if (parsed > balance) throw createError('Valor maior que o saldo disponível.', 400);

  // One active request per customer — replace the pending one if it exists
  const existing = await prisma.redemptionRequest.findFirst({ where: { customerId, establishmentId, status: 'PENDING' } });
  const req = existing
    ? await prisma.redemptionRequest.update({ where: { id: existing.id }, data: { amount: parsed } })
    : await prisma.redemptionRequest.create({ data: { customerId, establishmentId, amount: parsed, status: 'PENDING' } });

  return { mensagem: 'Solicitação de resgate enviada ao caixa.', solicitacao: serializeRequestForCustomer(req) };
}

// Customer (app): poll own latest request (pending, or resolved in the last 10 min)
async function getMyRequest(customerPayload) {
  const customerId = customerPayload.sub;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const req = await prisma.redemptionRequest.findFirst({
    where: { customerId, OR: [{ status: 'PENDING' }, { resolvedAt: { gte: tenMinAgo } }] },
    orderBy: { createdAt: 'desc' },
  });
  return { solicitacao: req ? serializeRequestForCustomer(req) : null };
}

// Customer (app): cancel own pending request
async function cancelMyRequest(customerPayload) {
  const customerId = customerPayload.sub;
  const existing = await prisma.redemptionRequest.findFirst({ where: { customerId, status: 'PENDING' } });
  if (existing) {
    await prisma.redemptionRequest.update({ where: { id: existing.id }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
  }
  return { mensagem: 'Solicitação cancelada.' };
}

// Pista (operator): live queue of pending requests
async function listRequests(operator) {
  const establishmentId = operator.establishmentId;
  const requests = await prisma.redemptionRequest.findMany({
    where: { establishmentId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { customer: { select: { name: true, cpf: true, balance: true, registered: true } } },
  });
  return {
    solicitacoes: requests.map((r) => ({
      id: r.id,
      clienteNome: r.customer.name,
      cpf: formatCpf(r.customer.cpf),
      registrado: r.customer.registered,
      saldoDisponivel: parseFloat(r.customer.balance),
      saldoFormatado: formatBRL(r.customer.balance),
      valorSolicitado: parseFloat(r.amount),
      valorFormatado: formatBRL(r.amount),
      data: r.createdAt.toISOString(),
    })),
  };
}

// Pista (operator): confirm the baixa — reuses redemptionService.redeem (all rules)
async function confirmRequest(operator, requestId, { amount, note }) {
  const establishmentId = operator.establishmentId;
  const reqRow = await prisma.redemptionRequest.findUnique({ where: { id: requestId } });
  if (!reqRow || reqRow.establishmentId !== establishmentId) throw createError('Solicitação não encontrada.', 404);
  if (reqRow.status !== 'PENDING') throw createError('Esta solicitação já foi resolvida.', 409);

  const customer = await prisma.customer.findUnique({ where: { id: reqRow.customerId } });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const finalAmount = amount != null ? parseFloat(amount) : parseFloat(reqRow.amount);

  // Enforces MIN_REDEMPTION_AMOUNT, MAX_DAILY_REDEMPTION, COOLDOWN, fraud, balance + audit
  const result = await redemptionService.redeem(
    { cpf: customer.cpf, amount: finalAmount, source: 'PISTA', metadata: { note: note || null, frentista: operator.name || null, requestId } },
    operator,
  );

  await prisma.redemptionRequest.update({
    where: { id: requestId },
    data: { status: 'CONFIRMED', operatorId: operator.id, redemptionId: result.resgate.id, note: note || null, resolvedAt: new Date() },
  });

  const comprovante = receiptService.generateComprovante({
    type: 'resgate', controlNumber: result.resgate.codigoCupom, date: result.resgate.createdAt,
    frentista: operator.name, customerName: result.resgate.clienteNome, cpf: result.resgate.cpf,
    value: result.resgate.valorNum, balance: result.resgate.novoSaldoNum, reference: note || null,
  });

  return { mensagem: 'Resgate confirmado.', resgate: result.resgate, comprovante };
}

// Pista (operator): cancel a pending request
async function cancelRequest(operator, requestId) {
  const establishmentId = operator.establishmentId;
  const reqRow = await prisma.redemptionRequest.findUnique({ where: { id: requestId } });
  if (!reqRow || reqRow.establishmentId !== establishmentId) throw createError('Solicitação não encontrada.', 404);
  if (reqRow.status !== 'PENDING') throw createError('Esta solicitação já foi resolvida.', 409);

  await prisma.redemptionRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', operatorId: operator.id, resolvedAt: new Date() },
  });
  await audit.log({ action: 'PISTA_REQUEST_CANCELLED', entity: 'RedemptionRequest', entityId: requestId, operatorId: operator.id, metadata: { establishmentId } });
  return { mensagem: 'Solicitação cancelada.' };
}

// ── PHASE 3: comprovante reprint ──────────────────────────────────────────────

async function getComprovante(operator, type, id) {
  const establishmentId = operator.establishmentId;
  if (type === 'acumulo') {
    const t = await prisma.transaction.findUnique({ where: { id }, include: { customer: true, operator: true } });
    if (!t || t.establishmentId !== establishmentId) throw createError('Comprovante não encontrado.', 404);
    const ref = t.metadata && t.metadata.bomba ? `${formatBRL(t.amount)} - ${t.metadata.bomba}` : formatBRL(t.amount);
    return { comprovante: receiptService.generateComprovante({
      type: 'acumulo', controlNumber: t.receiptCode, date: t.createdAt, frentista: t.operator?.name,
      customerName: t.customer.name, cpf: t.customer.cpf, value: parseFloat(t.cashbackValue),
      balance: parseFloat(t.customer.balance), reference: ref,
    }) };
  }
  const r = await prisma.redemption.findUnique({ where: { id }, include: { customer: true, operator: true } });
  if (!r || r.establishmentId !== establishmentId) throw createError('Comprovante não encontrado.', 404);
  return { comprovante: receiptService.generateComprovante({
    type: 'resgate', controlNumber: r.receiptCode, date: r.createdAt, frentista: r.operator?.name,
    customerName: r.customer.name, cpf: r.customer.cpf, value: parseFloat(r.amountUsed),
    balance: parseFloat(r.customer.balance), reference: (r.metadata && r.metadata.note) || null,
  }) };
}

// ── PHASE 4: caixa closing report ─────────────────────────────────────────────

function resolveRange(query = {}) {
  const { startDate, endDate } = query;
  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate || startDate}T23:59:59.999`);
    if (!isNaN(start) && !isNaN(end)) return { start, end };
  }
  // default: today
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return { start, end: new Date() };
}

async function caixaReport(operator, query = {}) {
  const establishmentId = operator.establishmentId;
  const { start, end } = resolveRange(query);

  const [accruals, redemptions, operators] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['operatorId'],
      where: { establishmentId, source: 'PISTA', status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      _sum: { cashbackValue: true, amount: true }, _count: { _all: true },
    }),
    prisma.redemption.groupBy({
      by: ['operatorId'],
      where: { establishmentId, status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      _sum: { amountUsed: true }, _count: { _all: true },
    }),
    prisma.operator.findMany({ where: { establishmentId }, select: { id: true, name: true } }),
  ]);

  const opName = new Map(operators.map((o) => [o.id, o.name]));
  const byOp = new Map();
  const ensure = (id) => { if (!byOp.has(id)) byOp.set(id, { operatorId: id, frentista: opName.get(id) || '—', acumulos: 0, totalAbastecido: 0, totalCashback: 0, resgates: 0, totalResgatado: 0 }); return byOp.get(id); };

  for (const a of accruals) { const e = ensure(a.operatorId); e.acumulos = a._count._all; e.totalAbastecido = round2(a._sum.amount); e.totalCashback = round2(a._sum.cashbackValue); }
  for (const r of redemptions) { const e = ensure(r.operatorId); e.resgates = r._count._all; e.totalResgatado = round2(r._sum.amountUsed); }

  const frentistas = Array.from(byOp.values()).sort((a, b) => b.totalResgatado - a.totalResgatado);
  const totalResgatado = round2(frentistas.reduce((s, f) => s + f.totalResgatado, 0));
  const totalCashback  = round2(frentistas.reduce((s, f) => s + f.totalCashback, 0));
  const totalAbastecido = round2(frentistas.reduce((s, f) => s + f.totalAbastecido, 0));

  return {
    periodo: { inicio: start.toISOString(), fim: end.toISOString() },
    frentistas,
    totais: {
      totalResgatado, totalResgatadoFormatado: formatBRL(totalResgatado),
      totalCashback,  totalCashbackFormatado:  formatBRL(totalCashback),
      totalAbastecido, totalAbastecidoFormatado: formatBRL(totalAbastecido),
    },
  };
}

// ── PHASE 4: cashback from a selected fueling ─────────────────────────────────

const TZ = 'America/Sao_Paulo';
function todayRange() {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { date, start: new Date(`${date}T00:00:00-03:00`), end: new Date(`${date}T23:59:59.999-03:00`) };
}

// Today's fuelings (live list) for the frentista to pick from.
async function listFuelings(operator, query = {}) {
  const establishmentId = operator.establishmentId;
  const { start, end } = todayRange();
  const onlyPending = query.pending === '1' || query.pending === 'true';

  const where = { establishmentId, fuelingDateTime: { gte: start, lte: end } };
  if (onlyPending) where.cashbackTransactionId = null;

  const [rows, cardMaps] = await Promise.all([
    prisma.abastecimento.findMany({ where, orderBy: { fuelingDateTime: 'desc' }, take: 100 }),
    prisma.pistaCardMap.findMany({ where: { establishmentId }, include: { attendant: { select: { name: true } } } }),
  ]);
  const cardToName = new Map(cardMaps.map((c) => [c.identfidCode, c.attendant?.name]));

  return {
    abastecimentos: rows.map((r) => ({
      id: r.id, registro: r.registro, bico: r.nozzleCode,
      combustivel: r.fuelName || null, aditivada: r.isAditivada,
      litros: parseFloat(r.volumeLiters), valor: parseFloat(r.totalValue), valorFormatado: formatBRL(r.totalValue),
      preco: parseFloat(r.unitPrice), data: r.fuelingDateTime.toISOString(),
      frentista: r.identfidCode ? (cardToName.get(r.identfidCode) || `Não identificado (${r.identfidCode})`) : null,
      cashbackAplicado: !!r.cashbackTransactionId, cpfCashback: r.cashbackCpf || null,
    })),
  };
}

// Apply cashback from a real fueling (value + fuel come from the Abastecimento row).
// Reuses accrueByCpf; one cashback per fueling (guarded by cashbackTransactionId).
async function accrueFromFueling(operator, { abastecimentoId, cpf }) {
  const establishmentId = operator.establishmentId;
  const ab = await prisma.abastecimento.findUnique({ where: { id: abastecimentoId } });
  if (!ab || ab.establishmentId !== establishmentId) throw createError('Abastecimento não encontrado.', 404);
  if (ab.cashbackTransactionId) throw createError('Este abastecimento já gerou cashback.', 409);

  const result = await accrueByCpf(
    { cpf, amount: parseFloat(ab.totalValue), fuelType: ab.fuelName || undefined, liters: parseFloat(ab.volumeLiters), bomba: `Bico ${ab.nozzleCode}` },
    operator,
  );

  await prisma.abastecimento.update({
    where: { id: ab.id },
    data: { cashbackTransactionId: result.transacao.id, cashbackCpf: stripCpf(cpf), cashbackAppliedAt: new Date() },
  });

  return { ...result, abastecimentoId: ab.id };
}

module.exports = {
  accrueByCpf,
  createRequest, getMyRequest, cancelMyRequest,
  listRequests, confirmRequest, cancelRequest,
  getComprovante, caixaReport,
  listFuelings, accrueFromFueling, todayRange,
};
