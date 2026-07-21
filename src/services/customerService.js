const { PrismaClient } = require('@prisma/client');
const { isValidCpf, stripCpf, formatCpf, maskCpf } = require('../utils/cpfValidator');
const { formatBRL } = require('../utils/currencyFormatter');
const { formatDateBR } = require('../utils/dateFormatter');
const { createError } = require('../middlewares/errorMiddleware');
const audit = require('./auditService');

const prisma = new PrismaClient();

function serializeCustomer(customer) {
  return {
    id: customer.id,
    nome: customer.name,
    cpf: formatCpf(customer.cpf),
    telefone: customer.phone,
    saldo: formatBRL(customer.balance),
    saldoNumerico: parseFloat(customer.balance),
    cadastradoEm: formatDateBR(customer.createdAt),
  };
}

async function upsert({ name, cpf, phone }, operator) {
  if (!cpf) throw createError('CPF é obrigatório.', 400);
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const cleanCpf = stripCpf(cpf);
  const { id: operatorId, establishmentId } = operator;

  const existing = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
  });

  // Already a fully registered customer — just return it, don't overwrite
  // name/phone from a re-submitted lookup.
  if (existing && existing.registered) {
    await audit.log({
      action: 'CUSTOMER_FETCHED',
      entity: 'Customer',
      entityId: existing.id,
      operatorId,
      metadata: { cpf: maskCpf(cleanCpf) },
    });

    return {
      mensagem: 'Cliente localizado com sucesso.',
      criado: false,
      cliente: serializeCustomer(existing),
    };
  }

  // Either a brand-new CPF, or an unregistered stub (pistaService creates
  // these the first time a CPF fuels before ever registering) that's now
  // being completed at the counter — both need name+phone.
  if (!name || !name.trim()) throw createError('Nome é obrigatório para novo cadastro.', 400);
  if (!phone || !phone.trim()) throw createError('Telefone é obrigatório para novo cadastro.', 400);

  let customer;
  try {
    customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { name: name.trim(), phone: phone.trim(), registered: true },
        })
      : await prisma.customer.create({
          data: { name: name.trim(), cpf: cleanCpf, phone: phone.trim(), establishmentId, registered: true },
        });
  } catch (err) {
    if (err.code === 'P2002') {
      // Lost a race against a concurrent create for the same brand-new CPF —
      // return the winner's row instead of crashing.
      const winner = await prisma.customer.findUnique({
        where: { cpf_establishmentId: { cpf: cleanCpf, establishmentId } },
      });
      if (winner) {
        return {
          mensagem: 'Cliente localizado com sucesso.',
          criado: false,
          cliente: serializeCustomer(winner),
        };
      }
    }
    throw err;
  }

  await audit.log({
    action: 'CUSTOMER_CREATED',
    entity: 'Customer',
    entityId: customer.id,
    operatorId,
    metadata: { cpf: maskCpf(cleanCpf), name: customer.name },
  });

  return {
    mensagem: 'Cliente cadastrado com sucesso.',
    criado: true,
    cliente: serializeCustomer(customer),
  };
}

async function findByCpf(cpf, establishmentId) {
  if (!isValidCpf(cpf)) throw createError('CPF inválido.', 400);

  const customer = await prisma.customer.findUnique({
    where: { cpf_establishmentId: { cpf: stripCpf(cpf), establishmentId } },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      redemptions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!customer) throw createError('Cliente não encontrado.', 404);

  return {
    mensagem: 'Cliente encontrado.',
    cliente: {
      ...serializeCustomer(customer),
      ultimasTransacoes: customer.transactions.map((t) => ({
        id: t.id,
        codigoCupom: t.receiptCode,
        valorAbastecimento: formatBRL(t.amount),
        percentualCashback: `${t.cashbackPercent}%`,
        cashbackGerado: formatBRL(t.cashbackValue),
        data: formatDateBR(t.createdAt),
      })),
      ultimosResgates: customer.redemptions.map((r) => ({
        id: r.id,
        codigoCupom: r.receiptCode,
        valorResgatado: formatBRL(r.amountUsed),
        status: r.status,
        data: formatDateBR(r.createdAt),
      })),
    },
  };
}

async function listAll({ page = 1, limit = 20, includeUnregistered = false } = {}, establishmentId) {
  const skip = (page - 1) * limit;
  const where = { establishmentId };
  if (!includeUnregistered) where.registered = true; // hide pista stub rows by default

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    mensagem: 'Clientes listados com sucesso.',
    total,
    pagina: page,
    porPagina: limit,
    clientes: customers.map(serializeCustomer),
  };
}

async function list({ search = '', page = 1, limit = 20, includeUnregistered = false } = {}, establishmentId) {
  const skip = (page - 1) * limit;

  const where = { establishmentId };
  if (!includeUnregistered) where.registered = true; // hide pista stub rows by default
  if (search && search.trim()) {
    const s = search.trim();
    const cleanDigits = s.replace(/\D/g, '');
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
      ...(cleanDigits.length > 0 ? [{ cpf: { contains: cleanDigits } }] : []),
    ];
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.count({ where }),
  ]);

  // Two DB-level aggregates instead of pulling every transaction row per
  // customer into Node just to sum/filter in JS — cost no longer grows with
  // how much fueling history each customer has.
  const ids = customers.map((c) => c.id);
  const [last30, allTime] = ids.length === 0 ? [[], []] : await Promise.all([
    prisma.transaction.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, createdAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids } },
      _max: { createdAt: true },
      _count: { _all: true },
    }),
  ]);

  const last30ById  = new Map(last30.map((r) => [r.customerId, r._sum.amount]));
  const allTimeById = new Map(allTime.map((r) => [r.customerId, r]));

  const serialized = customers.map((c) => {
    const allTimeRow = allTimeById.get(c.id);

    return {
      id: c.id,
      name: c.name,
      cpf: formatCpf(c.cpf),
      phone: c.phone,
      balance: parseFloat(c.balance),
      totalLast30Days: parseFloat(last30ById.get(c.id) || 0),
      lastFuelDate: allTimeRow?._max.createdAt ?? null,
      transactionCount: allTimeRow?._count._all ?? 0,
    };
  });

  return {
    total,
    page,
    limit,
    customers: serialized,
  };
}

module.exports = { upsert, findByCpf, listAll, list };
