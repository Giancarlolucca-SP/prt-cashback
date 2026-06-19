import { prisma } from "../lib/db.js";
import type { UserRole } from "@prisma/client";
import { isCommercialFullView } from "../auth/commercial-scope.js";

export type InternalNotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActiveNotificationSummary = {
  count: number;
  highestPriority: InternalNotificationPriority | null;
  latestCreatedAt: string | null;
  types: string[];
};

export const LEAD_CARD_NOTIFICATION_ENTITY_TYPES = [
  "follow_up_overdue",
  "lead_no_continuity",
  "lead_attention",
  "lead_cooling",
  "lead_high_risk",
  "negotiation_stalled",
  "purchase_confirmation_stalled",
  "missing_next_action",
] as const;

export const COMMERCIAL_APPOINTMENT_NOTIFICATION_ENTITY_TYPES = [
  "commercial_appointment_scheduled",
  "visit_confirmation_due",
  "appointment_upcoming",
  "no_show_recovery",
] as const;

const activeNotificationStatuses = ["NEW", "SEEN"] as const;
const priorityRank: Record<InternalNotificationPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const emptyActiveNotificationSummary: ActiveNotificationSummary = {
  count: 0,
  highestPriority: null,
  latestCreatedAt: null,
  types: [],
};

export function notificationEntityKey(entityType: string, entityId: string) {
  return `${entityType}:${entityId}`;
}

export function isLeadCardNotificationEntityType(entityType?: string | null) {
  return Boolean(entityType && (LEAD_CARD_NOTIFICATION_ENTITY_TYPES as readonly string[]).includes(entityType));
}

export function isCommercialAppointmentNotificationEntityType(entityType?: string | null) {
  return Boolean(entityType && (COMMERCIAL_APPOINTMENT_NOTIFICATION_ENTITY_TYPES as readonly string[]).includes(entityType));
}

export function mergeActiveNotificationSummaries(summaries: Array<ActiveNotificationSummary | null | undefined>): ActiveNotificationSummary {
  const merged = summaries.reduce(
    (acc, summary) => {
      if (!summary || summary.count === 0) return acc;
      acc.count += summary.count;
      if (summary.highestPriority && (!acc.highestPriority || priorityRank[summary.highestPriority] > priorityRank[acc.highestPriority])) {
        acc.highestPriority = summary.highestPriority;
      }
      if (summary.latestCreatedAt && (!acc.latestCreatedAt || summary.latestCreatedAt > acc.latestCreatedAt)) {
        acc.latestCreatedAt = summary.latestCreatedAt;
      }
      for (const type of summary.types) acc.types.add(type);
      return acc;
    },
    { count: 0, highestPriority: null as InternalNotificationPriority | null, latestCreatedAt: null as string | null, types: new Set<string>() },
  );

  return {
    count: merged.count,
    highestPriority: merged.highestPriority,
    latestCreatedAt: merged.latestCreatedAt,
    types: [...merged.types].sort(),
  };
}

function visibleNotificationWhere(user: { id: string; role: string }) {
  return isCommercialFullView(user.role) ? {} : { OR: [{ userId: user.id }, { userId: null }] };
}

export async function activeStoreUserIdsByRoles(storeId: string, roles: readonly UserRole[]) {
  const users = await prisma.user.findMany({
    where: { storeId, role: { in: [...roles] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

export async function notifyActiveUsers(input: {
  actionUrl?: string | null;
  body?: string | null;
  dueAt?: Date | null;
  entityId: string;
  entityType: string;
  priority?: InternalNotificationPriority;
  sourceModule?: string | null;
  storeId: string;
  title: string;
  userIds: Array<string | null | undefined>;
}) {
  const userIds = [...new Set(input.userIds.filter((userId): userId is string => Boolean(userId)))];
  if (userIds.length === 0) {
    return { created: 0, refreshed: 0 };
  }

  const existing = await prisma.notification.findMany({
    where: {
      storeId: input.storeId,
      userId: { in: userIds },
      entityType: input.entityType,
      entityId: input.entityId,
      status: { in: [...activeNotificationStatuses] },
    },
    select: { id: true, userId: true },
  });
  const existingIds = existing.map((notification) => notification.id);
  const existingUserIds = new Set(existing.map((notification) => notification.userId).filter((userId): userId is string => Boolean(userId)));
  const missingUserIds = userIds.filter((userId) => !existingUserIds.has(userId));
  const data = {
    title: input.title,
    body: input.body ?? null,
    priority: input.priority ?? "MEDIUM",
    sourceModule: input.sourceModule ?? null,
    actionUrl: input.actionUrl ?? null,
    dueAt: input.dueAt ?? null,
  };

  if (existingIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: existingIds } },
      data,
    });
  }

  if (missingUserIds.length > 0) {
    await prisma.notification.createMany({
      data: missingUserIds.map((userId) => ({
        storeId: input.storeId,
        userId,
        entityType: input.entityType,
        entityId: input.entityId,
        status: "NEW",
        ...data,
      })),
    });
  }

  return { created: missingUserIds.length, refreshed: existingIds.length };
}

export async function activeNotificationSummaryByEntity(input: {
  entities: Array<{ entityId: string | null | undefined; entityType: string }>;
  storeId: string;
  user: { id: string; role: string };
}) {
  const entities = input.entities.filter((entity): entity is { entityId: string; entityType: string } => Boolean(entity.entityId));
  if (entities.length === 0) {
    return new Map<string, ActiveNotificationSummary>();
  }

  const notifications = await prisma.notification.findMany({
    where: {
      storeId: input.storeId,
      status: { in: [...activeNotificationStatuses] },
      AND: [
        visibleNotificationWhere(input.user),
        { OR: entities.map((entity) => ({ entityType: entity.entityType, entityId: entity.entityId })) },
      ],
    },
    select: { createdAt: true, entityId: true, entityType: true, priority: true },
  });

  const byEntity = new Map<string, { count: number; highestPriority: InternalNotificationPriority | null; latestCreatedAt: Date | null; types: Set<string> }>();
  for (const notification of notifications) {
    if (!notification.entityType || !notification.entityId) continue;
    const key = notificationEntityKey(notification.entityType, notification.entityId);
    const current = byEntity.get(key) ?? { count: 0, highestPriority: null, latestCreatedAt: null, types: new Set<string>() };
    const priority = notification.priority as InternalNotificationPriority;
    current.count += 1;
    current.types.add(notification.entityType);
    if (!current.highestPriority || priorityRank[priority] > priorityRank[current.highestPriority]) {
      current.highestPriority = priority;
    }
    if (!current.latestCreatedAt || notification.createdAt > current.latestCreatedAt) {
      current.latestCreatedAt = notification.createdAt;
    }
    byEntity.set(key, current);
  }

  return new Map(
    [...byEntity.entries()].map(([key, value]) => [
      key,
      {
        count: value.count,
        highestPriority: value.highestPriority,
        latestCreatedAt: value.latestCreatedAt?.toISOString() ?? null,
        types: [...value.types].sort(),
      },
    ]),
  );
}

export async function resolveActiveNotificationsForEntity(input: {
  entityId: string;
  entityType: string;
  resolvedByUserId?: string | null;
  storeId: string;
}) {
  const now = new Date();
  return prisma.notification.updateMany({
    where: {
      storeId: input.storeId,
      entityType: input.entityType,
      entityId: input.entityId,
      status: { in: [...activeNotificationStatuses] },
    },
    data: {
      status: "RESOLVED",
      readAt: now,
      resolvedAt: now,
      resolvedByUserId: input.resolvedByUserId ?? null,
    },
  });
}
