import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requireAuth, type AuthenticatedContext } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import { COMMERCIAL_BOARD_KEY } from "../services/commercial-kanban.js";

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
  "VEHICLE_PROBLEM",
  "CUSTOMER_SATISFIED",
  "OTHER",
]);
const issueSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const interestTypeSchema = z.enum(["NONE", "TRADE", "PURCHASE_OTHER", "NOT_INFORMED"]);

const alertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: alertStatusSchema.optional(),
  assigned_user_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  sale_id: z.string().uuid().optional(),
  overdue_only: z.coerce.boolean().default(false),
});

const feedbacksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  contact_result: contactResultSchema.optional(),
  contact_channel: contactChannelSchema.optional(),
  interest_type: interestTypeSchema.optional(),
  customer_id: z.string().uuid().optional(),
  sale_id: z.string().uuid().optional(),
  created_card_only: z.coerce.boolean().default(false),
  internal_issue_only: z.coerce.boolean().default(false),
});

const internalIssuesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().max(80).optional(),
  severity: issueSeveritySchema.optional(),
  customer_id: z.string().uuid().optional(),
  sale_id: z.string().uuid().optional(),
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

const feedbackAlertBaseSchema = z.object({
  contactAttemptedAt: z.coerce.date().optional(),
  contactChannel: contactChannelSchema,
  contactResult: contactResultSchema,
  feedbackNotes: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Feedback pos-venda") })
    .optional(),
  vehicleInterestId: z.string().uuid().optional(),
  vehicleInterestNotes: z
    .string()
    .trim()
    .max(300)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Veiculo de interesse") })
    .optional(),
  nextAction: z
    .string()
    .trim()
    .max(160)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Proxima acao") })
    .optional(),
  nextActionAt: z.coerce.date().optional(),
  createCommercialCard: z.boolean().default(false),
  responsibleUserId: z.string().uuid().optional(),
  createInternalIssue: z.boolean().default(true),
  issueSeverity: issueSeveritySchema.default("MEDIUM"),
  issueResponsibleUserId: z.string().uuid().optional(),
});

function validateFeedbackConsistency(
  value: {
    contactChannel?: z.infer<typeof contactChannelSchema>;
    contactResult?: z.infer<typeof contactResultSchema>;
    createCommercialCard?: boolean;
    feedbackNotes?: string;
  },
  ctx: z.RefinementCtx,
) {
    const requiresNotes =
      value.contactChannel === "OTHER" ||
      value.contactResult === "OTHER" ||
      value.contactResult === "INTERESTED_TRADE" ||
      value.contactResult === "INTERESTED_PURCHASE" ||
      value.contactResult === "VEHICLE_PROBLEM";
    if (requiresNotes && !value.feedbackNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Observacao obrigatoria para canal outro, problema, outro resultado ou interesse em troca/compra.",
        path: ["feedbackNotes"],
      });
    }
    const hasPurchaseInterest = value.contactResult === "INTERESTED_TRADE" || value.contactResult === "INTERESTED_PURCHASE";
    if (value.createCommercialCard && !hasPurchaseInterest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Card comercial so pode ser criado quando houver interesse em troca ou compra.",
        path: ["createCommercialCard"],
      });
    }
}

const feedbackAlertSchema = feedbackAlertBaseSchema.superRefine(validateFeedbackConsistency);

const feedbackUpdateSchema = feedbackAlertBaseSchema.partial().extend({
  updateReason: z
    .string()
    .trim()
    .max(300)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Motivo da alteracao") })
    .optional(),
}).superRefine(validateFeedbackConsistency);

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
type FeedbackInput = z.infer<typeof feedbackAlertSchema>;
type FeedbackUpdateInput = z.infer<typeof feedbackUpdateSchema>;
type FeedbackRecord = Prisma.PostSaleFeedbackGetPayload<{}>;
type InternalIssueRecord = Prisma.PostSaleInternalIssueGetPayload<{}>;

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

