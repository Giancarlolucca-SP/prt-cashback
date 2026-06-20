import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requireAuth, type AuthenticatedContext } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const POST_SALE_ALERT_STATUSES = ["PENDING", "IN_CONTACT", "COMPLETED", "RESCHEDULED", "NO_CONTACT", "REASSIGNED", "CANCELLED_BY_RULE"] as const;
const POST_SALE_OPEN_STATUSES = ["PENDING", "IN_CONTACT", "RESCHEDULED", "REASSIGNED"] as const;
const POST_SALE_FULL_VIEW_ROLES = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);
const POST_SALE_ALLOWED_ROLES = new Set([...POST_SALE_FULL_VIEW_ROLES, "SELLER"]);
const POST_SALE_RESPONSIBLE_ROLES = ["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE", "SELLER"] as const;
const POST_SALE_MANAGEMENT_ROLES = ["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"] as const;
const POST_SALE_OPT_OUT_CHANNELS = ["ALL", "POST_SALE", "PHONE", "WHATSAPP", "EMAIL", "SMS"];

const alertStatusSchema = z.enum(POST_SALE_ALERT_STATUSES);
const contactChannelSchema = z.enum(["PHONE", "WHATSAPP", "IN_PERSON", "EMAIL", "OTHER"]);
const contactResultSchema = z.enum([
  "SPOKE_TO_CUSTOMER",
  "NO_ANSWER",
  "INVALID_NUMBER",
  "REQUESTED_CALLBACK",
  "NO_INTEREST",
  "INTERESTED_TRADE",
  "INTERESTED_PURCHASE",
  "CUSTOMER_SATISFIED",
  "OTHER",
]);

const alertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: alertStatusSchema.optional(),
  assigned_user_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  sale_id: z.string().uuid().optional(),
  overdue_only: z.coerce.boolean().default(false),
});

const alertParamsSchema = z.object({ id: z.string().uuid() });
const scanAlertsSchema = z.object({
  now: z.coerce.date().optional(),
  includeOverdue: z.boolean().default(true),
});

const reassignAlertSchema = z.object({
  assignedUserId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Motivo da reatribuicao") }),
});

const cancelAlertSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(8)
    .max(300)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Motivo do cancelamento") }),
});

const feedbackAlertSchema = z
  .object({
    contactAttemptedAt: z.coerce.date().optional(),
    contactChannel: contactChannelSchema,
    contactResult: contactResultSchema,
    feedbackNotes: z
      .string()
      .trim()
      .max(2000)
      .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Feedback pos-venda") })
      .optional(),
    nextActionAt: z.coerce.date().optional(),
  })
  .superRefine((value, ctx) => {
    const requiresNotes = value.contactResult === "OTHER" || value.contactResult === "INTERESTED_TRADE" || value.contactResult === "INTERESTED_PURCHASE";
    if (requiresNotes && !value.feedbackNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Observacao obrigatoria para outro resultado ou interesse em troca/compra.",
        path: ["feedbackNotes"],
      });
    }
  });

