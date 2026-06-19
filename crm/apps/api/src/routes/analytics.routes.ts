import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { prisma } from "../lib/db.js";
import { COMMERCIAL_BOARD_KEY, COMMERCIAL_STAGES } from "../services/commercial-kanban.js";
import { SALES_NEGOTIATION_STATUSES } from "../services/sales-transition.js";

const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const commercialAnalyticsQuerySchema = analyticsQuerySchema.extend({
  responsible_user_id: z.string().uuid().optional(),
  origin: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(80).optional(),
  stage: z.string().trim().max(80).optional(),
});

type AnalyticsSession = Awaited<ReturnType<typeof requirePermission>>;
type CommercialAnalyticsQuery = z.infer<typeof commercialAnalyticsQuerySchema>;

function periodWhere(
  field: "createdAt" | "closedAt" | "dueAt" | "metricDate" | "startsAt" | "triggeredAt" | "scheduledAt",
  from?: Date,
  to?: Date,
) {
  return from || to
    ? {
        [field]: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      }
    : {};
}

function responsePeriod(query: { from?: Date; to?: Date }) {
  return { from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null };
}

function decimalSum(value: { _sum: Record<string, unknown> }, key: string) {
  return decimalToNumber(value._sum[key]);
}

function decimalToNumber(amount: unknown) {
  return amount && typeof amount === "object" && "toString" in amount ? Number(amount.toString()) : 0;
}

function countBy(rows: Array<Record<string, unknown> & { _count: { _all: number } }>, key: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[String(row[key])] = row._count._all;
    return acc;
  }, {});
}

function countByValue<T>(rows: readonly T[], getKey: (row: T) => string | null | undefined) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getKey(row) ?? "sem_valor";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function withKnownKeys(keys: readonly string[], counts: Record<string, number>) {
  return keys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = counts[key] ?? 0;
    return acc;
  }, { ...counts });
}

