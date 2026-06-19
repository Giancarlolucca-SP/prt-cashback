import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { prisma } from "../lib/db.js";
import {
  COMMERCIAL_ALERT_RULES,
  COMMERCIAL_ALERT_STATUSES,
  commercialAlertRule,
  detectAppointmentAlert,
  detectFollowUpOverdueAlert,
  detectLeadContinuityAlert,
  detectMissingNextActionAlert,
  detectNegotiationStalledAlert,
  isCommercialAlertType,
  sortCommercialAlertCandidates,
  type CommercialAlertCandidate,
  type CommercialAlertSeverity,
  type CommercialAlertStatus,
  type CommercialAlertType,
} from "../services/commercial-alert.js";
import {
  ACTIVE_COMMERCIAL_ALERT_STATUSES,
  persistCommercialAlert,
  type PersistCommercialAlertInput,
} from "../services/commercial-alert-persistence.js";
import { COMMERCIAL_BOARD_KEY, type CommercialStageKey } from "../services/commercial-kanban.js";
import type { CommercialAppointmentStatus, CommercialAppointmentType } from "../services/commercial-appointment.js";
import {
  activeStoreUserIdsByRoles,
  notifyActiveUsers,
  resolveActiveNotificationsForEntity,
  type InternalNotificationPriority,
} from "../services/internal-notifications.js";

type CommercialCardWithLead = Prisma.LeadCardGetPayload<{ include: { lead: true } }>;
type CommercialAlertWithCard = Prisma.CommercialAlertGetPayload<{ include: { card: { include: { lead: true } } } }>;

const scannedAlertTypes = COMMERCIAL_ALERT_RULES.map((rule) => rule.type);
const alertTypeKeys = COMMERCIAL_ALERT_RULES.map((rule) => rule.type) as [CommercialAlertType, ...CommercialAlertType[]];
const alertStatusKeys = [...COMMERCIAL_ALERT_STATUSES] as [CommercialAlertStatus, ...CommercialAlertStatus[]];
const alertSeverityKeys = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as [CommercialAlertSeverity, ...CommercialAlertSeverity[]];
const alertTypeSchema = z.enum(alertTypeKeys);
const alertStatusSchema = z.enum(alertStatusKeys);
const alertSeveritySchema = z.enum(alertSeverityKeys);

const commercialAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: alertStatusSchema.optional(),
  type: alertTypeSchema.optional(),
  severity: alertSeveritySchema.optional(),
  card_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  responsible_user_id: z.string().uuid().optional(),
  target: z.enum(["all", "mine", "management"]).default("all"),
  open_only: z.coerce.boolean().default(true),
  due_from: z.coerce.date().optional(),
  due_to: z.coerce.date().optional(),
  triggered_from: z.coerce.date().optional(),
  triggered_to: z.coerce.date().optional(),
});

const commercialAlertParamsSchema = z.object({
  id: z.string().uuid(),
});

const commercialAlertActionSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
  })
  .default({});

const commercialAlertManagementNotificationRoles = ["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"] as const;
const appointmentAlertNotificationTypes: ReadonlySet<CommercialAlertType> = new Set([
  "visit_confirmation_due",
  "appointment_upcoming",
  "no_show_recovery",
]);
const commercialAlertNotificationTypes: ReadonlySet<CommercialAlertType> = new Set(
  COMMERCIAL_ALERT_RULES.map((rule) => rule.type).filter((type) => type !== "follow_up_overdue"),
);

type CommercialAlertSession = Awaited<ReturnType<typeof requirePermission>>;

function alertKey(alert: { type: string; cardId: string }) {
  return `${alert.type}:${alert.cardId}`;
}

function uniqueSortedCandidates(candidates: CommercialAlertCandidate[]) {
  const byKey = new Map<string, CommercialAlertCandidate>();
  for (const candidate of sortCommercialAlertCandidates(candidates)) {
    if (!byKey.has(alertKey(candidate))) {
      byKey.set(alertKey(candidate), candidate);
    }
  }
  return [...byKey.values()];
}

function countByType(candidates: CommercialAlertCandidate[]) {
  return candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.type] = (acc[candidate.type] ?? 0) + 1;
    return acc;
  }, {});
}

function alertPriority(alertType: string): number {
  return isCommercialAlertType(alertType) ? commercialAlertRule(alertType).priority : Number.MAX_SAFE_INTEGER;
}

