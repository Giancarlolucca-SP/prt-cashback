import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const commissionStatusSchema = z.enum(["PENDING", "APPROVED", "BLOCKED", "PAID", "CANCELLED"]);
const commissionBasisSchema = z.enum(["GROSS_MARGIN_PERCENT", "SALE_PRICE_PERCENT", "FIXED_AMOUNT"]);

const commissionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: commissionStatusSchema.optional(),
  user_id: z.string().uuid().optional(),
  sale_id: z.string().uuid().optional(),
});

const calculateCommissionSchema = z.object({
  saleId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  ruleId: z.string().uuid().optional(),
  ruleName: z.string().trim().min(2).max(120).optional(),
}).strict().refine((input) => Boolean(input.ruleId || input.ruleName), {
  message: "Informe uma regra de comissao configurada.",
  path: ["ruleId"],
});

const createCommissionRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  appliesTo: z.enum(["sale"]).default("sale"),
  basis: commissionBasisSchema,
  value: z.number().positive(),
  snapshot: z.record(z.unknown()).optional(),
}).strict();

const commissionParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateCommissionStatusSchema = z.object({
  status: z.enum(["APPROVED", "BLOCKED", "PAID", "CANCELLED"]),
  reason: z.string().trim().max(300).optional(),
});

const adjustmentSchema = z.object({
  amount: z.number(),
  reason: z.string().trim().min(5).max(300),
});

