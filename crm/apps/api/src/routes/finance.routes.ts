import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);
const transactionStatusSchema = z.enum(["PENDING", "SCHEDULED", "PAID", "CANCELLED", "OVERDUE"]);

const transactionQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  type: transactionTypeSchema.optional(),
  status: transactionStatusSchema.optional(),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const createTransactionSchema = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  type: transactionTypeSchema,
  status: transactionStatusSchema.default("PENDING"),
  description: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Descricao financeira") }),
  amount: z.number().positive(),
  dueAt: z.coerce.date().optional(),
  paidAt: z.coerce.date().optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  snapshot: z.record(z.unknown()).optional(),
});

const updateTransactionSchema = createTransactionSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const transactionParamsSchema = z.object({
  id: z.string().uuid(),
});

const settleTransactionSchema = z.object({
  status: z.enum(["PAID", "CANCELLED", "OVERDUE", "SCHEDULED"]),
  paidAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});

const summaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

type FinancialTransactionRecord = {
  id: string;
  accountId: string | null;
  categoryId: string | null;
  type: string;
  status: string;
  description: string;
  amount: { toString(): string };
  dueAt: Date | null;
  paidAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  snapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeTransaction(transaction: FinancialTransactionRecord) {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    type: transaction.type,
    status: transaction.status,
    description: transaction.description,
    amount: transaction.amount.toString(),
    dueAt: transaction.dueAt?.toISOString() ?? null,
    paidAt: transaction.paidAt?.toISOString() ?? null,
    entityType: transaction.entityType,
    entityId: transaction.entityId,
    snapshot: transaction.snapshot,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

async function ensureEntityInStore(storeId: string, entityType?: string, entityId?: string) {
  if (!entityType || !entityId) return;

  if (entityType === "sale") {
    const sale = await prisma.sale.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!sale) throw new ApiError("NOT_FOUND", "Venda vinculada ao lancamento financeiro nao encontrada.");
    return;
  }

  if (entityType === "vehicle" || entityType === "vehicle_inventory") {
    const model =
      entityType === "vehicle"
        ? await prisma.vehicle.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } })
        : await prisma.vehicleInventoryRecord.findFirst({
            where: { id: entityId, storeId, deletedAt: null },
            select: { id: true },
          });
    if (!model) throw new ApiError("NOT_FOUND", "Veiculo/estoque vinculado ao lancamento financeiro nao encontrado.");
    return;
  }

  if (entityType === "customer") {
    const customer = await prisma.customer.findFirst({
      where: { id: entityId, storeId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new ApiError("NOT_FOUND", "Cliente vinculado ao lancamento financeiro nao encontrado.");
  }
}

async function getTransactionOrThrow(storeId: string, id: string) {
  const transaction = await prisma.financialTransaction.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!transaction) {
    throw new ApiError("NOT_FOUND", "Lancamento financeiro nao encontrado.");
  }

  return transaction;
}

export async function registerFinanceRoutes(app: FastifyInstance) {
  app.get("/transactions", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const query = transactionQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      ...(query.from || query.to
        ? {
            dueAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.financialTransaction.findMany({ where, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], skip, take }),
      prisma.financialTransaction.count({ where }),
    ]);

    return listResponse(items.map(sanitizeTransaction), query, total);
  });

  app.get("/transactions/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = transactionParamsSchema.parse(request.params);
    const transaction = await getTransactionOrThrow(session.user.storeId, params.id);

    return { data: sanitizeTransaction(transaction) };
  });

  app.post("/transactions", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const input = createTransactionSchema.parse(request.body);

    await ensureEntityInStore(session.user.storeId, input.entityType, input.entityId);

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.financialTransaction.create({
        data: {
          storeId: session.user.storeId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          type: input.type,
          status: input.status,
          description: input.description,
          amount: input.amount,
          dueAt: input.dueAt,
          paidAt: input.paidAt,
          entityType: input.entityType,
          entityId: input.entityId,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "transaction_created",
          entityType: "financial_transaction",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            type: created.type,
            status: created.status,
            amount: created.amount.toString(),
            linkedEntityType: created.entityType,
            linkedEntityId: created.entityId,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "finance.transaction_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "financial_transaction",
      entityId: transaction.id,
      payload: { type: transaction.type, status: transaction.status, amount: transaction.amount.toString() },
    });

    return reply.code(201).send({ data: sanitizeTransaction(transaction) });
  });

  app.patch("/transactions/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = transactionParamsSchema.parse(request.params);
    const input = updateTransactionSchema.parse(request.body);
    const current = await getTransactionOrThrow(session.user.storeId, params.id);

    await ensureEntityInStore(session.user.storeId, input.entityType, input.entityId);

    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.financialTransaction.update({
        where: { id: current.id },
        data: {
          accountId: input.accountId,
          categoryId: input.categoryId,
          type: input.type,
          status: input.status,
          description: input.description,
          amount: input.amount,
          dueAt: input.dueAt,
          paidAt: input.paidAt,
          entityType: input.entityType,
          entityId: input.entityId,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "transaction_updated",
          entityType: "financial_transaction",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });

      return updated;
    });

    return { data: sanitizeTransaction(transaction) };
  });

  app.post("/transactions/:id/settle", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = transactionParamsSchema.parse(request.params);
    const input = settleTransactionSchema.parse(request.body);
    const current = await getTransactionOrThrow(session.user.storeId, params.id);

    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.financialTransaction.update({
        where: { id: current.id },
        data: {
          status: input.status,
          paidAt: input.status === "PAID" ? input.paidAt ?? new Date() : current.paidAt,
          snapshot: {
            ...(typeof current.snapshot === "object" && current.snapshot ? current.snapshot : {}),
            lastSettlement: {
              fromStatus: current.status,
              toStatus: input.status,
              reason: input.reason,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "transaction_settled",
          entityType: "financial_transaction",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            fromStatus: current.status,
            toStatus: input.status,
            reason: input.reason,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "finance.transaction_settled",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "financial_transaction",
      entityId: transaction.id,
      payload: { fromStatus: current.status, toStatus: transaction.status, amount: transaction.amount.toString() },
    });

    return { data: sanitizeTransaction(transaction) };
  });

  app.get("/summary", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const query = summaryQuerySchema.parse(request.query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.from || query.to
        ? {
            dueAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const transactions = await prisma.financialTransaction.findMany({ where });
    const summary = transactions.reduce(
      (acc, transaction) => {
        const amount = Number(transaction.amount.toString());
        if (transaction.type === "INCOME") acc.income += amount;
        if (transaction.type === "EXPENSE") acc.expense += amount;
        if (transaction.status === "PAID") acc.paid += amount;
        if (transaction.status === "PENDING" || transaction.status === "SCHEDULED") acc.open += amount;
        return acc;
      },
      { income: 0, expense: 0, paid: 0, open: 0 },
    );

    return {
      period: {
        from: query.from?.toISOString() ?? null,
        to: query.to?.toISOString() ?? null,
      },
      totals: {
        ...summary,
        net: summary.income - summary.expense,
      },
      count: transactions.length,
    };
  });
}
