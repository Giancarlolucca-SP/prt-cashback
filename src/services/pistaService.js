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
const { MIN_REDEMPTION } = redemptionService;
const receiptService = require('./receiptService');
const fraudService = require('./fraudService');
const audit = require('./auditService');
const pistaMaps = require('./pistaMapsService');

const prisma = new PrismaClient();

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Builds the same response shape as a fresh accrueByCpf() success, from an
// existing Transaction row matched by idempotencyKey. `saldo` reflects the
// customer's balance NOW, not a stored snapshot from the original attempt.
function buildAccrualReplayResult(existing) {
  const customer = existing.customer;
  const cashbackValue = parseFloat(existing.cashbackValue);
  const balanceNow = parseFloat(customer.balance);
  const frentista = existing.attendant?.name || (existing.metadata && existing.metadata.frentista) || null;
  const bomba = existing.metadata && existing.metadata.bomba;
  const reference = bomba ? `${formatBRL(existing.amount)} - ${bomba}` : formatBRL(existing.amount);

  let comprovante;
  try {
    comprovante = receiptService.generateComprovante({
      type: 'acumulo', controlNumber: existing.receiptCode, date: existing.createdAt,
      frentista, customerName: customer.name, cpf: customer.cpf,
      value: cashbackValue, balance: balanceNow, reference,
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao gerar comprovante (retentativa idempotente) do acúmulo ${existing.id}:`, err.message);
    comprovante = null;
  }

  return {
    mensagem: 'Cashback acumulado com sucesso.',
    novoCliente: false,
    transacao: {
      id: existing.id,
      controle: existing.receiptCode,
      valorAbastecimento: formatBRL(existing.amount),
      percentual: `${parseFloat(existing.cashbackPercent).toFixed(2)}%`,
      cashback: formatBRL(cashbackValue),
      saldo: formatBRL(balanceNow),
      saldoNum: balanceNow,
      clienteNome: customer.name,
    },
    comprovante,
  };
}

// ── PHASE 1: accrual by CPF (frentista) ───────────────────────────────────────

async function accrueByCpf({ cpf, amount, fuelType, liters, bomba, attendantId, idempotencyKey = null }, operator) {
  if (!cpf || !isValidCpf(cpf)) throw createError('CPF inválido.', 400);
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor do abastecimento deve ser maior que zero.', 400);
  }

  const { id: operatorId, establishmentId, name: operatorName } = operator;
  const strippedCpf = stripCpf(cpf);

  // Idempotency: a retry (after ANY failure, including one after the write
  // already committed) with the same client-supplied key returns the
  // existing result instead of reprocessing — safe by construction, not by
  // inferring from which line threw whether anything committed.
  if (idempotencyKey) {
    const existing = await prisma.transaction.findUnique({
      where: { establishmentId_idempotencyKey: { establishmentId, idempotencyKey } },
      include: { customer: true, attendant: true },
    });
    if (existing) {
      // A legitimate retry always resubmits the same cpf. If it doesn't
      // match, this idempotencyKey collided with a DIFFERENT customer's
      // transaction — refuse instead of returning that customer's balance,
      // receipt and name to the caller.
      if (existing.customer.cpf !== strippedCpf) {
        throw createError('Conflito de identificador de requisição.', 409);
      }
      return buildAccrualReplayResult(existing);
    }
  }

  // Prefer the individual Attendant identity (resolved via the card map) over the
  // shared operator login — frentistas at a station share one operator account.
  let frentista = operatorName;
  let resolvedAttendantId = null;
  if (attendantId) {
    const att = await prisma.attendant.findUnique({ where: { id: attendantId } });
    if (att && att.establishmentId === establishmentId) {
      frentista = att.name;
      resolvedAttendantId = att.id;
    }
  }

  // Find or create a stub customer (CPF without account yet)
  let customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId } },
  });
  let stubCreated = false;
  if (!customer) {
    try {
      customer = await prisma.customer.create({
        data: { cpf: strippedCpf, establishmentId, name: '(não cadastrado)', phone: '', registered: false },
      });
      stubCreated = true;
    } catch (err) {
      // Two concurrent accruals for the same brand-new CPF: the loser hits the
      // unique constraint instead of a stale null read — use the winner's row.
      if (err.code === 'P2002') {
        customer = await prisma.customer.findUnique({
          where: { cpf_establishmentId: { cpf: strippedCpf, establishmentId } },
        });
        if (!customer) throw createError('Cliente não encontrado após conflito de criação simultânea. Tente novamente.', 409);
      } else {
        throw err;
      }
    }
  }

  const { cashbackValue, effectivePercent } = await computeCashback(parsedAmount, fuelType, liters, establishmentId);
  await fraudService.checkTransaction(strippedCpf, parsedAmount, cashbackValue, establishmentId);

  const receiptCode = generateReceiptCode('PST');
  let transaction;
  try {
    [transaction] = await prisma.$transaction([
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
          attendantId:     resolvedAttendantId,
          metadata:        { pista: true, bomba: bomba || null, frentista: frentista || null },
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      }),
      prisma.customer.update({ where: { id: customer.id }, data: { balance: { increment: cashbackValue } } }),
    ]);
  } catch (err) {
    // Race: a concurrent call with the same idempotencyKey won the insert
    // between our check above and this one.
    if (err.code === 'P2002' && idempotencyKey) {
      const existing = await prisma.transaction.findUnique({
        where: { establishmentId_idempotencyKey: { establishmentId, idempotencyKey } },
        include: { customer: true, attendant: true },
      });
      if (existing) {
        if (existing.customer.cpf !== strippedCpf) {
          throw createError('Conflito de identificador de requisição.', 409);
        }
        return buildAccrualReplayResult(existing);
      }
    }
    throw err;
  }

  // The $transaction above already committed (Transaction created, balance
  // credited) — everything below is best-effort. A transient failure here
  // must NOT throw out of accrueByCpf(), or a caller (e.g. accrueFromFueling)
  // that releases its own claim on any exception from accrueByCpf() would
  // treat an already-committed credit as if it never happened, and a retry
  // would double-credit cashback for the same fueling.
  let newBalance;
  let balanceVerified = false;
  for (let attempt = 1; attempt <= 3 && !balanceVerified; attempt++) {
    try {
      const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
      newBalance = parseFloat(updated.balance);
      balanceVerified = true;
    } catch (err) {
      console.error(`[pistaService] Falha ao reler saldo após acúmulo (tentativa ${attempt}/3, transação ${transaction.id} já confirmada):`, err.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (!balanceVerified) {
    newBalance = Math.round((parseFloat(customer.balance) + cashbackValue) * 100) / 100;
  }

  try {
    await audit.log({
      action: 'PISTA_ACCRUAL', entity: 'Transaction', entityId: transaction.id, operatorId,
      metadata: { cpf: strippedCpf, amount: parsedAmount, cashbackValue, fuelType: fuelType || null, bomba: bomba || null, stubCreated, establishmentId },
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao registrar auditoria do acúmulo (transação ${transaction.id} já confirmada):`, err.message);
  }

  const reference = bomba ? `${formatBRL(parsedAmount)} - ${bomba}` : formatBRL(parsedAmount);
  let comprovante;
  try {
    comprovante = receiptService.generateComprovante({
      type: 'acumulo', controlNumber: receiptCode, date: transaction.createdAt,
      frentista, customerName: customer.name, cpf: customer.cpf,
      value: cashbackValue, balance: newBalance, reference,
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao gerar comprovante do acúmulo (transação ${transaction.id} já confirmada):`, err.message);
    comprovante = null;
  }

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
  if (parsed < MIN_REDEMPTION) {
    throw createError(`Valor mínimo para resgate é ${formatBRL(MIN_REDEMPTION)}.`, 400);
  }

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
async function confirmRequest(operator, requestId, { amount, note, attendantId }) {
  const establishmentId = operator.establishmentId;
  const reqRow = await prisma.redemptionRequest.findUnique({ where: { id: requestId } });
  if (!reqRow || reqRow.establishmentId !== establishmentId) throw createError('Solicitação não encontrada.', 404);
  if (reqRow.status !== 'PENDING') throw createError('Esta solicitação já foi resolvida.', 409);

  // Resolve the individual frentista who is confirming (picked in the frontend),
  // falling back to the shared operator login's name if none was selected.
  let frentista = operator.name;
  let resolvedAttendantId = null;
  if (attendantId) {
    const att = await prisma.attendant.findUnique({ where: { id: attendantId } });
    if (att && att.establishmentId === establishmentId) {
      frentista = att.name;
      resolvedAttendantId = att.id;
    }
  }

  // Atomically claim the request before debiting so two concurrent confirms for the
  // same requestId can't both pass the PENDING check above and double-redeem.
  const claim = await prisma.redemptionRequest.updateMany({
    where: { id: requestId, establishmentId, status: 'PENDING' },
    data: { status: 'CONFIRMED', operatorId: operator.id, attendantId: resolvedAttendantId, resolvedAt: new Date() },
  });
  if (claim.count === 0) throw createError('Esta solicitação já foi resolvida.', 409);

  let result;
  try {
    const customer = await prisma.customer.findUnique({ where: { id: reqRow.customerId } });
    if (!customer) throw createError('Cliente não encontrado.', 404);

    const finalAmount = amount != null ? parseFloat(amount) : parseFloat(reqRow.amount);

    // Enforces MIN_REDEMPTION_AMOUNT, MAX_DAILY_REDEMPTION, COOLDOWN, fraud, balance + audit.
    // idempotencyKey=requestId: redeem() is keyed to THIS request, so releasing
    // the claim and retrying below is always safe — a retry either finds
    // nothing (redeem() never committed) and proceeds fresh, or finds the
    // already-CONFIRMED redemption and returns it instead of reprocessing.
    // Safety no longer depends on inferring, from which line threw, whether
    // anything committed.
    result = await redemptionService.redeem(
      { cpf: customer.cpf, amount: finalAmount, source: 'PISTA', attendantId: resolvedAttendantId, metadata: { note: note || null, frentista: frentista || null, requestId }, idempotencyKey: requestId },
      operator,
    );
  } catch (err) {
    if (err.needsManualReview) {
      // redeem() detected a negative-balance race and tried to compensate,
      // but the compensation itself failed — the CUSTOMER'S BALANCE may still
      // be wrong and needs manual reconciliation directly. The request itself
      // is still safe to release: a retry with the same idempotencyKey will
      // just find and return the existing (still CONFIRMED) redemption.
      console.error(`[pistaService] Solicitação ${requestId} requer verificação manual de saldo (compensação falhou):`, err.message);
    }
    // Safe to release the claim regardless of what failed — see comment above
    // the redeem() call. A retry can never double-debit now.
    await prisma.redemptionRequest.update({
      where: { id: requestId },
      data: { status: 'PENDING', operatorId: null, attendantId: null, resolvedAt: null },
    }).catch((releaseErr) => {
      console.error(`[pistaService] Falha ao liberar a solicitação ${requestId} de volta para PENDING:`, releaseErr.message);
    });
    throw err;
  }

  // redeem() already committed (balance debited, Redemption row created) — a
  // failure past this point must NOT reset the request to PENDING, or a retry
  // would call redeem() again and double-debit the customer. Best-effort only.
  try {
    await prisma.redemptionRequest.update({
      where: { id: requestId },
      data: { redemptionId: result.resgate.id, note: note || null },
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao vincular redemptionId à solicitação ${requestId} (resgate ${result.resgate.id} já confirmado):`, err.message);
  }

  let comprovante;
  try {
    comprovante = receiptService.generateComprovante({
      type: 'resgate', controlNumber: result.resgate.codigoCupom, date: result.resgate.createdAt,
      frentista, customerName: result.resgate.clienteNome, cpf: result.resgate.cpf,
      value: result.resgate.valorNum, balance: result.resgate.novoSaldoNum, reference: note || null,
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao gerar comprovante do resgate ${requestId} (resgate ${result.resgate.id} já confirmado):`, err.message);
    comprovante = null;
  }

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
      type: 'acumulo', controlNumber: t.receiptCode, date: t.createdAt, frentista: (t.metadata && t.metadata.frentista) || t.operator?.name,
      customerName: t.customer.name, cpf: t.customer.cpf, value: parseFloat(t.cashbackValue),
      balance: parseFloat(t.customer.balance), reference: ref,
    }) };
  }
  const r = await prisma.redemption.findUnique({ where: { id }, include: { customer: true, operator: true, attendant: true } });
  if (!r || r.establishmentId !== establishmentId) throw createError('Comprovante não encontrado.', 404);
  return { comprovante: receiptService.generateComprovante({
    type: 'resgate', controlNumber: r.receiptCode, date: r.createdAt, frentista: r.attendant?.name || (r.metadata && r.metadata.frentista) || r.operator?.name,
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

  // Grouped by (attendantId, operatorId): several frentistas share one operator
  // login, so attendantId (when resolved) is what actually separates them —
  // operatorId is only the fallback bucket for legacy/unmapped records.
  const [accruals, redemptions, operators, attendants] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['attendantId', 'operatorId'],
      where: { establishmentId, source: 'PISTA', status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      _sum: { cashbackValue: true, amount: true }, _count: { _all: true },
    }),
    prisma.redemption.groupBy({
      by: ['attendantId', 'operatorId'],
      where: { establishmentId, source: 'PISTA', status: 'CONFIRMED', createdAt: { gte: start, lte: end } },
      _sum: { amountUsed: true }, _count: { _all: true },
    }),
    prisma.operator.findMany({ where: { establishmentId }, select: { id: true, name: true } }),
    prisma.attendant.findMany({ where: { establishmentId }, select: { id: true, name: true } }),
  ]);

  const opName  = new Map(operators.map((o) => [o.id, o.name]));
  const attName = new Map(attendants.map((a) => [a.id, a.name]));
  const byKey = new Map();
  const ensure = (attendantId, operatorId) => {
    const key = attendantId || `op:${operatorId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        attendantId: attendantId || null,
        operatorId,
        frentista: (attendantId && attName.get(attendantId)) || opName.get(operatorId) || '—',
        acumulos: 0, totalAbastecido: 0, totalCashback: 0, resgates: 0, totalResgatado: 0,
      });
    }
    return byKey.get(key);
  };

  for (const a of accruals) { const e = ensure(a.attendantId, a.operatorId); e.acumulos = a._count._all; e.totalAbastecido = round2(a._sum.amount); e.totalCashback = round2(a._sum.cashbackValue); }
  for (const r of redemptions) { const e = ensure(r.attendantId, r.operatorId); e.resgates = r._count._all; e.totalResgatado = round2(r._sum.amountUsed); }

  const frentistas = Array.from(byKey.values()).sort((a, b) => b.totalResgatado - a.totalResgatado);
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
  if (ab.cashbackTransactionId || ab.cashbackAppliedAt) throw createError('Este abastecimento já gerou cashback.', 409);

  // Resolved BEFORE the claim: it's a read-only lookup, so if it throws
  // (transient DB error) nothing has been claimed yet and there's nothing to
  // roll back — doing this after the claim would strand the fueling forever
  // (claimed but never accrued, permanently failing the guard above on retry).
  const attendant = ab.identfidCode ? await pistaMaps.resolveAttendant(establishmentId, ab.identfidCode) : null;

  // Atomically claim this fueling so two concurrent requests for the same
  // abastecimentoId can't both pass the "not yet accrued" check above and
  // double-credit cashback before either write-back lands.
  const claim = await prisma.abastecimento.updateMany({
    where: { id: abastecimentoId, cashbackTransactionId: null, cashbackAppliedAt: null },
    data: { cashbackAppliedAt: new Date() },
  });
  if (claim.count === 0) throw createError('Este abastecimento já gerou cashback.', 409);

  let result;
  try {
    // idempotencyKey=abastecimentoId: accrueByCpf() is keyed to THIS fueling,
    // so releasing the claim and retrying below is always safe — a retry
    // either finds nothing (accrueByCpf() never committed) and proceeds
    // fresh, or finds the already-CONFIRMED transaction and returns it
    // instead of double-crediting.
    result = await accrueByCpf(
      {
        cpf, amount: parseFloat(ab.totalValue), fuelType: ab.fuelName || undefined,
        liters: parseFloat(ab.volumeLiters), bomba: `Bico ${ab.nozzleCode}`, attendantId: attendant?.id,
        idempotencyKey: abastecimentoId,
      },
      operator,
    );
  } catch (err) {
    await prisma.abastecimento.update({ where: { id: ab.id }, data: { cashbackAppliedAt: null } }).catch((releaseErr) => {
      console.error(`[pistaService] Falha ao liberar o abastecimento ${ab.id}:`, releaseErr.message);
    });
    throw err;
  }

  // accrueByCpf already committed (Transaction created, balance credited) — a
  // failure past this point must NOT release the claim, or a retry would call
  // accrueByCpf again and double-credit cashback for the same fueling.
  try {
    await prisma.abastecimento.update({
      where: { id: ab.id },
      data: { cashbackTransactionId: result.transacao.id, cashbackCpf: stripCpf(cpf), cashbackAppliedAt: new Date() },
    });
  } catch (err) {
    console.error(`[pistaService] Falha ao vincular cashbackTransactionId ao abastecimento ${ab.id} (transação ${result.transacao.id} já criada):`, err.message);
  }

  return { ...result, abastecimentoId: ab.id };
}

module.exports = {
  accrueByCpf,
  createRequest, getMyRequest, cancelMyRequest,
  listRequests, confirmRequest, cancelRequest,
  getComprovante, caixaReport,
  listFuelings, accrueFromFueling, todayRange,
};
