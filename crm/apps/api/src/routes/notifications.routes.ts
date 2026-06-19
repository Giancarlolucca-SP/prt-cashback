import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requireAuth, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import { COMMERCIAL_BOARD_KEY } from "../services/commercial-kanban.js";

const notificationPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const notificationStatusSchema = z.enum(["NEW", "SEEN", "RESOLVED", "DISMISSED"]);
const terminalNotificationStatuses = ["RESOLVED", "DISMISSED"] as const;

const internalActionUrlSchema = z
  .string()
  .trim()
  .max(240)
  .regex(/^\/(?!\/)[A-Za-z0-9/_?=&.:%-]*$/, "Action URL deve ser uma rota interna relativa.");

const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  unread_only: z.coerce.boolean().default(false),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  priority: notificationPrioritySchema.optional(),
  status: notificationStatusSchema.optional(),
  source_module: z.string().trim().max(80).optional(),
  created_from: z.coerce.date().optional(),
  created_to: z.coerce.date().optional(),
  due_from: z.coerce.date().optional(),
  due_to: z.coerce.date().optional(),
});

const notificationSchema = z.object({
  userId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  body: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Notificacao") })
    .optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  priority: notificationPrioritySchema.default("MEDIUM"),
  sourceModule: z.string().trim().max(80).optional(),
  actionUrl: internalActionUrlSchema.optional(),
  dueAt: z.string().datetime().optional(),
});

const notificationParamsSchema = z.object({ id: z.string().uuid() });
const dismissNotificationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3)
    .max(240)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Motivo") }),
});
const reassignNotificationSchema = z.object({
  assignedUserId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Motivo da reatribuicao") }),
});

const responsibleChangeRoles = new Set(["OWNER_MANAGER", "ADMIN"]);
const reassignableCommercialAppointmentStatuses = new Set(["SCHEDULED", "CONFIRMED"]);
const terminalTechnicalDeliveryStatuses = new Set(["COMPLETED_SIGNED", "CANCELLED"]);

type NotificationRecord = {
  id: string;
  storeId: string | null;
  userId: string | null;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  priority: string;
  status: string;
  sourceModule: string | null;
  actionUrl: string | null;
  dueAt: Date | null;
  readAt: Date | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  dismissedAt: Date | null;
  dismissedByUserId: string | null;
  dismissedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationSession = Awaited<ReturnType<typeof requirePermission>>;
type NotificationReassignInput = z.infer<typeof reassignNotificationSchema>;
type NotificationReassignment = {
  entityType: "lead_card" | "commercial_appointment" | "technical_delivery";
  entityId: string;
  assignedUserId: string;
  previousAssignedUserId: string | null;
  reason: string;
  unchanged: boolean;
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
    priority: notification.priority,
    status: notification.status,
    sourceModule: notification.sourceModule,
    actionUrl: notification.actionUrl,
    dueAt: notification.dueAt?.toISOString() ?? null,
    readAt: notification.readAt?.toISOString() ?? null,
    resolvedAt: notification.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: notification.resolvedByUserId,
    dismissedAt: notification.dismissedAt?.toISOString() ?? null,
    dismissedByUserId: notification.dismissedByUserId,
    dismissedReason: notification.dismissedReason,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

async function ensureUser(storeId: string, userId?: string | null) {
  if (!userId) return;
  const user = await prisma.user.findFirst({ where: { id: userId, storeId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!user) throw new ApiError("NOT_FOUND", "Usuario da notificacao nao encontrado.");
}

async function ensureResponsibleInStore(storeId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, storeId, isActive: true, deletedAt: null }, select: { id: true } });
  if (!user) throw new ApiError("NOT_FOUND", "Novo responsavel nao encontrado.");
}

function notificationVisibilityWhere(user: { id: string; role: string }): Prisma.NotificationWhereInput {
  return isCommercialFullView(user.role) ? {} : { OR: [{ userId: user.id }, { userId: null }] };
}

async function getNotificationOrThrow(storeId: string, user: { id: string; role: string }, id: string) {
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      storeId,
      ...notificationVisibilityWhere(user),
    },
  });
  if (!notification) throw new ApiError("NOT_FOUND", "Notificacao nao encontrada.");
  return notification;
}

function assertReassignableNotification(notification: NotificationRecord) {
  if (terminalNotificationStatuses.includes(notification.status as (typeof terminalNotificationStatuses)[number])) {
    throw new ApiError("CONFLICT", "Notificacao finalizada nao pode reatribuir responsavel.");
  }
  if (!notification.entityType || !notification.entityId) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Notificacao nao possui entidade operacional para reatribuicao.");
  }
}

