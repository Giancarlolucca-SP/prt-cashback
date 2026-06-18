import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import { COMMERCIAL_BOARD_KEY } from "../services/commercial-kanban.js";
import {
  COMMERCIAL_INTERACTION_CHANNELS,
  COMMERCIAL_INTERACTION_RESULTS,
  COMMERCIAL_INTERACTION_TYPES,
  COMMERCIAL_NEXT_ACTION_TYPES,
  isFollowUpOverdue,
  type CommercialInteractionChannel,
  type CommercialInteractionResult,
  type CommercialInteractionType,
  type CommercialNextActionType,
} from "../services/commercial-interaction.js";

const interactionTypeKeys = COMMERCIAL_INTERACTION_TYPES.map((entry) => entry.key) as [CommercialInteractionType, ...CommercialInteractionType[]];
const resultKeys = COMMERCIAL_INTERACTION_RESULTS.map((entry) => entry.key) as [CommercialInteractionResult, ...CommercialInteractionResult[]];
const channelKeys = COMMERCIAL_INTERACTION_CHANNELS.map((entry) => entry.key) as [CommercialInteractionChannel, ...CommercialInteractionChannel[]];
const nextActionTypeKeys = COMMERCIAL_NEXT_ACTION_TYPES.map((entry) => entry.key) as [CommercialNextActionType, ...CommercialNextActionType[]];

const interactionTypeSchema = z.enum(interactionTypeKeys);
const interactionResultSchema = z.enum(resultKeys);
const interactionChannelSchema = z.enum(channelKeys);
const nextActionTypeSchema = z.enum(nextActionTypeKeys);

const vehicleInterestSchema = z
  .object({
    brand: z.string().trim().max(80).optional(),
    model: z.string().trim().max(80).optional(),
    version: z.string().trim().max(80).optional(),
    color: z.string().trim().max(40).optional(),
    expectedTerm: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .partial();

// next_action_status values that mean the follow-up no longer counts as overdue.
const RESOLVED_NEXT_ACTION_STATUSES = new Set(["DONE", "CANCELLED", "RESCHEDULED"]);

const createInteractionSchema = z
  .object({
    cardId: z.string().uuid(),
    interactionType: interactionTypeSchema,
    channel: interactionChannelSchema.optional(),
    result: interactionResultSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(2000)
      .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes da interacao") })
      .optional(),
    occurredAt: z.coerce.date().optional(),
    vehicleInterest: vehicleInterestSchema.optional(),
    nextActionType: nextActionTypeSchema.optional(),
    nextActionAt: z.coerce.date().optional(),
    nextActionOwnerId: z.string().uuid().optional(),
  })
  .superRefine((input, ctx) => {
    // A follow-up needs both a type and a date/time to feed the agenda/task list.
    if (input.nextActionAt && !input.nextActionType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe o tipo da proxima acao.", path: ["nextActionType"] });
    }
    if (input.nextActionType && !input.nextActionAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a data/hora da proxima acao.", path: ["nextActionAt"] });
    }
  });

const interactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  card_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  responsible_user_id: z.string().uuid().optional(),
  interaction_type: interactionTypeSchema.optional(),
  result: interactionResultSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  overdue_only: z.coerce.boolean().optional(),
});

type CommercialInteractionRecord = Prisma.CommercialInteractionGetPayload<Record<string, never>>;

function sanitizeInteraction(interaction: CommercialInteractionRecord, now: Date) {
  const resolved = interaction.nextActionStatus ? RESOLVED_NEXT_ACTION_STATUSES.has(interaction.nextActionStatus) : false;
  return {
    id: interaction.id,
    cardId: interaction.cardId,
    leadId: interaction.leadId,
    customerId: interaction.customerId,
    vehicleId: interaction.vehicleId,
    vehicleInterest: interaction.vehicleInterest,
    responsibleUserId: interaction.responsibleUserId,
    interactionType: interaction.interactionType,
    channel: interaction.channel,
    result: interaction.result,
    notes: interaction.notes,
    occurredAt: interaction.occurredAt.toISOString(),
    nextActionType: interaction.nextActionType,
    nextActionAt: interaction.nextActionAt?.toISOString() ?? null,
    nextActionOwnerId: interaction.nextActionOwnerId,
    nextActionStatus: interaction.nextActionStatus,
    followUpOverdue: isFollowUpOverdue({ nextActionAt: interaction.nextActionAt, resolved, now }),
    createdAt: interaction.createdAt.toISOString(),
  };
}

async function ensureUserInStore(storeId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel da proxima acao nao encontrado.");
  }
}

