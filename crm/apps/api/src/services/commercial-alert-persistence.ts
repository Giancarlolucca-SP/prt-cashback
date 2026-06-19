import type { CommercialAlert, Prisma } from "@prisma/client";
import { commercialAlertDedupKey, type CommercialAlertCandidate } from "./commercial-alert.js";

export const ACTIVE_COMMERCIAL_ALERT_STATUSES = ["PENDING", "VIEWED"] as const;

export type PersistCommercialAlertInput = CommercialAlertCandidate & {
  storeId: string;
  customerId?: string | null;
  vehicleId?: string | null;
  responsibleUserId?: string | null;
  targetUserId?: string | null;
  targetRole?: string | null;
};

type CommercialAlertPersistenceClient = {
  commercialAlert: {
    findFirst(args: Prisma.CommercialAlertFindFirstArgs): Promise<CommercialAlert | null>;
    create(args: Prisma.CommercialAlertCreateArgs): Promise<CommercialAlert>;
    update(args: Prisma.CommercialAlertUpdateArgs): Promise<CommercialAlert>;
    updateMany(args: Prisma.CommercialAlertUpdateManyArgs): Promise<{ count: number }>;
  };
};

export function activeCommercialAlertWhere(input: {
  storeId: string;
  cardId: string;
  alertType: string;
}): Prisma.CommercialAlertWhereInput {
  return {
    storeId: input.storeId,
    cardId: input.cardId,
    alertType: input.alertType,
    status: { in: [...ACTIVE_COMMERCIAL_ALERT_STATUSES] },
  };
}

function alertMetadata(input: PersistCommercialAlertInput): Prisma.InputJsonObject {
  return {
    dedupKey: commercialAlertDedupKey(input.cardId, input.type),
    priority: input.priority,
    audiences: [...input.audiences],
    ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
    ...(input.metadata ?? {}),
  };
}

export function commercialAlertCreateData(input: PersistCommercialAlertInput): Prisma.CommercialAlertCreateInput {
  return {
    storeId: input.storeId,
    alertType: input.type,
    severity: input.severity,
    status: "PENDING",
    card: { connect: { id: input.cardId } },
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    responsibleUserId: input.responsibleUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    targetRole: input.targetRole ?? null,
    reason: input.reason,
    suggestedAction: input.suggestedAction,
    dueAt: input.dueAt,
    triggeredAt: input.triggeredAt,
    metadata: alertMetadata(input),
  };
}

function commercialAlertRefreshData(input: PersistCommercialAlertInput): Prisma.CommercialAlertUpdateInput {
  return {
    severity: input.severity,
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    vehicleId: input.vehicleId ?? null,
    responsibleUserId: input.responsibleUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    targetRole: input.targetRole ?? null,
    reason: input.reason,
    suggestedAction: input.suggestedAction,
    dueAt: input.dueAt,
    triggeredAt: input.triggeredAt,
    metadata: alertMetadata(input),
  };
}

export async function persistCommercialAlert(
  client: CommercialAlertPersistenceClient,
  input: PersistCommercialAlertInput,
): Promise<{ alert: CommercialAlert; created: boolean }> {
  const existing = await client.commercialAlert.findFirst({
    where: activeCommercialAlertWhere({ storeId: input.storeId, cardId: input.cardId, alertType: input.type }),
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const alert = await client.commercialAlert.update({
      where: { id: existing.id },
      data: commercialAlertRefreshData(input),
    });
    return { alert, created: false };
  }

  const alert = await client.commercialAlert.create({
    data: commercialAlertCreateData(input),
  });
  return { alert, created: true };
}

export async function resolveCommercialAlertCondition(
  client: CommercialAlertPersistenceClient,
  input: { storeId: string; cardId: string; alertType: string; resolvedByUserId?: string | null; now: Date },
): Promise<number> {
  const result = await client.commercialAlert.updateMany({
    where: activeCommercialAlertWhere({ storeId: input.storeId, cardId: input.cardId, alertType: input.alertType }),
    data: {
      status: "RESOLVED",
      resolvedAt: input.now,
      resolvedByUserId: input.resolvedByUserId ?? null,
    },
  });
  return result.count;
}