async function reassignLeadCardFromNotification(
  session: NotificationSession,
  notification: NotificationRecord,
  input: NotificationReassignInput,
): Promise<NotificationReassignment> {
  const card = await prisma.leadCard.findFirst({
    where: {
      id: notification.entityId ?? "",
      storeId: session.user.storeId,
      boardKey: COMMERCIAL_BOARD_KEY,
      archivedAt: null,
      lead: { deletedAt: null },
    },
    include: { lead: true },
  });
  if (!card) {
    throw new ApiError("NOT_FOUND", "Card comercial nao encontrado.");
  }

  const previousAssignedUserId = card.lead.assignedUserId;
  if (previousAssignedUserId === input.assignedUserId) {
    return {
      entityType: "lead_card",
      entityId: card.id,
      assignedUserId: input.assignedUserId,
      previousAssignedUserId,
      reason: input.reason,
      unchanged: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: card.leadId },
      data: { assignedUserId: input.assignedUserId, updatedByUserId: session.user.id },
    });

    await tx.notification.updateMany({
      where: {
        storeId: session.user.storeId,
        entityType: { in: ["follow_up_overdue", "lead_no_continuity"] },
        entityId: card.id,
        userId: previousAssignedUserId,
        status: { in: ["NEW", "SEEN"] },
      },
      data: { userId: input.assignedUserId },
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
          notificationId: notification.id,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
          source: "notification",
        },
      },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "notifications",
        action: "notification_responsible_reassigned",
        entityType: "notification",
        entityId: notification.id,
        result: "SUCCESS",
        metadata: {
          targetEntityType: "lead_card",
          targetEntityId: card.id,
          leadId: card.leadId,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
        },
      },
    });
  });

  return {
    entityType: "lead_card",
    entityId: card.id,
    assignedUserId: input.assignedUserId,
    previousAssignedUserId,
    reason: input.reason,
    unchanged: false,
  };
}

async function reassignCommercialAppointmentFromNotification(
  session: NotificationSession,
  notification: NotificationRecord,
  input: NotificationReassignInput,
): Promise<NotificationReassignment> {
  const appointment = await prisma.commercialAppointment.findFirst({
    where: { id: notification.entityId ?? "", storeId: session.user.storeId },
  });
  if (!appointment) {
    throw new ApiError("NOT_FOUND", "Agendamento comercial nao encontrado.");
  }
  if (!reassignableCommercialAppointmentStatuses.has(appointment.status)) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento comercial nao pode ser reatribuido no status atual.", {
      status: appointment.status,
    });
  }

  const previousAssignedUserId = appointment.responsibleUserId;
  if (previousAssignedUserId === input.assignedUserId) {
    return {
      entityType: "commercial_appointment",
      entityId: appointment.id,
      assignedUserId: input.assignedUserId,
      previousAssignedUserId,
      reason: input.reason,
      unchanged: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.commercialAppointment.updateMany({
      where: { id: appointment.id, status: appointment.status },
      data: { responsibleUserId: input.assignedUserId },
    });
    if (changed.count !== 1) {
      throw new ApiError("CONFLICT", "Agendamento foi alterado por outra acao. Recarregue e tente novamente.");
    }

    await tx.notification.updateMany({
      where: {
        storeId: session.user.storeId,
        entityType: notification.entityType,
        entityId: appointment.id,
        userId: previousAssignedUserId,
        status: { in: ["NEW", "SEEN"] },
      },
      data: { userId: input.assignedUserId },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "commercial_appointments",
        action: "commercial_appointment_responsible_changed",
        entityType: "commercial_appointment",
        entityId: appointment.id,
        result: "SUCCESS",
        metadata: {
          notificationId: notification.id,
          cardId: appointment.cardId,
          leadId: appointment.leadId,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
          source: "notification",
        },
      },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "notifications",
        action: "notification_responsible_reassigned",
        entityType: "notification",
        entityId: notification.id,
        result: "SUCCESS",
        metadata: {
          targetEntityType: "commercial_appointment",
          targetEntityId: appointment.id,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
        },
      },
    });
  });

  return {
    entityType: "commercial_appointment",
    entityId: appointment.id,
    assignedUserId: input.assignedUserId,
    previousAssignedUserId,
    reason: input.reason,
    unchanged: false,
  };
}