type CommissionRecord = {
  id: string;
  userId: string | null;
  saleId: string | null;
  serviceOrderId: string | null;
  ruleId: string | null;
  amount: { toString(): string };
  status: string;
  snapshot: unknown;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CommissionRuleRecord = {
  id: string;
  name: string;
  appliesTo: string;
  basis: string;
  value: { toString(): string } | null;
  version: number;
  snapshot: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeCommission(commission: CommissionRecord) {
  return {
    id: commission.id,
    userId: commission.userId,
    saleId: commission.saleId,
    serviceOrderId: commission.serviceOrderId,
    ruleId: commission.ruleId,
    amount: commission.amount.toString(),
    status: commission.status,
    snapshot: commission.snapshot,
    approvedAt: commission.approvedAt?.toISOString() ?? null,
    paidAt: commission.paidAt?.toISOString() ?? null,
    createdAt: commission.createdAt.toISOString(),
    updatedAt: commission.updatedAt.toISOString(),
  };
}

function sanitizeCommissionRule(rule: CommissionRuleRecord) {
  return {
    id: rule.id,
    name: rule.name,
    appliesTo: rule.appliesTo,
    basis: rule.basis,
    value: rule.value?.toString() ?? null,
    version: rule.version,
    snapshot: rule.snapshot,
    status: rule.status,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

async function getCommissionOrThrow(storeId: string, id: string) {
  const commission = await prisma.commissionCalculation.findFirst({
    where: { id, storeId },
  });

  if (!commission) {
    throw new ApiError("NOT_FOUND", "Comissao nao encontrada.");
  }

  return commission;
}

async function ensureUserInStore(storeId: string, userId?: string | null) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Usuario da comissao nao encontrado.");
  }
}

function calculateAmount(input: {
  basis: z.infer<typeof commissionBasisSchema>;
  value: number;
  salePrice: number;
  grossMargin: number;
}) {
  if (input.basis === "FIXED_AMOUNT") {
    return input.value;
  }

  if (input.basis === "SALE_PRICE_PERCENT") {
    return input.salePrice * (input.value / 100);
  }

  return input.grossMargin * (input.value / 100);
}

export async function registerCommissionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "read_all",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const query = commissionsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.user_id ? { userId: query.user_id } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.commissionCalculation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.commissionCalculation.count({ where }),
    ]);

    return listResponse(items.map(sanitizeCommission), query, total);
  });

  app.get("/mine", async (request) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "read_own",
      scope: "OWN_PORTFOLIO",
      sensitiveArea: "general",
    });
    const query = commissionsQuerySchema.omit({ user_id: true }).parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      userId: session.user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.commissionCalculation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.commissionCalculation.count({ where }),
    ]);

    return listResponse(items.map(sanitizeCommission), query, total);
  });

  app.post("/rules", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const input = createCommissionRuleSchema.parse(request.body);

    const rule = await prisma.$transaction(async (tx) => {
      const latest = await tx.commissionRule.findFirst({
        where: {
          storeId: session.user.storeId,
          name: input.name,
          appliesTo: input.appliesTo,
          deletedAt: null,
        },
        orderBy: { version: "desc" },
      });

      const created = await tx.commissionRule.create({
        data: {
          storeId: session.user.storeId,
          name: input.name,
          appliesTo: input.appliesTo,
          basis: input.basis,
          value: input.value,
          version: (latest?.version ?? 0) + 1,
          snapshot: {
            ...(input.snapshot ?? {}),
            source: "configured_rule",
            basis: input.basis,
            value: input.value,
          } as Prisma.InputJsonObject,
        },
      });

      if (latest?.status === "ACTIVE") {
        await tx.commissionRule.update({
          where: { id: latest.id },
          data: { status: "INACTIVE" },
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commissions",
          action: "rule_configured",
          entityType: "commission_rule",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            name: created.name,
            appliesTo: created.appliesTo,
            basis: created.basis,
            version: created.version,
          },
        },
      });

      return created;
    });

    return reply.code(201).send({ data: sanitizeCommissionRule(rule) });
  });

  app.post("/calculate", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const input = calculateCommissionSchema.parse(request.body);

    const sale = await prisma.sale.findFirst({
      where: { id: input.saleId, storeId: session.user.storeId, deletedAt: null },
    });

    if (!sale) {
      throw new ApiError("NOT_FOUND", "Venda da comissao nao encontrada.");
    }

    const userId = input.userId ?? sale.sellerUserId;
    await ensureUserInStore(session.user.storeId, userId);

    if (!userId) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Venda sem vendedor responsavel para calcular comissao.");
    }

    const commission = await prisma.$transaction(async (tx) => {
      const rule = input.ruleId
        ? await tx.commissionRule.findFirst({
            where: {
              id: input.ruleId,
              storeId: session.user.storeId,
              appliesTo: "sale",
              status: "ACTIVE",
              deletedAt: null,
            },
          })
        : await tx.commissionRule.findFirst({
            where: {
              storeId: session.user.storeId,
              name: input.ruleName,
              appliesTo: "sale",
              status: "ACTIVE",
              deletedAt: null,
            },
            orderBy: { version: "desc" },
          });

      if (!rule || !rule.value) {
        throw new ApiError("BUSINESS_RULE_ERROR", "Regra de comissao ativa nao encontrada.");
      }

      const salePrice = Number(sale.salePrice?.toString() ?? 0);
      const grossMargin = Number(sale.grossMargin?.toString() ?? 0);
      const ruleValue = Number(rule.value.toString());
      const ruleBasis = commissionBasisSchema.parse(rule.basis);
      const amount = calculateAmount({
        basis: ruleBasis,
        value: ruleValue,
        salePrice,
        grossMargin,
      });

      const created = await tx.commissionCalculation.create({
        data: {
          storeId: session.user.storeId,
          userId,
          saleId: sale.id,
          ruleId: rule?.id,
          amount,
          status: "PENDING",
          snapshot: {
            basis: ruleBasis,
            value: ruleValue,
            salePrice,
            grossMargin,
            saleStatus: sale.status,
            ruleName: rule.name,
            ruleVersion: rule.version,
          } as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commissions",
          action: "calculate",
          entityType: "commission_calculation",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            userId,
            amount: created.amount.toString(),
            basis: ruleBasis,
            ruleId: rule.id,
            ruleVersion: rule.version,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "commission.calculated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "commission_calculation",
      entityId: commission.id,
      payload: { saleId: sale.id, userId, amount: commission.amount.toString() },
    });

    return reply.code(201).send({ data: sanitizeCommission(commission) });
  });

  app.post("/:id/status", async (request) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = commissionParamsSchema.parse(request.params);
    const input = updateCommissionStatusSchema.parse(request.body);
    const current = await getCommissionOrThrow(session.user.storeId, params.id);

    const commission = await prisma.$transaction(async (tx) => {
      const updated = await tx.commissionCalculation.update({
        where: { id: current.id },
        data: {
          status: input.status,
          approvedAt: input.status === "APPROVED" ? new Date() : current.approvedAt,
          paidAt: input.status === "PAID" ? new Date() : current.paidAt,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commissions",
          action: "status_changed",
          entityType: "commission_calculation",
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
      name: "commission.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "commission_calculation",
      entityId: commission.id,
      payload: { fromStatus: current.status, toStatus: commission.status, reason: input.reason },
    });

    return { data: sanitizeCommission(commission) };
  });

  app.post("/:id/adjustments", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "commissions",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });
    const params = commissionParamsSchema.parse(request.params);
    const input = adjustmentSchema.parse(request.body);
    const current = await getCommissionOrThrow(session.user.storeId, params.id);

    const result = await prisma.$transaction(async (tx) => {
      const adjustment = await tx.commissionAdjustment.create({
        data: {
          storeId: session.user.storeId,
          commissionCalculationId: current.id,
          amount: input.amount,
          reason: input.reason,
          createdByUserId: session.user.id,
        },
      });

      const updated = await tx.commissionCalculation.update({
        where: { id: current.id },
        data: {
          amount: Number(current.amount.toString()) + input.amount,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commissions",
          action: "adjustment_created",
          entityType: "commission_adjustment",
          entityId: adjustment.id,
          result: "SUCCESS",
          metadata: {
            commissionCalculationId: current.id,
            amount: adjustment.amount.toString(),
            reason: input.reason,
          },
        },
      });

      return { adjustment, commission: updated };
    });

    return reply.code(201).send({
      data: {
        id: result.adjustment.id,
        commissionCalculationId: result.adjustment.commissionCalculationId,
        amount: result.adjustment.amount.toString(),
        reason: result.adjustment.reason,
        commission: sanitizeCommission(result.commission),
      },
    });
  });
}
