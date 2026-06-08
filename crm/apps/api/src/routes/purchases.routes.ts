import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const purchaseStatusSchema = z.enum(["OPEN", "EVALUATING", "APPROVED", "REJECTED", "PURCHASED", "CANCELLED"]);
const evaluationDecisionSchema = z.enum(["PENDING", "APPROVED_BUY", "APPROVED_REPASSE", "REJECTED", "NEGOTIATING"]);
const paymentStatusSchema = z.enum(["PENDING", "SCHEDULED", "PAID", "CANCELLED", "OVERDUE"]);

const purchaseLeadQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: purchaseStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
});

const createPurchaseLeadSchema = z.object({
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  source: z.string().trim().max(80).optional(),
  status: purchaseStatusSchema.default("OPEN"),
  askingPrice: z.number().nonnegative().optional(),
});

const updatePurchaseLeadStatusSchema = z.object({
  status: purchaseStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const purchaseLeadParamsSchema = z.object({ id: z.string().uuid() });

const evaluationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  decision: evaluationDecisionSchema.optional(),
  purchase_lead_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
});

const createEvaluationSchema = z.object({
  purchaseLeadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  appraiserUserId: z.string().uuid().optional(),
  requestedPrice: z.number().nonnegative().optional(),
  fipeValue: z.number().nonnegative().optional(),
  suggestedPrice: z.number().nonnegative().optional(),
  expectedPrepCost: z.number().nonnegative().optional(),
  expectedMargin: z.number().optional(),
  decision: evaluationDecisionSchema.default("PENDING"),
  snapshot: z.record(z.unknown()).optional(),
  evaluatedAt: z.coerce.date().optional(),
});

const evaluationParamsSchema = z.object({ id: z.string().uuid() });

const checklistSchema = z.object({
  itemKey: z.string().trim().min(2).max(80),
  label: z.string().trim().min(2).max(160),
  value: z.string().trim().max(300).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const approvalSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "NEGOTIATING"]),
  reason: z.string().trim().max(300).optional(),
  snapshot: z.record(z.unknown()).optional(),
});

const createPurchasePaymentSchema = z.object({
  purchaseLeadId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  amount: z.number().positive(),
  status: paymentStatusSchema.default("PENDING"),
  paidAt: z.coerce.date().optional(),
  snapshot: z.record(z.unknown()).optional(),
});

const paymentParamsSchema = z.object({ id: z.string().uuid() });

const updatePaymentStatusSchema = z.object({
  status: paymentStatusSchema,
  paidAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});

type PurchaseLeadRecord = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  source: string | null;
  status: string;
  askingPrice: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
};