type AlertRecord = {
  id: string;
  storeId: string;
  customerId: string;
  saleId: string;
  vehicleId: string | null;
  purchaseDate: Date;
  triggerDate: Date;
  feedbackDueAt: Date;
  originalSellerUserId: string | null;
  assignedUserId: string | null;
  status: string;
  contactAttemptedAt: Date | null;
  contactChannel: string | null;
  contactResult: string | null;
  feedbackNotes: string | null;
  nextActionAt: Date | null;
  overdueNotificationId: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  reassignedFromUserId: string | null;
  reassignedAt: Date | null;
  reassignedByUserId: string | null;
  reassignedReason: string | null;
  createdByAutomation: boolean;
  createdByUserId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type AlertContext = {
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  vehicle: { id: string; label: string; plate: string | null } | null;
  originalSeller: { id: string; name: string; role: string } | null;
  assignedUser: { id: string; name: string; role: string } | null;
};

function isPostSaleFullView(role: string) {
  return POST_SALE_FULL_VIEW_ROLES.has(role);
}

function assertPostSaleRole(session: AuthenticatedContext) {
  if (!POST_SALE_ALLOWED_ROLES.has(session.user.role)) {
    throw new ApiError("FORBIDDEN", "Usuario sem acesso ao pos-venda.");
  }
}

function assertPostSaleFullView(session: AuthenticatedContext) {
  if (!isPostSaleFullView(session.user.role)) {
    throw new ApiError("FORBIDDEN", "Usuario sem permissao para gerir alertas de pos-venda.");
  }
}

async function requirePostSaleSession(request: FastifyRequest) {
  const session = await requireAuth(request);
  assertPostSaleRole(session);
  return session;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addYears(date: Date, years: number) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function vehicleLabel(vehicle: { brand: string; model: string; version: string | null; yearModel: number | null }) {
  return [vehicle.brand, vehicle.model, vehicle.version, vehicle.yearModel ? String(vehicle.yearModel) : null].filter(Boolean).join(" ");
}

function alertVisibilityWhere(user: { id: string; role: string }): Prisma.PostSaleAlertWhereInput {
  return isPostSaleFullView(user.role) ? {} : { assignedUserId: user.id };
}

async function getAlertOrThrow(input: {
  id: string;
  request: FastifyRequest;
  session: AuthenticatedContext;
  fullViewOverride?: boolean;
}) {
  const visibility = input.fullViewOverride ? {} : alertVisibilityWhere(input.session.user);
  const alert = await prisma.postSaleAlert.findFirst({
    where: {
      id: input.id,
      storeId: input.session.user.storeId,
      deletedAt: null,
      ...visibility,
    },
  });

  if (!alert && !input.fullViewOverride && !isPostSaleFullView(input.session.user.role)) {
    return denyOwnershipAccess({
      action: "read_post_sale_alert",
      entityId: input.id,
      entityType: "post_sale_alert",
      message: "Alerta pos-venda nao encontrado.",
      module: "post_sale",
      request: input.request,
      session: input.session,
    });
  }

  if (!alert) throw new ApiError("NOT_FOUND", "Alerta pos-venda nao encontrado.");
  return alert;
}

async function ensureResponsibleUser(storeId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null, role: { in: [...POST_SALE_RESPONSIBLE_ROLES] } },
    select: { id: true, name: true, role: true },
  });
  if (!user) throw new ApiError("NOT_FOUND", "Responsavel de pos-venda nao encontrado.");
  return user;
}

async function buildAlertContexts(storeId: string, alerts: AlertRecord[]) {
  const customerIds = [...new Set(alerts.map((alert) => alert.customerId))];
  const vehicleIds = [...new Set(alerts.map((alert) => alert.vehicleId).filter(Boolean) as string[])];
  const userIds = [
    ...new Set(
      alerts
        .flatMap((alert) => [alert.originalSellerUserId, alert.assignedUserId])
        .filter(Boolean) as string[],
    ),
  ];

  const [customers, vehicles, users] = await Promise.all([
    customerIds.length
      ? prisma.customer.findMany({ where: { storeId, id: { in: customerIds } }, select: { id: true, name: true, phone: true, email: true } })
      : [],
    vehicleIds.length
      ? prisma.vehicle.findMany({
          where: { storeId, id: { in: vehicleIds } },
          select: { id: true, brand: true, model: true, version: true, yearModel: true, plate: true },
        })
      : [],
    userIds.length ? prisma.user.findMany({ where: { storeId, id: { in: userIds } }, select: { id: true, name: true, role: true } }) : [],
  ]);

  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, { id: vehicle.id, label: vehicleLabel(vehicle), plate: vehicle.plate }]));
  const usersById = new Map(users.map((user) => [user.id, user]));

  return new Map<string, AlertContext>(
    alerts.map((alert) => [
      alert.id,
      {
        customer: customersById.get(alert.customerId) ?? null,
        vehicle: alert.vehicleId ? (vehiclesById.get(alert.vehicleId) ?? null) : null,
        originalSeller: alert.originalSellerUserId ? (usersById.get(alert.originalSellerUserId) ?? null) : null,
        assignedUser: alert.assignedUserId ? (usersById.get(alert.assignedUserId) ?? null) : null,
      },
    ]),
  );
}

