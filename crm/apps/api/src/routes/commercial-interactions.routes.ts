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
import { COMMERCIAL_BOARD_KEY, isActiveStage, type CommercialStageKey } from "../services/commercial-kanban.js";
import {
  COMMERCIAL_INTERACTION_CHANNELS,
  COMMERCIAL_INTERACTION_RESULTS,
  COMMERCIAL_INTERACTION_TYPES,
  COMMERCIAL_NEXT_ACTION_TYPES,
  COMMERCIAL_NOTIFICATION_TYPES,
  commercialNotificationDedupKey,
  continuityNeedsManagerNotification,
  isFollowUpOverdue,
  leadContinuityStatus,
  type CommercialInteractionChannel,
  type CommercialInteractionResult,
  type CommercialInteractionType,
  type CommercialNextActionType,
  type CommercialNotificationType,
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
    if (input.nextActionAt && input.nextActionAt.getTime() < Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A proxima acao deve ser agendada para o futuro.", path: ["nextActionAt"] });
    }
  });

const interactionParamsSchema = z.object({ id: z.string().uuid() });

const resolveFollowUpSchema = z
  .object({
    action: z.enum(["complete", "cancel", "reschedule"]),
    nextActionAt: z.coerce.date().optional(),
    nextActionType: nextActionTypeSchema.optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.action === "reschedule" && !input.nextActionAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a nova data/hora para reagendar o follow-up.", path: ["nextActionAt"] });
    }
    if (input.action === "reschedule" && input.nextActionAt && input.nextActionAt.getTime() < Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A nova data/hora do follow-up deve ser no futuro.", path: ["nextActionAt"] });
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
  // Explicit boolean parsing: only "true"/"1" mean true (z.coerce.boolean turns "false" into true).
  overdue_only: z.preprocess((value) => value === "true" || value === "1", z.boolean()),
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

// Project the lead's next action from the EARLIEST pending follow-up across the lead's
// interactions, so creating/resolving one follow-up never hides another pending (overdue) one.
async function recomputeLeadNextAction(tx: Prisma.TransactionClient, storeId: string, leadId: string) {
  const earliest = await tx.commercialInteraction.findFirst({
    where: { storeId, leadId, deletedAt: null, nextActionStatus: "PENDING", nextActionAt: { not: null } },
    orderBy: { nextActionAt: "asc" },
    select: { nextActionAt: true, nextActionType: true },
  });
  return { nextActionAt: earliest?.nextActionAt ?? null, nextActionType: earliest?.nextActionType ?? null };
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

    // Scope by CARD OWNERSHIP, not by responsibleUserId: the owner of a card must see ALL
    // interactions on it (including those a manager registered). The responsible_user_id filter
    // is honored only for full-view roles and never widens a limited role's scope.
    const fullView = isCommercialFullView(session.user.role);

    const where: Prisma.CommercialInteractionWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(fullView
        ? query.responsible_user_id
          ? { responsibleUserId: query.responsible_user_id }
          : {}
        : { card: { lead: { assignedUserId: session.user.id } } }),
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

      // Project the latest interaction + the earliest pending follow-up onto the lead/card.
      const projectedNextAction = await recomputeLeadNextAction(tx, session.user.storeId, card.leadId);
      await tx.lead.update({
        where: { id: card.leadId },
        data: {
          lastInteractionAt: occurredAt,
          lastInteractionType: input.interactionType,
          lastInteractionResult: input.result ?? null,
          nextActionAt: projectedNextAction.nextActionAt,
          nextActionType: projectedNextAction.nextActionType,
          updatedByUserId: session.user.id,
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

  app.post("/:id/follow-up", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = interactionParamsSchema.parse(request.params);
    const input = resolveFollowUpSchema.parse(request.body);

    // Scope: SDR/Vendedor only resolve their own follow-ups.
    const interaction = await prisma.commercialInteraction.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...(isCommercialFullView(session.user.role) ? {} : { responsibleUserId: session.user.id }),
      },
    });
    if (!interaction) {
      throw new ApiError("NOT_FOUND", "Interacao nao encontrada.");
    }
    if (interaction.nextActionStatus !== "PENDING") {
      throw new ApiError("BUSINESS_RULE_ERROR", "Nao ha follow-up pendente nesta interacao.", {
        nextActionStatus: interaction.nextActionStatus,
      });
    }

    const now = new Date();
    const reschedule = input.action === "reschedule";
    const targetStatus = input.action === "complete" ? "DONE" : input.action === "cancel" ? "CANCELLED" : "PENDING";
    const newNextActionAt = reschedule ? input.nextActionAt ?? null : interaction.nextActionAt;
    const newNextActionType = reschedule ? input.nextActionType ?? interaction.nextActionType : interaction.nextActionType;

    const updated = await prisma.$transaction(async (tx) => {
      // Concurrency guard: only resolve a still-PENDING follow-up.
      const changed = await tx.commercialInteraction.updateMany({
        where: { id: interaction.id, nextActionStatus: "PENDING" },
        data: {
          nextActionStatus: targetStatus,
          ...(reschedule ? { nextActionAt: newNextActionAt, nextActionType: newNextActionType } : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Follow-up foi alterado por outra acao. Recarregue e tente novamente.");
      }
      const next = await tx.commercialInteraction.findUniqueOrThrow({ where: { id: interaction.id } });

      // Re-project the lead's next action from the remaining earliest pending follow-up
      // (so resolving one follow-up never hides another still-pending one).
      if (interaction.leadId) {
        const projectedNextAction = await recomputeLeadNextAction(tx, session.user.storeId, interaction.leadId);
        await tx.lead.update({
          where: { id: interaction.leadId },
          data: {
            nextActionAt: projectedNextAction.nextActionAt,
            nextActionType: projectedNextAction.nextActionType,
            updatedByUserId: session.user.id,
          },
        });

        // The overdue condition is cleared when no pending follow-up remains overdue; remove the
        // card's overdue notifications so a future overdue can alert again (dedup by condition).
        const overdueCleared = !projectedNextAction.nextActionAt || projectedNextAction.nextActionAt.getTime() > now.getTime();
        if (overdueCleared) {
          await tx.notification.deleteMany({
            where: { storeId: session.user.storeId, entityType: "follow_up_overdue", entityId: interaction.cardId },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_interactions",
          action: "commercial_follow_up_resolved",
          entityType: "commercial_interaction",
          entityId: interaction.id,
          result: "SUCCESS",
          metadata: {
            action: input.action,
            fromStatus: "PENDING",
            toStatus: targetStatus,
            newNextActionAt: newNextActionAt?.toISOString() ?? null,
            reason: input.reason ?? null,
            cardId: interaction.cardId,
            leadId: interaction.leadId,
          },
        },
      });

      if (interaction.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_follow_up_resolved",
            entityType: "lead",
            entityId: interaction.leadId,
            result: "SUCCESS",
            metadata: { interactionId: interaction.id, action: input.action, toStatus: targetStatus },
          },
        });
      }

      return next;
    });

    return { data: sanitizeInteraction(updated, new Date()) };
  });

  app.post("/scan-followups", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    // Managerial maintenance action that generates Admin/Dono-Gestor notifications.
    if (!isCommercialFullView(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestao/Administracao pode executar a varredura de follow-ups.");
    }
    const storeId = session.user.storeId;
    const now = new Date();

    // Notification recipients: Administrador + Dono/Gestor.
    const recipients = await prisma.user.findMany({
      where: { storeId, role: { in: ["OWNER_MANAGER", "ADMIN"] }, isActive: true, deletedAt: null },
      select: { id: true },
    });

    // Active commercial cards (for both overdue scoping and continuity).
    const activeCards = await prisma.leadCard.findMany({
      where: { storeId, boardKey: COMMERCIAL_BOARD_KEY, archivedAt: null, stageKey: { not: "LOST" } },
      include: { lead: true },
    });
    const activeCardById = new Map(activeCards.map((card) => [card.id, card]));

    // Overdue follow-ups (pending next action in the past) on active cards.
    const overdueInteractions = await prisma.commercialInteraction.findMany({
      where: { storeId, deletedAt: null, nextActionStatus: "PENDING", nextActionAt: { lt: now } },
      select: { cardId: true },
    });
    const overdueActiveCardIds = [...new Set(overdueInteractions.map((entry) => entry.cardId))].filter((id) => activeCardById.has(id));

    // Future appointments per active card (continuity exception).
    const activeCardIds = activeCards.map((card) => card.id);
    const futureAppointments = activeCardIds.length
      ? await prisma.commercialAppointment.findMany({
          where: { storeId, cardId: { in: activeCardIds }, startsAt: { gt: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          select: { cardId: true },
        })
      : [];
    const cardsWithFutureAppointment = new Set(futureAppointments.map((entry) => entry.cardId));

    // Build the needed (card, reason) alerts.
    const alerts: Array<{ cardId: string; leadId: string | null; type: CommercialNotificationType; title: string }> = [];
    for (const cardId of overdueActiveCardIds) {
      alerts.push({ cardId, leadId: activeCardById.get(cardId)?.leadId ?? null, type: "follow_up_overdue", title: "Follow-up vencido" });
    }
    for (const card of activeCards) {
      const status = leadContinuityStatus({
        stageActive: isActiveStage(card.stageKey as CommercialStageKey),
        hasFutureNextAction: Boolean(card.lead.nextActionAt && card.lead.nextActionAt.getTime() > now.getTime()),
        hasFutureAppointment: cardsWithFutureAppointment.has(card.id),
        lastActivityAt: card.lead.lastInteractionAt ?? card.lead.createdAt,
        now,
      });
      if (continuityNeedsManagerNotification(status)) {
        alerts.push({ cardId: card.id, leadId: card.leadId, type: "lead_no_continuity", title: `Lead sem continuidade (${status})` });
      }
    }

    // Dedup by the ACTIVE condition, not by readAt: while the follow-up is still overdue / the lead
    // still has no continuity, do not recreate the alert (reading it must not trigger a re-create).
    // Notifications are removed when the underlying condition is resolved (see the resolve endpoint).
    const candidateCardIds = [...new Set(alerts.map((alert) => alert.cardId))];
    const existing = candidateCardIds.length
      ? await prisma.notification.findMany({
          where: { storeId, entityType: { in: [...COMMERCIAL_NOTIFICATION_TYPES] }, entityId: { in: candidateCardIds } },
          select: { entityType: true, entityId: true },
        })
      : [];
    const seenKeys = new Set(existing.map((entry) => `${entry.entityType}:${entry.entityId}`));

    let notificationsCreated = 0;
    let deduped = 0;
    for (const alert of alerts) {
      const key = commercialNotificationDedupKey(alert.cardId, alert.type);
      if (seenKeys.has(key)) {
        deduped += 1;
        continue;
      }
      seenKeys.add(key);
      if (recipients.length === 0) {
        continue;
      }
      await prisma.notification.createMany({
        data: recipients.map((recipient) => ({
          storeId,
          userId: recipient.id,
          title: alert.title,
          body: `Card comercial ${alert.cardId} requer atencao da gestao.`,
          entityType: alert.type,
          entityId: alert.cardId,
        })),
      });
      notificationsCreated += recipients.length;

      if (alert.leadId) {
        await prisma.auditLog.create({
          data: {
            storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "commercial_interactions",
            action: alert.type === "follow_up_overdue" ? "follow_up_overdue_alert" : "lead_no_continuity_alert",
            entityType: "lead",
            entityId: alert.leadId,
            result: "SUCCESS",
            metadata: { cardId: alert.cardId, type: alert.type },
          },
        });
      }
    }

    return {
      data: {
        overdueFollowUps: overdueActiveCardIds.length,
        noContinuityAlerts: alerts.filter((alert) => alert.type === "lead_no_continuity").length,
        notificationsCreated,
        deduped,
        recipients: recipients.length,
      },
    };
  });
}
