import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { isFollowUpOverdue } from "../services/commercial-interaction.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import {
  COMMERCIAL_APPOINTMENT_NOTIFICATION_ENTITY_TYPES,
  LEAD_CARD_NOTIFICATION_ENTITY_TYPES,
  activeNotificationSummaryByEntity,
  mergeActiveNotificationSummaries,
  notificationEntityKey,
  type ActiveNotificationSummary,
} from "../services/internal-notifications.js";
import {
  COMMERCIAL_BOARD_KEY,
  COMMERCIAL_STAGES,
  TEMPERATURE_THRESHOLDS_HOURS,
  canRoleMoveToStage,
  commercialStageLabel,
  computeTemperatureStatus,
  isActiveStage,
  isCommercialStage,
  timeInStageHours,
  timeInStageMs,
  type CommercialStageKey,
} from "../services/commercial-kanban.js";

const stageKeys = COMMERCIAL_STAGES.map((stage) => stage.key) as [CommercialStageKey, ...CommercialStageKey[]];
const commercialStageSchema = z.enum(stageKeys);

const cardOrderSchema = z.enum(["stage_time", "next_action", "created_recent", "interaction_oldest", "origin"]).default("stage_time");

const commercialCardParamsSchema = z.object({
  id: z.string().uuid(),
});

const moveCommercialCardSchema = z
  .object({
    toStage: commercialStageSchema,
    reason: z.string().trim().max(300).optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do card comercial") })
      .optional(),
    position: z.number().int().min(0).default(0),
  })
  .superRefine((input, context) => {
    // Moving a card to LOST archives it; a reason is mandatory for the lost history.
    if (input.toStage === "LOST" && (!input.reason || input.reason.trim().length < 8)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe um motivo com pelo menos 8 caracteres para perder/encerrar o card.",
        path: ["reason"],
      });
    }
  });

// Manual card creation by phone call / direct contact (SDR or Vendedor), without
// requiring a full customer record yet.
const createManualCardSchema = z.object({
  name: z.string().trim().min(2).max(180),
  phone: z.string().trim().max(40).optional(),
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  source: z.string().trim().min(2).max(80).default("ligacao_loja"),
  channel: z.string().trim().max(80).optional(),
  assignedUserId: z.string().uuid().optional(),
  note: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacao do card comercial") })
    .optional(),
});

// Changing the responsible (carteira) requires a reason and is manager-only.
const reassignCommercialCardSchema = z.object({
  assignedUserId: z.string().uuid(),
  reason: z.string().trim().min(8).max(300),
});

const responsibleChangeRoles = new Set(["OWNER_MANAGER", "ADMIN"]);

const commercialCardsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  stage: commercialStageSchema.optional(),
  assigned_user_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  origin: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(80).optional(),
  created_from: z.coerce.date().optional(),
  created_to: z.coerce.date().optional(),
  cooling: z.coerce.boolean().optional(),
  include_archived: z.coerce.boolean().default(false),
  order: cardOrderSchema,
});

type CommercialCardWithLead = Prisma.LeadCardGetPayload<{ include: { lead: true } }>;

function leadScopeWhere(user: { id: string; role: string }): Prisma.LeadWhereInput {
  return isCommercialFullView(user.role) ? {} : { assignedUserId: user.id };
}

function cardOrderBy(order: z.infer<typeof cardOrderSchema>): Prisma.LeadCardOrderByWithRelationInput[] {
  switch (order) {
    case "next_action":
      return [{ lead: { nextActionAt: "asc" } }, { stageEnteredAt: "asc" }];
    case "created_recent":
      return [{ lead: { createdAt: "desc" } }];
    case "interaction_oldest":
      return [{ lead: { lastInteractionAt: "asc" } }, { stageEnteredAt: "asc" }];
    case "origin":
      return [{ lead: { source: "asc" } }, { stageEnteredAt: "asc" }];
    case "stage_time":
    default:
      // Oldest stage entry first = most time parked in the stage.
      return [{ stageEnteredAt: "asc" }];
  }
}

