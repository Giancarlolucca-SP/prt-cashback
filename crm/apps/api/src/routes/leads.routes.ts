import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const leadStatusSchema = z.enum(["NEW", "CONTACTED", "SCHEDULED", "NEGOTIATION", "WON", "LOST", "COLD"]);
const terminalLeadStatuses = new Set(["WON", "LOST", "COLD"]);
const defaultLeadOutcomeReasons: Record<"WON" | "LOST" | "COLD", string[]> = {
  COLD: ["Sem resposta apos tentativas", "Retorno futuro", "Interesse esfriou"],
  LOST: ["Cliente comprou em outra loja", "Preco fora do esperado", "Veiculo indisponivel", "Credito nao aprovado"],
  WON: ["Venda concluida", "Proposta aceita", "Cliente reservou veiculo"],
};

const leadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: leadStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  assigned_user_id: z.string().uuid().optional(),
});

const followUpsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  assigned_user_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  include_completed: z.coerce.boolean().default(false),
  to: z.coerce.date().optional(),
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

const followUpParamsSchema = z.object({
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

const scheduleLeadFollowUpSchema = z.object({
  dueAt: z.coerce.date(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do follow-up") })
    .optional(),
  type: z.string().trim().min(2).max(80).default("Contato comercial"),
});

const completeLeadFollowUpSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do follow-up") })
    .optional(),
});

const convertLeadFollowUpToAppointmentSchema = z
  .object({
    endsAt: z.coerce.date().optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do agendamento") })
      .optional(),
    startsAt: z.coerce.date(),
    title: z.string().trim().min(2).max(180).optional(),
    type: z.string().trim().min(2).max(80).default("Visita loja"),
  })
  .refine((input) => !input.endsAt || input.endsAt > input.startsAt, {
    message: "Horario final deve ser posterior ao horario inicial.",
    path: ["endsAt"],
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

type FollowUpRecord = {
  id: string;
  leadId: string | null;
  customerId: string | null;
  assignedUserId: string | null;
  type: string;
  dueAt: Date;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AppointmentRecord = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  vehicleId: string | null;
  assignedUserId: string | null;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LeadStageHistoryRecord = {
  id: string;
  leadId: string;
  fromStage: string | null;
  toStage: string;
  actorUserId: string | null;
  reason: string | null;
  createdAt: Date;
};

type AuditLogRecord = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  module: string | null;
  action: string;
  entityType: string;
  entityId: string;
  result: string;
  metadata: unknown;
  createdAt: Date;
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

function sanitizeLeadStageHistory(item: LeadStageHistoryRecord) {
  return {
    id: item.id,
    leadId: item.leadId,
    fromStage: item.fromStage,
    toStage: item.toStage,
    actorUserId: item.actorUserId,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
  };
}

function sanitizeFollowUp(followUp: FollowUpRecord) {
  return {
    id: followUp.id,
    leadId: followUp.leadId,
    customerId: followUp.customerId,
    assignedUserId: followUp.assignedUserId,
    type: followUp.type,
    dueAt: followUp.dueAt.toISOString(),
    completedAt: followUp.completedAt?.toISOString() ?? null,
    notes: followUp.notes,
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString(),
  };
}

function sanitizeAuditEvent(event: AuditLogRecord) {
  return {
    id: event.id,
    actorId: event.actorId,
    actorRole: event.actorRole,
    module: event.module,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    result: event.result,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

function sanitizeAppointment(appointment: AppointmentRecord) {
  return {
    id: appointment.id,
    customerId: appointment.customerId,
    leadId: appointment.leadId,
    vehicleId: appointment.vehicleId,
    assignedUserId: appointment.assignedUserId,
    type: appointment.type,
    title: appointment.title,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt?.toISOString() ?? null,
    status: appointment.status,
    notes: appointment.notes,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

function metadataStage(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const stage = (metadata as { stage?: unknown }).stage;
  return typeof stage === "string" && terminalLeadStatuses.has(stage) ? (stage as "WON" | "LOST" | "COLD") : null;
}

function defaultOutcomeReasonItems() {
  return Object.entries(defaultLeadOutcomeReasons).map(([stage, reasons]) => ({
    reasons,
    stage,
  }));
}

function leadScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }

  return {};
}

function followUpScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }

  return {};
}

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
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

  app.get("/outcome-reasons", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });

    const categories = await prisma.configurableCategory.findMany({
      where: {
        storeId: session.user.storeId,
        deletedAt: null,
        domain: "lead_outcome_reason",
        status: "ACTIVE",
      },
      orderBy: [{ name: "asc" }],
    });

    if (categories.length === 0) {
      return { items: defaultOutcomeReasonItems(), source: "default" };
    }

    const byStage = new Map<"WON" | "LOST" | "COLD", string[]>();
    for (const category of categories) {
      const stage = metadataStage(category.metadata);
      if (!stage) {
        continue;
      }
      byStage.set(stage, [...(byStage.get(stage) ?? []), category.name]);
    }

    return {
      items: Object.entries(defaultLeadOutcomeReasons).map(([stage, reasons]) => ({
        reasons: byStage.get(stage as "WON" | "LOST" | "COLD") ?? reasons,
        stage,
      })),
      source: "configuration",
    };
  });

  app.get("/follow-ups", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = followUpsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const defaultRange = todayRange();
    const from = query.from ?? defaultRange.from;
    const to = query.to ?? defaultRange.to;

    const where = {
      storeId: session.user.storeId,
      ...followUpScopeWhere(session.user),
      ...(query.assigned_user_id ? { assignedUserId: query.assigned_user_id } : {}),
      ...(query.include_completed ? {} : { completedAt: null }),
      dueAt: {
        gte: from,
        lt: to,
      },
    };

    const [items, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        skip,
        take,
      }),
      prisma.followUp.count({ where }),
    ]);
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: items.map((followUp) => followUp.leadId).filter((id): id is string => Boolean(id)) },
        storeId: session.user.storeId,
        deletedAt: null,
      },
      select: {
        id: true,
        interest: true,
        source: true,
        status: true,
        title: true,
      },
    });
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));

    return listResponse(
      items.map((followUp) => ({
        ...sanitizeFollowUp(followUp),
        lead: followUp.leadId ? leadById.get(followUp.leadId) ?? null : null,
      })),
      query,
      total,
    );
  });

  app.post("/follow-ups/:id/complete", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = followUpParamsSchema.parse(request.params);
    const input = completeLeadFollowUpSchema.parse(request.body ?? {});

    const current = await prisma.followUp.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        ...followUpScopeWhere(session.user),
      },
    });

    if (!current) {
      return denyOwnershipAccess({
        action: "follow_up_completed",
        entityId: params.id,
        entityType: "follow_up",
        message: "Follow-up nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    if (current.completedAt) {
      return { data: sanitizeFollowUp(current), unchanged: true };
    }

    const completedAt = new Date();
    const followUp = await prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id: current.id },
        data: {
          completedAt,
          notes: input.notes ?? current.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "follow_up_completed",
          entityType: "follow_up",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            completedAt: completedAt.toISOString(),
            dueAt: current.dueAt.toISOString(),
            leadId: current.leadId,
            type: current.type,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "lead.follow_up_completed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "follow_up",
      entityId: followUp.id,
      payload: {
        completedAt: followUp.completedAt?.toISOString() ?? completedAt.toISOString(),
        dueAt: followUp.dueAt.toISOString(),
        leadId: followUp.leadId,
      },
    });

    return { data: sanitizeFollowUp(followUp), unchanged: false };
  });

  app.post("/follow-ups/:id/appointment", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = followUpParamsSchema.parse(request.params);
    const input = convertLeadFollowUpToAppointmentSchema.parse(request.body);

    const current = await prisma.followUp.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        ...followUpScopeWhere(session.user),
      },
    });

    if (!current || current.completedAt) {
      return denyOwnershipAccess({
        action: "follow_up_converted",
        entityId: params.id,
        entityType: "follow_up",
        message: "Follow-up nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    const lead = current.leadId
      ? await prisma.lead.findFirst({
          where: {
            id: current.leadId,
            storeId: session.user.storeId,
            deletedAt: null,
            ...leadScopeWhere(session.user),
          },
        })
      : null;

    if (!lead) {
      throw new ApiError("NOT_FOUND", "Lead vinculado ao follow-up nao encontrado.");
    }

    const assignedUserId = lead.assignedUserId ?? current.assignedUserId ?? session.user.id;
    await ensureUserInStore(session.user.storeId, assignedUserId);

    const completedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          storeId: session.user.storeId,
          customerId: lead.customerId,
          leadId: lead.id,
          assignedUserId,
          type: input.type,
          title: input.title ?? lead.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          notes: input.notes ?? current.notes,
        },
      });

      const followUp = await tx.followUp.update({
        where: { id: current.id },
        data: {
          completedAt,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          nextActionAt: input.startsAt,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "appointments",
          action: "create_from_follow_up",
          entityType: "appointment",
          entityId: appointment.id,
          result: "SUCCESS",
          metadata: {
            followUpId: followUp.id,
            leadId: lead.id,
            startsAt: appointment.startsAt.toISOString(),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "follow_up_converted",
          entityType: "follow_up",
          entityId: followUp.id,
          result: "SUCCESS",
          metadata: {
            appointmentId: appointment.id,
            completedAt: completedAt.toISOString(),
            leadId: lead.id,
          },
        },
      });

      return { appointment, followUp };
    });

    await emitInternalEvent({
      name: "appointment.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "appointment",
      entityId: result.appointment.id,
      payload: {
        followUpId: result.followUp.id,
        leadId: result.appointment.leadId,
        startsAt: result.appointment.startsAt.toISOString(),
      },
    });

    await emitInternalEvent({
      name: "lead.follow_up_converted",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "follow_up",
      entityId: result.followUp.id,
      payload: {
        appointmentId: result.appointment.id,
        completedAt: result.followUp.completedAt?.toISOString() ?? completedAt.toISOString(),
        leadId: lead.id,
      },
    });

    return reply.code(201).send({
      appointment: sanitizeAppointment(result.appointment),
      followUp: sanitizeFollowUp(result.followUp),
    });
  });

  app.get("/:id/history", async (request) => {
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
      return denyOwnershipAccess({
        action: "history_read",
        entityId: params.id,
        entityType: "lead",
        message: "Lead nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    const [stageHistory, followUps, appointments, events] = await Promise.all([
      prisma.leadStageHistory.findMany({
        where: {
          leadId: lead.id,
          storeId: session.user.storeId,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.followUp.findMany({
        where: {
          leadId: lead.id,
          storeId: session.user.storeId,
          ...followUpScopeWhere(session.user),
        },
        orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      prisma.appointment.findMany({
        where: {
          leadId: lead.id,
          storeId: session.user.storeId,
          deletedAt: null,
        },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        take: 50,
      }),
      prisma.auditLog.findMany({
        where: {
          storeId: session.user.storeId,
          entityType: "lead",
          entityId: lead.id,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      lead: sanitizeLead(lead),
      stageHistory: stageHistory.map(sanitizeLeadStageHistory),
      followUps: followUps.map(sanitizeFollowUp),
      appointments: appointments.map(sanitizeAppointment),
      events: events.map(sanitizeAuditEvent),
    };
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

  app.post("/:id/follow-ups", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = leadParamsSchema.parse(request.params);
    const input = scheduleLeadFollowUpSchema.parse(request.body);

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
        action: "follow_up_scheduled",
        entityId: params.id,
        entityType: "lead",
        message: "Lead nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.create({
        data: {
          storeId: session.user.storeId,
          leadId: current.id,
          customerId: current.customerId,
          assignedUserId: current.assignedUserId ?? session.user.id,
          type: input.type,
          dueAt: input.dueAt,
          notes: input.notes,
        },
      });

      const lead = await tx.lead.update({
        where: { id: current.id },
        data: { nextActionAt: input.dueAt },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "follow_up_scheduled",
          entityType: "lead",
          entityId: lead.id,
          result: "SUCCESS",
          metadata: {
            dueAt: input.dueAt.toISOString(),
            followUpId: followUp.id,
            type: input.type,
          },
        },
      });

      return { followUp, lead };
    });

    await emitInternalEvent({
      name: "lead.follow_up_scheduled",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead",
      entityId: result.lead.id,
      payload: {
        dueAt: result.followUp.dueAt.toISOString(),
        followUpId: result.followUp.id,
        type: result.followUp.type,
      },
    });

    return reply.code(201).send({ data: sanitizeLead(result.lead), followUp: sanitizeFollowUp(result.followUp) });
  });
}
