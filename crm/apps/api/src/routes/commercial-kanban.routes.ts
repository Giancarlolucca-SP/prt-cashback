import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
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
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }
  return {};
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
    nextActionAt: lead.nextActionAt?.toISOString() ?? null,
    stageEnteredAt: card.stageEnteredAt.toISOString(),
    timeInStageHours: timeInStageHours(card.stageEnteredAt, context.now),
    timeInStageMs: timeInStageMs(card.stageEnteredAt, context.now),
    temperatureStatus,
    archivedAt: card.archivedAt?.toISOString() ?? null,
    lostReason: card.lostReason,
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

    const [vehicles, customers, futureAppointments] = await Promise.all([
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
    ]);

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
    const leadsWithFutureSchedule = new Set(futureAppointments.map((appointment) => appointment.leadId).filter((id): id is string => Boolean(id)));

    const items = cards.map((card) =>
      sanitizeCommercialCard(card, {
        now,
        vehicle: card.lead.vehicleId ? vehicleById.get(card.lead.vehicleId) ?? null : null,
        customerName: card.lead.customerId ? customerNameById.get(card.lead.customerId) ?? null : null,
        hasFutureSchedule: leadsWithFutureSchedule.has(card.leadId),
      }),
    );

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
}