type EvaluationRecord = {
  id: string;
  purchaseLeadId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  appraiserUserId: string | null;
  requestedPrice: { toString(): string } | null;
  fipeValue: { toString(): string } | null;
  suggestedPrice: { toString(): string } | null;
  expectedPrepCost: { toString(): string } | null;
  expectedMargin: { toString(): string } | null;
  decision: string;
  snapshot: unknown;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type PurchasePaymentRecord = {
  id: string;
  purchaseLeadId: string | null;
  vehicleId: string | null;
  amount: { toString(): string };
  status: string;
  paidAt: Date | null;
  snapshot: unknown;
  createdAt: Date;
};

function sanitizeLead(lead: PurchaseLeadRecord) {
  return {
    id: lead.id,
    customerId: lead.customerId,
    vehicleId: lead.vehicleId,
    source: lead.source,
    status: lead.status,
    askingPrice: lead.askingPrice?.toString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function sanitizeEvaluation(evaluation: EvaluationRecord) {
  return {
    id: evaluation.id,
    purchaseLeadId: evaluation.purchaseLeadId,
    customerId: evaluation.customerId,
    vehicleId: evaluation.vehicleId,
    appraiserUserId: evaluation.appraiserUserId,
    requestedPrice: evaluation.requestedPrice?.toString() ?? null,
    fipeValue: evaluation.fipeValue?.toString() ?? null,
    suggestedPrice: evaluation.suggestedPrice?.toString() ?? null,
    expectedPrepCost: evaluation.expectedPrepCost?.toString() ?? null,
    expectedMargin: evaluation.expectedMargin?.toString() ?? null,
    decision: evaluation.decision,
    snapshot: evaluation.snapshot,
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
    createdAt: evaluation.createdAt.toISOString(),
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

function sanitizePayment(payment: PurchasePaymentRecord) {
  return {
    id: payment.id,
    purchaseLeadId: payment.purchaseLeadId,
    vehicleId: payment.vehicleId,
    amount: payment.amount.toString(),
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    snapshot: payment.snapshot,
    createdAt: payment.createdAt.toISOString(),
  };
}

async function ensureCustomer(storeId: string, customerId?: string | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente da compra nao encontrado.");
}

async function ensureVehicle(storeId: string, vehicleId?: string | null) {
  if (!vehicleId) return;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, storeId, deletedAt: null }, select: { id: true } });
  if (!vehicle) throw new ApiError("NOT_FOUND", "Veiculo da compra nao encontrado.");
}

async function ensureUser(storeId: string, userId?: string | null) {
  if (!userId) return;
  const user = await prisma.user.findFirst({ where: { id: userId, storeId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!user) throw new ApiError("NOT_FOUND", "Avaliador nao encontrado.");
}

async function getPurchaseLeadOrThrow(storeId: string, id: string) {
  const lead = await prisma.purchaseLead.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!lead) throw new ApiError("NOT_FOUND", "Lead de compra nao encontrado.");
  return lead;
}

async function ensurePurchaseLead(storeId: string, purchaseLeadId?: string | null) {
  if (!purchaseLeadId) return null;
  return getPurchaseLeadOrThrow(storeId, purchaseLeadId);
}

async function getEvaluationOrThrow(storeId: string, id: string) {
  const evaluation = await prisma.vehicleEvaluation.findFirst({ where: { id, storeId } });
  if (!evaluation) throw new ApiError("NOT_FOUND", "Avaliacao nao encontrada.");
  return evaluation;
}

async function getPaymentOrThrow(storeId: string, id: string) {
  const payment = await prisma.purchasePayment.findFirst({ where: { id, storeId } });
  if (!payment) throw new ApiError("NOT_FOUND", "Pagamento de compra nao encontrado.");
  return payment;
}

export async function registerPurchaseRoutes(app: FastifyInstance) {
  app.get("/leads", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "read", scope: "STORE", sensitiveArea: "general" });
    const query = purchaseLeadQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.purchaseLead.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.purchaseLead.count({ where }),
    ]);
    return listResponse(items.map(sanitizeLead), query, total);
  });

  app.get("/leads/:id", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = purchaseLeadParamsSchema.parse(request.params);
    const lead = await getPurchaseLeadOrThrow(session.user.storeId, params.id);
    const [evaluations, payments] = await Promise.all([
      prisma.vehicleEvaluation.findMany({ where: { storeId: session.user.storeId, purchaseLeadId: lead.id }, orderBy: { createdAt: "desc" } }),
      prisma.purchasePayment.findMany({ where: { storeId: session.user.storeId, purchaseLeadId: lead.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return { data: sanitizeLead(lead), evaluations: evaluations.map(sanitizeEvaluation), payments: payments.map(sanitizePayment) };
  });

  app.post("/leads", async (request, reply) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = createPurchaseLeadSchema.parse(request.body);
    await ensureCustomer(session.user.storeId, input.customerId);
    await ensureVehicle(session.user.storeId, input.vehicleId);
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseLead.create({
        data: {
          storeId: session.user.storeId,
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          source: input.source,
          status: input.status,
          askingPrice: input.askingPrice,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "purchase_lead_created",
          entityType: "purchase_lead",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { customerId: created.customerId, vehicleId: created.vehicleId, status: created.status },
        },
      });
      return created;
    });
    await emitInternalEvent({
      name: "purchase.lead_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "purchase_lead",
      entityId: lead.id,
      payload: { status: lead.status, vehicleId: lead.vehicleId },
    });
    return reply.code(201).send({ data: sanitizeLead(lead) });
  });

  app.post("/leads/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = purchaseLeadParamsSchema.parse(request.params);
    const input = updatePurchaseLeadStatusSchema.parse(request.body);
    const current = await getPurchaseLeadOrThrow(session.user.storeId, params.id);
    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseLead.update({
        where: { id: current.id },
        data: { status: input.status, deletedAt: input.status === "CANCELLED" ? new Date() : null },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "purchase_lead_status_changed",
          entityType: "purchase_lead",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: updated.status, reason: input.reason },
        },
      });
      return updated;
    });
    await emitInternalEvent({
      name: "purchase.lead_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "purchase_lead",
      entityId: lead.id,
      payload: { fromStatus: current.status, toStatus: lead.status, reason: input.reason },
    });
    return { data: sanitizeLead(lead) };
  });

  app.get("/evaluations", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "read", scope: "STORE", sensitiveArea: "general" });
    const query = evaluationsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.decision ? { decision: query.decision } : {}),
      ...(query.purchase_lead_id ? { purchaseLeadId: query.purchase_lead_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.vehicleEvaluation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.vehicleEvaluation.count({ where }),
    ]);
    return listResponse(items.map(sanitizeEvaluation), query, total);
  });

  app.get("/evaluations/:id", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = evaluationParamsSchema.parse(request.params);
    const evaluation = await getEvaluationOrThrow(session.user.storeId, params.id);
    const [checklist, approvals] = await Promise.all([
      prisma.evaluationChecklist.findMany({ where: { storeId: session.user.storeId, evaluationId: evaluation.id }, orderBy: { createdAt: "asc" } }),
      prisma.purchaseApproval.findMany({ where: { storeId: session.user.storeId, evaluationId: evaluation.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      data: sanitizeEvaluation(evaluation),
      checklist,
      approvals,
    };
  });

  app.post("/evaluations", async (request, reply) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = createEvaluationSchema.parse(request.body);
    const purchaseLead = await ensurePurchaseLead(session.user.storeId, input.purchaseLeadId);
    const customerId = input.customerId ?? purchaseLead?.customerId ?? undefined;
    const vehicleId = input.vehicleId ?? purchaseLead?.vehicleId ?? undefined;
    const appraiserUserId = input.appraiserUserId ?? session.user.id;
    await ensureCustomer(session.user.storeId, customerId);
    await ensureVehicle(session.user.storeId, vehicleId);
    await ensureUser(session.user.storeId, appraiserUserId);
    const evaluation = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicleEvaluation.create({
        data: {
          storeId: session.user.storeId,
          purchaseLeadId: input.purchaseLeadId,
          customerId,
          vehicleId,
          appraiserUserId,
          requestedPrice: input.requestedPrice,
          fipeValue: input.fipeValue,
          suggestedPrice: input.suggestedPrice,
          expectedPrepCost: input.expectedPrepCost,
          expectedMargin: input.expectedMargin,
          decision: input.decision,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
          evaluatedAt: input.evaluatedAt,
        },
      });
      if (input.purchaseLeadId) {
        await tx.purchaseLead.updateMany({
          where: { id: input.purchaseLeadId, storeId: session.user.storeId, deletedAt: null },
          data: { status: "EVALUATING" },
        });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "evaluation_created",
          entityType: "vehicle_evaluation",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { purchaseLeadId: created.purchaseLeadId, decision: created.decision, vehicleId: created.vehicleId },
        },
      });
      return created;
    });
    await emitInternalEvent({
      name: "purchase.evaluation_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "vehicle_evaluation",
      entityId: evaluation.id,
      payload: { purchaseLeadId: evaluation.purchaseLeadId, decision: evaluation.decision },
    });
    return reply.code(201).send({ data: sanitizeEvaluation(evaluation) });
  });

  app.post("/evaluations/:id/checklist", async (request, reply) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = evaluationParamsSchema.parse(request.params);
    const input = checklistSchema.parse(request.body);
    const evaluation = await getEvaluationOrThrow(session.user.storeId, params.id);
    const item = await prisma.evaluationChecklist.create({
      data: {
        storeId: session.user.storeId,
        evaluationId: evaluation.id,
        itemKey: input.itemKey,
        label: input.label,
        value: input.value,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });
    return reply.code(201).send({ data: item });
  });

  app.post("/evaluations/:id/approval", async (request, reply) => {
    const session = await requirePermission(request, { module: "purchases", action: "approve", scope: "ALL", sensitiveArea: "sensitive_approval" });
    const params = evaluationParamsSchema.parse(request.params);
    const input = approvalSchema.parse(request.body);
    const current = await getEvaluationOrThrow(session.user.storeId, params.id);
    const decision = input.status === "APPROVED" ? "APPROVED_BUY" : input.status === "REJECTED" ? "REJECTED" : "NEGOTIATING";
    const leadStatus = input.status === "APPROVED" ? "APPROVED" : input.status === "REJECTED" ? "REJECTED" : "EVALUATING";
    const result = await prisma.$transaction(async (tx) => {
      const approval = await tx.purchaseApproval.create({
        data: {
          storeId: session.user.storeId,
          evaluationId: current.id,
          approvedByUserId: session.user.id,
          status: input.status,
          reason: input.reason,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        },
      });
      const evaluation = await tx.vehicleEvaluation.update({
        where: { id: current.id },
        data: { decision },
      });
      if (current.purchaseLeadId) {
        await tx.purchaseLead.update({
          where: { id: current.purchaseLeadId },
          data: { status: leadStatus },
        });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "evaluation_approved",
          entityType: "vehicle_evaluation",
          entityId: evaluation.id,
          result: "SUCCESS",
          metadata: { approvalId: approval.id, fromDecision: current.decision, toDecision: evaluation.decision, reason: input.reason },
        },
      });
      return { approval, evaluation };
    });
    await emitInternalEvent({
      name: "purchase.evaluation_decision_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "vehicle_evaluation",
      entityId: result.evaluation.id,
      payload: { fromDecision: current.decision, toDecision: result.evaluation.decision, approvalStatus: input.status },
    });
    return reply.code(201).send({ data: sanitizeEvaluation(result.evaluation), approval: result.approval });
  });

  app.post("/payments", async (request, reply) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = createPurchasePaymentSchema.parse(request.body);
    const purchaseLead = await ensurePurchaseLead(session.user.storeId, input.purchaseLeadId);
    const vehicleId = input.vehicleId ?? purchaseLead?.vehicleId ?? undefined;
    await ensureVehicle(session.user.storeId, vehicleId);
    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.purchasePayment.create({
        data: {
          storeId: session.user.storeId,
          purchaseLeadId: input.purchaseLeadId,
          vehicleId,
          amount: input.amount,
          status: input.status,
          paidAt: input.paidAt,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        },
      });
      if (input.purchaseLeadId && input.status === "PAID") {
        await tx.purchaseLead.update({ where: { id: input.purchaseLeadId }, data: { status: "PURCHASED" } });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "purchase_payment_created",
          entityType: "purchase_payment",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { purchaseLeadId: created.purchaseLeadId, amount: created.amount.toString(), status: created.status },
        },
      });
      return created;
    });
    await emitInternalEvent({
      name: "purchase.payment_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "purchase_payment",
      entityId: payment.id,
      payload: { purchaseLeadId: payment.purchaseLeadId, status: payment.status, amount: payment.amount.toString() },
    });
    return reply.code(201).send({ data: sanitizePayment(payment) });
  });

  app.post("/payments/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = paymentParamsSchema.parse(request.params);
    const input = updatePaymentStatusSchema.parse(request.body);
    const current = await getPaymentOrThrow(session.user.storeId, params.id);
    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchasePayment.update({
        where: { id: current.id },
        data: { status: input.status, paidAt: input.status === "PAID" ? input.paidAt ?? new Date() : current.paidAt },
      });
      if (updated.purchaseLeadId && updated.status === "PAID") {
        await tx.purchaseLead.update({ where: { id: updated.purchaseLeadId }, data: { status: "PURCHASED" } });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "purchases",
          action: "purchase_payment_status_changed",
          entityType: "purchase_payment",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: updated.status, reason: input.reason },
        },
      });
      return updated;
    });
    await emitInternalEvent({
      name: "purchase.payment_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "purchase_payment",
      entityId: payment.id,
      payload: { fromStatus: current.status, toStatus: payment.status, reason: input.reason },
    });
    return { data: sanitizePayment(payment) };
  });
}