function sortPersistedAlerts<T extends { alertType: string; dueAt: Date | null; triggeredAt: Date; createdAt: Date }>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => {
    const priorityDiff = alertPriority(a.alertType) - alertPriority(b.alertType);
    if (priorityDiff !== 0) return priorityDiff;
    const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    const triggeredDiff = a.triggeredAt.getTime() - b.triggeredAt.getTime();
    if (triggeredDiff !== 0) return triggeredDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

function sanitizeCommercialAlert(alert: CommercialAlertWithCard) {
  const type = isCommercialAlertType(alert.alertType) ? alert.alertType : null;
  const rule = type ? commercialAlertRule(type) : null;
  return {
    id: alert.id,
    storeId: alert.storeId,
    alertType: alert.alertType,
    alertLabel: rule?.label ?? alert.alertType,
    priority: rule?.priority ?? Number.MAX_SAFE_INTEGER,
    severity: alert.severity,
    status: alert.status,
    cardId: alert.cardId,
    leadId: alert.leadId,
    customerId: alert.customerId,
    vehicleId: alert.vehicleId,
    responsibleUserId: alert.responsibleUserId,
    targetUserId: alert.targetUserId,
    targetRole: alert.targetRole,
    reason: alert.reason,
    suggestedAction: alert.suggestedAction,
    dueAt: alert.dueAt?.toISOString() ?? null,
    triggeredAt: alert.triggeredAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: alert.resolvedByUserId,
    metadata: alert.metadata,
    card: {
      id: alert.card.id,
      boardKey: alert.card.boardKey,
      stageKey: alert.card.stageKey,
      stageEnteredAt: alert.card.stageEnteredAt.toISOString(),
      archivedAt: alert.card.archivedAt?.toISOString() ?? null,
    },
    lead: {
      id: alert.card.lead.id,
      title: alert.card.lead.title,
      assignedUserId: alert.card.lead.assignedUserId,
      status: alert.card.lead.status,
      source: alert.card.lead.source,
      channel: alert.card.lead.channel,
      interest: alert.card.lead.interest,
      lastInteractionAt: alert.card.lead.lastInteractionAt?.toISOString() ?? null,
      nextActionAt: alert.card.lead.nextActionAt?.toISOString() ?? null,
      nextActionType: alert.card.lead.nextActionType,
      createdAt: alert.card.lead.createdAt.toISOString(),
    },
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
  };
}

function commercialAlertVisibleWhere(user: { id: string; role: string }): Prisma.CommercialAlertWhereInput {
  return isCommercialFullView(user.role) ? {} : { OR: [{ targetUserId: user.id }, { responsibleUserId: user.id }] };
}

async function loadScopedCommercialAlert(session: CommercialAlertSession, id: string) {
  const alert = await prisma.commercialAlert.findFirst({
    where: {
      id,
      storeId: session.user.storeId,
      ...commercialAlertVisibleWhere(session.user),
    },
    include: { card: { include: { lead: true } } },
  });
  if (!alert) {
    throw new ApiError("NOT_FOUND", "Alerta comercial nao encontrado.");
  }
  return alert;
}

function assertAlertIsActive(alert: CommercialAlertWithCard) {
  if (!ACTIVE_COMMERCIAL_ALERT_STATUSES.includes(alert.status as (typeof ACTIVE_COMMERCIAL_ALERT_STATUSES)[number])) {
    throw new ApiError("CONFLICT", "Alerta comercial ja esta encerrado.", { status: alert.status });
  }
}

async function auditCommercialAlertTransition(
  tx: Prisma.TransactionClient,
  session: CommercialAlertSession,
  alert: CommercialAlertWithCard,
  input: {
    action: string;
    fromStatus: string;
    toStatus: CommercialAlertStatus;
    reason?: string | null;
  },
) {
  const metadata = {
    alertType: alert.alertType,
    severity: alert.severity,
    cardId: alert.cardId,
    leadId: alert.leadId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    source: "manual",
  } satisfies Prisma.InputJsonObject;

  await tx.auditLog.create({
    data: {
      storeId: session.user.storeId,
      actorId: session.user.id,
      actorRole: session.user.role,
      module: "commercial_alerts",
      action: input.action,
      entityType: "commercial_alert",
      entityId: alert.id,
      result: "SUCCESS",
      metadata,
    },
  });

  if (alert.leadId) {
    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "leads",
        action: input.action,
        entityType: "lead",
        entityId: alert.leadId,
        result: "SUCCESS",
        metadata: { ...metadata, alertId: alert.id },
      },
    });
  }
}

