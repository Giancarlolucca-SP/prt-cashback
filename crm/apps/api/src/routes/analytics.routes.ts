import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../api/auth-guards.js";
import { prisma } from "../lib/db.js";

const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function periodWhere(field: "createdAt" | "closedAt" | "dueAt" | "metricDate", from?: Date, to?: Date) {
  return from || to
    ? {
        [field]: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      }
    : {};
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

function commonInventoryWhere(storeId: string) {
  return {
    storeId,
    deletedAt: null,
    NOT: [{ status: "REPASSE" as const }, { ownershipType: "REPASSE" as const }],
  };
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
      period: { from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null },
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
      period: { from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null },
      leadsByStatus: countBy(leadsByStatus, "status"),
      leadsBySource: countBy(leadsBySource, "source"),
      salesByStatus: countBy(salesByStatus, "status"),
      appointmentsByStatus: countBy(appointmentsByStatus, "status"),
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
      period: { from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null },
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
