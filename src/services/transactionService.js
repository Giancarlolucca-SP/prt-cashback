const { PrismaClient } = require('@prisma/client');
const { isValidCpf, stripCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { generateReceiptCode } = require('../utils/receiptCode');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');
const receiptService = require('./receiptService');
const fraudService = require('./fraudService');
const { DEFAULT_FUEL_TYPES } = require('./cashbackSettingsService');

const prisma = new PrismaClient();

// ── Cashback calculation using CashbackSettings ───────────────────────────────

async function computeCashback(amount, fuelType, liters, establishmentId) {
  // Load (or create default) settings
  const settings = await prisma.cashbackSettings.upsert({
    where:  { establishmentId },
    create: { establishmentId, fuelTypes: DEFAULT_FUEL_TYPES },
    update: {},
  });

  // Minimum purchase check
  const minAmount = parseFloat(settings.minFuelAmount);
  if (minAmount > 0 && amount < minAmount) {
    throw createError(
      `Valor mínimo para gerar cashback é ${formatBRL(minAmount)}.`,
      400
    );
  }

  const fuelTypesMap = (settings.fuelTypes && typeof settings.fuelTypes === 'object')
    ? settings.fuelTypes
    : DEFAULT_FUEL_TYPES;

  let cashbackValue   = 0;
  let effectivePercent = 0;

  // Fixed-value fuel types (carWash, convenienceStore) bypass mode entirely
  const ftConfig   = fuelType ? fuelTypesMap[fuelType] : null;
  const fixedValue = ftConfig?.active ? parseFloat(ftConfig.fixedValue) : 0;

  if (fixedValue > 0) {
    cashbackValue    = fixedValue;
    effectivePercent = amount > 0 ? (cashbackValue / amount) * 100 : 0;
  } else if (settings.mode === 'CENTS_PER_LITER') {
    // Need liters; fall back to PERCENTAGE if not provided
    if (liters && parseFloat(liters) > 0) {
      const parsedLiters = parseFloat(liters);
      let centsPerLiter  = parseFloat(settings.defaultCentsPerLiter);

      if (fuelType && fuelTypesMap[fuelType]?.active) {
        centsPerLiter = parseFloat(fuelTypesMap[fuelType].centsPerLiter) || centsPerLiter;
      }

      cashbackValue    = parsedLiters * centsPerLiter;
      effectivePercent = amount > 0 ? (cashbackValue / amount) * 100 : 0;
    } else {
      // Graceful fallback: use defaultPercent so the register screen still works
      let percent = parseFloat(settings.defaultPercent);
      if (fuelType && fuelTypesMap[fuelType]?.active) {
        percent = parseFloat(fuelTypesMap[fuelType].percent) || percent;
      }
      cashbackValue    = amount * percent / 100;
      effectivePercent = percent;
    }
  } else {
    // PERCENTAGE mode
    let percent = parseFloat(settings.defaultPercent);
    if (fuelType && fuelTypesMap[fuelType]?.active) {
      percent = parseFloat(fuelTypesMap[fuelType].percent) || percent;
    }
    cashbackValue    = amount * percent / 100;
    effectivePercent = percent;
  }

  // Double bonus
  if (settings.doubleBonus) {
    const now   = new Date();
    const start = settings.doubleBonusStart ? new Date(settings.doubleBonusStart) : null;
    const end   = settings.doubleBonusEnd   ? new Date(settings.doubleBonusEnd)   : null;
    if ((!start || now >= start) && (!end || now <= end)) {
      cashbackValue    *= 2;
      effectivePercent *= 2;
    }
  }

  // Rush hour bonus (São Paulo timezone)
  if (settings.rushHourBonus && settings.rushHourStart && settings.rushHourEnd) {
    const nowSP = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    );
    const currentMins = nowSP.getHours() * 60 + nowSP.getMinutes();

    const [sh, sm] = settings.rushHourStart.split(':').map(Number);
    const [eh, em] = settings.rushHourEnd.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins   = eh * 60 + em;

    if (currentMins >= startMins && currentMins <= endMins) {
      const extra   = parseFloat(settings.rushHourPercent) / 100;
      cashbackValue    *= (1 + extra);
      effectivePercent *= (1 + extra);
    }
  }

  // Cap per transaction
  const cap = parseFloat(settings.maxCashbackPerTransaction);
  if (cap > 0 && cashbackValue > cap) {
    cashbackValue = cap;
  }

  cashbackValue    = parseFloat(cashbackValue.toFixed(2));
  effectivePercent = parseFloat(effectivePercent.toFixed(4));

  return { cashbackValue, effectivePercent };
}

