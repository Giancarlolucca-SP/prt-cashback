import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { prisma } from "../lib/db.js";
import {
  COMMERCIAL_ALERT_RULES,
  detectAppointmentAlert,
  detectFollowUpOverdueAlert,
  detectLeadContinuityAlert,
  detectMissingNextActionAlert,
  detectNegotiationStalledAlert,
  sortCommercialAlertCandidates,
  type CommercialAlertCandidate,
  type CommercialAlertType,
} from "../services/commercial-alert.js";
import {
  ACTIVE_COMMERCIAL_ALERT_STATUSES,
  persistCommercialAlert,
  type PersistCommercialAlertInput,
} from "../services/commercial-alert-persistence.js";
import { COMMERCIAL_BOARD_KEY, type CommercialStageKey } from "../services/commercial-kanban.js";
import type { CommercialAppointmentStatus, CommercialAppointmentType } from "../services/commercial-appointment.js";

type CommercialCardWithLead = Prisma.LeadCardGetPayload<{ include: { lead: true } }>;

const scannedAlertTypes = COMMERCIAL_ALERT_RULES.map((rule) => rule.type);

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

    for (const candidate of candidates) {
      const card = cardById.get(candidate.cardId);
      if (!card) {
        continue;
      }
      const result = await persistCommercialAlert(prisma, enrichCandidate(storeId, candidate, card));
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
          select: { id: true, cardId: true, alertType: true, leadId: true, severity: true },
        })
      : [];
    const staleAlerts = activeExisting.filter((alert) => !candidateKeys.has(`${alert.alertType}:${alert.cardId}`));

    let alertsResolved = 0;
    if (staleAlerts.length > 0) {
      const staleIds = staleAlerts.map((alert) => alert.id);
      const resolved = await prisma.commercialAlert.updateMany({
        where: { id: { in: staleIds }, status: { in: [...ACTIVE_COMMERCIAL_ALERT_STATUSES] } },
        data: { status: "RESOLVED", resolvedAt: now, resolvedByUserId: session.user.id },
      });
      alertsResolved = resolved.count;
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
        byType: countByType(candidates),
      },
    };
  });
}
