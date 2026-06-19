import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import {
  PAYMENT_CHECK_DIRECTIONS,
  PAYMENT_CHECK_STATUSES,
  PAYMENT_RELEASE_STATUSES,
  PAYMENT_RELEASED_STATUS,
  summarizeSalePaymentChecks,
  type PaymentCheckStatus,
  type PaymentReleaseStatus,
} from "../services/sale-payment-check.js";

const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"]);
const transactionStatusSchema = z.enum(["PENDING", "SCHEDULED", "PAID", "CANCELLED", "OVERDUE"]);
const paymentCheckDirectionSchema = z.enum(PAYMENT_CHECK_DIRECTIONS);
const paymentCheckStatusSchema = z.enum(PAYMENT_CHECK_STATUSES);
const paymentReleaseStatusSchema = z.enum(PAYMENT_RELEASE_STATUSES);

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

const salePaymentCheckQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  payment_status: paymentCheckStatusSchema.optional(),
  release_status: paymentReleaseStatusSchema.optional(),
  direction: paymentCheckDirectionSchema.optional(),
});

const createSalePaymentCheckSchema = z.object({
  saleId: z.string().uuid(),
  paymentItemType: z.string().trim().min(2).max(80),
  direction: paymentCheckDirectionSchema,
  isRequired: z.boolean().default(true),
  expectedAmount: z.number().positive(),
  paymentMethod: z.string().trim().max(80).optional(),
  expectedAt: z.coerce.date().optional(),
  payerOrReceiverName: z.string().trim().max(160).optional(),
  payerOrReceiverDocument: z.string().trim().max(32).optional(),
  notes: z.string().trim().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSalePaymentCheckSchema = createSalePaymentCheckSchema
  .omit({ saleId: true })
  .partial()
  .extend({
    confirmedAmount: z.number().nonnegative().nullable().optional(),
    bankMovementAt: z.coerce.date().nullable().optional(),
    bankAccountId: z.string().trim().max(120).nullable().optional(),
    bankDescription: z.string().trim().max(300).nullable().optional(),
    bankTransactionId: z.string().trim().max(120).nullable().optional(),
    proofFileId: z.string().uuid().nullable().optional(),
    bankEvidenceFileId: z.string().uuid().nullable().optional(),
    paymentStatus: paymentCheckStatusSchema.optional(),
    releaseStatus: paymentReleaseStatusSchema.optional(),
    divergenceReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  })
  .superRefine((input, ctx) => {
    if ((input.paymentStatus === "DIVERGENT" || input.releaseStatus === "BLOCKED_FOR_RELEASE") && !input.divergenceReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe motivo/observacao para divergencia ou bloqueio.", path: ["divergenceReason"] });
    }
  });

const confirmSalePaymentCheckSchema = z
  .object({
    confirmedAmount: z.number().nonnegative(),
    bankMovementAt: z.coerce.date(),
    bankAccountId: z.string().trim().max(120).optional(),
    bankDescription: z.string().trim().min(2).max(300),
    bankTransactionId: z.string().trim().max(120).optional(),
    proofFileId: z.string().uuid().nullable().optional(),
    bankEvidenceFileId: z.string().uuid().nullable().optional(),
    payerOrReceiverName: z.string().trim().max(160).optional(),
    payerOrReceiverDocument: z.string().trim().max(32).optional(),
    divergenceReason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.confirmedAmount === 0 && !input.divergenceReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe observacao quando nenhum valor foi confirmado.", path: ["notes"] });
    }
  });

const salePaymentCheckParamsSchema = z.object({
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

type SalePaymentCheckRecord = Prisma.SalePaymentCheckGetPayload<Record<string, never>>;

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

function sanitizeSalePaymentCheck(check: SalePaymentCheckRecord) {
  return {
    id: check.id,
    saleId: check.saleId,
    paymentItemType: check.paymentItemType,
    direction: check.direction,
    isRequired: check.isRequired,
    expectedAmount: check.expectedAmount.toString(),
    confirmedAmount: check.confirmedAmount?.toString() ?? null,
    pendingAmount: check.pendingAmount?.toString() ?? null,
    paymentMethod: check.paymentMethod,
    expectedAt: check.expectedAt?.toISOString() ?? null,
    bankMovementAt: check.bankMovementAt?.toISOString() ?? null,
    bankAccountId: check.bankAccountId,
    bankDescription: check.bankDescription,
    bankTransactionId: check.bankTransactionId,
    payerOrReceiverName: check.payerOrReceiverName,
    payerOrReceiverDocument: check.payerOrReceiverDocument,
    proofFileId: check.proofFileId,
    bankEvidenceFileId: check.bankEvidenceFileId,
    paymentStatus: check.paymentStatus,
    releaseStatus: check.releaseStatus,
    checkedByUserId: check.checkedByUserId,
    checkedAt: check.checkedAt?.toISOString() ?? null,
    releaseApprovedByUserId: check.releaseApprovedByUserId,
    releaseApprovedAt: check.releaseApprovedAt?.toISOString() ?? null,
    divergenceReason: check.divergenceReason,
    notes: check.notes,
    metadata: check.metadata,
    createdAt: check.createdAt.toISOString(),
    updatedAt: check.updatedAt.toISOString(),
  };
}

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value.toString());
}

function resolvePendingAmount(expectedAmount: number, confirmedAmount: number | null | undefined) {
  return Math.max(expectedAmount - (confirmedAmount ?? 0), 0);
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

async function ensureSaleInStore(storeId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, storeId, deletedAt: null }, select: { id: true } });
  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda vinculada a conferencia de pagamento nao encontrada.");
  }
}