function sanitizeAlert(alert: AlertRecord, context?: AlertContext | null) {
  return {
    id: alert.id,
    customerId: alert.customerId,
    saleId: alert.saleId,
    vehicleId: alert.vehicleId,
    purchaseDate: alert.purchaseDate.toISOString(),
    triggerDate: alert.triggerDate.toISOString(),
    feedbackDueAt: alert.feedbackDueAt.toISOString(),
    originalSellerUserId: alert.originalSellerUserId,
    assignedUserId: alert.assignedUserId,
    status: alert.status,
    contactAttemptedAt: alert.contactAttemptedAt?.toISOString() ?? null,
    contactChannel: alert.contactChannel,
    contactResult: alert.contactResult,
    feedbackNotes: alert.feedbackNotes,
    nextActionAt: alert.nextActionAt?.toISOString() ?? null,
    overdueNotificationId: alert.overdueNotificationId,
    closedAt: alert.closedAt?.toISOString() ?? null,
    closedByUserId: alert.closedByUserId,
    reassignedFromUserId: alert.reassignedFromUserId,
    reassignedAt: alert.reassignedAt?.toISOString() ?? null,
    reassignedByUserId: alert.reassignedByUserId,
    reassignedReason: alert.reassignedReason,
    createdByAutomation: alert.createdByAutomation,
    createdByUserId: alert.createdByUserId,
    createdAt: alert.createdAt.toISOString(),
    updatedAt: alert.updatedAt.toISOString(),
    context: context ?? null,
    objective: "Saber como esta o veiculo, identificar necessidade de troca ou nova compra.",
  };
}

async function hasPostSaleOptOut(tx: Prisma.TransactionClient, storeId: string, customerId: string) {
  const preference = await tx.privacyPreference.findFirst({
    where: {
      storeId,
      customerId,
      allowed: false,
      channel: { in: POST_SALE_OPT_OUT_CHANNELS },
    },
    select: { id: true },
  });
  return Boolean(preference);
}

async function ensureNotification(
  tx: Prisma.TransactionClient,
  input: {
    actionUrl: string;
    body: string;
    dueAt?: Date;
    entityId: string;
    entityType: string;
    priority: "MEDIUM" | "HIGH" | "CRITICAL";
    sourceModule: string;
    storeId: string;
    title: string;
    userId: string;
  },
) {
  const active = await tx.notification.findFirst({
    where: {
      storeId: input.storeId,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      status: { in: ["NEW", "SEEN"] },
    },
    select: { id: true },
  });
  if (active) return active;

  return tx.notification.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      priority: input.priority,
      sourceModule: input.sourceModule,
      actionUrl: input.actionUrl,
      dueAt: input.dueAt,
    },
    select: { id: true },
  });
}

async function resolveActiveAlertNotifications(tx: Prisma.TransactionClient, input: { alertId: string; actorId: string; storeId: string }) {
  await tx.notification.updateMany({
    where: {
      storeId: input.storeId,
      entityId: input.alertId,
      entityType: { in: ["post_sale_alert_assigned", "post_sale_alert_overdue"] },
      status: { in: ["NEW", "SEEN"] },
    },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByUserId: input.actorId },
  });
}