function snapshotString(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function commonInventoryWhere(storeId: string) {
  return {
    storeId,
    deletedAt: null,
    NOT: [{ status: "REPASSE" as const }, { ownershipType: "REPASSE" as const }],
  };
}

function assertCommercialOverviewAccess(session: AnalyticsSession) {
  if (!isCommercialFullView(session.user.role)) {
    throw new ApiError("FORBIDDEN", "Dashboard comercial geral disponivel apenas para Gestao/Administracao.");
  }
}

function assertSdrDashboardAccess(session: AnalyticsSession) {
  if (!isCommercialFullView(session.user.role) && session.user.role !== "SDR") {
    throw new ApiError("FORBIDDEN", "Dashboard SDR disponivel apenas para SDR ou Gestao/Administracao.");
  }
}

function assertSalesDashboardAccess(session: AnalyticsSession) {
  if (!isCommercialFullView(session.user.role) && session.user.role !== "SELLER") {
    throw new ApiError("FORBIDDEN", "Dashboard Vendas disponivel apenas para Vendedor ou Gestao/Administracao.");
  }
}

function commercialCardWhere(
  storeId: string,
  query: CommercialAnalyticsQuery,
  input: { responsibleUserId?: string | null; activeOnly?: boolean } = {},
): Prisma.LeadCardWhereInput {
  return {
    storeId,
    boardKey: COMMERCIAL_BOARD_KEY,
    ...(input.activeOnly ? { archivedAt: null } : {}),
    ...(query.stage ? { stageKey: query.stage } : {}),
    ...periodWhere("createdAt", query.from, query.to),
    lead: {
      deletedAt: null,
      ...(input.responsibleUserId ? { assignedUserId: input.responsibleUserId } : {}),
      ...(query.origin ? { source: { contains: query.origin, mode: "insensitive" } } : {}),
      ...(query.channel ? { channel: { contains: query.channel, mode: "insensitive" } } : {}),
    },
  };
}

async function leadIdsForOriginChannel(storeId: string, query: CommercialAnalyticsQuery) {
  if (!query.origin && !query.channel) {
    return null;
  }
  const leads = await prisma.lead.findMany({
    where: {
      storeId,
      deletedAt: null,
      ...(query.origin ? { source: { contains: query.origin, mode: "insensitive" } } : {}),
      ...(query.channel ? { channel: { contains: query.channel, mode: "insensitive" } } : {}),
    },
    select: { id: true },
  });
  return leads.map((lead) => lead.id);
}

async function saleIdsForStage(storeId: string, stage?: string) {
  if (!stage) {
    return null;
  }
  const saleCards = await prisma.saleCard.findMany({ where: { storeId, stageKey: stage }, select: { saleId: true } });
  return saleCards.map((card) => card.saleId);
}

async function commercialSaleWhere(
  storeId: string,
  query: CommercialAnalyticsQuery,
  input: { sellerUserId?: string | null; includeStageFilter?: boolean } = {},
): Promise<Prisma.SaleWhereInput> {
  const leadIds = await leadIdsForOriginChannel(storeId, query);
  const stageSaleIds = input.includeStageFilter ? await saleIdsForStage(storeId, query.stage) : null;

  return {
    storeId,
    deletedAt: null,
    ...(input.sellerUserId ? { sellerUserId: input.sellerUserId } : {}),
    ...periodWhere("createdAt", query.from, query.to),
    ...(leadIds ? { leadId: { in: leadIds } } : {}),
    ...(stageSaleIds ? { id: { in: stageSaleIds } } : {}),
  };
}

function saleMatchesSource(sale: { snapshot: unknown }, source: string) {
  return snapshotString(sale.snapshot, "source") === source;
}

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildRevenueSeries(
  from: Date,
  to: Date,
  sales: Array<{ closedAt: Date | null; salePrice: unknown; grossMargin: unknown }>,
) {
  const buckets: Array<{ key: string; month: string; vendas: number; margem: number }> = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= end) {
    buckets.push({
      key: monthKey(cursor),
      month: monthLabels[cursor.getMonth()] ?? monthKey(cursor),
      vendas: 0,
      margem: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const byMonth = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const sale of sales) {
    if (!sale.closedAt) {
      continue;
    }

    const bucket = byMonth.get(monthKey(sale.closedAt));
    if (bucket) {
      bucket.vendas += decimalToNumber(sale.salePrice);
      bucket.margem += decimalToNumber(sale.grossMargin);
    }
  }

  return buckets.map(({ key: _key, ...bucket }) => ({
    ...bucket,
    vendas: Number(bucket.vendas.toFixed(2)),
    margem: Number(bucket.margem.toFixed(2)),
  }));
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get("/executive-summary", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    const query = analyticsQuerySchema.parse(request.query);
    const today = new Date();
    const revenueSeriesFrom = query.from ?? new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const revenueSeriesTo = query.to ?? today;

    const [
      customers,
      leads,
      appointments,
      inventory,
      openSales,
      closedSales,
      saleRevenue,
      grossMargin,
      financeIncome,
      financeExpense,
      financeOpen,
      activeCampaigns,
      unreadNotifications,
      revenueSeriesSales,
    ] = await Promise.all([
      prisma.customer.count({ where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) } }),
      prisma.lead.count({ where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) } }),
      prisma.appointment.count({ where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) } }),
      prisma.vehicleInventoryRecord.count({ where: commonInventoryWhere(session.user.storeId) }),
      prisma.sale.count({ where: { storeId: session.user.storeId, deletedAt: null, status: { in: ["DRAFT", "PROPOSAL", "APPROVED", "DOCUMENTATION"] } } }),
      prisma.sale.count({ where: { storeId: session.user.storeId, deletedAt: null, status: "CLOSED", ...periodWhere("closedAt", query.from, query.to) } }),
      prisma.sale.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, status: "CLOSED", ...periodWhere("closedAt", query.from, query.to) },
        _sum: { salePrice: true },
      }),
      prisma.sale.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, status: "CLOSED", ...periodWhere("closedAt", query.from, query.to) },
        _sum: { grossMargin: true },
      }),
      prisma.financialTransaction.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, type: "INCOME", ...periodWhere("dueAt", query.from, query.to) },
        _sum: { amount: true },
      }),
      prisma.financialTransaction.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, type: "EXPENSE", ...periodWhere("dueAt", query.from, query.to) },
        _sum: { amount: true },
      }),
      prisma.financialTransaction.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, status: { in: ["PENDING", "SCHEDULED"] }, ...periodWhere("dueAt", query.from, query.to) },
        _sum: { amount: true },
      }),
      prisma.campaign.count({ where: { storeId: session.user.storeId, deletedAt: null, status: "ACTIVE" } }),
      prisma.notification.count({
        where: {
          storeId: session.user.storeId,
          OR: [{ userId: session.user.id }, { userId: null }],
          readAt: null,
        },
      }),
      prisma.sale.findMany({
        where: {
          storeId: session.user.storeId,
          deletedAt: null,
          status: "CLOSED",
          closedAt: { gte: revenueSeriesFrom, lte: revenueSeriesTo },
        },
        select: { closedAt: true, salePrice: true, grossMargin: true },
      }),
    ]);

    const revenue = decimalSum(saleRevenue, "salePrice");
    const margin = decimalSum(grossMargin, "grossMargin");
    const income = decimalSum(financeIncome, "amount");
    const expense = decimalSum(financeExpense, "amount");

    return {
      period: responsePeriod(query),
      revenueSeries: buildRevenueSeries(revenueSeriesFrom, revenueSeriesTo, revenueSeriesSales),
      totals: {
        customers,
        leads,
        appointments,
        inventory,
        openSales,
        closedSales,
        saleRevenue: revenue.toFixed(2),
        grossMargin: margin.toFixed(2),
        grossMarginRate: revenue > 0 ? (margin / revenue).toFixed(4) : null,
        financialIncome: income.toFixed(2),
        financialExpense: expense.toFixed(2),
        financialNet: (income - expense).toFixed(2),
        openReceivablesAndPayables: decimalSum(financeOpen, "amount").toFixed(2),
        activeCampaigns,
        unreadNotifications,
      },
    };
  });

  app.get("/sales-funnel", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    const query = analyticsQuerySchema.parse(request.query);
    const [leadsByStatus, leadsBySource, salesByStatus, appointmentsByStatus] = await Promise.all([
      prisma.lead.groupBy({
        by: ["status"],
        where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) },
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ["source"],
        where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["status"],
        where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) },
        _count: { _all: true },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: { storeId: session.user.storeId, deletedAt: null, ...periodWhere("createdAt", query.from, query.to) },
        _count: { _all: true },
      }),
    ]);

    return {
      period: responsePeriod(query),
      leadsByStatus: countBy(leadsByStatus, "status"),
      leadsBySource: countBy(leadsBySource, "source"),
      salesByStatus: countBy(salesByStatus, "status"),
      appointmentsByStatus: countBy(appointmentsByStatus, "status"),
    };
  });

  app.get("/commercial-overview", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    assertCommercialOverviewAccess(session);
    const query = commercialAnalyticsQuerySchema.parse(request.query);
    const storeId = session.user.storeId;
    const now = new Date();
    const cardWhere = commercialCardWhere(storeId, query, { responsibleUserId: query.responsible_user_id });
    const activeCardWhere = commercialCardWhere(storeId, query, { responsibleUserId: query.responsible_user_id, activeOnly: true });
    const saleWhere = await commercialSaleWhere(storeId, query, { sellerUserId: query.responsible_user_id, includeStageFilter: true });

    const [
      cards,
      activeCards,
      newLeads,
      appointments,
      alerts,
      overdueFollowUps,
      notifications,
      technicalDeliveries,
      sales,
    ] = await Promise.all([
      prisma.leadCard.findMany({
        where: cardWhere,
        select: { id: true, stageKey: true, lead: { select: { assignedUserId: true, source: true, channel: true } } },
      }),
      prisma.leadCard.findMany({
        where: activeCardWhere,
        select: { id: true, stageKey: true, lead: { select: { assignedUserId: true, source: true, channel: true } } },
      }),
      prisma.lead.count({
        where: {
          storeId,
          deletedAt: null,
          ...(query.responsible_user_id ? { assignedUserId: query.responsible_user_id } : {}),
          ...(query.origin ? { source: { contains: query.origin, mode: "insensitive" } } : {}),
          ...(query.channel ? { channel: { contains: query.channel, mode: "insensitive" } } : {}),
          ...periodWhere("createdAt", query.from, query.to),
        },
      }),
      prisma.commercialAppointment.findMany({
        where: {
          storeId,
          ...(query.responsible_user_id ? { responsibleUserId: query.responsible_user_id } : {}),
          ...(query.origin ? { origin: { contains: query.origin, mode: "insensitive" } } : {}),
          ...(query.channel ? { channel: { contains: query.channel, mode: "insensitive" } } : {}),
          ...periodWhere("startsAt", query.from, query.to),
        },
        select: { status: true, type: true, responsibleUserId: true },
      }),
      prisma.commercialAlert.findMany({
        where: {
          storeId,
          status: { in: ["PENDING", "VIEWED"] },
          ...(query.responsible_user_id ? { responsibleUserId: query.responsible_user_id } : {}),
          ...periodWhere("triggeredAt", query.from, query.to),
        },
        select: { alertType: true, severity: true, responsibleUserId: true },
      }),
      prisma.commercialInteraction.count({
        where: {
          storeId,
          deletedAt: null,
          nextActionStatus: "PENDING",
          nextActionAt: { lt: now },
          ...(query.responsible_user_id ? { responsibleUserId: query.responsible_user_id } : {}),
        },
      }),
      prisma.notification.findMany({
        where: { storeId, ...periodWhere("createdAt", query.from, query.to) },
        select: { status: true },
      }),
      prisma.technicalDelivery.findMany({
        where: { storeId, ...periodWhere("scheduledAt", query.from, query.to) },
        select: { status: true, signedCopyStatus: true },
      }),
      prisma.sale.findMany({
        where: saleWhere,
        select: { id: true, status: true, sellerUserId: true, leadId: true, snapshot: true },
      }),
    ]);

    const saleCards = sales.length
      ? await prisma.saleCard.findMany({
          where: { storeId, saleId: { in: sales.map((sale) => sale.id) } },
          select: { saleId: true, stageKey: true },
        })
      : [];

    const salesByStage = withKnownKeys(SALES_NEGOTIATION_STATUSES.map((stage) => stage.key), countByValue(saleCards, (card) => card.stageKey));
    const commercialCardsByStage = withKnownKeys(COMMERCIAL_STAGES.map((stage) => stage.key), countByValue(cards, (card) => card.stageKey));
    const activeAlertTypes = countByValue(alerts, (alert) => alert.alertType);
    const deliveryStatus = countByValue(technicalDeliveries, (delivery) => delivery.status);

    return {
      period: responsePeriod(query),
      filters: {
        responsibleUserId: query.responsible_user_id ?? null,
        origin: query.origin ?? null,
        channel: query.channel ?? null,
        stage: query.stage ?? null,
      },
      modules: ["commercial_kanban", "sales_kanban", "management_documentation", "commercial_agenda", "commercial_alerts"],
      totals: {
        activeCards: activeCards.length,
        newLeads,
        commercialCards: cards.length,
        salesCards: saleCards.length,
        documentationProcesses: sales.filter((sale) => sale.status === "DOCUMENTATION").length,
        appointments: appointments.length,
        overdueFollowUps,
        highRiskLeads: activeAlertTypes.lead_high_risk ?? 0,
        stalledNegotiations: activeAlertTypes.negotiation_stalled ?? 0,
        closedDeals: salesByStage.CLOSED_WON ?? 0,
        pendingNotifications: notifications.filter((notification) => ["NEW", "SEEN"].includes(notification.status)).length,
        resolvedNotifications: notifications.filter((notification) => notification.status === "RESOLVED").length,
        technicalDeliveries: {
          scheduled: (deliveryStatus.SCHEDULED ?? 0) + (deliveryStatus.RESCHEDULED ?? 0),
          pendingSignedCopy: technicalDeliveries.filter((delivery) => delivery.status === "PRINTED_PENDING_SIGNATURE").length,
          completed: deliveryStatus.COMPLETED_SIGNED ?? 0,
        },
      },
      distributions: {
        commercialCardsByStage,
        salesByStage,
        appointmentsByStatus: countByValue(appointments, (appointment) => appointment.status),
        activeAlertsByType: activeAlertTypes,
        activeAlertsBySeverity: countByValue(alerts, (alert) => alert.severity),
        notificationsByStatus: countByValue(notifications, (notification) => notification.status),
        technicalDeliveriesByStatus: deliveryStatus,
        byResponsible: countByValue(activeCards, (card) => card.lead.assignedUserId),
        byOrigin: countByValue(activeCards, (card) => card.lead.source),
        byChannel: countByValue(activeCards, (card) => card.lead.channel),
      },
    };
  });

  app.get("/commercial-sdr", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    assertSdrDashboardAccess(session);
    const query = commercialAnalyticsQuerySchema.parse(request.query);
    const storeId = session.user.storeId;
    const now = new Date();
    const responsibleUserId = isCommercialFullView(session.user.role) ? query.responsible_user_id : session.user.id;
    const cards = await prisma.leadCard.findMany({
      where: commercialCardWhere(storeId, query, { responsibleUserId }),
      select: { id: true, stageKey: true, leadId: true, lead: { select: { assignedUserId: true, source: true, channel: true } } },
    });
    const cardIds = cards.map((card) => card.id);

    const [appointments, alerts, overdueFollowUps, sales] = await Promise.all([
      cardIds.length
        ? prisma.commercialAppointment.findMany({
            where: { storeId, cardId: { in: cardIds }, ...periodWhere("startsAt", query.from, query.to) },
            select: { status: true, type: true, rescheduleFromId: true },
          })
        : Promise.resolve([]),
      cardIds.length
        ? prisma.commercialAlert.findMany({
            where: { storeId, cardId: { in: cardIds }, status: { in: ["PENDING", "VIEWED"] }, ...periodWhere("triggeredAt", query.from, query.to) },
            select: { alertType: true, severity: true },
          })
        : Promise.resolve([]),
      cardIds.length
        ? prisma.commercialInteraction.count({
            where: { storeId, deletedAt: null, cardId: { in: cardIds }, nextActionStatus: "PENDING", nextActionAt: { lt: now } },
          })
        : Promise.resolve(0),
      cardIds.length
        ? prisma.sale.findMany({
            where: { storeId, deletedAt: null, leadCardId: { in: cardIds }, ...periodWhere("createdAt", query.from, query.to) },
            select: { id: true, snapshot: true },
          })
        : Promise.resolve([]),
    ]);

    const alertsByType = countByValue(alerts, (alert) => alert.alertType);
    const transferredToSales = sales.filter((sale) => saleMatchesSource(sale, "sdr_transfer")).length;

    return {
      period: responsePeriod(query),
      filters: {
        responsibleUserId: responsibleUserId ?? null,
        origin: query.origin ?? null,
        channel: query.channel ?? null,
        stage: query.stage ?? null,
      },
      totals: {
        cards: cards.length,
        transferredToSales,
        conversionRate: cards.length > 0 ? Number((transferredToSales / cards.length).toFixed(4)) : null,
        followUpsOverdue: overdueFollowUps,
        leadCooling: alertsByType.lead_cooling ?? 0,
        leadHighRisk: alertsByType.lead_high_risk ?? 0,
        visitsConfirmed: appointments.filter((appointment) => appointment.type === "VISIT" && appointment.status === "CONFIRMED").length,
        visitsAttended: appointments.filter((appointment) => ["ATTENDED", "COMPLETED"].includes(appointment.status)).length,
        noShows: appointments.filter((appointment) => appointment.status === "NO_SHOW").length,
        reschedules: appointments.filter((appointment) => appointment.status === "RESCHEDULED" || appointment.rescheduleFromId).length,
      },
      cardsByStage: withKnownKeys(COMMERCIAL_STAGES.map((stage) => stage.key), countByValue(cards, (card) => card.stageKey)),
      appointmentsByStatus: countByValue(appointments, (appointment) => appointment.status),
      appointmentsByType: countByValue(appointments, (appointment) => appointment.type),
      alertsByType,
      alertsBySeverity: countByValue(alerts, (alert) => alert.severity),
      byOrigin: countByValue(cards, (card) => card.lead.source),
      byChannel: countByValue(cards, (card) => card.lead.channel),
    };
  });

  app.get("/commercial-sales", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    assertSalesDashboardAccess(session);
    const query = commercialAnalyticsQuerySchema.parse(request.query);
    const storeId = session.user.storeId;
    const now = new Date();
    const sellerUserId = isCommercialFullView(session.user.role) ? query.responsible_user_id : session.user.id;
    const saleWhere = await commercialSaleWhere(storeId, query, { sellerUserId, includeStageFilter: true });
    const sales = await prisma.sale.findMany({
      where: saleWhere,
      select: { id: true, status: true, sellerUserId: true, leadId: true, leadCardId: true, snapshot: true },
    });
    const saleIds = sales.map((sale) => sale.id);
    const leadCardIds = sales.map((sale) => sale.leadCardId).filter((leadCardId): leadCardId is string => Boolean(leadCardId));
    const leadIds = sales.map((sale) => sale.leadId).filter((leadId): leadId is string => Boolean(leadId));

    const [saleCards, appointments, alerts, overdueFollowUps, leads] = await Promise.all([
      saleIds.length
        ? prisma.saleCard.findMany({ where: { storeId, saleId: { in: saleIds } }, select: { saleId: true, stageKey: true } })
        : Promise.resolve([]),
      leadCardIds.length
        ? prisma.commercialAppointment.findMany({
            where: { storeId, cardId: { in: leadCardIds }, ...periodWhere("startsAt", query.from, query.to) },
            select: { status: true, type: true },
          })
        : Promise.resolve([]),
      leadCardIds.length
        ? prisma.commercialAlert.findMany({
            where: { storeId, cardId: { in: leadCardIds }, status: { in: ["PENDING", "VIEWED"] }, ...periodWhere("triggeredAt", query.from, query.to) },
            select: { alertType: true, severity: true },
          })
        : Promise.resolve([]),
      leadCardIds.length
        ? prisma.commercialInteraction.count({
            where: { storeId, deletedAt: null, cardId: { in: leadCardIds }, nextActionStatus: "PENDING", nextActionAt: { lt: now } },
          })
        : Promise.resolve(0),
      leadIds.length
        ? prisma.lead.findMany({ where: { storeId, id: { in: leadIds } }, select: { id: true, source: true, channel: true } })
        : Promise.resolve([]),
    ]);

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const salesByStage = withKnownKeys(SALES_NEGOTIATION_STATUSES.map((stage) => stage.key), countByValue(saleCards, (card) => card.stageKey));
    const alertsByType = countByValue(alerts, (alert) => alert.alertType);

    return {
      period: responsePeriod(query),
      filters: {
        sellerUserId: sellerUserId ?? null,
        origin: query.origin ?? null,
        channel: query.channel ?? null,
        stage: query.stage ?? null,
      },
      totals: {
        salesCards: saleCards.length,
        receivedFromSdr: sales.filter((sale) => saleMatchesSource(sale, "sdr_transfer")).length,
        directSales: sales.filter((sale) => saleMatchesSource(sale, "direct_seller")).length,
        customersAtStore: sales.filter((sale) => snapshotString(sale.snapshot, "customerArrivalStatus") === "AT_STORE").length,
        testDrives: appointments.filter((appointment) => appointment.type === "TEST_DRIVE" && ["ATTENDED", "COMPLETED"].includes(appointment.status)).length,
        negotiationsInProgress: salesByStage.IN_NEGOTIATION ?? 0,
        awaitingReturn: salesByStage.AWAITING_RETURN ?? 0,
        closedDeals: salesByStage.CLOSED_WON ?? 0,
        lostDeals: salesByStage.LOST ?? 0,
        sentToDocumentation: sales.filter((sale) => sale.status === "DOCUMENTATION").length,
        stalledNegotiations: alertsByType.negotiation_stalled ?? 0,
        followUpsOverdue: overdueFollowUps,
      },
      salesByStage,
      salesByStatus: countByValue(sales, (sale) => sale.status),
      appointmentsByStatus: countByValue(appointments, (appointment) => appointment.status),
      alertsByType,
      alertsBySeverity: countByValue(alerts, (alert) => alert.severity),
      bySeller: countByValue(sales, (sale) => sale.sellerUserId),
      byOrigin: countByValue(sales, (sale) => snapshotString(sale.snapshot, "source")),
      byChannel: countByValue(sales, (sale) => (sale.leadId ? leadById.get(sale.leadId)?.channel : null)),
    };
  });

  app.get("/inventory-performance", async (request) => {
    const session = await requirePermission(request, { module: "dashboard", action: "read", scope: "STORE", sensitiveArea: "general" });
    const query = analyticsQuerySchema.parse(request.query);
    const [inventoryByStatus, inventoryByOwnership, inventoryValue, costs, listingMetrics] = await Promise.all([
      prisma.vehicleInventoryRecord.groupBy({
        by: ["status"],
        where: commonInventoryWhere(session.user.storeId),
        _count: { _all: true },
      }),
      prisma.vehicleInventoryRecord.groupBy({
        by: ["ownershipType"],
        where: commonInventoryWhere(session.user.storeId),
        _count: { _all: true },
      }),
      prisma.vehicleInventoryRecord.aggregate({
        where: { ...commonInventoryWhere(session.user.storeId), status: { in: ["IN_PREPARATION", "AVAILABLE", "RESERVED"] } },
        _sum: { askingPrice: true, purchaseCost: true },
      }),
      prisma.vehicleCost.aggregate({
        where: { storeId: session.user.storeId, deletedAt: null, capitalized: true, ...periodWhere("createdAt", query.from, query.to) },
        _sum: { amount: true },
      }),
      prisma.listingMetric.aggregate({
        where: { storeId: session.user.storeId, ...periodWhere("metricDate", query.from, query.to) },
        _sum: { views: true, clicks: true, leads: true },
      }),
    ]);

    const views = listingMetrics._sum.views ?? 0;
    const clicks = listingMetrics._sum.clicks ?? 0;

    return {
      period: responsePeriod(query),
      inventoryByStatus: countBy(inventoryByStatus, "status"),
      inventoryByOwnership: countBy(inventoryByOwnership, "ownershipType"),
      inventoryValue: {
        askingPrice: decimalSum(inventoryValue, "askingPrice").toFixed(2),
        purchaseCost: decimalSum(inventoryValue, "purchaseCost").toFixed(2),
        capitalizedCosts: decimalSum(costs, "amount").toFixed(2),
      },
      listingMetrics: {
        views,
        clicks,
        leads: listingMetrics._sum.leads ?? 0,
        ctr: views > 0 ? (clicks / views).toFixed(4) : null,
      },
    };
  });
}
