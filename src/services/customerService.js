const { PrismaClient } = require('@prisma/client');
const { isValidCpf, stripCpf, formatCpf } = require('../utils/cpfValidator');
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

  if (existing) {
    await audit.log({
      action: 'CUSTOMER_FETCHED',
      entity: 'Customer',
      entityId: existing.id,
      operatorId,
      metadata: { cpf: cleanCpf },
    });

    return {
      mensagem: 'Cliente localizado com sucesso.',
      cliente: serializeCustomer(existing),
    };
  }

  // Create new customer
  if (!name || !name.trim()) throw createError('Nome é obrigatório para novo cadastro.', 400);
  if (!phone || !phone.trim()) throw createError('Telefone é obrigatório para novo cadastro.', 400);

  const customer = await prisma.customer.create({
    data: { name: name.trim(), cpf: cleanCpf, phone: phone.trim(), establishmentId },
  });

  await audit.log({
    action: 'CUSTOMER_CREATED',
    entity: 'Customer',
    entityId: customer.id,
    operatorId,
    metadata: { cpf: cleanCpf, name: customer.name },
  });

  return {
    mensagem: 'Cliente cadastrado com sucesso.',
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

async function listAll({ page = 1, limit = 20 } = {}, establishmentId) {
  const skip = (page - 1) * limit;
  const where = { establishmentId };

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

async function list({ search = '', page = 1, limit = 20 } = {}, establishmentId) {
  const skip = (page - 1) * limit;

  const where = { establishmentId };
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
      include: {
        transactions: {
          select: { amount: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.count({ where }),
  ]);

  const serialized = customers.map((c) => {
    const totalLast30Days = c.transactions
      .filter((t) => t.createdAt >= thirtyDaysAgo)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const lastFuelDate = c.transactions.length > 0 ? c.transactions[0].createdAt : null;

    return {
      id: c.id,
      name: c.name,
      cpf: formatCpf(c.cpf),
      phone: c.phone,
      balance: parseFloat(c.balance),
      totalLast30Days,
      lastFuelDate,
      transactionCount: c.transactions.length,
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
