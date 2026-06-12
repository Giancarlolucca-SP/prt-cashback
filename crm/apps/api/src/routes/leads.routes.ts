import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const leadStatusSchema = z.enum(["NEW", "CONTACTED", "SCHEDULED", "NEGOTIATION", "WON", "LOST", "COLD"]);
const terminalLeadStatuses = new Set(["WON", "LOST", "COLD"]);

const leadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: leadStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  assigned_user_id: z.string().uuid().optional(),
});

const createLeadSchema = z.object({
  customerId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  source: z.string().trim().max(80).optional(),
  title: z.string().trim().min(2).max(180),
  status: leadStatusSchema.default("NEW"),
  interest: z.string().trim().max(180).optional(),
  temperature: z.number().int().min(0).max(100).optional(),
  nextActionAt: z.coerce.date().optional(),
});

const updateLeadSchema = createLeadSchema
  .omit({ status: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const leadParamsSchema = z.object({
  id: z.string().uuid(),
});

const moveLeadStageSchema = z
  .object({
    toStage: leadStatusSchema,
    reason: z.string().trim().max(300).optional(),
    position: z.number().int().min(0).default(0),
  })
  .superRefine((input, context) => {
    if (terminalLeadStatuses.has(input.toStage) && (!input.reason || input.reason.trim().length < 8)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um motivo com pelo menos 8 caracteres para concluir, perder ou esfriar o lead.",
        path: ["reason"],
      });
    }
  });

type LeadRecord = {
  id: string;
  customerId: string | null;
  assignedUserId: string | null;
  source: string | null;
  title: string;
  status: string;
  interest: string | null;
  temperature: number | null;
  nextActionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeLead(lead: LeadRecord) {
  return {
    id: lead.id,
    customerId: lead.customerId,
    assignedUserId: lead.assignedUserId,
    source: lead.source,
    title: lead.title,
    status: lead.status,
    interest: lead.interest,
    temperature: lead.temperature,
    nextActionAt: lead.nextActionAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function leadScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }

  return {};
}

async function ensureCustomerInStore(storeId: string, customerId?: string) {
  if (!customerId) {
    return;
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      storeId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!customer) {
    throw new ApiError("NOT_FOUND", "Cliente vinculado ao lead nao encontrado.");
  }
}

async function ensureUserInStore(storeId: string, userId?: string) {
  if (!userId) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      storeId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel do lead nao encontrado.");
  }
}

export async function registerLeadRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = leadsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...leadScopeWhere(session.user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.assigned_user_id ? { assignedUserId: query.assigned_user_id } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" as const } },
              { interest: { contains: query.search, mode: "insensitive" as const } },
              { source: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: [{ nextActionAt: "asc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.lead.count({ where }),
    ]);

    return listResponse(items.map(sanitizeLead), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = leadParamsSchema.parse(request.params);

    const lead = await prisma.lead.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...leadScopeWhere(session.user),
      },
    });

    if (!lead) {
      throw new ApiError("NOT_FOUND", "Lead nao encontrado.");
    }

    return { data: sanitizeLead(lead) };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createLeadSchema.parse(request.body);
    const assignedUserId = input.assignedUserId ?? session.user.id;

    await ensureCustomerInStore(session.user.storeId, input.customerId);
    await ensureUserInStore(session.user.storeId, assignedUserId);

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          storeId: session.user.storeId,
          customerId: input.customerId,
          assignedUserId,
          source: input.source,
          title: input.title,
          status: input.status,
          interest: input.interest,
          temperature: input.temperature,
          nextActionAt: input.nextActionAt,
        },
      });

      await tx.leadCard.create({
        data: {
          storeId: session.user.storeId,
          leadId: created.id,
          boardKey: "leads",
          stageKey: created.status,
          position: 0,
        },
      });

      await tx.leadStageHistory.create({
        data: {
          storeId: session.user.storeId,
          leadId: created.id,
          fromStage: null,
          toStage: created.status,
          actorUserId: session.user.id,
          reason: "Lead criado",
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "create",
          entityType: "lead",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            customerId: created.customerId,
            assignedUserId: created.assignedUserId,
            source: created.source,
            status: created.status,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "lead.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead",
      entityId: lead.id,
      payload: { customerId: lead.customerId, status: lead.status },
    });

    return reply.code(201).send({ data: sanitizeLead(lead) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = leadParamsSchema.parse(request.params);
    const input = updateLeadSchema.parse(request.body);

    const current = await prisma.lead.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...leadScopeWhere(session.user),
      },
    });

    if (!current) {
      return denyOwnershipAccess({
        action: "update",
        entityId: params.id,
        entityType: "lead",
        message: "Lead nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    await ensureCustomerInStore(session.user.storeId, input.customerId);
    await ensureUserInStore(session.user.storeId, input.assignedUserId);

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: current.id },
        data: input,
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "update",
          entityType: "lead",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            changedFields: Object.keys(input),
          },
        },
      });

      return updated;
    });

    return { data: sanitizeLead(lead) };
  });

  app.post("/:id/stage", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = leadParamsSchema.parse(request.params);
    const input = moveLeadStageSchema.parse(request.body);

    const current = await prisma.lead.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...leadScopeWhere(session.user),
      },
    });

    if (!current) {
      return denyOwnershipAccess({
        action: "stage_changed",
        entityId: params.id,
        entityType: "lead",
        message: "Lead nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    if (current.status === input.toStage) {
      return { data: sanitizeLead(current), unchanged: true };
    }

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: current.id },
        data: {
          status: input.toStage,
        },
      });

      const currentCard = await tx.leadCard.findFirst({
        where: {
          storeId: session.user.storeId,
          leadId: updated.id,
          boardKey: "leads",
        },
      });

      if (currentCard) {
        await tx.leadCard.update({
          where: { id: currentCard.id },
          data: {
            stageKey: input.toStage,
            position: input.position,
          },
        });
      } else {
        await tx.leadCard.create({
          data: {
            storeId: session.user.storeId,
            leadId: updated.id,
            boardKey: "leads",
            stageKey: input.toStage,
            position: input.position,
          },
        });
      }

      await tx.leadStageHistory.create({
        data: {
          storeId: session.user.storeId,
          leadId: updated.id,
          fromStage: current.status,
          toStage: input.toStage,
          actorUserId: session.user.id,
          reason: input.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "stage_changed",
          entityType: "lead",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            fromStage: current.status,
            toStage: input.toStage,
            reason: input.reason,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "lead.stage_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead",
      entityId: lead.id,
      payload: {
        fromStage: current.status,
        toStage: input.toStage,
        reason: input.reason,
      },
    });

    return { data: sanitizeLead(lead), unchanged: false };
  });
}