export async function registerCommercialInteractionRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = interactionsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const now = new Date();

    // Scope guard: SDR/Vendedor only see their own interactions; the responsible_user_id
    // filter is honored only for full-view roles (cannot widen scope).
    const scopedResponsibleUserId = isCommercialFullView(session.user.role) ? query.responsible_user_id : session.user.id;

    const where: Prisma.CommercialInteractionWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(scopedResponsibleUserId ? { responsibleUserId: scopedResponsibleUserId } : {}),
      ...(query.card_id ? { cardId: query.card_id } : {}),
      ...(query.lead_id ? { leadId: query.lead_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.interaction_type ? { interactionType: query.interaction_type } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...(query.from || query.to
        ? { occurredAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
      ...(query.overdue_only ? { nextActionStatus: "PENDING", nextActionAt: { lt: now } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.commercialInteraction.findMany({ where, orderBy: { occurredAt: "desc" }, skip, take }),
      prisma.commercialInteraction.count({ where }),
    ]);

    return listResponse(items.map((item) => sanitizeInteraction(item, now)), query, total);
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createInteractionSchema.parse(request.body);

    // Write-permission scope: the card/lead must belong to the author's scope (do not trust the id).
    const leadWhere: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(isCommercialFullView(session.user.role) ? {} : { assignedUserId: session.user.id }),
    };
    const card = await prisma.leadCard.findFirst({
      where: { id: input.cardId, storeId: session.user.storeId, boardKey: COMMERCIAL_BOARD_KEY, lead: leadWhere },
      include: { lead: true },
    });
    if (!card) {
      return denyOwnershipAccess({
        action: "commercial_interaction_registered",
        entityId: input.cardId,
        entityType: "lead_card",
        message: "Card comercial nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    const now = new Date();
    const occurredAt = input.occurredAt ?? now;
    const hasNextAction = Boolean(input.nextActionAt && input.nextActionType);
    const nextActionOwnerId = hasNextAction
      ? input.nextActionOwnerId ?? card.lead.assignedUserId ?? session.user.id
      : null;
    if (nextActionOwnerId) {
      await ensureUserInStore(session.user.storeId, nextActionOwnerId);
    }

    const interaction = await prisma.$transaction(async (tx) => {
      const created = await tx.commercialInteraction.create({
        data: {
          storeId: session.user.storeId,
          cardId: card.id,
          leadId: card.leadId,
          customerId: card.lead.customerId,
          vehicleId: card.lead.vehicleId,
          ...(input.vehicleInterest ? { vehicleInterest: input.vehicleInterest as Prisma.InputJsonValue } : {}),
          responsibleUserId: session.user.id,
          interactionType: input.interactionType,
          channel: input.channel,
          result: input.result,
          notes: input.notes,
          occurredAt,
          nextActionType: hasNextAction ? input.nextActionType : null,
          nextActionAt: hasNextAction ? input.nextActionAt : null,
          nextActionOwnerId,
          nextActionStatus: hasNextAction ? "PENDING" : null,
          createdByUserId: session.user.id,
        },
      });

      // Project the latest interaction (and next action, when present) onto the lead/card.
      await tx.lead.update({
        where: { id: card.leadId },
        data: {
          lastInteractionAt: occurredAt,
          lastInteractionType: input.interactionType,
          lastInteractionResult: input.result ?? null,
          updatedByUserId: session.user.id,
          ...(hasNextAction ? { nextActionAt: input.nextActionAt, nextActionType: input.nextActionType } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_interactions",
          action: "commercial_interaction_registered",
          entityType: "commercial_interaction",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            cardId: card.id,
            leadId: card.leadId,
            interactionType: created.interactionType,
            channel: created.channel,
            result: created.result,
            occurredAt: created.occurredAt.toISOString(),
            nextActionAt: created.nextActionAt?.toISOString() ?? null,
          },
        },
      });

      // Lead-scoped audit so the interaction shows in the lead/customer history.
      if (card.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_interaction_registered",
            entityType: "lead",
            entityId: card.leadId,
            result: "SUCCESS",
            metadata: { interactionId: created.id, interactionType: created.interactionType, result: created.result },
          },
        });
      }

      return created;
    });

    await emitInternalEvent({
      name: "commercial_interaction.registered",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "commercial_interaction",
      entityId: interaction.id,
      payload: { cardId: card.id, leadId: card.leadId, interactionType: interaction.interactionType },
    });

    return reply.code(201).send({ data: sanitizeInteraction(interaction, now) });
  });
}