async function ensureVehicleInterest(storeId: string, vehicleId?: string | null) {
  if (!vehicleId) return;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, storeId, deletedAt: null }, select: { id: true } });
  if (!vehicle) throw new ApiError("NOT_FOUND", "Veiculo de interesse nao encontrado.");
}

function feedbackVisibilityWhere(user: { id: string; role: string }): Prisma.PostSaleFeedbackWhereInput {
  return isPostSaleFullView(user.role) ? {} : { OR: [{ assignedUserId: user.id }, { createdByUserId: user.id }] };
}

function interestTypeFromResult(result: string) {
  if (result === "INTERESTED_TRADE") return "TRADE";
  if (result === "INTERESTED_PURCHASE") return "PURCHASE_OTHER";
  return "NONE";
}

function hasPurchaseInterest(result: string) {
  return result === "INTERESTED_TRADE" || result === "INTERESTED_PURCHASE";
}

function commercialLeadPreparation(input: { alert: AlertRecord; feedback: Pick<FeedbackInput, "contactResult" | "vehicleInterestId" | "vehicleInterestNotes" | "responsibleUserId"> }) {
  if (!hasPurchaseInterest(input.feedback.contactResult)) return null;
  return {
    source: "post_sale_alert",
    customerId: input.alert.customerId,
    saleId: input.alert.saleId,
    originalVehicleId: input.alert.vehicleId,
    vehicleInterestId: input.feedback.vehicleInterestId ?? null,
    vehicleInterestNotes: input.feedback.vehicleInterestNotes ?? null,
    postSaleAlertId: input.alert.id,
    responsibleUserId: input.feedback.responsibleUserId ?? input.alert.assignedUserId,
    suggestedTitle: input.feedback.contactResult === "INTERESTED_TRADE" ? "Interesse em troca no pos-venda" : "Interesse em nova compra no pos-venda",
  };
}