async function reassignTechnicalDeliveryFromNotification(
  session: NotificationSession,
  notification: NotificationRecord,
  input: NotificationReassignInput,
): Promise<NotificationReassignment> {
  const delivery = await prisma.technicalDelivery.findFirst({
    where: { id: notification.entityId ?? "", storeId: session.user.storeId },
  });
  if (!delivery) {
    throw new ApiError("NOT_FOUND", "Entrega tecnica nao encontrada.");
  }
  if (terminalTechnicalDeliveryStatuses.has(delivery.status)) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Entrega tecnica nao pode ser reatribuida no status atual.", {
      status: delivery.status,
    });
  }

  const previousAssignedUserId = delivery.responsibleUserId;
  if (previousAssignedUserId === input.assignedUserId) {
    return {
      entityType: "technical_delivery",
      entityId: delivery.id,
      assignedUserId: input.assignedUserId,
      previousAssignedUserId,
      reason: input.reason,
      unchanged: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.technicalDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status },
      data: { responsibleUserId: input.assignedUserId },
    });
    if (changed.count !== 1) {
      throw new ApiError("CONFLICT", "Entrega tecnica foi alterada por outra acao. Recarregue e tente novamente.");
    }

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "technical_deliveries",
        action: "technical_delivery_responsible_changed",
        entityType: "technical_delivery",
        entityId: delivery.id,
        result: "SUCCESS",
        metadata: {
          notificationId: notification.id,
          saleId: delivery.saleId,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
          source: "notification",
        },
      },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "notifications",
        action: "notification_responsible_reassigned",
        entityType: "notification",
        entityId: notification.id,
        result: "SUCCESS",
        metadata: {
          targetEntityType: "technical_delivery",
          targetEntityId: delivery.id,
          saleId: delivery.saleId,
          fromUserId: previousAssignedUserId,
          toUserId: input.assignedUserId,
          reason: input.reason,
        },
      },
    });
  });

  return {
    entityType: "technical_delivery",
    entityId: delivery.id,
    assignedUserId: input.assignedUserId,
    previousAssignedUserId,
    reason: input.reason,
    unchanged: false,
  };
}

