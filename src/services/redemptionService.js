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

async function redeem({ cpf, amount }, operator) {
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

  // --- Fraud check ---
  await fraudService.checkRedemption(cpf, establishmentId);

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
  const [redemption] = await prisma.$transaction([
    prisma.redemption.create({
      data: {
        customerId: customer.id,
        operatorId,
        establishmentId,
        amountUsed: parsedAmount,
        status: 'CONFIRMED',
        receiptCode: generateReceiptCode('RSG'),
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { balance: { decrement: parsedAmount } },
    }),
  ]);

  const updated = await prisma.customer.findUnique({ where: { id: customer.id } });
  const newBalance = parseFloat(updated.balance);

  // Guard against floating-point negative balance
  if (newBalance < 0) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { balance: { increment: parsedAmount } },
    });
    await prisma.redemption.update({
      where: { id: redemption.id },
      data: { status: 'CANCELLED' },
    });
    throw createError('Erro ao processar resgate. Operação cancelada.', 500);
  }

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

  const receipt = receiptService.generateRedeemReceipt({
    customerName: customer.name,
    cpf: customer.cpf,
    amountUsed: parsedAmount,
    newBalance,
    receiptCode: redemption.receiptCode,
    date: redemption.createdAt,
  });

  return {
    mensagem: 'Resgate realizado com sucesso.',
    resgate: {
      id: redemption.id,
      codigoCupom: redemption.receiptCode,
      valorResgatado: formatBRL(parsedAmount),
      saldoAnterior: formatBRL(currentBalance),
      novoSaldo: formatBRL(newBalance),
      data: formatDateBR(redemption.createdAt),
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

module.exports = { redeem, listByCustomer };