async function createCommercialCardFromFeedback(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    actorRole: string;
    alert: AlertRecord;
    contactAt: Date;
    feedback: FeedbackInput;
    feedbackId: string;
    storeId: string;
  },
) {
  const customer = await tx.customer.findFirst({
    where: { id: input.alert.customerId, storeId: input.storeId, deletedAt: null },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente do feedback nao encontrado.");

  const responsibleUserId = input.feedback.responsibleUserId ?? input.alert.assignedUserId ?? input.actorId;
  const now = new Date();
  const lead = await tx.lead.create({
    data: {
      storeId: input.storeId,
      customerId: customer.id,
      assignedUserId: responsibleUserId,
      vehicleId: input.feedback.vehicleInterestId,
      source: "post_sale_2_years",
      title: `Pos-venda 2 anos - ${customer.name}`,
      status: "NEW",
      interest: interestTypeFromResult(input.feedback.contactResult),
      channel: input.feedback.contactChannel,
      contactedAt: input.contactAt,
      lastInteractionAt: input.contactAt,
      lastInteractionType: "POST_SALE_FEEDBACK",
      lastInteractionResult: input.feedback.contactResult,
      nextActionAt: input.feedback.nextActionAt,
      nextActionType: input.feedback.nextAction,
      createdByUserId: input.actorId,
      updatedByUserId: input.actorId,
    },
  });

  const card = await tx.leadCard.create({
    data: {
      storeId: input.storeId,
      leadId: lead.id,
      boardKey: COMMERCIAL_BOARD_KEY,
      stageKey: "NEW_LEAD",
      position: 0,
      stageEnteredAt: now,
      metadata: {
        origin: "post_sale_2_years",
        postSaleAlertId: input.alert.id,
        postSaleFeedbackId: input.feedbackId,
        saleId: input.alert.saleId,
        originalVehicleId: input.alert.vehicleId,
        vehicleInterestId: input.feedback.vehicleInterestId ?? null,
        vehicleInterestNotes: input.feedback.vehicleInterestNotes ?? null,
      },
    },
  });

  await tx.leadStageHistory.create({
    data: {
      storeId: input.storeId,
      leadId: lead.id,
      fromStage: null,
      toStage: "NEW_LEAD",
      actorUserId: input.actorId,
      reason: "Card criado a partir de feedback pos-venda",
    },
  });

  await tx.commercialInteraction.create({
    data: {
      storeId: input.storeId,
      cardId: card.id,
      leadId: lead.id,
      customerId: customer.id,
      vehicleId: input.feedback.vehicleInterestId ?? input.alert.vehicleId,
      vehicleInterest: {
        vehicleInterestId: input.feedback.vehicleInterestId ?? null,
        vehicleInterestNotes: input.feedback.vehicleInterestNotes ?? null,
      },
      responsibleUserId,
      interactionType: "POST_SALE_FEEDBACK",
      channel: input.feedback.contactChannel,
      result: input.feedback.contactResult,
      notes: input.feedback.feedbackNotes,
      occurredAt: input.contactAt,
      nextActionType: input.feedback.nextAction,
      nextActionAt: input.feedback.nextActionAt,
      nextActionOwnerId: responsibleUserId,
      nextActionStatus: input.feedback.nextActionAt ? "PENDING" : null,
      createdByUserId: input.actorId,
    },
  });

  await tx.auditLog.create({
    data: {
      storeId: input.storeId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      module: "leads",
      action: "commercial_card_created_from_post_sale_feedback",
      entityType: "lead_card",
      entityId: card.id,
      result: "SUCCESS",
      metadata: {
        leadId: lead.id,
        postSaleAlertId: input.alert.id,
        postSaleFeedbackId: input.feedbackId,
        saleId: input.alert.saleId,
        customerId: customer.id,
        assignedUserId: responsibleUserId,
      },
    },
  });

  return { card, lead };
}

async function createInternalIssueFromFeedback(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    actorRole: string;
    alert: AlertRecord;
    feedback: FeedbackInput;
    feedbackId: string;
    storeId: string;
  },
) {
  const issue = await tx.postSaleInternalIssue.create({
    data: {
      storeId: input.storeId,
      postSaleFeedbackId: input.feedbackId,
      postSaleAlertId: input.alert.id,
      customerId: input.alert.customerId,
      saleId: input.alert.saleId,
      vehicleId: input.alert.vehicleId,
      issueType: "VEHICLE_PROBLEM",
      severity: input.feedback.issueSeverity,
      status: "PENDING_REVIEW",
      description: input.feedback.feedbackNotes ?? "Problema relatado no contato pos-venda.",
      responsibleUserId: input.feedback.issueResponsibleUserId,
      createdByUserId: input.actorId,
      metadata: {
        contactChannel: input.feedback.contactChannel,
        contactResult: input.feedback.contactResult,
        postSaleAlertId: input.alert.id,
      },
    },
  });

  const managers = await tx.user.findMany({
    where: { storeId: input.storeId, isActive: true, deletedAt: null, role: { in: [...POST_SALE_MANAGEMENT_ROLES] } },
    select: { id: true },
  });
  for (const manager of managers) {
    await ensureNotification(tx, {
      actionUrl: `/post-sale/internal-issues/${issue.id}`,
      body: "Cliente relatou problema no contato pos-venda. Avaliar atendimento interno separado do fluxo comercial.",
      entityId: issue.id,
      entityType: "post_sale_internal_issue",
      priority: input.feedback.issueSeverity === "CRITICAL" || input.feedback.issueSeverity === "HIGH" ? "CRITICAL" : "HIGH",
      sourceModule: "post_sale",
      storeId: input.storeId,
      title: "Pendencia interna de pos-venda",
      userId: manager.id,
    });
  }

  await tx.auditLog.create({
    data: {
      storeId: input.storeId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      module: "post_sale",
      action: "post_sale_internal_issue_created",
      entityType: "post_sale_internal_issue",
      entityId: issue.id,
      result: "SUCCESS",
      metadata: {
        postSaleAlertId: input.alert.id,
        postSaleFeedbackId: input.feedbackId,
        customerId: input.alert.customerId,
        saleId: input.alert.saleId,
        severity: issue.severity,
      },
    },
  });

  return issue;
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

function sanitizeFeedback(feedback: FeedbackRecord) {
  return {
    id: feedback.id,
    postSaleAlertId: feedback.postSaleAlertId,
    customerId: feedback.customerId,
    saleId: feedback.saleId,
    vehicleId: feedback.vehicleId,
    originalSellerUserId: feedback.originalSellerUserId,
    assignedUserId: feedback.assignedUserId,
    contactAt: feedback.contactAt.toISOString(),
    contactChannel: feedback.contactChannel,
    contactResult: feedback.contactResult,
    feedbackNotes: feedback.feedbackNotes,
    hasPurchaseInterest: feedback.hasPurchaseInterest,
    interestType: feedback.interestType,
    vehicleInterestId: feedback.vehicleInterestId,
    vehicleInterestNotes: feedback.vehicleInterestNotes,
    nextAction: feedback.nextAction,
    nextActionAt: feedback.nextActionAt?.toISOString() ?? null,
    createdLeadId: feedback.createdLeadId,
    createdCardId: feedback.createdCardId,
    createdInternalIssueId: feedback.createdInternalIssueId,
    createdByUserId: feedback.createdByUserId,
    updatedByUserId: feedback.updatedByUserId,
    auditLogId: feedback.auditLogId,
    metadata: feedback.metadata,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}

function sanitizeInternalIssue(issue: InternalIssueRecord) {
  return {
    id: issue.id,
    postSaleFeedbackId: issue.postSaleFeedbackId,
    postSaleAlertId: issue.postSaleAlertId,
    customerId: issue.customerId,
    saleId: issue.saleId,
    vehicleId: issue.vehicleId,
    issueType: issue.issueType,
    severity: issue.severity,
    status: issue.status,
    description: issue.description,
    responsibleUserId: issue.responsibleUserId,
    createdByUserId: issue.createdByUserId,
    updatedByUserId: issue.updatedByUserId,
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: issue.resolvedByUserId,
    metadata: issue.metadata,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
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

export async function registerPostSaleRoutes(app: FastifyInstance) {
  app.get("/feedbacks", async (request) => {
    const session = await requirePostSaleSession(request);
    const query = feedbacksQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.PostSaleFeedbackWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...feedbackVisibilityWhere(session.user),
      ...(query.contact_result ? { contactResult: query.contact_result } : {}),
      ...(query.contact_channel ? { contactChannel: query.contact_channel } : {}),
      ...(query.interest_type ? { interestType: query.interest_type } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.created_card_only ? { createdCardId: { not: null } } : {}),
      ...(query.internal_issue_only ? { createdInternalIssueId: { not: null } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.postSaleFeedback.findMany({ where, orderBy: { contactAt: "desc" }, skip, take }),
      prisma.postSaleFeedback.count({ where }),
    ]);
    return listResponse(items.map(sanitizeFeedback), query, total);
  });

  app.get("/feedbacks/metrics/summary", async (request) => {
    const session = await requirePostSaleSession(request);
    const where: Prisma.PostSaleFeedbackWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...feedbackVisibilityWhere(session.user),
    };
    const [total, byResult, byChannel, withPurchaseInterest, createdCards, internalIssues] = await Promise.all([
      prisma.postSaleFeedback.count({ where }),
      prisma.postSaleFeedback.groupBy({ by: ["contactResult"], where, _count: { _all: true } }),
      prisma.postSaleFeedback.groupBy({ by: ["contactChannel"], where, _count: { _all: true } }),
      prisma.postSaleFeedback.count({ where: { ...where, hasPurchaseInterest: true } }),
      prisma.postSaleFeedback.count({ where: { ...where, createdCardId: { not: null } } }),
      prisma.postSaleFeedback.count({ where: { ...where, createdInternalIssueId: { not: null } } }),
    ]);
    return {
      data: {
        total,
        withPurchaseInterest,
        createdCards,
        internalIssues,
        byResult: Object.fromEntries(byResult.map((item) => [item.contactResult, item._count._all])),
        byChannel: Object.fromEntries(byChannel.map((item) => [item.contactChannel, item._count._all])),
      },
    };
  });

  app.get("/internal-issues", async (request) => {
    const session = await requirePostSaleSession(request);
    assertPostSaleFullView(session);
    const query = internalIssuesQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.PostSaleInternalIssueWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.postSaleInternalIssue.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip, take }),
      prisma.postSaleInternalIssue.count({ where }),
    ]);
    return listResponse(items.map(sanitizeInternalIssue), query, total);
  });

  app.get("/internal-issues/:id", async (request) => {
    const session = await requirePostSaleSession(request);
    assertPostSaleFullView(session);
    const params = alertParamsSchema.parse(request.params);
    const issue = await prisma.postSaleInternalIssue.findFirst({
      where: { id: params.id, storeId: session.user.storeId, deletedAt: null },
    });
    if (!issue) throw new ApiError("NOT_FOUND", "Pendencia interna de pos-venda nao encontrada.");
    return { data: sanitizeInternalIssue(issue) };
  });

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
    const existingFeedback = await prisma.postSaleFeedback.findUnique({
      where: { postSaleAlertId: current.id },
      select: { id: true },
    });
    if (existingFeedback) {
      throw new ApiError("CONFLICT", "Feedback pos-venda ja registrado para este alerta.");
    }

    await ensureVehicleInterest(session.user.storeId, input.vehicleInterestId);
    if (input.responsibleUserId) await ensureResponsibleUser(session.user.storeId, input.responsibleUserId);
    if (input.issueResponsibleUserId) await ensureResponsibleUser(session.user.storeId, input.issueResponsibleUserId);

    const nextStatus = feedbackStatus(input);
    const attemptedAt = input.contactAttemptedAt ?? new Date();
    const preparation = commercialLeadPreparation({ alert: current, feedback: input });

    const result = await prisma.$transaction(async (tx) => {
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
            createCommercialCardRequested: input.createCommercialCard,
            createInternalIssueRequested: input.createInternalIssue,
          },
        },
      });

      let feedback = await tx.postSaleFeedback.create({
        data: {
          storeId: session.user.storeId,
          postSaleAlertId: alert.id,
          customerId: alert.customerId,
          saleId: alert.saleId,
          vehicleId: alert.vehicleId,
          originalSellerUserId: alert.originalSellerUserId,
          assignedUserId: alert.assignedUserId,
          contactAt: attemptedAt,
          contactChannel: input.contactChannel,
          contactResult: input.contactResult,
          feedbackNotes: input.feedbackNotes,
          hasPurchaseInterest: hasPurchaseInterest(input.contactResult),
          interestType: interestTypeFromResult(input.contactResult),
          vehicleInterestId: input.vehicleInterestId,
          vehicleInterestNotes: input.vehicleInterestNotes,
          nextAction: input.nextAction,
          nextActionAt: input.nextActionAt,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
          metadata: {
            commercialLeadPreparation: preparation,
            commercialCardStatus: preparation ? (input.createCommercialCard ? "REQUESTED" : "PENDING_REVIEW") : "NOT_APPLICABLE",
            internalIssueStatus: input.contactResult === "VEHICLE_PROBLEM" ? (input.createInternalIssue ? "REQUESTED" : "PENDING_REVIEW") : "NOT_APPLICABLE",
          },
        },
      });

      const commercialCard = preparation && input.createCommercialCard
        ? await createCommercialCardFromFeedback(tx, {
            actorId: session.user.id,
            actorRole: session.user.role,
            alert,
            contactAt: attemptedAt,
            feedback: input,
            feedbackId: feedback.id,
            storeId: session.user.storeId,
          })
        : null;

      const internalIssue = input.contactResult === "VEHICLE_PROBLEM" && input.createInternalIssue
        ? await createInternalIssueFromFeedback(tx, {
            actorId: session.user.id,
            actorRole: session.user.role,
            alert,
            feedback: input,
            feedbackId: feedback.id,
            storeId: session.user.storeId,
          })
        : null;

      if (commercialCard || internalIssue) {
        feedback = await tx.postSaleFeedback.update({
          where: { id: feedback.id },
          data: {
            createdLeadId: commercialCard?.lead.id,
            createdCardId: commercialCard?.card.id,
            createdInternalIssueId: internalIssue?.id,
            metadata: {
              commercialLeadPreparation: preparation,
              commercialCardStatus: commercialCard ? "CREATED" : preparation ? "PENDING_REVIEW" : "NOT_APPLICABLE",
              internalIssueStatus: internalIssue ? "CREATED" : input.contactResult === "VEHICLE_PROBLEM" ? "PENDING_REVIEW" : "NOT_APPLICABLE",
            },
          },
        });
      }

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
            postSaleFeedbackId: feedback.id,
            nextActionAt: input.nextActionAt?.toISOString() ?? null,
            hasCommercialLeadPreparation: Boolean(preparation),
            createdCardId: commercialCard?.card.id ?? null,
            createdInternalIssueId: internalIssue?.id ?? null,
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
            postSaleFeedbackId: feedback.id,
            nextActionAt: input.nextActionAt?.toISOString() ?? null,
            commercialLeadPreparation: preparation,
            createdCardId: commercialCard?.card.id ?? null,
            createdInternalIssueId: internalIssue?.id ?? null,
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
          entityType: "post_sale_feedback",
          entityId: feedback.id,
          result: "SUCCESS",
          metadata: {
            alertId: alert.id,
            contactChannel: input.contactChannel,
            contactResult: input.contactResult,
            nextStatus,
            createdCardId: commercialCard?.card.id ?? null,
            createdInternalIssueId: internalIssue?.id ?? null,
          },
        },
      });

      return { alert, commercialCard, feedback, internalIssue };
    });

    const contexts = await buildAlertContexts(session.user.storeId, [result.alert]);
    return {
      data: sanitizeAlert(result.alert, contexts.get(result.alert.id)),
      feedback: sanitizeFeedback(result.feedback),
      commercialLeadPreparation: preparation,
      createdCommercialCard: result.commercialCard ? { id: result.commercialCard.card.id, leadId: result.commercialCard.lead.id } : null,
      internalIssue: result.internalIssue ? sanitizeInternalIssue(result.internalIssue) : null,
    };
  });

  app.patch("/alerts/:id/feedback", async (request) => {
    const session = await requirePostSaleSession(request);
    const params = alertParamsSchema.parse(request.params);
    const input = feedbackUpdateSchema.parse(request.body);
    const current = await getAlertOrThrow({ id: params.id, request, session });
    const feedback = await prisma.postSaleFeedback.findFirst({
      where: {
        postSaleAlertId: current.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...feedbackVisibilityWhere(session.user),
      },
    });
    if (!feedback) throw new ApiError("NOT_FOUND", "Feedback pos-venda nao encontrado.");
    if (!isPostSaleFullView(session.user.role) && current.closedAt) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Vendedor nao pode editar feedback de alerta concluido.");
    }

    await ensureVehicleInterest(session.user.storeId, input.vehicleInterestId);
    if (input.responsibleUserId) await ensureResponsibleUser(session.user.storeId, input.responsibleUserId);

    const merged = {
      contactAt: input.contactAttemptedAt ?? feedback.contactAt,
      contactChannel: input.contactChannel ?? feedback.contactChannel,
      contactResult: input.contactResult ?? feedback.contactResult,
      feedbackNotes: input.feedbackNotes ?? feedback.feedbackNotes ?? undefined,
      vehicleInterestId: input.vehicleInterestId ?? feedback.vehicleInterestId ?? undefined,
      vehicleInterestNotes: input.vehicleInterestNotes ?? feedback.vehicleInterestNotes ?? undefined,
      nextAction: input.nextAction ?? feedback.nextAction ?? undefined,
      nextActionAt: input.nextActionAt ?? feedback.nextActionAt ?? undefined,
    };
    const updatedStatus = feedbackStatus({
      contactAttemptedAt: merged.contactAt,
      contactChannel: merged.contactChannel as FeedbackInput["contactChannel"],
      contactResult: merged.contactResult as FeedbackInput["contactResult"],
      feedbackNotes: merged.feedbackNotes,
      vehicleInterestId: merged.vehicleInterestId,
      vehicleInterestNotes: merged.vehicleInterestNotes,
      nextAction: merged.nextAction,
      nextActionAt: merged.nextActionAt,
      createCommercialCard: false,
      createInternalIssue: false,
      issueSeverity: "MEDIUM",
    });

    const changedFields = Object.keys(input).filter((key) => key !== "updateReason");
    const result = await prisma.$transaction(async (tx) => {
      const updatedFeedback = await tx.postSaleFeedback.update({
        where: { id: feedback.id },
        data: {
          contactAt: merged.contactAt,
          contactChannel: merged.contactChannel,
          contactResult: merged.contactResult,
          feedbackNotes: merged.feedbackNotes,
          hasPurchaseInterest: hasPurchaseInterest(merged.contactResult),
          interestType: interestTypeFromResult(merged.contactResult),
          vehicleInterestId: merged.vehicleInterestId,
          vehicleInterestNotes: merged.vehicleInterestNotes,
          nextAction: merged.nextAction,
          nextActionAt: merged.nextActionAt,
          updatedByUserId: session.user.id,
          metadata: {
            ...(feedback.metadata && typeof feedback.metadata === "object" && !Array.isArray(feedback.metadata) ? feedback.metadata : {}),
            lastUpdateReason: input.updateReason ?? null,
            lastUpdatedBy: session.user.id,
          },
        },
      });

      const updatedAlert = await tx.postSaleAlert.update({
        where: { id: current.id },
        data: {
          status: updatedStatus,
          contactAttemptedAt: merged.contactAt,
          contactChannel: merged.contactChannel,
          contactResult: merged.contactResult,
          feedbackNotes: merged.feedbackNotes,
          nextActionAt: merged.nextActionAt,
          closedAt: updatedStatus === "RESCHEDULED" ? null : (current.closedAt ?? new Date()),
          closedByUserId: updatedStatus === "RESCHEDULED" ? null : (current.closedByUserId ?? session.user.id),
        },
      });

      await tx.postSaleAlertEvent.create({
        data: {
          storeId: session.user.storeId,
          postSaleAlertId: current.id,
          customerId: current.customerId,
          saleId: current.saleId,
          eventType: "feedback_updated",
          actorUserId: session.user.id,
          fromStatus: current.status,
          toStatus: updatedAlert.status,
          payload: {
            postSaleFeedbackId: feedback.id,
            changedFields,
            reason: input.updateReason ?? null,
          },
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: current.customerId,
          type: "post_sale_feedback_updated",
          title: "Feedback pos-venda atualizado",
          description: input.updateReason ?? "Feedback pos-venda corrigido/complementado.",
          metadata: {
            alertId: current.id,
            feedbackId: feedback.id,
            changedFields,
            contactChannel: updatedFeedback.contactChannel,
            contactResult: updatedFeedback.contactResult,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "post_sale",
          action: "post_sale_feedback_updated",
          entityType: "post_sale_feedback",
          entityId: feedback.id,
          result: "SUCCESS",
          metadata: {
            alertId: current.id,
            changedFields,
            reason: input.updateReason ?? null,
          },
        },
      });

      return { alert: updatedAlert, feedback: updatedFeedback };
    });

    const contexts = await buildAlertContexts(session.user.storeId, [result.alert]);
    return { data: sanitizeAlert(result.alert, contexts.get(result.alert.id)), feedback: sanitizeFeedback(result.feedback) };
  });
}