async function reassignNotificationTarget(
  session: NotificationSession,
  notification: NotificationRecord,
  input: NotificationReassignInput,
): Promise<NotificationReassignment> {
  assertReassignableNotification(notification);

  if (notification.entityType === "follow_up_overdue" || notification.entityType === "lead_no_continuity") {
    return reassignLeadCardFromNotification(session, notification, input);
  }
  if (notification.entityType === "commercial_appointment_scheduled") {
    return reassignCommercialAppointmentFromNotification(session, notification, input);
  }
  if (notification.entityType === "technical_delivery_scheduled" || notification.entityType === "technical_delivery_signed_copy_pending") {
    return reassignTechnicalDeliveryFromNotification(session, notification, input);
  }

  throw new ApiError("BUSINESS_RULE_ERROR", "Notificacao nao suporta reatribuicao de responsavel.", {
    entityType: notification.entityType,
  });
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requireAuth(request);
    const query = notificationsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.NotificationWhereInput = {
      storeId: session.user.storeId,
      ...notificationVisibilityWhere(session.user),
      ...(query.user_id ? { userId: query.user_id } : {}),
      ...(query.unread_only ? { readAt: null, status: { notIn: [...terminalNotificationStatuses] } } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.source_module ? { sourceModule: query.source_module } : {}),
      ...(query.created_from || query.created_to
        ? { createdAt: { ...(query.created_from ? { gte: query.created_from } : {}), ...(query.created_to ? { lte: query.created_to } : {}) } }
        : {}),
      ...(query.due_from || query.due_to
        ? { dueAt: { ...(query.due_from ? { gte: query.due_from } : {}), ...(query.due_to ? { lte: query.due_to } : {}) } }
        : {}),
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
        ...notificationVisibilityWhere(session.user),
        readAt: null,
        status: { notIn: [...terminalNotificationStatuses] },
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
          priority: input.priority,
          status: "NEW",
          sourceModule: input.sourceModule,
          actionUrl: input.actionUrl,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
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
          metadata: { userId: created.userId, entityType: created.entityType, entityId: created.entityId, priority: created.priority, status: created.status },
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
      payload: { userId: notification.userId, entityType: notification.entityType, entityId: notification.entityId, priority: notification.priority, status: notification.status },
    });

    return reply.code(201).send({ data: sanitizeNotification(notification) });
  });

  app.post("/:id/read", async (request) => {
    const session = await requireAuth(request);
    const params = notificationParamsSchema.parse(request.params);
    const current = await getNotificationOrThrow(session.user.storeId, session.user, params.id);
    const notification = await prisma.notification.update({
      where: { id: current.id },
      data: { readAt: current.readAt ?? new Date(), status: current.status === "NEW" ? "SEEN" : current.status },
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

  app.post("/:id/open", async (request) => {
    const session = await requireAuth(request);
    const params = notificationParamsSchema.parse(request.params);
    const current = await getNotificationOrThrow(session.user.storeId, session.user, params.id);
    if (!current.actionUrl) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Notificacao nao possui destino interno para abrir.");
    }

    const notification = await prisma.notification.update({
      where: { id: current.id },
      data: { readAt: current.readAt ?? new Date(), status: current.status === "NEW" ? "SEEN" : current.status },
    });

    await emitInternalEvent({
      name: "notification.read",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: { userId: notification.userId, opened: true, actionUrl: notification.actionUrl ?? "" },
    });

    return {
      data: sanitizeNotification(notification),
      target: {
        actionUrl: notification.actionUrl,
        entityType: notification.entityType,
        entityId: notification.entityId,
        sourceModule: notification.sourceModule,
      },
    };
  });

  app.post("/:id/reassign", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    if (!responsibleChangeRoles.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestor ou Administrador pode reatribuir responsavel pela notificacao.");
    }

    const params = notificationParamsSchema.parse(request.params);
    const input = reassignNotificationSchema.parse(request.body);
    const current = await getNotificationOrThrow(session.user.storeId, session.user, params.id);
    await ensureResponsibleInStore(session.user.storeId, input.assignedUserId);
    const reassignment = await reassignNotificationTarget(session, current, input);
    const notification = await prisma.notification.findUniqueOrThrow({ where: { id: current.id } });

    await emitInternalEvent({
      name: "notification.responsible_reassigned",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: {
        targetEntityType: reassignment.entityType,
        targetEntityId: reassignment.entityId,
        fromUserId: reassignment.previousAssignedUserId,
        toUserId: reassignment.assignedUserId,
        unchanged: reassignment.unchanged,
      },
    });

    return { data: sanitizeNotification(notification), reassignment };
  });

  app.post("/:id/resolve", async (request) => {
    const session = await requireAuth(request);
    const params = notificationParamsSchema.parse(request.params);
    const current = await getNotificationOrThrow(session.user.storeId, session.user, params.id);
    if (current.status === "DISMISSED") {
      throw new ApiError("CONFLICT", "Notificacao ignorada nao pode ser resolvida.");
    }

    const now = new Date();
    const notification = await prisma.notification.update({
      where: { id: current.id },
      data: {
        status: "RESOLVED",
        readAt: current.readAt ?? now,
        resolvedAt: current.resolvedAt ?? now,
        resolvedByUserId: current.resolvedByUserId ?? session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "notifications",
        action: "notification_resolved",
        entityType: "notification",
        entityId: notification.id,
        result: "SUCCESS",
        metadata: { userId: notification.userId, entityType: notification.entityType, entityId: notification.entityId },
      },
    });

    await emitInternalEvent({
      name: "notification.resolved",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: { userId: notification.userId },
    });

    return { data: sanitizeNotification(notification) };
  });

  app.post("/:id/dismiss", async (request) => {
    const session = await requireAuth(request);
    const params = notificationParamsSchema.parse(request.params);
    const input = dismissNotificationSchema.parse(request.body);
    const current = await getNotificationOrThrow(session.user.storeId, session.user, params.id);
    if (current.status === "RESOLVED") {
      throw new ApiError("CONFLICT", "Notificacao resolvida nao pode ser ignorada.");
    }

    const now = new Date();
    const notification = await prisma.notification.update({
      where: { id: current.id },
      data: {
        status: "DISMISSED",
        readAt: current.readAt ?? now,
        dismissedAt: current.dismissedAt ?? now,
        dismissedByUserId: current.dismissedByUserId ?? session.user.id,
        dismissedReason: input.reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "notifications",
        action: "notification_dismissed",
        entityType: "notification",
        entityId: notification.id,
        result: "SUCCESS",
        metadata: { userId: notification.userId, entityType: notification.entityType, entityId: notification.entityId, reason: input.reason },
      },
    });

    await emitInternalEvent({
      name: "notification.dismissed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "notification",
      entityId: notification.id,
      payload: { userId: notification.userId },
    });

    return { data: sanitizeNotification(notification) };
  });
}
