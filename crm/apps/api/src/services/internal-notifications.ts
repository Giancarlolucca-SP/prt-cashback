import { prisma } from "../lib/db.js";
import type { UserRole } from "@prisma/client";

export type InternalNotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const activeNotificationStatuses = ["NEW", "SEEN"] as const;

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
