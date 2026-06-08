import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requireAuth, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  unread_only: z.coerce.boolean().default(false),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
});

const notificationSchema = z.object({
  userId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(1000).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
});

const notificationParamsSchema = z.object({ id: z.string().uuid() });

type NotificationRecord = {
  id: string;
  storeId: string | null;
  userId: string | null;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function sanitizeNotification(notification: NotificationRecord) {
  return {
    id: notification.id,
    storeId: notification.storeId,
    userId: notification.userId,
    title: notification.title,
    body: notification.body,
    entityType: notification.entityType,
    entityId: notification.entityId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

async function ensureUser(storeId: string, userId?: string | null) {
  if (!userId) return;
  const user = await prisma.user.findFirst({ where: { id: userId, storeId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!user) throw new ApiError("NOT_FOUND", "Usuario da notificacao nao encontrado.");
}

async function getNotificationOrThrow(storeId: string, userId: string, id: string) {
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      storeId,
      OR: [{ userId }, { userId: null }],
    },
  });
  if (!notification) throw new ApiError("NOT_FOUND", "Notificacao nao encontrada.");
  return notification;
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requireAuth(request);
    const query = notificationsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      OR: [{ userId: session.user.id }, { userId: null }],
      ...(query.unread_only ? { readAt: null } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where }),
    ]);

    return listResponse(items.map(sanitizeNotification), query, total);
  });

  app.get("/summary", async (request) => {
    const session = await requireAuth(request);
    const unread = await prisma.notification.count({
      where: {
        storeId: session.user.storeId,
        OR: [{ userId: session.user.id }, { userId: null }],
        readAt: null,
      },
    });
    return { data: { unread } };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const input = notificationSchema.parse(request.body);
    await ensureUser(session.user.storeId, input.userId);

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          storeId: session.user.storeId,
          userId: input.userId,
          title: input.title,
          body: input.body,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "notifications",
          action: "notification_created",
          entityType: "notification",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { userId: created.userId, entityType: created.entityType, entityId: created.entityId },
        },
      });
      return created;
    });

    await emitInternalEvent({
      name: "notification.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: { userId: notification.userId, entityType: notification.entityType, entityId: notification.entityId },
    });

    return reply.code(201).send({ data: sanitizeNotification(notification) });
  });

  app.post("/:id/read", async (request) => {
    const session = await requireAuth(request);
    const params = notificationParamsSchema.parse(request.params);
    const current = await getNotificationOrThrow(session.user.storeId, session.user.id, params.id);
    const notification = await prisma.notification.update({
      where: { id: current.id },
      data: { readAt: current.readAt ?? new Date() },
    });

    await emitInternalEvent({
      name: "notification.read",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: { userId: notification.userId },
    });

    return { data: sanitizeNotification(notification) };
  });
}