function sanitizeCommercialCard(
  card: CommercialCardWithLead,
  context: {
    now: Date;
    vehicle: { id: string; brand: string; model: string; version: string | null; yearModel: number | null; plate: string | null } | null;
    customerName: string | null;
    hasFutureSchedule: boolean;
    nextAppointment: { id: string; type: string; status: string; startsAt: string; activeNotifications: ActiveNotificationSummary } | null;
    activeNotifications: ActiveNotificationSummary;
  },
) {
  const lead = card.lead;
  const stage = card.stageKey as CommercialStageKey;
  const lastInteractionAt = lead.lastInteractionAt ?? lead.createdAt;
  const temperatureStatus = computeTemperatureStatus({
    stage,
    lastInteractionAt,
    now: context.now,
    hasFutureSchedule: context.hasFutureSchedule,
  });

  return {
    id: card.id,
    leadId: card.leadId,
    boardKey: card.boardKey,
    stage,
    stageLabel: commercialStageLabel(stage),
    position: card.position,
    name: context.customerName ?? lead.title,
    customerId: lead.customerId,
    vehicleId: lead.vehicleId,
    vehicle: context.vehicle,
    assignedUserId: lead.assignedUserId,
    source: lead.source,
    channel: lead.channel,
    campaign: lead.campaign,
    interest: lead.interest,
    leadStatus: lead.status,
    createdAt: lead.createdAt.toISOString(),
    contactedAt: lead.contactedAt?.toISOString() ?? null,
    lastInteractionAt: lead.lastInteractionAt?.toISOString() ?? null,
    lastInteractionType: lead.lastInteractionType,
    lastInteractionResult: lead.lastInteractionResult,
    nextActionAt: lead.nextActionAt?.toISOString() ?? null,
    nextActionType: lead.nextActionType,
    followUpOverdue: isFollowUpOverdue({ nextActionAt: lead.nextActionAt, resolved: false, now: context.now }),
    stageEnteredAt: card.stageEnteredAt.toISOString(),
    timeInStageHours: timeInStageHours(card.stageEnteredAt, context.now),
    timeInStageMs: timeInStageMs(card.stageEnteredAt, context.now),
    temperatureStatus,
    archivedAt: card.archivedAt?.toISOString() ?? null,
    lostReason: card.lostReason,
    nextAppointment: context.nextAppointment,
    activeNotifications: context.activeNotifications,
  };
}

function sanitizeMovedCommercialCard(
  card: { id: string; leadId: string; stageKey: string; position: number; stageEnteredAt: Date; archivedAt: Date | null; lostReason: string | null },
  lead: { assignedUserId: string | null; customerId: string | null; vehicleId: string | null; lastInteractionAt: Date | null; contactedAt: Date | null },
) {
  const stage = card.stageKey as CommercialStageKey;
  return {
    id: card.id,
    leadId: card.leadId,
    stage,
    stageLabel: commercialStageLabel(stage),
    position: card.position,
    stageEnteredAt: card.stageEnteredAt.toISOString(),
    archived: !isActiveStage(stage),
    archivedAt: card.archivedAt?.toISOString() ?? null,
    lostReason: card.lostReason,
    assignedUserId: lead.assignedUserId,
    customerId: lead.customerId,
    vehicleId: lead.vehicleId,
    lastInteractionAt: lead.lastInteractionAt?.toISOString() ?? null,
    contactedAt: lead.contactedAt?.toISOString() ?? null,
  };
}