async function ensureAttachmentInStore(storeId: string, attachmentId: string | null | undefined) {
  if (!attachmentId) {
    return;
  }
  const attachment = await prisma.fileAttachment.findFirst({
    where: { id: attachmentId, storeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Anexo da conferencia de pagamento nao encontrado.");
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

async function getSalePaymentCheckOrThrow(storeId: string, id: string) {
  const check = await prisma.salePaymentCheck.findFirst({
    where: { id, storeId },
  });

  if (!check) {
    throw new ApiError("NOT_FOUND", "Conferencia de pagamento nao encontrada.");
  }

  return check;
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

  app.get("/sale-payment-checks", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const query = salePaymentCheckQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.payment_status ? { paymentStatus: query.payment_status } : {}),
      ...(query.release_status ? { releaseStatus: query.release_status } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
    };

    const [items, total, allForSummary] = await Promise.all([
      prisma.salePaymentCheck.findMany({ where, orderBy: [{ createdAt: "desc" }], skip, take }),
      prisma.salePaymentCheck.count({ where }),
      prisma.salePaymentCheck.findMany({ where }),
    ]);

    return {
      ...listResponse(items.map(sanitizeSalePaymentCheck), query, total),
      summary: summarizeSalePaymentChecks(allForSummary),
    };
  });

  app.get("/sale-payment-checks/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = salePaymentCheckParamsSchema.parse(request.params);
    const check = await getSalePaymentCheckOrThrow(session.user.storeId, params.id);

    return { data: sanitizeSalePaymentCheck(check) };
  });

  app.post("/sale-payment-checks", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const input = createSalePaymentCheckSchema.parse(request.body);

    await ensureSaleInStore(session.user.storeId, input.saleId);

    const check = await prisma.$transaction(async (tx) => {
      const created = await tx.salePaymentCheck.create({
        data: {
          storeId: session.user.storeId,
          saleId: input.saleId,
          paymentItemType: input.paymentItemType,
          direction: input.direction,
          isRequired: input.isRequired,
          expectedAmount: input.expectedAmount,
          pendingAmount: input.expectedAmount,
          paymentMethod: input.paymentMethod,
          expectedAt: input.expectedAt,
          payerOrReceiverName: input.payerOrReceiverName,
          payerOrReceiverDocument: input.payerOrReceiverDocument,
          notes: input.notes,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_payment_check_created",
          entityType: "sale_payment_check",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: created.saleId,
            paymentItemType: created.paymentItemType,
            direction: created.direction,
            expectedAmount: created.expectedAmount.toString(),
          },
        },
      });

      return created;
    });

    return reply.code(201).send({ data: sanitizeSalePaymentCheck(check) });
  });

  app.patch("/sale-payment-checks/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = salePaymentCheckParamsSchema.parse(request.params);
    const input = updateSalePaymentCheckSchema.parse(request.body);
    const current = await getSalePaymentCheckOrThrow(session.user.storeId, params.id);

    await ensureAttachmentInStore(session.user.storeId, input.proofFileId);
    await ensureAttachmentInStore(session.user.storeId, input.bankEvidenceFileId);

    const expectedAmount = input.expectedAmount ?? decimalToNumber(current.expectedAmount);
    const confirmedAmount = input.confirmedAmount === undefined ? decimalToNumber(current.confirmedAmount) : input.confirmedAmount;
    const pendingAmount =
      input.expectedAmount !== undefined || input.confirmedAmount !== undefined ? resolvePendingAmount(expectedAmount, confirmedAmount ?? 0) : undefined;

    const check = await prisma.$transaction(async (tx) => {
      const updated = await tx.salePaymentCheck.update({
        where: { id: current.id },
        data: {
          paymentItemType: input.paymentItemType,
          direction: input.direction,
          isRequired: input.isRequired,
          expectedAmount: input.expectedAmount,
          confirmedAmount: input.confirmedAmount === undefined ? undefined : input.confirmedAmount,
          pendingAmount,
          paymentMethod: input.paymentMethod,
          expectedAt: input.expectedAt,
          bankMovementAt: input.bankMovementAt === undefined ? undefined : input.bankMovementAt,
          bankAccountId: input.bankAccountId === undefined ? undefined : input.bankAccountId,
          bankDescription: input.bankDescription === undefined ? undefined : input.bankDescription,
          bankTransactionId: input.bankTransactionId === undefined ? undefined : input.bankTransactionId,
          payerOrReceiverName: input.payerOrReceiverName,
          payerOrReceiverDocument: input.payerOrReceiverDocument,
          proofFileId: input.proofFileId === undefined ? undefined : input.proofFileId,
          bankEvidenceFileId: input.bankEvidenceFileId === undefined ? undefined : input.bankEvidenceFileId,
          paymentStatus: input.paymentStatus,
          releaseStatus: input.releaseStatus,
          divergenceReason: input.divergenceReason === undefined ? undefined : input.divergenceReason,
          notes: input.notes,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_payment_check_updated",
          entityType: "sale_payment_check",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            changedFields: Object.keys(input),
            fromPaymentStatus: current.paymentStatus,
            toPaymentStatus: updated.paymentStatus,
            fromReleaseStatus: current.releaseStatus,
            toReleaseStatus: updated.releaseStatus,
          },
        },
      });

      return updated;
    });

    return { data: sanitizeSalePaymentCheck(check) };
  });

  app.post("/sale-payment-checks/:id/confirm", async (request) => {
    const session = await requirePermission(request, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = salePaymentCheckParamsSchema.parse(request.params);
    const input = confirmSalePaymentCheckSchema.parse(request.body);
    const current = await getSalePaymentCheckOrThrow(session.user.storeId, params.id);

    await ensureAttachmentInStore(session.user.storeId, input.proofFileId);
    await ensureAttachmentInStore(session.user.storeId, input.bankEvidenceFileId);

    const expectedAmount = decimalToNumber(current.expectedAmount);
    const pendingAmount = resolvePendingAmount(expectedAmount, input.confirmedAmount);
    const hasDivergence = Boolean(input.divergenceReason);
    const nextPaymentStatus: PaymentCheckStatus = hasDivergence
      ? "DIVERGENT"
      : pendingAmount > 0
        ? "PARTIAL_RECEIVED"
        : current.direction === "EXPENSE"
          ? "CONFIRMED_PAID"
          : "CONFIRMED_RECEIVED";
    const nextReleaseStatus: PaymentReleaseStatus = hasDivergence ? "BLOCKED_FOR_RELEASE" : pendingAmount > 0 ? "BLOCKED" : PAYMENT_RELEASED_STATUS;
    const now = new Date();

    const check = await prisma.$transaction(async (tx) => {
      const updated = await tx.salePaymentCheck.update({
        where: { id: current.id },
        data: {
          confirmedAmount: input.confirmedAmount,
          pendingAmount,
          bankMovementAt: input.bankMovementAt,
          bankAccountId: input.bankAccountId,
          bankDescription: input.bankDescription,
          bankTransactionId: input.bankTransactionId,
          payerOrReceiverName: input.payerOrReceiverName,
          payerOrReceiverDocument: input.payerOrReceiverDocument,
          proofFileId: input.proofFileId === undefined ? undefined : input.proofFileId,
          bankEvidenceFileId: input.bankEvidenceFileId === undefined ? undefined : input.bankEvidenceFileId,
          paymentStatus: nextPaymentStatus,
          releaseStatus: nextReleaseStatus,
          checkedByUserId: session.user.id,
          checkedAt: now,
          releaseApprovedByUserId: nextReleaseStatus === PAYMENT_RELEASED_STATUS ? session.user.id : null,
          releaseApprovedAt: nextReleaseStatus === PAYMENT_RELEASED_STATUS ? now : null,
          divergenceReason: input.divergenceReason,
          notes: input.notes,
        },
      });

      const links = [input.proofFileId, input.bankEvidenceFileId]
        .filter((attachmentId): attachmentId is string => Boolean(attachmentId))
        .map((attachmentId) => ({
          storeId: session.user.storeId,
          attachmentId,
          entityType: "sale",
          entityId: current.saleId,
          purpose: `payment_check_${current.paymentItemType}`,
        }));
      if (links.length > 0) {
        await tx.fileAttachmentLink.createMany({ data: links, skipDuplicates: true });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_payment_check_confirmed",
          entityType: "sale_payment_check",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            expectedAmount: current.expectedAmount.toString(),
            confirmedAmount: updated.confirmedAmount?.toString() ?? null,
            pendingAmount: updated.pendingAmount?.toString() ?? null,
            fromPaymentStatus: current.paymentStatus,
            toPaymentStatus: updated.paymentStatus,
            fromReleaseStatus: current.releaseStatus,
            toReleaseStatus: updated.releaseStatus,
          },
        },
      });

      return updated;
    });

    return { data: sanitizeSalePaymentCheck(check) };
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