// ── earn ──────────────────────────────────────────────────────────────────────

async function earn({ cpf, amount, fuelType, liters }, operator) {
  if (!cpf) throw createError('CPF é obrigatório.', 400);
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    throw createError('Valor do abastecimento deve ser maior que zero.', 400);
  }

  const { id: operatorId, establishmentId } = operator;

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: stripCpf(cpf), establishmentId } },
  });
  if (!customer) throw createError('Cliente não encontrado. Realize o cadastro primeiro.', 404);

  const { cashbackValue, effectivePercent } = await computeCashback(
    parsedAmount, fuelType, liters, establishmentId
  );

  await fraudService.checkTransaction(cpf, parsedAmount, cashbackValue, establishmentId);

  const [transaction] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId:     customer.id,
        operatorId,
        establishmentId,
        amount:          parsedAmount,
        cashbackPercent: effectivePercent,
        cashbackValue,
        receiptCode:     generateReceiptCode('TXN'),
        fuelType:        fuelType || null,
        liters:          liters ? parseFloat(liters) : null,
        status:          'CONFIRMED',
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data:  { balance: { increment: cashbackValue } },
    }),
  ]);

  const updated = await prisma.customer.findUnique({ where: { id: customer.id } });

  await audit.log({
    action:   'CASHBACK_EARNED',
    entity:   'Transaction',
    entityId: transaction.id,
    operatorId,
    metadata: {
      cpf: stripCpf(cpf),
      amount: parsedAmount,
      cashbackPercent: effectivePercent,
      cashbackValue,
      fuelType: fuelType || null,
      establishmentId,
    },
  });

  const receipt = receiptService.generateEarnReceipt({
    customerName:   customer.name,
    cpf:            customer.cpf,
    amount:         parsedAmount,
    cashbackPercent: effectivePercent,
    cashbackValue,
    newBalance:     parseFloat(updated.balance),
    receiptCode:    transaction.receiptCode,
    date:           transaction.createdAt,
  });

  return {
    mensagem: 'Cashback gerado com sucesso.',
    transacao: {
      id:                  transaction.id,
      codigoCupom:         transaction.receiptCode,
      valorAbastecimento:  formatBRL(parsedAmount),
      percentualCashback:  `${effectivePercent.toFixed(2)}%`,
      cashbackGerado:      formatBRL(cashbackValue),
      novoSaldo:           formatBRL(updated.balance),
      data:                formatDateBR(transaction.createdAt),
    },
    cupom: receipt,
  };
}

// ── listByCustomer ────────────────────────────────────────────────────────────

async function listByCustomer(cpf, establishmentId) {
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: stripCpf(cpf), establishmentId } },
  });
  if (!customer) throw createError('Cliente não encontrado.', 404);

  const transactions = await prisma.transaction.findMany({
    where:   { customerId: customer.id, establishmentId },
    orderBy: { createdAt: 'desc' },
  });

  return {
    mensagem: 'Transações listadas com sucesso.',
    cliente:  customer.name,
    transacoes: transactions.map((t) => ({
      id:                  t.id,
      codigoCupom:         t.receiptCode,
      valorAbastecimento:  formatBRL(t.amount),
      percentualCashback:  `${t.cashbackPercent}%`,
      cashbackGerado:      formatBRL(t.cashbackValue),
      data:                formatDateBR(t.createdAt),
    })),
  };
}

module.exports = { earn, listByCustomer, computeCashback };