export async function registerCommercialKanbanRoutes(app: FastifyInstance) {
  app.get("/stages", async (request) => {
    await requirePermission(request, { module: "leads", action: "read", scope: "STORE", sensitiveArea: "general" });
    return { items: COMMERCIAL_STAGES.map((stage) => ({ ...stage })) };
  });

  app.get("/cards", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = commercialCardsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const now = new Date();

    // LOST cards leave the default active view; they remain consultable when the user
    // explicitly filters by the LOST stage or asks to include archived cards.
    const includeArchived = query.include_archived || query.stage === "LOST";

    const leadWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...leadScopeWhere(session.user),
      ...(query.assigned_user_id ? { assignedUserId: query.assigned_user_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.origin ? { source: { contains: query.origin, mode: "insensitive" } } : {}),
      ...(query.channel ? { channel: { contains: query.channel, mode: "insensitive" } } : {}),
      ...(query.created_from || query.created_to
        ? { createdAt: { ...(query.created_from ? { gte: query.created_from } : {}), ...(query.created_to ? { lte: query.created_to } : {}) } }
        : {}),
      // "Lead atrasado/esfriando": at least the 24h ATTENTION threshold (raw rule; the
      // per-card temperatureStatus still reflects the future-appointment softening).
      ...(query.cooling
        ? { lastInteractionAt: { lte: new Date(now.getTime() - TEMPERATURE_THRESHOLDS_HOURS.ATTENTION * 60 * 60 * 1000) } }
        : {}),
    };

    const where: Prisma.LeadCardWhereInput = {
      storeId: session.user.storeId,
      boardKey: COMMERCIAL_BOARD_KEY,
      ...(query.stage ? { stageKey: query.stage } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
      lead: leadWhere,
    };

    const [cards, total] = await Promise.all([
      prisma.leadCard.findMany({ where, include: { lead: true }, orderBy: cardOrderBy(query.order), skip, take }),
      prisma.leadCard.count({ where }),
    ]);

    const vehicleIds = [...new Set(cards.map((card) => card.lead.vehicleId).filter((id): id is string => Boolean(id)))];
    const customerIds = [...new Set(cards.map((card) => card.lead.customerId).filter((id): id is string => Boolean(id)))];
    const leadIds = cards.map((card) => card.leadId);
    const cardIds = cards.map((card) => card.id);

    const [vehicles, customers, futureAppointments, upcomingCommercialAppointments, activeNotificationSummaries] = await Promise.all([
      vehicleIds.length
        ? prisma.vehicle.findMany({
            where: { id: { in: vehicleIds }, storeId: session.user.storeId, deletedAt: null },
            select: { id: true, brand: true, model: true, version: true, yearModel: true, plate: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? prisma.customer.findMany({
            where: { id: { in: customerIds }, storeId: session.user.storeId, deletedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      leadIds.length
        ? prisma.appointment.findMany({
            where: {
              leadId: { in: leadIds },
              storeId: session.user.storeId,
              deletedAt: null,
              startsAt: { gt: now },
              status: { notIn: ["CANCELLED", "NO_SHOW"] },
            },
            select: { leadId: true },
          })
        : Promise.resolve([]),
      cardIds.length
        ? prisma.commercialAppointment.findMany({
            where: {
              cardId: { in: cardIds },
              storeId: session.user.storeId,
              startsAt: { gte: now },
              status: { in: ["SCHEDULED", "CONFIRMED"] },
            },
            orderBy: { startsAt: "asc" },
            select: { id: true, cardId: true, type: true, status: true, startsAt: true },
          })
        : Promise.resolve([]),
      activeNotificationSummaryByEntity({
        storeId: session.user.storeId,
        user: session.user,
        entities: cardIds.flatMap((cardId) =>
          LEAD_CARD_NOTIFICATION_ENTITY_TYPES.map((entityType) => ({ entityType, entityId: cardId })),
        ),
      }),
    ]);

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
    const leadsWithFutureSchedule = new Set(futureAppointments.map((appointment) => appointment.leadId).filter((id): id is string => Boolean(id)));

    // Earliest upcoming commercial appointment per card (next appointment shown on the card).
    const appointmentNotificationSummaries = await activeNotificationSummaryByEntity({
      storeId: session.user.storeId,
      user: session.user,
      entities: upcomingCommercialAppointments.flatMap((appointment) =>
        COMMERCIAL_APPOINTMENT_NOTIFICATION_ENTITY_TYPES.map((entityType) => ({ entityType, entityId: appointment.id })),
      ),
    });

    const nextAppointmentByCard = new Map<string, { id: string; type: string; status: string; startsAt: string; activeNotifications: ActiveNotificationSummary }>();
    for (const appointment of upcomingCommercialAppointments) {
      if (!nextAppointmentByCard.has(appointment.cardId)) {
        nextAppointmentByCard.set(appointment.cardId, {
          id: appointment.id,
          type: appointment.type,
          status: appointment.status,
          startsAt: appointment.startsAt.toISOString(),
          activeNotifications: mergeActiveNotificationSummaries(
            COMMERCIAL_APPOINTMENT_NOTIFICATION_ENTITY_TYPES.map((entityType) =>
              appointmentNotificationSummaries.get(notificationEntityKey(entityType, appointment.id)),
            ),
          ),
        });
      }
    }

    const items = cards.map((card) => {
      const nextAppointment = nextAppointmentByCard.get(card.id) ?? null;
      return sanitizeCommercialCard(card, {
        now,
        vehicle: card.lead.vehicleId ? vehicleById.get(card.lead.vehicleId) ?? null : null,
        customerName: card.lead.customerId ? customerNameById.get(card.lead.customerId) ?? null : null,
        // A future commercial appointment also softens the cooling alert.
        hasFutureSchedule: leadsWithFutureSchedule.has(card.leadId) || nextAppointment !== null,
        nextAppointment,
        activeNotifications: mergeActiveNotificationSummaries(
          LEAD_CARD_NOTIFICATION_ENTITY_TYPES.map((entityType) => activeNotificationSummaries.get(notificationEntityKey(entityType, card.id))),
        ),
      });
    });

    return listResponse(items, query, total);
  });

  app.post("/cards/:id/move", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = commercialCardParamsSchema.parse(request.params);
    const input = moveCommercialCardSchema.parse(request.body);

    const card = await prisma.leadCard.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        boardKey: COMMERCIAL_BOARD_KEY,
        lead: { deletedAt: null, ...leadScopeWhere(session.user) },
      },
      include: { lead: true },
    });

    if (!card) {
      return denyOwnershipAccess({
        action: "commercial_card_moved",
        entityId: params.id,
        entityType: "lead_card",
        message: "Card comercial nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    // Role-based movement rule (SDR limited to early stages + forwarding to negotiation;
    // seller/managers drive the full flow).
    if (!canRoleMoveToStage(session.user.role, input.toStage)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao pode mover o card para esta etapa.", {
        role: session.user.role,
        toStage: input.toStage,
      });
    }

    const fromStage = card.stageKey;
    if (fromStage === input.toStage) {
      return { data: sanitizeMovedCommercialCard(card, card.lead), unchanged: true };
    }

    const now = new Date();
    const movingToLost = input.toStage === "LOST";
    const firstContact = input.toStage === "IN_CONTACT" && !card.lead.contactedAt;

    const result = await prisma.$transaction(async (tx) => {
      const movedCard = await tx.leadCard.update({
        where: { id: card.id },
        data: {
          stageKey: input.toStage,
          position: input.position,
          stageEnteredAt: now,
          archivedAt: movingToLost ? now : null,
          lostReason: movingToLost ? input.reason : null,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: card.leadId },
        data: {
          lastInteractionAt: now,
          updatedByUserId: session.user.id,
          ...(firstContact ? { contactedAt: now } : {}),
        },
      });

      await tx.leadStageHistory.create({
        data: {
          storeId: session.user.storeId,
          leadId: card.leadId,
          fromStage,
          toStage: input.toStage,
          actorUserId: session.user.id,
          reason: input.reason,
        },
      });

      // Lead-scoped audit so the move shows up in the lead/customer operational history.
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_stage_changed",
          entityType: "lead",
          entityId: card.leadId,
          result: "SUCCESS",
          metadata: {
            boardKey: COMMERCIAL_BOARD_KEY,
            fromStage,
            toStage: input.toStage,
            reason: input.reason ?? null,
            notes: input.notes ?? null,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_card_moved",
          entityType: "lead_card",
          entityId: movedCard.id,
          result: "SUCCESS",
          metadata: {
            leadId: card.leadId,
            customerId: updatedLead.customerId,
            vehicleId: updatedLead.vehicleId,
            boardKey: COMMERCIAL_BOARD_KEY,
            fromStage,
            toStage: input.toStage,
            fromPosition: card.position,
            toPosition: movedCard.position,
            archived: !isActiveStage(input.toStage),
            reason: input.reason ?? null,
            notes: input.notes ?? null,
          },
        },
      });

      return { movedCard, updatedLead };
    });

    await emitInternalEvent({
      name: "commercial_card.moved",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead_card",
      entityId: result.movedCard.id,
      payload: {
        leadId: card.leadId,
        fromStage,
        toStage: input.toStage,
        archived: !isActiveStage(input.toStage),
      },
    });

    return { data: sanitizeMovedCommercialCard(result.movedCard, result.updatedLead), unchanged: false };
  });

  app.post("/cards", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createManualCardSchema.parse(request.body);
    const assignedUserId = input.assignedUserId ?? session.user.id;

    const assignedUser = await prisma.user.findFirst({
      where: { id: assignedUserId, storeId: session.user.storeId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!assignedUser) {
      throw new ApiError("NOT_FOUND", "Responsavel inicial do card nao encontrado.");
    }

    if (input.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: input.customerId, storeId: session.user.storeId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        throw new ApiError("NOT_FOUND", "Cliente vinculado ao card nao encontrado.");
      }
    }

    if (input.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: input.vehicleId, storeId: session.user.storeId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) {
        throw new ApiError("NOT_FOUND", "Veiculo de interesse nao encontrado.");
      }
    }

    const now = new Date();
    const cardMetadata = {
      manualEntry: true,
      origin: "call",
      callerName: input.name,
      callerPhone: input.phone ?? null,
      note: input.note ?? null,
    } satisfies Prisma.InputJsonObject;

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          storeId: session.user.storeId,
          customerId: input.customerId,
          assignedUserId,
          vehicleId: input.vehicleId,
          source: input.source,
          channel: input.channel,
          title: input.name,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
          lastInteractionAt: now,
        },
      });

      const card = await tx.leadCard.create({
        data: {
          storeId: session.user.storeId,
          leadId: lead.id,
          boardKey: COMMERCIAL_BOARD_KEY,
          stageKey: "NEW_LEAD",
          position: 0,
          stageEnteredAt: now,
          metadata: cardMetadata,
        },
      });

      await tx.leadStageHistory.create({
        data: {
          storeId: session.user.storeId,
          leadId: lead.id,
          fromStage: null,
          toStage: "NEW_LEAD",
          actorUserId: session.user.id,
          reason: "Card criado manualmente (ligacao)",
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_card_created",
          entityType: "lead_card",
          entityId: card.id,
          result: "SUCCESS",
          metadata: {
            leadId: lead.id,
            boardKey: COMMERCIAL_BOARD_KEY,
            stageKey: "NEW_LEAD",
            source: input.source,
            channel: input.channel ?? null,
            customerId: input.customerId ?? null,
            vehicleId: input.vehicleId ?? null,
            assignedUserId,
            manualEntry: true,
          },
        },
      });

      // Lead-scoped audit so the manual creation shows up in the lead/customer history.
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "create",
          entityType: "lead",
          entityId: lead.id,
          result: "SUCCESS",
          metadata: {
            board: COMMERCIAL_BOARD_KEY,
            source: input.source,
            assignedUserId,
            customerId: input.customerId ?? null,
            vehicleId: input.vehicleId ?? null,
            manualEntry: true,
          },
        },
      });

      return { lead, card };
    });

    await emitInternalEvent({
      name: "commercial_card.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead_card",
      entityId: result.card.id,
      payload: { leadId: result.lead.id, assignedUserId, source: input.source },
    });

    return reply.code(201).send({
      data: {
        id: result.card.id,
        leadId: result.lead.id,
        stage: "NEW_LEAD",
        stageLabel: commercialStageLabel("NEW_LEAD"),
        name: result.lead.title,
        phone: input.phone ?? null,
        source: result.lead.source,
        channel: result.lead.channel,
        customerId: result.lead.customerId,
        vehicleId: result.lead.vehicleId,
        assignedUserId: result.lead.assignedUserId,
        note: input.note ?? null,
        createdAt: result.lead.createdAt.toISOString(),
        stageEnteredAt: result.card.stageEnteredAt.toISOString(),
      },
    });
  });

  app.post("/cards/:id/assign", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    if (!responsibleChangeRoles.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestor ou Administrador pode alterar o responsavel do card.");
    }
    const params = commercialCardParamsSchema.parse(request.params);
    const input = reassignCommercialCardSchema.parse(request.body);

    const card = await prisma.leadCard.findFirst({
      where: { id: params.id, storeId: session.user.storeId, boardKey: COMMERCIAL_BOARD_KEY, lead: { deletedAt: null } },
      include: { lead: true },
    });
    if (!card) {
      throw new ApiError("NOT_FOUND", "Card comercial nao encontrado.");
    }

    const newResponsible = await prisma.user.findFirst({
      where: { id: input.assignedUserId, storeId: session.user.storeId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!newResponsible) {
      throw new ApiError("NOT_FOUND", "Novo responsavel nao encontrado.");
    }

    const previousAssignedUserId = card.lead.assignedUserId;
    if (previousAssignedUserId === input.assignedUserId) {
      return { data: { id: card.id, leadId: card.leadId, assignedUserId: input.assignedUserId }, unchanged: true };
    }

    const updatedLead = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: card.leadId },
        data: { assignedUserId: input.assignedUserId, updatedByUserId: session.user.id },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_responsible_changed",
          entityType: "lead",
          entityId: card.leadId,
          result: "SUCCESS",
          metadata: {
            boardKey: COMMERCIAL_BOARD_KEY,
            cardId: card.id,
            fromUserId: previousAssignedUserId,
            toUserId: input.assignedUserId,
            reason: input.reason,
          },
        },
      });

      return lead;
    });

    await emitInternalEvent({
      name: "commercial_card.reassigned",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead_card",
      entityId: card.id,
      payload: { leadId: card.leadId, fromUserId: previousAssignedUserId, toUserId: input.assignedUserId },
    });

    return {
      data: {
        id: card.id,
        leadId: card.leadId,
        assignedUserId: updatedLead.assignedUserId,
        previousAssignedUserId,
        reason: input.reason,
      },
      unchanged: false,
    };
  });
}
