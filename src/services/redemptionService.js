const { PrismaClient } = require('@prisma/client');
const { isValidCpf, stripCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { generateReceiptCode } = require('../utils/receiptCode');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');
const receiptService = require('./receiptService');
const fraudService = require('./fraudService');

const prisma = new PrismaClient();

const MIN_REDEMPTION = parseFloat(process.env.MIN_REDEMPTION_AMOUNT || '10');
const MAX_DAILY_REDEMPTION = parseFloat(process.env.MAX_DAILY_REDEMPTION || '500');
const COOLDOWN_MINUTES = parseInt(process.env.REDEMPTION_COOLDOWN_MINUTES || '5', 10);

// Builds the same response shape as a fresh redeem() success, from an
// existing CONFIRMED Redemption row matched by idempotencyKey. `novoSaldo`
// reflects the customer's balance NOW (not a stored snapshot from the
// original attempt) — accurate as of this reply, even if other activity
// happened on the account since.
function buildIdempotentReplayResult(existing) {
  const customer = existing.customer;
  const amountUsed = parseFloat(existing.amountUsed);
  const balanceNow = parseFloat(customer.balance);

  let receipt;
  try {
    receipt = receiptService.generateRedeemReceipt({
      customerName: customer.name,
      cpf: customer.cpf,
      amountUsed,
      newBalance: balanceNow,
      receiptCode: existing.receiptCode,
      date: existing.createdAt,
    });
  } catch (err) {
    console.error(`[redemptionService] Falha ao gerar comprovante (retentativa idempotente) do resgate ${existing.id}:`, err.message);
    receipt = null;
  }

  return {
    mensagem: 'Resgate realizado com sucesso.',
    resgate: {
      id: existing.id,
      codigoCupom: existing.receiptCode,
      valorResgatado: formatBRL(amountUsed),
      saldoAnterior: formatBRL(balanceNow + amountUsed),
      novoSaldo: formatBRL(balanceNow),
      data: formatDateBR(existing.createdAt),
      clienteNome: customer.name,
      cpf: customer.cpf,
      valorNum: amountUsed,
      novoSaldoNum: balanceNow,
      createdAt: existing.createdAt,
    },
    cupom: receipt,
  };
}

async function redeem({ cpf, amount, source = null, metadata = null, attendantId = null, idempotencyKey = null }, operator) {
  // --- Validation ---
  if (!cpf) throw createError('CPF é obrigatório.', 400);
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor do resgate deve ser maior que zero.', 400);
  }

  if (parsedAmount < MIN_REDEMPTION) {
    throw createError(
      `Valor mínimo para resgate é ${formatBRL(MIN_REDEMPTION)}.`,
      400
    );
  }

  const { id: operatorId, establishmentId } = operator;

  // --- Idempotency ---
  // If a client-supplied key (e.g. a RedemptionRequest id) matches an already
  // CONFIRMED redemption, this is a retry of a call that committed but then
  // failed on a later step (or a naive double-submit) — return the existing
  // result instead of reprocessing. This makes retries safe BY CONSTRUCTION,
  // regardless of which line failed downstream, rather than the caller
  // inferring safety from which exception was thrown. A CANCELLED match
  // means a prior attempt was legitimately reversed (its key was cleared —
  // see the compensation block below) and is never returned here.
  if (idempotencyKey) {
    const existing = await prisma.redemption.findUnique({
      where: { establishmentId_idempotencyKey: { establishmentId, idempotencyKey } },
      include: { customer: true },
    });
    if (existing && existing.status === 'CONFIRMED') {
      // A legitimate retry always resubmits the same cpf. If it doesn't
      // match, this idempotencyKey collided with a DIFFERENT customer's
      // redemption — refuse instead of returning that customer's balance,
      // receipt and name to the caller.
      if (existing.customer.cpf !== stripCpf(cpf)) {
        throw createError('Conflito de identificador de requisição.', 409);
      }
      return buildIdempotentReplayResult(existing);
    }
  }

  // --- Fraud check ---
  await fraudService.checkRedemption(cpf, establishmentId);

  // Callers (e.g. pistaService.confirmRequest/accrueByCpf) already validate
  // attendantId belongs to this establishment before passing it in — but
  // redeem() is also reachable directly (POST /redeem, admin-only) with a
  // client-supplied attendantId, so it must not trust it blindly here too.
  let verifiedAttendantId = null;
  if (attendantId) {
    const att = await prisma.attendant.findUnique({ where: { id: attendantId } });
    if (att && att.establishmentId === establishmentId) verifiedAttendantId = att.id;
  }

  // --- Find customer scoped to establishment ---
  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: stripCpf(cpf), establishmentId } },
  });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  // --- Anti-fraud: cooldown check (scoped to establishment) ---
  const cooldownThreshold = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000);
  const recentRedemption = await prisma.redemption.findFirst({
    where: {
      customerId: customer.id,
      establishmentId,
      status: 'CONFIRMED',
      createdAt: { gte: cooldownThreshold },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recentRedemption) {
    const minutesAgo = Math.ceil(
      (Date.now() - new Date(recentRedemption.createdAt).getTime()) / 60000
    );
    const waitMinutes = COOLDOWN_MINUTES - minutesAgo;
    throw createError(
      `Resgate recente detectado. Aguarde ${waitMinutes} minuto(s) antes de resgatar novamente.`,
      429
    );
  }

  // --- Anti-fraud: daily limit check (scoped to establishment) ---
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayRedemptions = await prisma.redemption.aggregate({
    where: {
      customerId: customer.id,
      establishmentId,
      status: 'CONFIRMED',
      createdAt: { gte: startOfDay },
    },
    _sum: { amountUsed: true },
  });

  const todayTotal = parseFloat(todayRedemptions._sum.amountUsed || 0);
  if (todayTotal + parsedAmount > MAX_DAILY_REDEMPTION) {
    const remaining = MAX_DAILY_REDEMPTION - todayTotal;
    throw createError(
      `Limite diário de resgates atingido. Você pode resgatar até ${formatBRL(remaining)} hoje.`,
      400
    );
  }

  // --- Balance check ---
  const currentBalance = parseFloat(customer.balance);
  if (currentBalance < parsedAmount) {
    throw createError(
      `Saldo insuficiente. Saldo atual: ${formatBRL(currentBalance)}.`,
      400
    );
  }

  // --- Atomic: debit balance + create redemption ---
  let redemption;
  try {
    [redemption] = await prisma.$transaction([
      prisma.redemption.create({
        data: {
          customerId: customer.id,
          operatorId,
          establishmentId,
          amountUsed: parsedAmount,
          status: 'CONFIRMED',
          receiptCode: generateReceiptCode('RSG'),
          ...(source ? { source } : {}),
          ...(metadata ? { metadata } : {}),
          ...(verifiedAttendantId ? { attendantId: verifiedAttendantId } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: { balance: { decrement: parsedAmount } },
      }),
    ]);
  } catch (err) {
    // Race: a concurrent call with the same idempotencyKey won the insert
    // between our check above and this one (the unique index is the real
    // guard; the check above is just an optimization to skip re-validating).
    if (err.code === 'P2002' && idempotencyKey) {
      const existing = await prisma.redemption.findUnique({
        where: { establishmentId_idempotencyKey: { establishmentId, idempotencyKey } },
        include: { customer: true },
      });
      if (existing && existing.status === 'CONFIRMED') {
        if (existing.customer.cpf !== stripCpf(cpf)) {
          throw createError('Conflito de identificador de requisição.', 409);
        }
        return buildIdempotentReplayResult(existing);
      }
    }
    throw err;
  }

  // The $transaction above already committed (Redemption created, balance
  // debited) — everything below is best-effort. A transient failure here must
  // NOT throw out of redeem(), or a caller (e.g. pistaService.confirmRequest)
  // that rolls back its own claim on any exception from redeem() would treat
  // an already-committed debit as if it never happened, and a retry would
  // double-debit the customer.
  //
  // The reread is retried a few times before giving up: `currentBalance -
  // parsedAmount` is NOT a safe fallback here — it's the value from BEFORE
  // this debit, so by construction of the `currentBalance < parsedAmount`
  // check above it can never be negative. Using it whenever the reread fails
  // would silently defeat the negative-balance race guard below (exactly
  // when a concurrent-overdraft race is most likely to be in flight). Only
  // used, clearly logged, as a last-resort DISPLAY value if every retry fails.
  let newBalance;
  let balanceVerified = false;
  for (let attempt = 1; attempt <= 3 && !balanceVerified; attempt++) {
    try {
      const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
      newBalance = parseFloat(updated.balance);
      balanceVerified = true;
    } catch (err) {
      console.error(`[redemptionService] Falha ao reler saldo após o débito (tentativa ${attempt}/3, resgate ${redemption.id} já confirmado):`, err.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150));
    }
  }

  if (balanceVerified && newBalance < 0) {
    // Guard against a genuine race: two concurrent redemptions for the same
    // customer each passed their own balance check but together overdraw.
    // The two compensating writes run in one $transaction so they can't
    // partially apply — otherwise a failure of just the second write would
    // leave the balance reversed but the Redemption still CONFIRMED (double
    // counted in caixaReport, and mistaken for "not reversed" below).
    try {
      await prisma.$transaction([
        prisma.customer.update({
          where: { id: customer.id },
          data: { balance: { increment: parsedAmount } },
        }),
        prisma.redemption.update({
          where: { id: redemption.id },
          // Clear idempotencyKey too: this attempt is being invalidated, so a
          // legitimate subsequent attempt with the same key must be able to
          // reuse it (the unique index would otherwise block it forever).
          data: { status: 'CANCELLED', idempotencyKey: null },
        }),
      ]);
      throw createError('Erro ao processar resgate. Operação cancelada.', 500);
    } catch (compErr) {
      if (compErr.isOperational) throw compErr; // the createError above — compensation succeeded
      // Compensation itself failed (atomically — neither write applied): the
      // debit is NOT reversed. This is no longer safe to treat as "nothing
      // committed" — flag it distinctly so confirmRequest doesn't reset the
      // request to PENDING and invite a double-debiting retry; it needs
      // manual reconciliation instead.
      console.error(`[redemptionService] Falha ao compensar saldo negativo do resgate ${redemption.id} — requer verificação manual:`, compErr.message);
      const err = createError('Erro ao processar resgate: falha ao compensar saldo negativo. Requer verificação manual.', 500);
      err.needsManualReview = true;
      throw err;
    }
  }

  if (!balanceVerified) {
    console.error(`[redemptionService] Não foi possível confirmar o saldo pós-débito do resgate ${redemption.id} — usando valor estimado para exibição; verificação manual recomendada.`);
    newBalance = Math.round((currentBalance - parsedAmount) * 100) / 100;
  }

  try {
    await audit.log({
      action: 'CASHBACK_REDEEMED',
      entity: 'Redemption',
      entityId: redemption.id,
      operatorId,
      metadata: {
        cpf: stripCpf(cpf),
        amountUsed: parsedAmount,
        previousBalance: currentBalance,
        newBalance,
        establishmentId,
      },
    });
  } catch (err) {
    console.error(`[redemptionService] Falha ao registrar auditoria do resgate ${redemption.id} (já confirmado):`, err.message);
  }

  let receipt;
  try {
    receipt = receiptService.generateRedeemReceipt({
      customerName: customer.name,
      cpf: customer.cpf,
      amountUsed: parsedAmount,
      newBalance,
      receiptCode: redemption.receiptCode,
      date: redemption.createdAt,
    });
  } catch (err) {
    console.error(`[redemptionService] Falha ao gerar comprovante do resgate ${redemption.id} (já confirmado):`, err.message);
    receipt = null;
  }

  return {
    mensagem: 'Resgate realizado com sucesso.',
    resgate: {
      id: redemption.id,
      codigoCupom: redemption.receiptCode,
      valorResgatado: formatBRL(parsedAmount),
      saldoAnterior: formatBRL(currentBalance),
      novoSaldo: formatBRL(newBalance),
      data: formatDateBR(redemption.createdAt),
      // raw fields used by the pista panel / comprovante
      clienteNome: customer.name,
      cpf: customer.cpf,
      valorNum: parsedAmount,
      novoSaldoNum: newBalance,
      createdAt: redemption.createdAt,
    },
    cupom: receipt,
  };
}

async function listByCustomer(cpf, establishmentId) {
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: stripCpf(cpf), establishmentId } },
  });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const redemptions = await prisma.redemption.findMany({
    where: { customerId: customer.id, establishmentId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    mensagem: 'Resgates listados com sucesso.',
    cliente: customer.name,
    resgates: redemptions.map((r) => ({
      id: r.id,
      codigoCupom: r.receiptCode,
      valorResgatado: formatBRL(r.amountUsed),
      status: r.status,
      data: formatDateBR(r.createdAt),
    })),
  };
}

module.exports = { redeem, listByCustomer, MIN_REDEMPTION };