async function transitionCommercialAlert(
  session: CommercialAlertSession,
  alert: CommercialAlertWithCard,
  input: {
    toStatus: "VIEWED" | "RESOLVED" | "DISMISSED";
    action: string;
    reason?: string | null;
  },
) {
  if (input.toStatus === "VIEWED" && alert.status === "VIEWED") {
    return alert;
  }
  assertAlertIsActive(alert);

  const fromStatus = alert.status;
  const now = new Date();
  const terminalData =
    input.toStatus === "RESOLVED" || input.toStatus === "DISMISSED"
      ? { resolvedAt: now, resolvedByUserId: session.user.id }
      : {};

  return prisma.$transaction(async (tx) => {
    const changed = await tx.commercialAlert.updateMany({
      where: { id: alert.id, status: fromStatus },
      data: {
        status: input.toStatus,
        ...terminalData,
      },
    });
    if (changed.count !== 1) {
      throw new ApiError("CONFLICT", "Alerta comercial foi alterado por outra acao. Recarregue e tente novamente.");
    }

    const updated = await tx.commercialAlert.findUniqueOrThrow({
      where: { id: alert.id },
      include: { card: { include: { lead: true } } },
    });

    await auditCommercialAlertTransition(tx, session, alert, {
      action: input.action,
      fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
    });

    if (input.toStatus === "RESOLVED" || input.toStatus === "DISMISSED") {
      const notificationTarget = commercialAlertNotificationTargetFromPersistedAlert(alert);
      if (notificationTarget) {
        await tx.notification.updateMany({
          where: {
            storeId: session.user.storeId,
            entityType: notificationTarget.entityType,
            entityId: notificationTarget.entityId,
            status: { in: ["NEW", "SEEN"] },
          },
          data:
            input.toStatus === "DISMISSED"
              ? { status: "DISMISSED", readAt: now, dismissedAt: now, dismissedByUserId: session.user.id }
              : { status: "RESOLVED", readAt: now, resolvedAt: now, resolvedByUserId: session.user.id },
        });
      }
    }

    return updated;
  });
}

function enrichCandidate(storeId: string, candidate: CommercialAlertCandidate, card: CommercialCardWithLead): PersistCommercialAlertInput {
  const responsibleUserId = card.lead.assignedUserId ?? null;
  return {
    ...candidate,
    storeId,
    leadId: candidate.leadId ?? card.leadId,
    customerId: card.lead.customerId,
    vehicleId: card.lead.vehicleId,
    responsibleUserId,
    targetUserId: candidate.audiences.includes("RESPONSIBLE") ? responsibleUserId : null,
    targetRole: candidate.audiences.includes("MANAGEMENT") ? "MANAGEMENT" : null,
  };
}

function notificationPriorityFromSeverity(severity: CommercialAlertSeverity): InternalNotificationPriority {
  return severity;
}

function commercialAlertNotificationTarget(input: {
  alertType: CommercialAlertType;
  appointmentId?: string | null;
  cardId: string;
}) {
  if (!commercialAlertNotificationTypes.has(input.alertType)) {
    return null;
  }
  if (appointmentAlertNotificationTypes.has(input.alertType)) {
    return input.appointmentId
      ? {
          actionUrl: `/commercial-agenda/appointments/${input.appointmentId}`,
          entityId: input.appointmentId,
          entityType: input.alertType,
        }
      : null;
  }
  return {
    actionUrl: `/commercial-kanban/cards/${input.cardId}`,
    entityId: input.cardId,
    entityType: input.alertType,
  };
}

function appointmentIdFromMetadata(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const appointmentId = (metadata as Prisma.JsonObject).appointmentId;
  return typeof appointmentId === "string" ? appointmentId : null;
}

function commercialAlertNotificationTargetFromPersistedAlert(alert: {
  alertType: string;
  cardId: string;
  metadata?: Prisma.JsonValue | null;
}) {
  if (!isCommercialAlertType(alert.alertType)) {
    return null;
  }
  return commercialAlertNotificationTarget({
    alertType: alert.alertType,
    appointmentId: appointmentIdFromMetadata(alert.metadata),
    cardId: alert.cardId,
  });
}