async function createPostSaleAlerts(input: { actorId: string; actorRole: string; now: Date; storeId: string }) {
  const cutoff = addYears(input.now, -2);
  const saleCandidates = await prisma.sale.findMany({
    where: {
      storeId: input.storeId,
      deletedAt: null,
      customerId: { not: null },
      closedAt: { not: null, lte: cutoff },
      status: { in: ["DOCUMENTATION", "CLOSED"] },
    },
    orderBy: { closedAt: "asc" },
    select: { id: true, customerId: true, vehicleId: true, sellerUserId: true, closedAt: true },
  });

  const result = {
    candidates: saleCandidates.length,
    created: 0,
    duplicated: 0,
    skippedByRule: 0,
    alerts: [] as AlertRecord[],
  };

  await prisma.$transaction(async (tx) => {
    for (const sale of saleCandidates) {
      if (!sale.customerId || !sale.closedAt) {
        result.skippedByRule += 1;
        continue;
      }

      const customer = await tx.customer.findFirst({
        where: { id: sale.customerId, storeId: input.storeId, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      if (!customer) {
        result.skippedByRule += 1;
        continue;
      }

      const blockedByOptOut = await hasPostSaleOptOut(tx, input.storeId, customer.id);
      if (blockedByOptOut) {
        result.skippedByRule += 1;
        continue;
      }

      const triggerDate = addYears(sale.closedAt, 2);
      if (triggerDate > input.now) {
        result.skippedByRule += 1;
        continue;
      }

      const existing = await tx.postSaleAlert.findUnique({
        where: { storeId_saleId_triggerDate: { storeId: input.storeId, saleId: sale.id, triggerDate } },
      });
      if (existing) {
        result.duplicated += 1;
        continue;
      }

      const seller = sale.sellerUserId
        ? await tx.user.findFirst({
            where: {
              id: sale.sellerUserId,
              storeId: input.storeId,
              isActive: true,
              deletedAt: null,
              role: { in: [...POST_SALE_RESPONSIBLE_ROLES] },
            },
            select: { id: true, name: true },
          })
        : null;

      const alert = await tx.postSaleAlert.create({
        data: {
          storeId: input.storeId,
          customerId: customer.id,
          saleId: sale.id,
          vehicleId: sale.vehicleId,
          purchaseDate: sale.closedAt,
          triggerDate,
          feedbackDueAt: addDays(triggerDate, 7),
          originalSellerUserId: sale.sellerUserId,
          assignedUserId: seller?.id ?? null,
          status: "PENDING",
          createdByAutomation: true,
          createdByUserId: input.actorId,
          metadata: { source: "post_sale_two_year_scan" },
        },
      });

      await tx.postSaleAlertEvent.create({
        data: {
          storeId: input.storeId,
          postSaleAlertId: alert.id,
          customerId: alert.customerId,
          saleId: alert.saleId,
          eventType: "alert_created",
          actorUserId: input.actorId,
          toStatus: alert.status,
          toAssignedUserId: alert.assignedUserId,
          payload: { triggerDate: triggerDate.toISOString(), purchaseDate: sale.closedAt.toISOString() },
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: input.storeId,
          customerId: customer.id,
          type: "post_sale_alert_created",
          title: "Alerta pos-venda de 2 anos gerado",
          description: "Contato de relacionamento apos 2 anos da compra.",
          metadata: { alertId: alert.id, saleId: sale.id, vehicleId: sale.vehicleId, assignedUserId: alert.assignedUserId },
          occurredAt: input.now,
        },
      });

      if (alert.assignedUserId) {
        await ensureNotification(tx, {
          actionUrl: `/post-sale/alerts/${alert.id}`,
          body: `${customer.name} completou 2 anos desde a compra. Registre o contato em ate 7 dias.`,
          dueAt: alert.feedbackDueAt,
          entityId: alert.id,
          entityType: "post_sale_alert_assigned",
          priority: "HIGH",
          sourceModule: "post_sale",
          storeId: input.storeId,
          title: "Alerta pos-venda de 2 anos",
          userId: alert.assignedUserId,
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: input.storeId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          module: "post_sale",
          action: "post_sale_alert_created",
          entityType: "post_sale_alert",
          entityId: alert.id,
          result: "SUCCESS",
          metadata: { saleId: alert.saleId, customerId: alert.customerId, assignedUserId: alert.assignedUserId },
        },
      });

      result.created += 1;
      result.alerts.push(alert);
    }
  });

  return result;
}

async function createOverdueNotifications(input: { actorId: string; now: Date; storeId: string }) {
  const alerts = await prisma.postSaleAlert.findMany({
    where: {
      storeId: input.storeId,
      deletedAt: null,
      closedAt: null,
      status: { in: [...POST_SALE_OPEN_STATUSES] },
      feedbackDueAt: { lt: input.now },
    },
    orderBy: { feedbackDueAt: "asc" },
  });

  const result = { overdueAlerts: alerts.length, notificationsCreated: 0 };
  if (!alerts.length) return result;

  await prisma.$transaction(async (tx) => {
    const managers = await tx.user.findMany({
      where: { storeId: input.storeId, isActive: true, deletedAt: null, role: { in: [...POST_SALE_MANAGEMENT_ROLES] } },
      select: { id: true },
    });

    for (const alert of alerts) {
      const [customer, assignedUser] = await Promise.all([
        tx.customer.findFirst({ where: { id: alert.customerId, storeId: input.storeId }, select: { name: true } }),
        alert.assignedUserId ? tx.user.findFirst({ where: { id: alert.assignedUserId, storeId: input.storeId }, select: { name: true } }) : null,
      ]);
      let firstNotificationId: string | null = alert.overdueNotificationId;
      for (const manager of managers) {
        const before = await tx.notification.findFirst({
          where: {
            storeId: input.storeId,
            userId: manager.id,
            entityType: "post_sale_alert_overdue",
            entityId: alert.id,
            status: { in: ["NEW", "SEEN"] },
          },
          select: { id: true },
        });
        const notification = await ensureNotification(tx, {
          actionUrl: `/post-sale/alerts/${alert.id}`,
          body: `Responsavel: ${assignedUser?.name ?? "sem responsavel"}. Cliente: ${customer?.name ?? "cliente"}.`,
          dueAt: alert.feedbackDueAt,
          entityId: alert.id,
          entityType: "post_sale_alert_overdue",
          priority: "CRITICAL",
          sourceModule: "post_sale",
          storeId: input.storeId,
          title: "Feedback pos-venda atrasado",
          userId: manager.id,
        });
        if (!before) result.notificationsCreated += 1;
        firstNotificationId ??= notification.id;
      }

      if (firstNotificationId && firstNotificationId !== alert.overdueNotificationId) {
        await tx.postSaleAlert.update({ where: { id: alert.id }, data: { overdueNotificationId: firstNotificationId } });
      }
    }
  });

  return result;
}

function feedbackStatus(input: z.infer<typeof feedbackAlertSchema>) {
  if (input.nextActionAt) return "RESCHEDULED";
  if (input.contactResult === "NO_ANSWER" || input.contactResult === "INVALID_NUMBER") return "NO_CONTACT";
  return "COMPLETED";
}

function commercialLeadPreparation(input: { alert: AlertRecord; feedback: z.infer<typeof feedbackAlertSchema> }) {
  if (input.feedback.contactResult !== "INTERESTED_TRADE" && input.feedback.contactResult !== "INTERESTED_PURCHASE") return null;
  return {
    source: "post_sale_alert",
    customerId: input.alert.customerId,
    saleId: input.alert.saleId,
    postSaleAlertId: input.alert.id,
    suggestedTitle: input.feedback.contactResult === "INTERESTED_TRADE" ? "Interesse em troca no pos-venda" : "Interesse em nova compra no pos-venda",
  };
}

export async function registerPostSaleRoutes(app: FastifyInstance) {
  app.post("/alerts/scan", async (request) => {
    const session = await requirePostSaleSession(request);
    assertPostSaleFullView(session);
    const input = scanAlertsSchema.parse(request.body ?? {});
    const now = input.now ?? new Date();
    const created = await createPostSaleAlerts({ actorId: session.user.id, actorRole: session.user.role, now, storeId: session.user.storeId });
    const overdue = input.includeOverdue ? await createOverdueNotifications({ actorId: session.user.id, now, storeId: session.user.storeId }) : { overdueAlerts: 0, notificationsCreated: 0 };
    const contexts = await buildAlertContexts(session.user.storeId, created.alerts);
    return {
      data: {
        candidates: created.candidates,
        alertsCreated: created.created,
        duplicated: created.duplicated,
        skippedByRule: created.skippedByRule,
        overdueAlerts: overdue.overdueAlerts,
        overdueNotificationsCreated: overdue.notificationsCreated,
        alerts: created.alerts.map((alert) => sanitizeAlert(alert, contexts.get(alert.id))),
      },
    };
  });

  app.get("/alerts", async (request) => {
    const session = await requirePostSaleSession(request);
    const query = alertsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.PostSaleAlertWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...alertVisibilityWhere(session.user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigned_user_id ? { assignedUserId: query.assigned_user_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.overdue_only ? { closedAt: null, status: { in: [...POST_SALE_OPEN_STATUSES] }, feedbackDueAt: { lt: new Date() } } : {}),
    };
    const [alerts, total] = await Promise.all([
      prisma.postSaleAlert.findMany({ where, orderBy: [{ feedbackDueAt: "asc" }, { createdAt: "desc" }], skip, take }),
      prisma.postSaleAlert.count({ where }),
    ]);
    const contexts = await buildAlertContexts(session.user.storeId, alerts);
    return listResponse(alerts.map((alert) => sanitizeAlert(alert, contexts.get(alert.id))), query, total);
  });

  app.get("/alerts/:id", async (request) => {
    const session = await requirePostSaleSession(request);
    const params = alertParamsSchema.parse(request.params);
    const alert = await getAlertOrThrow({ id: params.id, request, session });
    const contexts = await buildAlertContexts(session.user.storeId, [alert]);
    return { data: sanitizeAlert(alert, contexts.get(alert.id)) };
  });

  app.get("/alerts/:id/events", async (request) => {
    const session = await requirePostSaleSession(request);
    const params = alertParamsSchema.parse(request.params);
    const alert = await getAlertOrThrow({ id: params.id, request, session });
    const events = await prisma.postSaleAlertEvent.findMany({
      where: { storeId: session.user.storeId, postSaleAlertId: alert.id },
      orderBy: { occurredAt: "desc" },
    });
    return {
      items: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        actorUserId: event.actorUserId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        fromAssignedUserId: event.fromAssignedUserId,
        toAssignedUserId: event.toAssignedUserId,
        payload: event.payload,
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      })),
    };
  });

  app.post("/alerts/:id/reassign", async (request) => {
    const session = await requirePostSaleSession(request);
    assertPostSaleFullView(session);
    const params = alertParamsSchema.parse(request.params);
    const input = reassignAlertSchema.parse(request.body);
    const current = await getAlertOrThrow({ id: params.id, request, session, fullViewOverride: true });
    const responsible = await ensureResponsibleUser(session.user.storeId, input.assignedUserId);
    const previousAssignedUserId = current.assignedUserId;
    const updated = await prisma.$transaction(async (tx) => {
      const alert = await tx.postSaleAlert.update({
        where: { id: current.id },
        data: {
          assignedUserId: responsible.id,
          reassignedFromUserId: previousAssignedUserId,
          reassignedAt: new Date(),
          reassignedByUserId: session.user.id,
          reassignedReason: input.reason,
          status: "REASSIGNED",
        },
      });

      await tx.postSaleAlertEvent.create({
        data: {
          storeId: session.user.storeId,
          postSaleAlertId: alert.id,
          customerId: alert.customerId,
          saleId: alert.saleId,
          eventType: "alert_reassigned",
          actorUserId: session.user.id,
          fromStatus: current.status,
          toStatus: alert.status,
          fromAssignedUserId: previousAssignedUserId,
          toAssignedUserId: responsible.id,
          payload: { reason: input.reason },
        },
      });

      if (previousAssignedUserId) {
        await tx.userResponsibilityTransfer.create({
          data: {
            storeId: session.user.storeId,
            fromUserId: previousAssignedUserId,
            toUserId: responsible.id,
            entityType: "post_sale_alert",
            entityId: alert.id,
            reason: input.reason,
            transferredBy: session.user.id,
          },
        });
      }

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: alert.customerId,
          type: "post_sale_alert_reassigned",
          title: "Alerta pos-venda reatribuido",
          description: input.reason,
          metadata: { alertId: alert.id, fromUserId: previousAssignedUserId, toUserId: responsible.id },
        },
      });

      await resolveActiveAlertNotifications(tx, { alertId: alert.id, actorId: session.user.id, storeId: session.user.storeId });
      await ensureNotification(tx, {
        actionUrl: `/post-sale/alerts/${alert.id}`,
        body: "Voce recebeu um alerta de relacionamento pos-venda.",
        dueAt: alert.feedbackDueAt,
        entityId: alert.id,
        entityType: "post_sale_alert_assigned",
        priority: "HIGH",
        sourceModule: "post_sale",
        storeId: session.user.storeId,
        title: "Alerta pos-venda reatribuido",
        userId: responsible.id,
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "post_sale",
          action: "post_sale_alert_reassigned",
          entityType: "post_sale_alert",
          entityId: alert.id,
          result: "SUCCESS",
          metadata: { fromUserId: previousAssignedUserId, toUserId: responsible.id, reason: input.reason },
        },
      });

      return alert;
    });

    const contexts = await buildAlertContexts(session.user.storeId, [updated]);
    return { data: sanitizeAlert(updated, contexts.get(updated.id)) };
  });

  app.post("/alerts/:id/cancel", async (request) => {
    const session = await requirePostSaleSession(request);
    assertPostSaleFullView(session);
    const params = alertParamsSchema.parse(request.params);
    const input = cancelAlertSchema.parse(request.body);
    const current = await getAlertOrThrow({ id: params.id, request, session, fullViewOverride: true });
    const updated = await prisma.$transaction(async (tx) => {
      const alert = await tx.postSaleAlert.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED_BY_RULE",
          closedAt: new Date(),
          closedByUserId: session.user.id,
          metadata: { cancelledReason: input.reason },
        },
      });

      await tx.postSaleAlertEvent.create({
        data: {
          storeId: session.user.storeId,
          postSaleAlertId: alert.id,
          customerId: alert.customerId,
          saleId: alert.saleId,
          eventType: "alert_cancelled_by_rule",
          actorUserId: session.user.id,
          fromStatus: current.status,
          toStatus: alert.status,
          payload: { reason: input.reason },
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: alert.customerId,
          type: "post_sale_alert_cancelled",
          title: "Alerta pos-venda cancelado por regra",
          description: input.reason,
          metadata: { alertId: alert.id, saleId: alert.saleId },
        },
      });

      await resolveActiveAlertNotifications(tx, { alertId: alert.id, actorId: session.user.id, storeId: session.user.storeId });
      return alert;
    });
    const contexts = await buildAlertContexts(session.user.storeId, [updated]);
    return { data: sanitizeAlert(updated, contexts.get(updated.id)) };
  });

  app.post("/alerts/:id/feedback", async (request) => {
    const session = await requirePostSaleSession(request);
    const params = alertParamsSchema.parse(request.params);
    const input = feedbackAlertSchema.parse(request.body);
    const current = await getAlertOrThrow({ id: params.id, request, session });
    if (current.closedAt || current.status === "CANCELLED_BY_RULE") {
      throw new ApiError("BUSINESS_RULE_ERROR", "Alerta pos-venda ja encerrado.");
    }

    const nextStatus = feedbackStatus(input);
    const attemptedAt = input.contactAttemptedAt ?? new Date();
    const preparation = commercialLeadPreparation({ alert: current, feedback: input });

    const updated = await prisma.$transaction(async (tx) => {
      const alert = await tx.postSaleAlert.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          contactAttemptedAt: attemptedAt,
          contactChannel: input.contactChannel,
          contactResult: input.contactResult,
          feedbackNotes: input.feedbackNotes,
          nextActionAt: input.nextActionAt,
          closedAt: nextStatus === "RESCHEDULED" ? null : new Date(),
          closedByUserId: nextStatus === "RESCHEDULED" ? null : session.user.id,
          metadata: {
            commercialLeadPreparation: preparation,
          },
        },
      });

      await tx.postSaleAlertEvent.create({
        data: {
          storeId: session.user.storeId,
          postSaleAlertId: alert.id,
          customerId: alert.customerId,
          saleId: alert.saleId,
          eventType: "feedback_recorded",
          actorUserId: session.user.id,
          fromStatus: current.status,
          toStatus: alert.status,
          payload: {
            contactAttemptedAt: attemptedAt.toISOString(),
            contactChannel: input.contactChannel,
            contactResult: input.contactResult,
            nextActionAt: input.nextActionAt?.toISOString() ?? null,
            hasCommercialLeadPreparation: Boolean(preparation),
          },
        },
      });

      await tx.customerInteraction.create({
        data: {
          storeId: session.user.storeId,
          customerId: alert.customerId,
          channel: input.contactChannel,
          summary: input.feedbackNotes ?? input.contactResult,
          entityType: "post_sale_alert",
          entityId: alert.id,
          occurredAt: attemptedAt,
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: alert.customerId,
          type: "post_sale_feedback_recorded",
          title: "Feedback pos-venda registrado",
          description: input.feedbackNotes ?? input.contactResult,
          metadata: {
            alertId: alert.id,
            saleId: alert.saleId,
            vehicleId: alert.vehicleId,
            contactChannel: input.contactChannel,
            contactResult: input.contactResult,
            nextActionAt: input.nextActionAt?.toISOString() ?? null,
            commercialLeadPreparation: preparation,
          },
          occurredAt: attemptedAt,
        },
      });

      await resolveActiveAlertNotifications(tx, { alertId: alert.id, actorId: session.user.id, storeId: session.user.storeId });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "post_sale",
          action: "post_sale_feedback_recorded",
          entityType: "post_sale_alert",
          entityId: alert.id,
          result: "SUCCESS",
          metadata: { contactChannel: input.contactChannel, contactResult: input.contactResult, nextStatus },
        },
      });

      return alert;
    });

    const contexts = await buildAlertContexts(session.user.storeId, [updated]);
    return { data: sanitizeAlert(updated, contexts.get(updated.id)), commercialLeadPreparation: preparation };
  });
}