async function notifyCommercialAlertCandidate(input: {
  candidate: CommercialAlertCandidate;
  managementUserIds: string[];
  persisted: PersistCommercialAlertInput;
  storeId: string;
}) {
  const target = commercialAlertNotificationTarget({
    alertType: input.candidate.type,
    appointmentId: input.candidate.appointmentId,
    cardId: input.candidate.cardId,
  });
  if (!target) {
    return { created: 0, refreshed: 0 };
  }

  const userIds = [
    ...(input.candidate.audiences.includes("RESPONSIBLE") ? [input.persisted.responsibleUserId] : []),
    ...(input.candidate.audiences.includes("MANAGEMENT") ? input.managementUserIds : []),
  ];

  return notifyActiveUsers({
    storeId: input.storeId,
    userIds,
    title: input.candidate.title,
    body: `${input.candidate.reason} Acao sugerida: ${input.candidate.suggestedAction}`,
    entityType: target.entityType,
    entityId: target.entityId,
    priority: notificationPriorityFromSeverity(input.candidate.severity),
    sourceModule: "commercial_alerts",
    actionUrl: target.actionUrl,
    dueAt: input.candidate.dueAt,
  });
}

async function buildAlertCandidates(storeId: string, now: Date) {
  const cards = await prisma.leadCard.findMany({
    where: { storeId, boardKey: COMMERCIAL_BOARD_KEY },
    include: { lead: true },
  });
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const activeCards = cards.filter((card) => !card.archivedAt && card.stageKey !== "LOST");
  const activeCardIds = activeCards.map((card) => card.id);

  const [overdueInteractions, appointments, futureAppointments] = await Promise.all([
    activeCardIds.length
      ? prisma.commercialInteraction.findMany({
          where: { storeId, deletedAt: null, cardId: { in: activeCardIds }, nextActionStatus: "PENDING", nextActionAt: { lt: now } },
          orderBy: { nextActionAt: "asc" },
          select: { cardId: true, leadId: true, nextActionAt: true },
        })
      : Promise.resolve([]),
    activeCardIds.length
      ? prisma.commercialAppointment.findMany({
          where: {
            storeId,
            cardId: { in: activeCardIds },
            OR: [
              { status: "NO_SHOW" },
              { status: { in: ["SCHEDULED", "CONFIRMED"] }, startsAt: { gte: now, lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) } },
            ],
          },
          orderBy: { startsAt: "asc" },
          select: { id: true, cardId: true, leadId: true, type: true, status: true, startsAt: true },
        })
      : Promise.resolve([]),
    activeCardIds.length
      ? prisma.commercialAppointment.findMany({
          where: { storeId, cardId: { in: activeCardIds }, startsAt: { gt: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          select: { cardId: true },
        })
      : Promise.resolve([]),
  ]);

  const cardsWithFutureAppointment = new Set(futureAppointments.map((appointment) => appointment.cardId));
  const candidates: CommercialAlertCandidate[] = [];
  const overdueCardIds = new Set<string>();

  for (const interaction of overdueInteractions) {
    if (overdueCardIds.has(interaction.cardId)) {
      continue;
    }
    overdueCardIds.add(interaction.cardId);
    const alert = detectFollowUpOverdueAlert({
      cardId: interaction.cardId,
      leadId: interaction.leadId,
      nextActionAt: interaction.nextActionAt,
      resolved: false,
      now,
    });
    if (alert) candidates.push(alert);
  }

  for (const appointment of appointments) {
    const alert = detectAppointmentAlert({
      cardId: appointment.cardId,
      leadId: appointment.leadId,
      appointmentId: appointment.id,
      type: appointment.type as CommercialAppointmentType,
      status: appointment.status as CommercialAppointmentStatus,
      startsAt: appointment.startsAt,
      now,
    });
    if (alert) candidates.push(alert);
  }

  for (const card of activeCards) {
    const stage = card.stageKey as CommercialStageKey;
    const hasFutureNextAction = Boolean(card.lead.nextActionAt && card.lead.nextActionAt.getTime() > now.getTime());
    const hasFutureAppointment = cardsWithFutureAppointment.has(card.id);
    const lastActivityAt = card.lead.lastInteractionAt ?? card.lead.createdAt;

    const continuity = detectLeadContinuityAlert({
      cardId: card.id,
      leadId: card.leadId,
      stage,
      lastActivityAt,
      hasFutureNextAction,
      hasFutureAppointment,
      now,
    });
    if (continuity) candidates.push(continuity);

    const stalled = detectNegotiationStalledAlert({
      cardId: card.id,
      leadId: card.leadId,
      stage,
      stageEnteredAt: card.stageEnteredAt,
      hasFutureNextAction,
      now,
    });
    if (stalled) candidates.push(stalled);

    const missingNextAction = detectMissingNextActionAlert({
      cardId: card.id,
      leadId: card.leadId,
      stage,
      hasFutureNextAction,
      hasFutureAppointment,
      now,
    });
    if (missingNextAction) candidates.push(missingNextAction);
  }

  return {
    cards,
    cardById,
    candidates: uniqueSortedCandidates(candidates),
  };
}

export async function registerCommercialAlertRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = commercialAlertsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const fullView = isCommercialFullView(session.user.role);

    const statusWhere: Prisma.StringFilter | string | undefined = query.status
      ? query.status
      : query.open_only
        ? { in: [...ACTIVE_COMMERCIAL_ALERT_STATUSES] }
        : undefined;
    const visibilityWhere: Prisma.CommercialAlertWhereInput = fullView
      ? query.target === "management"
        ? { targetRole: "MANAGEMENT" }
        : query.target === "mine"
          ? { OR: [{ targetUserId: session.user.id }, { responsibleUserId: session.user.id }] }
          : {}
      : commercialAlertVisibleWhere(session.user);
    const responsibleWhere: Prisma.CommercialAlertWhereInput =
      fullView && query.responsible_user_id ? { responsibleUserId: query.responsible_user_id } : {};

    const where: Prisma.CommercialAlertWhereInput = {
      storeId: session.user.storeId,
      ...visibilityWhere,
      ...responsibleWhere,
      ...(statusWhere ? { status: statusWhere } : {}),
      ...(query.type ? { alertType: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.card_id ? { cardId: query.card_id } : {}),
      ...(query.lead_id ? { leadId: query.lead_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.due_from || query.due_to
        ? { dueAt: { ...(query.due_from ? { gte: query.due_from } : {}), ...(query.due_to ? { lte: query.due_to } : {}) } }
        : {}),
      ...(query.triggered_from || query.triggered_to
        ? { triggeredAt: { ...(query.triggered_from ? { gte: query.triggered_from } : {}), ...(query.triggered_to ? { lte: query.triggered_to } : {}) } }
        : {}),
    };

    const alerts = await prisma.commercialAlert.findMany({
      where,
      include: { card: { include: { lead: true } } },
    });
    const sorted = sortPersistedAlerts(alerts);

    return listResponse(sorted.slice(skip, skip + take).map(sanitizeCommercialAlert), query, sorted.length);
  });

  app.post("/scan", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    if (!isCommercialFullView(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestao/Administracao pode executar a varredura de alertas comerciais.");
    }

    const storeId = session.user.storeId;
    const now = new Date();
    const { cards, cardById, candidates } = await buildAlertCandidates(storeId, now);
    const candidateKeys = new Set(candidates.map(alertKey));
    let alertsCreated = 0;
    let alertsRefreshed = 0;
    let notificationsCreated = 0;
    let notificationsRefreshed = 0;
    let notificationsFailed = 0;
    const managementNotificationUserIds = await activeStoreUserIdsByRoles(storeId, commercialAlertManagementNotificationRoles);

    for (const candidate of candidates) {
      const card = cardById.get(candidate.cardId);
      if (!card) {
        continue;
      }
      const persisted = enrichCandidate(storeId, candidate, card);
      const result = await persistCommercialAlert(prisma, persisted);
      if (result.created) {
        alertsCreated += 1;
        await prisma.auditLog.create({
          data: {
            storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "commercial_alerts",
            action: "commercial_alert_created",
            entityType: "commercial_alert",
            entityId: result.alert.id,
            result: "SUCCESS",
            metadata: {
              cardId: candidate.cardId,
              leadId: candidate.leadId ?? null,
              alertType: candidate.type,
              severity: candidate.severity,
            } satisfies Prisma.InputJsonObject,
          },
        });
      } else {
        alertsRefreshed += 1;
      }

      try {
        const notificationResult = await notifyCommercialAlertCandidate({
          candidate,
          managementUserIds: managementNotificationUserIds,
          persisted,
          storeId,
        });
        notificationsCreated += notificationResult.created;
        notificationsRefreshed += notificationResult.refreshed;
      } catch (notificationError) {
        notificationsFailed += 1;
        request.log.error(
          { err: notificationError, alertType: candidate.type, cardId: candidate.cardId },
          "Falha ao gerar notificacao de alerta comercial",
        );
      }
    }

    const scannedCardIds = cards.map((card) => card.id);
    const activeExisting = scannedCardIds.length
      ? await prisma.commercialAlert.findMany({
          where: {
            storeId,
            cardId: { in: scannedCardIds },
            alertType: { in: scannedAlertTypes },
            status: { in: [...ACTIVE_COMMERCIAL_ALERT_STATUSES] },
          },
          select: { id: true, cardId: true, alertType: true, leadId: true, metadata: true, severity: true },
        })
      : [];
    const staleAlerts = activeExisting.filter((alert) => !candidateKeys.has(`${alert.alertType}:${alert.cardId}`));

    let alertsResolved = 0;
    let notificationsResolved = 0;
    if (staleAlerts.length > 0) {
      const staleIds = staleAlerts.map((alert) => alert.id);
      const resolved = await prisma.commercialAlert.updateMany({
        where: { id: { in: staleIds }, status: { in: [...ACTIVE_COMMERCIAL_ALERT_STATUSES] } },
        data: { status: "RESOLVED", resolvedAt: now, resolvedByUserId: session.user.id },
      });
      alertsResolved = resolved.count;
      for (const alert of staleAlerts) {
        const notificationTarget = commercialAlertNotificationTargetFromPersistedAlert(alert);
        if (!notificationTarget) {
          continue;
        }
        const notificationResult = await resolveActiveNotificationsForEntity({
          storeId,
          entityType: notificationTarget.entityType,
          entityId: notificationTarget.entityId,
          resolvedByUserId: session.user.id,
        });
        notificationsResolved += notificationResult.count;
      }
      await prisma.auditLog.createMany({
        data: staleAlerts.map((alert) => ({
          storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_alerts",
          action: "commercial_alert_resolved",
          entityType: "commercial_alert",
          entityId: alert.id,
          result: "SUCCESS",
          metadata: {
            cardId: alert.cardId,
            leadId: alert.leadId,
            alertType: alert.alertType as CommercialAlertType,
            severity: alert.severity,
            source: "scan",
          },
        })),
      });
    }

    return {
      data: {
        cardsScanned: cards.length,
        candidates: candidates.length,
        alertsCreated,
        alertsRefreshed,
        alertsResolved,
        notificationsCreated,
        notificationsRefreshed,
        notificationsResolved,
        notificationsFailed,
        byType: countByType(candidates),
      },
    };
  });

  app.post("/:id/view", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = commercialAlertParamsSchema.parse(request.params);
    const input = commercialAlertActionSchema.parse(request.body);
    const alert = await loadScopedCommercialAlert(session, params.id);
    const updated = await transitionCommercialAlert(session, alert, {
      toStatus: "VIEWED",
      action: "commercial_alert_viewed",
      reason: input.reason ?? null,
    });
    return { data: sanitizeCommercialAlert(updated) };
  });

  app.post("/:id/resolve", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = commercialAlertParamsSchema.parse(request.params);
    const input = commercialAlertActionSchema.parse(request.body);
    const alert = await loadScopedCommercialAlert(session, params.id);
    const updated = await transitionCommercialAlert(session, alert, {
      toStatus: "RESOLVED",
      action: "commercial_alert_resolved",
      reason: input.reason ?? null,
    });
    return { data: sanitizeCommercialAlert(updated) };
  });

  app.post("/:id/dismiss", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = commercialAlertParamsSchema.parse(request.params);
    const input = commercialAlertActionSchema.parse(request.body);
    const alert = await loadScopedCommercialAlert(session, params.id);
    const updated = await transitionCommercialAlert(session, alert, {
      toStatus: "DISMISSED",
      action: "commercial_alert_dismissed",
      reason: input.reason ?? null,
    });
    return { data: sanitizeCommercialAlert(updated) };
  });
}
