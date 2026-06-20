import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import { COMMERCIAL_BOARD_KEY } from "../services/commercial-kanban.js";
import {
  DOCUMENT_CHECKLIST_STATUSES,
  buildBuyerDocumentChecklistItems,
  isAddressProofExpired,
  isAddressProofItem,
  isDocumentChecklistDone,
  type DocumentChecklistStatus,
} from "../services/sale-document-checklist.js";
import {
  activeNotificationSummaryByEntity,
  activeStoreUserIdsByRoles,
  emptyActiveNotificationSummary,
  mergeActiveNotificationSummaries,
  notificationEntityKey,
  notifyActiveUsers,
  type ActiveNotificationSummary,
} from "../services/internal-notifications.js";
import {
  CUSTOMER_ARRIVAL_STATUSES,
  canCloseDeal,
  canTransferToSales,
  closingRequirementErrors,
  requiresOwnFinancingAlert,
  type CustomerArrivalStatus,
  type FinancingType,
} from "../services/sales-transition.js";
import { createMissingSalePaymentChecks, summarizeSalePaymentChecks } from "../services/sale-payment-check.js";
import { createMissingSaleInspectionReports, summarizeSaleInspectionReports } from "../services/sale-inspection-report.js";

// Sales-board (Kanban Vendas) default stage when an opportunity enters the sales flow.
const SALES_STAGE_ASSUMED = "ASSUMED";
// Roles that operate the sales Kanban (create direct / negotiate). SDR does not operate sales.
const OPERATE_SALES_ROLES: ReadonlySet<string> = new Set(["SELLER", "OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);

const arrivalKeys = CUSTOMER_ARRIVAL_STATUSES.map((entry) => entry.key) as [CustomerArrivalStatus, ...CustomerArrivalStatus[]];
const customerArrivalSchema = z.enum(arrivalKeys);
const saleStatusSchema = z.enum(["DRAFT", "PROPOSAL", "APPROVED", "DOCUMENTATION", "CLOSED", "CANCELLED"]);

const notesField = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes da transferencia") })
  .optional();

const transferToSalesSchema = z.object({
  cardId: z.string().uuid(),
  sellerUserId: z.string().uuid(),
  customerArrivalStatus: customerArrivalSchema,
  transferReason: z.string().trim().max(300).optional(),
  transferNotes: notesField,
});

const directSalesCardSchema = z.object({
  cardId: z.string().uuid(),
  sellerUserId: z.string().uuid().optional(),
  customerArrivalStatus: customerArrivalSchema.default("AT_STORE"),
  notes: notesField,
});

const salesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: saleStatusSchema.optional(),
  seller_user_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
});

const saleParamsSchema = z.object({ id: z.string().uuid() });

const financingTypeSchema = z.enum(["STORE_PARTNER", "CUSTOMER_OWN", "NOT_APPLICABLE"]);
const initialDocStatusSchema = z.enum(["PENDING", "PARTIAL", "COLLECTED"]);

// Statuses in which the sales process is still editable/negotiable.
const EDITABLE_SALE_STATUSES: ReadonlySet<string> = new Set(["DRAFT", "PROPOSAL", "APPROVED"]);
const additionalRevenueItemTypeSchema = z.enum([
  "FINANCING_RETURN",
  "INSURANCE",
  "WARRANTY_UPGRADE",
  "TRANSFER_DOCUMENTATION",
  "DISPATCHER",
  "INSPECTION_REPORT",
  "PPF",
  "WINDOW_FILM",
  "VITRIFICATION",
  "ACCESSORY",
  "OTHER_SERVICE",
]);
const additionalRevenueItemStatusSchema = z.enum(["SOLD", "AWAITING_COST", "CANCELLED", "COURTESY"]);
const additionalCostCategorySchema = z.enum([
  "DISPATCHER_FEE",
  "DETRAN_FEE",
  "INSPECTION_FEE",
  "STORE_COST",
  "THIRD_PARTY_SERVICE",
  "PRODUCT_SUPPLY",
  "MATERIALS",
  "PARTS",
  "OTHER",
]);
const additionalCostStatusSchema = z.enum(["EXPECTED", "APPROVED", "REALIZED", "PAID", "CANCELLED"]);
const additionalRevenueItemParamsSchema = saleParamsSchema.extend({ itemId: z.string().uuid() });
const additionalCostParamsSchema = additionalRevenueItemParamsSchema.extend({ costId: z.string().uuid() });

const createAdditionalRevenueItemSchema = z.object({
  itemType: additionalRevenueItemTypeSchema,
  itemDescription: z.string().trim().max(160).optional(),
  chargedAmount: z.coerce.number().nonnegative(),
  includedInVehiclePrice: z.boolean().default(false),
  itemStatus: additionalRevenueItemStatusSchema.default("SOLD"),
  commercialNotes: notesField,
  soldAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateAdditionalRevenueItemSchema = createAdditionalRevenueItemSchema.partial().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "Informe ao menos um campo para atualizar.",
});

const additionalCostBaseSchema = z.object({
  costCategory: additionalCostCategorySchema,
  providerId: z.string().uuid().nullable().optional(),
  expectedCostAmount: z.coerce.number().nonnegative().nullable().optional(),
  realizedCostAmount: z.coerce.number().nonnegative().nullable().optional(),
  costStatus: additionalCostStatusSchema.default("EXPECTED"),
  costDate: z.coerce.date().nullable().optional(),
  proofFileId: z.string().uuid().nullable().optional(),
  notes: notesField,
  metadata: z.record(z.unknown()).optional(),
});

const createAdditionalCostSchema = additionalCostBaseSchema.superRefine((input, ctx) => {
  if (input.costStatus !== "CANCELLED" && input.expectedCostAmount == null && input.realizedCostAmount == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe custo previsto ou realizado.", path: ["expectedCostAmount"] });
  }
});

const updateAdditionalCostSchema = additionalCostBaseSchema.partial().refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "Informe ao menos um campo para atualizar.",
});

const salePatchSchema = z
  .object({
    salePrice: z.coerce.number().nonnegative().optional(),
    paymentMethodForecast: z.string().trim().max(120).optional(),
    hasFinancing: z.boolean().optional(),
    financingType: financingTypeSchema.optional(),
    hasTradeIn: z.boolean().optional(),
    initialDocsStatus: initialDocStatusSchema.optional(),
    notes: notesField,
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  });

const salesMoveSchema = z
  .object({
    toStage: z.enum(["ASSUMED", "IN_NEGOTIATION", "AWAITING_RETURN", "LOST"]),
    reason: z.string().trim().max(300).optional(),
    position: z.number().int().min(0).default(0),
  })
  .superRefine((input, ctx) => {
    if (input.toStage === "LOST" && (!input.reason || input.reason.trim().length < 8)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um motivo (>=8 caracteres) para perder o processo.", path: ["reason"] });
    }
  });

const initialDocumentsSchema = z.object({
  status: initialDocStatusSchema.default("COLLECTED"),
  notes: notesField,
});

const closeDealSchema = z.object({
  negotiatedValue: z.coerce.number().positive().optional(),
  paymentMethod: z.string().trim().min(1).max(120).optional(),
  financingType: financingTypeSchema.optional(),
  hasFinancing: z.boolean().optional(),
  knownPendencies: z.string().trim().max(500).optional(),
  closingNotes: notesField,
});

const conferDocumentsSchema = z.object({ notes: notesField }).default({});
const documentChecklistStatusSchema = z.enum(DOCUMENT_CHECKLIST_STATUSES);
const documentChecklistParamsSchema = saleParamsSchema.extend({
  itemKey: z.string().trim().min(2).max(80),
});
const updateDocumentChecklistItemSchema = z
  .object({
    status: documentChecklistStatusSchema.optional(),
    attachmentId: z.string().uuid().nullable().optional(),
    issueDate: z.coerce.date().nullable().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    responsibleUserId: z.string().uuid().nullable().optional(),
    notes: notesField,
    rejectionReason: z.string().trim().max(500).optional(),
    waivedReason: z.string().trim().max(500).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  })
  .superRefine((input, ctx) => {
    if (input.status === "REJECTED" && !input.rejectionReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe motivo/observacao para recusar documento.", path: ["rejectionReason"] });
    }
    if (input.status === "WAIVED" && !input.waivedReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe motivo/observacao para dispensar documento.", path: ["waivedReason"] });
    }
  });

const OWN_FINANCING_ALERT_TYPE = "own_financing_alert";

type SaleRecord = Prisma.SaleGetPayload<Record<string, never>>;

function saleActiveNotificationSummary(summaryByEntity: Map<string, ActiveNotificationSummary>, saleId: string) {
  return mergeActiveNotificationSummaries([
    summaryByEntity.get(notificationEntityKey("commercial_sale_assigned", saleId)),
    summaryByEntity.get(notificationEntityKey("commercial_sale_documentation_pending", saleId)),
    summaryByEntity.get(notificationEntityKey(OWN_FINANCING_ALERT_TYPE, saleId)),
  ]);
}

function sanitizeSale(sale: SaleRecord, stageKey: string | null, activeNotifications: ActiveNotificationSummary = emptyActiveNotificationSummary) {
  return {
    id: sale.id,
    customerId: sale.customerId,
    vehicleId: sale.vehicleId,
    sellerUserId: sale.sellerUserId,
    leadId: sale.leadId,
    leadCardId: sale.leadCardId,
    type: sale.type,
    status: sale.status,
    stageKey,
    salePrice: sale.salePrice?.toString() ?? null,
    paymentMethodForecast: sale.paymentMethodForecast,
    hasFinancing: sale.hasFinancing,
    financingType: sale.financingType,
    initialDocsStatus: sale.initialDocsStatus,
    closedAt: sale.closedAt?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
    activeNotifications,
  };
}

async function ensureSellerInStore(storeId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new ApiError("NOT_FOUND", "Vendedor responsavel nao encontrado.");
  }
}

type SalesSession = Awaited<ReturnType<typeof requirePermission>>;

async function loadScopedCommercialCard(session: SalesSession, cardId: string) {
  const leadWhere: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(isCommercialFullView(session.user.role) ? {} : { assignedUserId: session.user.id }),
  };
  return prisma.leadCard.findFirst({
    where: { id: cardId, storeId: session.user.storeId, boardKey: COMMERCIAL_BOARD_KEY, lead: leadWhere },
    include: { lead: true },
  });
}

async function ensureNoActiveSaleForCard(storeId: string, leadCardId: string) {
  const existing = await prisma.sale.findFirst({
    where: { storeId, leadCardId, deletedAt: null, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError("CONFLICT", "Card comercial ja possui um processo de vendas ativo.", { saleId: existing.id });
  }
}

type CardWithLead = Prisma.LeadCardGetPayload<{ include: { lead: true } }>;

async function createSaleFromCard(
  session: SalesSession,
  card: CardWithLead,
  input: { sellerUserId: string; origin: string; customerArrivalStatus: CustomerArrivalStatus; reason?: string | null; notes?: string | null; action: string },
) {
  const snapshot = {
    source: input.origin,
    sourceCardId: card.id,
    leadId: card.leadId,
    initiatedByUserId: session.user.id,
    customerArrivalStatus: input.customerArrivalStatus,
    transferReason: input.reason ?? null,
    observationNotes: input.notes ?? null,
  } satisfies Prisma.InputJsonObject;

  const result = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        storeId: session.user.storeId,
        customerId: card.lead.customerId,
        vehicleId: card.lead.vehicleId,
        sellerUserId: input.sellerUserId,
        leadId: card.leadId,
        leadCardId: card.id,
        type: "VEHICLE",
        status: "DRAFT",
        initialDocsStatus: "PENDING",
        snapshot,
      },
    });

    const saleCard = await tx.saleCard.create({
      data: { storeId: session.user.storeId, saleId: sale.id, stageKey: SALES_STAGE_ASSUMED, position: 0 },
    });

    await tx.saleStageHistory.create({
      data: { storeId: session.user.storeId, saleId: sale.id, fromStage: null, toStage: SALES_STAGE_ASSUMED, actorUserId: session.user.id },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "commercial_sales",
        action: input.action,
        entityType: "sale",
        entityId: sale.id,
        result: "SUCCESS",
        metadata: {
          origin: input.origin,
          sourceCardId: card.id,
          leadId: card.leadId,
          sellerUserId: input.sellerUserId,
          customerArrivalStatus: input.customerArrivalStatus,
          reason: input.reason ?? null,
        },
      },
    });

    // Lead-scoped audit so the transfer shows in the lead/customer history.
    if (card.leadId) {
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_transferred_to_sales",
          entityType: "lead",
          entityId: card.leadId,
          result: "SUCCESS",
          metadata: { saleId: sale.id, sellerUserId: input.sellerUserId, origin: input.origin },
        },
      });
    }

    return { sale, saleCard };
  });

  return result;
}

async function loadScopedSale(session: SalesSession, id: string) {
  const sale = await prisma.sale.findFirst({
    where: {
      id,
      storeId: session.user.storeId,
      deletedAt: null,
      leadCardId: { not: null },
      ...(isCommercialFullView(session.user.role) ? {} : { sellerUserId: session.user.id }),
    },
  });
  if (!sale) {
    throw new ApiError("NOT_FOUND", "Processo de vendas nao encontrado.");
  }
  return sale;
}

async function getSaleStageKey(saleId: string): Promise<string | null> {
  const card = await prisma.saleCard.findFirst({ where: { saleId }, select: { stageKey: true } });
  return card?.stageKey ?? null;
}

function mergeSnapshot(snapshot: Prisma.JsonValue | null, patch: Record<string, unknown>): Prisma.InputJsonObject {
  const base = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? (snapshot as Record<string, unknown>) : {};
  return { ...base, ...patch } as Prisma.InputJsonObject;
}

type SaleDocumentChecklistRecord = Prisma.SaleDocumentChecklistGetPayload<Record<string, never>>;

function sanitizeDocumentChecklistItem(item: SaleDocumentChecklistRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    itemKey: item.itemKey,
    label: item.label,
    status: item.status,
    isRequired: item.isRequired,
    isDone: item.isDone,
    attachmentId: item.attachmentId,
    issueDate: item.issueDate?.toISOString() ?? null,
    validUntil: item.validUntil?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    checkedByUserId: item.checkedByUserId,
    responsibleUserId: item.responsibleUserId,
    notes: item.notes,
    rejectionReason: item.rejectionReason,
    waivedReason: item.waivedReason,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type SalePaymentCheckRecord = Prisma.SalePaymentCheckGetPayload<Record<string, never>>;
type SaleInspectionReportRecord = Prisma.SaleInspectionReportGetPayload<Record<string, never>>;

function sanitizeSalePaymentCheckForCommercial(item: SalePaymentCheckRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    paymentItemType: item.paymentItemType,
    direction: item.direction,
    isRequired: item.isRequired,
    expectedAmount: item.expectedAmount.toString(),
    confirmedAmount: item.confirmedAmount?.toString() ?? null,
    pendingAmount: item.pendingAmount?.toString() ?? null,
    paymentMethod: item.paymentMethod,
    expectedAt: item.expectedAt?.toISOString() ?? null,
    paymentStatus: item.paymentStatus,
    releaseStatus: item.releaseStatus,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    releaseApprovedAt: item.releaseApprovedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function sanitizeSaleInspectionReportForCommercial(item: SaleInspectionReportRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    vehicleId: item.vehicleId,
    reportType: item.reportType,
    status: item.status,
    isRequired: item.isRequired,
    reportFileId: item.reportFileId,
    reportDate: item.reportDate?.toISOString() ?? null,
    requestedByCustomer: item.requestedByCustomer,
    printedAt: item.printedAt?.toISOString() ?? null,
    exportedAt: item.exportedAt?.toISOString() ?? null,
    retentionUntil: item.retentionUntil?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type SaleAdditionalRevenueItemRecord = Prisma.SaleAdditionalRevenueItemGetPayload<Record<string, never>>;
type SaleAdditionalCostRecord = Prisma.SaleAdditionalCostGetPayload<Record<string, never>>;

const COUNTED_ADDITIONAL_REVENUE_ITEM_STATUSES: ReadonlySet<string> = new Set(["SOLD", "AWAITING_COST"]);
const COUNTED_ADDITIONAL_COST_STATUSES: ReadonlySet<string> = new Set(["EXPECTED", "APPROVED", "REALIZED", "PAID"]);

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value.toString());
}

function moneyString(value: number) {
  return value.toFixed(2);
}

function additionalRevenueItemCounts(item: SaleAdditionalRevenueItemRecord) {
  return COUNTED_ADDITIONAL_REVENUE_ITEM_STATUSES.has(item.itemStatus);
}

function additionalCostCounts(cost: SaleAdditionalCostRecord) {
  return COUNTED_ADDITIONAL_COST_STATUSES.has(cost.costStatus);
}

function additionalCostAmount(cost: SaleAdditionalCostRecord) {
  return decimalToNumber(cost.realizedCostAmount ?? cost.expectedCostAmount);
}

function groupAdditionalCostsByItem(costs: SaleAdditionalCostRecord[]) {
  const grouped = new Map<string, SaleAdditionalCostRecord[]>();
  for (const cost of costs) {
    const list = grouped.get(cost.additionalRevenueItemId) ?? [];
    list.push(cost);
    grouped.set(cost.additionalRevenueItemId, list);
  }
  return grouped;
}

function additionalRevenueItemFinancials(item: SaleAdditionalRevenueItemRecord, costs: SaleAdditionalCostRecord[]) {
  const countedRevenue = additionalRevenueItemCounts(item) ? decimalToNumber(item.chargedAmount) : 0;
  const countedCosts = costs.filter(additionalCostCounts);
  const totalCost = countedCosts.reduce((sum, cost) => sum + additionalCostAmount(cost), 0);
  const spread = countedRevenue - totalCost;
  const costPending =
    additionalRevenueItemCounts(item) &&
    (countedCosts.length === 0 || countedCosts.some((cost) => cost.costStatus !== "PAID" && cost.realizedCostAmount === null));

  return { revenue: countedRevenue, cost: totalCost, spread, costPending, negativeSpread: spread < 0 };
}

function sanitizeAdditionalCost(cost: SaleAdditionalCostRecord) {
  return {
    id: cost.id,
    saleId: cost.saleId,
    additionalRevenueItemId: cost.additionalRevenueItemId,
    costCategory: cost.costCategory,
    providerId: cost.providerId,
    expectedCostAmount: cost.expectedCostAmount?.toString() ?? null,
    realizedCostAmount: cost.realizedCostAmount?.toString() ?? null,
    costStatus: cost.costStatus,
    costDate: cost.costDate?.toISOString() ?? null,
    proofFileId: cost.proofFileId,
    launchedByUserId: cost.launchedByUserId,
    notes: cost.notes,
    metadata: cost.metadata,
    createdAt: cost.createdAt.toISOString(),
    updatedAt: cost.updatedAt.toISOString(),
  };
}

function sanitizeAdditionalRevenueItem(item: SaleAdditionalRevenueItemRecord, costs: SaleAdditionalCostRecord[]) {
  const financials = additionalRevenueItemFinancials(item, costs);
  return {
    id: item.id,
    saleId: item.saleId,
    vehicleId: item.vehicleId,
    buyerId: item.buyerId,
    sellerId: item.sellerId,
    itemType: item.itemType,
    itemDescription: item.itemDescription,
    soldByUserId: item.soldByUserId,
    soldAt: item.soldAt.toISOString(),
    chargedAmount: item.chargedAmount.toString(),
    includedInVehiclePrice: item.includedInVehiclePrice,
    itemStatus: item.itemStatus,
    commercialNotes: item.commercialNotes,
    metadata: item.metadata,
    financials: {
      revenue: moneyString(financials.revenue),
      cost: moneyString(financials.cost),
      spread: moneyString(financials.spread),
      costPending: financials.costPending,
      negativeSpread: financials.negativeSpread,
    },
    costs: costs.map(sanitizeAdditionalCost),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function summarizeAdditionalRevenueItems(sale: SaleRecord, items: SaleAdditionalRevenueItemRecord[], costs: SaleAdditionalCostRecord[]) {
  const costsByItem = groupAdditionalCostsByItem(costs);
  const itemFinancials = items.map((item) => ({ itemId: item.id, ...additionalRevenueItemFinancials(item, costsByItem.get(item.id) ?? []) }));
  const totalRevenue = itemFinancials.reduce((sum, item) => sum + item.revenue, 0);
  const totalCost = itemFinancials.reduce((sum, item) => sum + item.cost, 0);
  const totalSpread = itemFinancials.reduce((sum, item) => sum + item.spread, 0);
  const mainVehicleMargin = sale.grossMargin === null ? null : decimalToNumber(sale.grossMargin);

  return {
    itemsCount: items.length,
    countedItems: itemFinancials.filter((item) => item.revenue > 0 || item.cost > 0).length,
    totalRevenue: moneyString(totalRevenue),
    totalCost: moneyString(totalCost),
    totalSpread: moneyString(totalSpread),
    mainVehicleMargin: sale.grossMargin?.toString() ?? null,
    totalProfitWithAdditional: mainVehicleMargin === null ? null : moneyString(mainVehicleMargin + totalSpread),
    pendingCostItems: itemFinancials.filter((item) => item.costPending).map((item) => item.itemId),
    negativeSpreadItems: itemFinancials.filter((item) => item.negativeSpread).map((item) => item.itemId),
  };
}

async function loadAdditionalRevenueBundle(storeId: string, sale: SaleRecord) {
  const [items, costs] = await Promise.all([
    prisma.saleAdditionalRevenueItem.findMany({ where: { storeId, saleId: sale.id }, orderBy: [{ createdAt: "asc" }] }),
    prisma.saleAdditionalCost.findMany({ where: { storeId, saleId: sale.id }, orderBy: [{ createdAt: "asc" }] }),
  ]);
  return { items, costs, costsByItem: groupAdditionalCostsByItem(costs), summary: summarizeAdditionalRevenueItems(sale, items, costs) };
}

async function getAdditionalRevenueItemOrThrow(storeId: string, saleId: string, itemId: string) {
  const item = await prisma.saleAdditionalRevenueItem.findFirst({ where: { id: itemId, storeId, saleId } });
  if (!item) {
    throw new ApiError("NOT_FOUND", "Receita adicional da venda nao encontrada.");
  }
  return item;
}

async function getAdditionalCostOrThrow(storeId: string, saleId: string, itemId: string, costId: string) {
  const cost = await prisma.saleAdditionalCost.findFirst({ where: { id: costId, storeId, saleId, additionalRevenueItemId: itemId } });
  if (!cost) {
    throw new ApiError("NOT_FOUND", "Custo da receita adicional nao encontrado.");
  }
  return cost;
}

function assertCanOperateAdditionalRevenue(role: string) {
  if (!OPERATE_SALES_ROLES.has(role)) {
    throw new ApiError("FORBIDDEN", "Seu perfil nao opera receitas adicionais da venda.");
  }
}

function assertCanManageAdditionalCosts(role: string) {
  if (!isCommercialFullView(role)) {
    throw new ApiError("FORBIDDEN", "Somente administrativo/gestao pode lancar custos adicionais.");
  }
}

function assertAdditionalRevenueAmount(itemStatus: string, chargedAmount: number) {
  if (itemStatus !== "COURTESY" && chargedAmount <= 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Informe valor vendido maior que zero para receita adicional nao cortesia.");
  }
}

function documentChecklistSummary(items: SaleDocumentChecklistRecord[]) {
  const staleItems = items.filter((item) => item.isRequired && isAddressProofItem(item.itemKey, item.metadata) && isAddressProofExpired(item.issueDate));
  const pendingRequiredItems = items.filter((item) => item.isRequired && !item.isDone);
  const blockers = [
    ...pendingRequiredItems.map((item) => ({ itemKey: item.itemKey, reason: "required_pending" })),
    ...staleItems.map((item) => ({ itemKey: item.itemKey, reason: "address_proof_expired" })),
  ];

  return {
    total: items.length,
    required: items.filter((item) => item.isRequired).length,
    done: items.filter((item) => item.isDone).length,
    pendingRequired: pendingRequiredItems.length,
    blockedForContracts: blockers.length > 0,
    blockers,
  };
}

async function createMissingBuyerDocumentChecklistItems(
  tx: Prisma.TransactionClient,
  storeId: string,
  sale: Pick<SaleRecord, "id" | "customerId" | "hasFinancing" | "financingType" | "sellerUserId">,
) {
  const customer = sale.customerId
    ? await tx.customer.findFirst({ where: { id: sale.customerId, storeId, deletedAt: null }, select: { type: true } })
    : null;
  const items = buildBuyerDocumentChecklistItems({
    buyerType: customer?.type ?? "PERSON",
    hasFinancing: sale.hasFinancing,
    financingType: sale.financingType,
  });

  await tx.saleDocumentChecklist.createMany({
    data: items.map((item) => ({
      storeId,
      saleId: sale.id,
      itemKey: item.itemKey,
      label: item.label,
      isRequired: item.isRequired,
      responsibleUserId: sale.sellerUserId,
      metadata: item.metadata as Prisma.InputJsonObject,
    })),
    skipDuplicates: true,
  });
}

function canRoleAdministerDocumentChecklist(role: string) {
  return isCommercialFullView(role);
}

function assertChecklistStatusAllowedForRole(role: string, status: DocumentChecklistStatus | undefined) {
  if (!status || canRoleAdministerDocumentChecklist(role)) {
    return;
  }
  if (role === "SELLER" && ["REQUESTED", "RECEIVED", "ATTACHED"].includes(status)) {
    return;
  }
  throw new ApiError("FORBIDDEN", "Vendedor pode anexar/receber documentos, mas nao aprovar, recusar ou dispensar conferencia.");
}

async function ensureAttachmentInStore(storeId: string, attachmentId: string | null | undefined) {
  if (!attachmentId) {
    return;
  }
  const attachment = await prisma.fileAttachment.findFirst({
    where: { id: attachmentId, storeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Anexo do checklist nao encontrado.");
  }
}

// Best-effort managerial alert for customer-own financing. Deduped by the ACTIVE condition
// (one alert per sale while it persists, regardless of readAt), like the S2-US03 review fix.
async function raiseOwnFinancingAlert(session: SalesSession, sale: SaleRecord) {
  const storeId = session.user.storeId;
  const existing = await prisma.notification.findFirst({
    where: { storeId, entityType: OWN_FINANCING_ALERT_TYPE, entityId: sale.id, status: { in: ["NEW", "SEEN"] } },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  const managers = await prisma.user.findMany({
    where: { storeId, role: { in: ["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const recipientIds = new Set(managers.map((manager) => manager.id));
  if (sale.sellerUserId) {
    recipientIds.add(sale.sellerUserId); // alert the seller too
  }
  if (recipientIds.size === 0) {
    return;
  }
  await notifyActiveUsers({
    storeId,
    userIds: [...recipientIds],
    title: "Financeira propria: valor deve cair na conta da loja",
    body: `O processo de vendas ${sale.id} usa financeira propria do cliente. Nao liberar documento/entrega ate a conferencia administrativa do recebimento.`,
    entityType: OWN_FINANCING_ALERT_TYPE,
    entityId: sale.id,
    priority: "CRITICAL",
    sourceModule: "commercial_sales",
    actionUrl: `/commercial-sales/${sale.id}`,
  });
  await prisma.auditLog.create({
    data: {
      storeId,
      actorId: session.user.id,
      actorRole: session.user.role,
      module: "commercial_sales",
      action: "own_financing_alert",
      entityType: "sale",
      entityId: sale.id,
      result: "SUCCESS",
      metadata: { financingType: "CUSTOMER_OWN", recipients: recipientIds.size },
    },
  });
}

export async function registerCommercialSalesRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = salesQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const fullView = isCommercialFullView(session.user.role);

    const where: Prisma.SaleWhereInput = {
      storeId: session.user.storeId,
      deletedAt: null,
      leadCardId: { not: null },
      ...(fullView
        ? query.seller_user_id
          ? { sellerUserId: query.seller_user_id }
          : {}
        : { sellerUserId: session.user.id }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.sale.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.sale.count({ where }),
    ]);

    const cards = items.length
      ? await prisma.saleCard.findMany({ where: { saleId: { in: items.map((sale) => sale.id) } }, select: { saleId: true, stageKey: true } })
      : [];
    const stageBySaleId = new Map(cards.map((card) => [card.saleId, card.stageKey]));
    const saleIds = items.map((sale) => sale.id);
    const activeNotificationSummaries = await activeNotificationSummaryByEntity({
      storeId: session.user.storeId,
      user: session.user,
      entities: saleIds.flatMap((saleId) => [
        { entityType: "commercial_sale_assigned", entityId: saleId },
        { entityType: "commercial_sale_documentation_pending", entityId: saleId },
        { entityType: OWN_FINANCING_ALERT_TYPE, entityId: saleId },
      ]),
    });

    return listResponse(items.map((sale) => sanitizeSale(sale, stageBySaleId.get(sale.id) ?? null, saleActiveNotificationSummary(activeNotificationSummaries, sale.id))), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = saleParamsSchema.parse(request.params);
    const sale = await prisma.sale.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...(isCommercialFullView(session.user.role) ? {} : { sellerUserId: session.user.id }),
      },
    });
    if (!sale) {
      throw new ApiError("NOT_FOUND", "Processo de vendas nao encontrado.");
    }
    const card = await prisma.saleCard.findFirst({ where: { saleId: sale.id }, select: { stageKey: true } });
    const activeNotificationSummaries = await activeNotificationSummaryByEntity({
      storeId: session.user.storeId,
      user: session.user,
      entities: [
        { entityType: "commercial_sale_assigned", entityId: sale.id },
        { entityType: "commercial_sale_documentation_pending", entityId: sale.id },
        { entityType: OWN_FINANCING_ALERT_TYPE, entityId: sale.id },
      ],
    });
    return { data: sanitizeSale(sale, card?.stageKey ?? null, saleActiveNotificationSummary(activeNotificationSummaries, sale.id)) };
  });

  app.get("/:id/document-checklist", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleParamsSchema.parse(request.params);
    const sale = await loadScopedSale(session, params.id);
    const items = await prisma.saleDocumentChecklist.findMany({
      where: { storeId: session.user.storeId, saleId: sale.id },
      orderBy: [{ isRequired: "desc" }, { createdAt: "asc" }],
    });

    return {
      data: {
        sale: sanitizeSale(sale, await getSaleStageKey(sale.id)),
        summary: documentChecklistSummary(items),
        items: items.map(sanitizeDocumentChecklistItem),
      },
    };
  });

  app.patch("/:id/document-checklist/:itemKey", async (request) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const params = documentChecklistParamsSchema.parse(request.params);
    const input = updateDocumentChecklistItemSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    const item = await prisma.saleDocumentChecklist.findFirst({
      where: { storeId: session.user.storeId, saleId: sale.id, itemKey: params.itemKey },
    });
    if (!item) {
      throw new ApiError("NOT_FOUND", "Item do checklist documental nao encontrado.");
    }

    assertChecklistStatusAllowedForRole(session.user.role, input.status);
    if (input.responsibleUserId) {
      await ensureSellerInStore(session.user.storeId, input.responsibleUserId);
    }
    await ensureAttachmentInStore(session.user.storeId, input.attachmentId);

    const requestedStatus = (input.status ?? item.status) as DocumentChecklistStatus;
    const issueDate = input.issueDate === undefined ? item.issueDate : input.issueDate;
    const isAddressProof = isAddressProofItem(item.itemKey, item.metadata);
    const expiredAddressProof = isAddressProof && isAddressProofExpired(issueDate);
    if (expiredAddressProof && isDocumentChecklistDone(requestedStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Comprovante de residencia/endereco esta desatualizado.", {
        itemKey: item.itemKey,
        maxAgeDays: 92,
      });
    }
    const nextStatus = expiredAddressProof ? "EXPIRED" : requestedStatus;
    const nextIsDone = isDocumentChecklistDone(nextStatus);
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.saleDocumentChecklist.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          isDone: nextIsDone,
          attachmentId: input.attachmentId === undefined ? undefined : input.attachmentId,
          issueDate: input.issueDate === undefined ? undefined : input.issueDate,
          validUntil: input.validUntil === undefined ? undefined : input.validUntil,
          completedAt: nextIsDone ? item.completedAt ?? now : null,
          checkedAt: nextIsDone ? item.checkedAt ?? now : null,
          checkedByUserId: nextIsDone ? item.checkedByUserId ?? session.user.id : null,
          responsibleUserId: input.responsibleUserId === undefined ? undefined : input.responsibleUserId,
          notes: input.notes === undefined ? undefined : input.notes,
          rejectionReason: input.rejectionReason === undefined ? undefined : input.rejectionReason,
          waivedReason: input.waivedReason === undefined ? undefined : input.waivedReason,
        },
      });

      if (input.attachmentId) {
        await tx.fileAttachmentLink.createMany({
          data: [
            {
              storeId: session.user.storeId,
              attachmentId: input.attachmentId,
              entityType: "sale",
              entityId: sale.id,
              purpose: item.itemKey,
            },
          ],
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "buyer_document_checklist_item_updated",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: {
            itemKey: item.itemKey,
            fromStatus: item.status,
            toStatus: next.status,
            attachmentId: next.attachmentId,
            addressProofExpired: expiredAddressProof,
          },
        },
      });

      return next;
    });

    const items = await prisma.saleDocumentChecklist.findMany({ where: { storeId: session.user.storeId, saleId: sale.id } });
    return {
      data: sanitizeDocumentChecklistItem(updated),
      summary: documentChecklistSummary(items),
      warnings: expiredAddressProof ? [{ itemKey: item.itemKey, code: "ADDRESS_PROOF_EXPIRED" }] : [],
    };
  });

  app.get("/:id/payment-checks", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleParamsSchema.parse(request.params);
    const sale = await loadScopedSale(session, params.id);
    const items = await prisma.salePaymentCheck.findMany({
      where: { storeId: session.user.storeId, saleId: sale.id },
      orderBy: [{ isRequired: "desc" }, { createdAt: "asc" }],
    });

    return {
      data: {
        sale: sanitizeSale(sale, await getSaleStageKey(sale.id)),
        summary: summarizeSalePaymentChecks(items),
        items: items.map(sanitizeSalePaymentCheckForCommercial),
      },
    };
  });

  app.get("/:id/inspection-reports", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleParamsSchema.parse(request.params);
    const sale = await loadScopedSale(session, params.id);
    const items = await prisma.saleInspectionReport.findMany({
      where: { storeId: session.user.storeId, saleId: sale.id },
      orderBy: [{ reportType: "asc" }],
    });

    return {
      data: {
        sale: sanitizeSale(sale, await getSaleStageKey(sale.id)),
        summary: summarizeSaleInspectionReports(items),
        items: items.map(sanitizeSaleInspectionReportForCommercial),
      },
    };
  });

  app.get("/:id/additional-revenues", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleParamsSchema.parse(request.params);
    const sale = await loadScopedSale(session, params.id);
    const bundle = await loadAdditionalRevenueBundle(session.user.storeId, sale);

    return {
      data: {
        sale: sanitizeSale(sale, await getSaleStageKey(sale.id)),
        summary: bundle.summary,
        items: bundle.items.map((item) => sanitizeAdditionalRevenueItem(item, bundle.costsByItem.get(item.id) ?? [])),
      },
    };
  });

  app.post("/:id/additional-revenues", async (request, reply) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    assertCanOperateAdditionalRevenue(session.user.role);
    const params = saleParamsSchema.parse(request.params);
    const input = createAdditionalRevenueItemSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    assertAdditionalRevenueAmount(input.itemStatus, input.chargedAmount);

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.saleAdditionalRevenueItem.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          vehicleId: sale.vehicleId,
          buyerId: sale.customerId,
          sellerId: sale.sellerUserId,
          itemType: input.itemType,
          itemDescription: input.itemDescription,
          soldByUserId: session.user.id,
          soldAt: input.soldAt,
          chargedAmount: input.chargedAmount,
          includedInVehiclePrice: input.includedInVehiclePrice,
          itemStatus: input.itemStatus,
          commercialNotes: input.commercialNotes,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "sale_additional_revenue_created",
          entityType: "sale_additional_revenue_item",
          entityId: item.id,
          result: "SUCCESS",
          metadata: { saleId: sale.id, itemType: item.itemType, chargedAmount: item.chargedAmount.toString(), itemStatus: item.itemStatus },
        },
      });

      return item;
    });

    const bundle = await loadAdditionalRevenueBundle(session.user.storeId, sale);
    return reply.code(201).send({ data: sanitizeAdditionalRevenueItem(created, []), summary: bundle.summary });
  });

  app.patch("/:id/additional-revenues/:itemId", async (request) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    assertCanOperateAdditionalRevenue(session.user.role);
    const params = additionalRevenueItemParamsSchema.parse(request.params);
    const input = updateAdditionalRevenueItemSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    const item = await getAdditionalRevenueItemOrThrow(session.user.storeId, sale.id, params.itemId);
    const nextStatus = input.itemStatus ?? item.itemStatus;
    const nextChargedAmount = input.chargedAmount ?? decimalToNumber(item.chargedAmount);
    assertAdditionalRevenueAmount(nextStatus, nextChargedAmount);

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.saleAdditionalRevenueItem.updateMany({
        where: { id: item.id, itemStatus: item.itemStatus, updatedAt: item.updatedAt },
        data: {
          itemType: input.itemType,
          itemDescription: input.itemDescription,
          chargedAmount: input.chargedAmount,
          includedInVehiclePrice: input.includedInVehiclePrice,
          itemStatus: input.itemStatus,
          commercialNotes: input.commercialNotes,
          soldAt: input.soldAt,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Receita adicional foi alterada por outra acao. Recarregue e tente novamente.");
      }

      const next = await tx.saleAdditionalRevenueItem.findUniqueOrThrow({ where: { id: item.id } });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "sale_additional_revenue_updated",
          entityType: "sale_additional_revenue_item",
          entityId: item.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            changedFields: Object.keys(input),
            fromItemStatus: item.itemStatus,
            toItemStatus: next.itemStatus,
            fromChargedAmount: item.chargedAmount.toString(),
            toChargedAmount: next.chargedAmount.toString(),
          },
        },
      });

      return next;
    });

    const bundle = await loadAdditionalRevenueBundle(session.user.storeId, sale);
    return { data: sanitizeAdditionalRevenueItem(updated, bundle.costsByItem.get(updated.id) ?? []), summary: bundle.summary };
  });

  app.post("/:id/additional-revenues/:itemId/costs", async (request, reply) => {
    const session = await requirePermission(request, { module: "finance", action: "manage", scope: "ALL", sensitiveArea: "financial" });
    assertCanManageAdditionalCosts(session.user.role);
    const params = additionalRevenueItemParamsSchema.parse(request.params);
    const input = createAdditionalCostSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    const item = await getAdditionalRevenueItemOrThrow(session.user.storeId, sale.id, params.itemId);
    await ensureAttachmentInStore(session.user.storeId, input.proofFileId);

    const created = await prisma.$transaction(async (tx) => {
      const cost = await tx.saleAdditionalCost.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          additionalRevenueItemId: item.id,
          costCategory: input.costCategory,
          providerId: input.providerId ?? null,
          expectedCostAmount: input.expectedCostAmount ?? null,
          realizedCostAmount: input.realizedCostAmount ?? null,
          costStatus: input.costStatus,
          costDate: input.costDate ?? null,
          proofFileId: input.proofFileId ?? null,
          launchedByUserId: session.user.id,
          notes: input.notes,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      if (input.proofFileId) {
        await tx.fileAttachmentLink.createMany({
          data: [{ storeId: session.user.storeId, attachmentId: input.proofFileId, entityType: "sale", entityId: sale.id, purpose: `additional_revenue_cost_${input.costCategory}` }],
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_additional_cost_created",
          entityType: "sale_additional_cost",
          entityId: cost.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            additionalRevenueItemId: item.id,
            costCategory: cost.costCategory,
            expectedCostAmount: cost.expectedCostAmount?.toString() ?? null,
            realizedCostAmount: cost.realizedCostAmount?.toString() ?? null,
            costStatus: cost.costStatus,
          },
        },
      });

      return cost;
    });

    const bundle = await loadAdditionalRevenueBundle(session.user.storeId, sale);
    return reply.code(201).send({
      data: sanitizeAdditionalCost(created),
      item: sanitizeAdditionalRevenueItem(item, bundle.costsByItem.get(item.id) ?? []),
      summary: bundle.summary,
    });
  });

  app.patch("/:id/additional-revenues/:itemId/costs/:costId", async (request) => {
    const session = await requirePermission(request, { module: "finance", action: "manage", scope: "ALL", sensitiveArea: "financial" });
    assertCanManageAdditionalCosts(session.user.role);
    const params = additionalCostParamsSchema.parse(request.params);
    const input = updateAdditionalCostSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    const item = await getAdditionalRevenueItemOrThrow(session.user.storeId, sale.id, params.itemId);
    const cost = await getAdditionalCostOrThrow(session.user.storeId, sale.id, item.id, params.costId);
    await ensureAttachmentInStore(session.user.storeId, input.proofFileId);

    const nextCostStatus = input.costStatus ?? cost.costStatus;
    const nextExpectedCostAmount = input.expectedCostAmount === undefined ? (cost.expectedCostAmount === null ? null : decimalToNumber(cost.expectedCostAmount)) : input.expectedCostAmount;
    const nextRealizedCostAmount = input.realizedCostAmount === undefined ? (cost.realizedCostAmount === null ? null : decimalToNumber(cost.realizedCostAmount)) : input.realizedCostAmount;
    if (nextCostStatus !== "CANCELLED" && nextExpectedCostAmount == null && nextRealizedCostAmount == null) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Informe custo previsto ou realizado.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.saleAdditionalCost.updateMany({
        where: { id: cost.id, costStatus: cost.costStatus, updatedAt: cost.updatedAt },
        data: {
          costCategory: input.costCategory,
          providerId: input.providerId === undefined ? undefined : input.providerId,
          expectedCostAmount: input.expectedCostAmount === undefined ? undefined : input.expectedCostAmount,
          realizedCostAmount: input.realizedCostAmount === undefined ? undefined : input.realizedCostAmount,
          costStatus: input.costStatus,
          costDate: input.costDate === undefined ? undefined : input.costDate,
          proofFileId: input.proofFileId === undefined ? undefined : input.proofFileId,
          notes: input.notes,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Custo adicional foi alterado por outra acao. Recarregue e tente novamente.");
      }

      const next = await tx.saleAdditionalCost.findUniqueOrThrow({ where: { id: cost.id } });
      if (input.proofFileId) {
        await tx.fileAttachmentLink.createMany({
          data: [{ storeId: session.user.storeId, attachmentId: input.proofFileId, entityType: "sale", entityId: sale.id, purpose: `additional_revenue_cost_${next.costCategory}` }],
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_additional_cost_updated",
          entityType: "sale_additional_cost",
          entityId: cost.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            additionalRevenueItemId: item.id,
            changedFields: Object.keys(input),
            fromCostStatus: cost.costStatus,
            toCostStatus: next.costStatus,
            fromRealizedCostAmount: cost.realizedCostAmount?.toString() ?? null,
            toRealizedCostAmount: next.realizedCostAmount?.toString() ?? null,
          },
        },
      });

      return next;
    });

    const bundle = await loadAdditionalRevenueBundle(session.user.storeId, sale);
    return {
      data: sanitizeAdditionalCost(updated),
      item: sanitizeAdditionalRevenueItem(item, bundle.costsByItem.get(item.id) ?? []),
      summary: bundle.summary,
    };
  });

  app.post("/transfer", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    if (!canTransferToSales(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao pode transferir para o Kanban Vendas.");
    }
    const input = transferToSalesSchema.parse(request.body);

    const card = await loadScopedCommercialCard(session, input.cardId);
    if (!card) {
      return denyOwnershipAccess({
        action: "commercial_sale_transferred",
        entityId: input.cardId,
        entityType: "lead_card",
        message: "Card comercial nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    await ensureSellerInStore(session.user.storeId, input.sellerUserId);
    await ensureNoActiveSaleForCard(session.user.storeId, card.id);

    const { sale, saleCard } = await createSaleFromCard(session, card, {
      sellerUserId: input.sellerUserId,
      origin: "sdr_transfer",
      customerArrivalStatus: input.customerArrivalStatus,
      reason: input.transferReason,
      notes: input.transferNotes,
      action: "commercial_sale_transferred",
    });

    await emitInternalEvent({
      name: "commercial_sale.transferred",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "sale",
      entityId: sale.id,
      payload: { sourceCardId: card.id, leadId: card.leadId, sellerUserId: input.sellerUserId },
    });

    try {
      await notifyActiveUsers({
        storeId: session.user.storeId,
        userIds: [input.sellerUserId],
        entityType: "commercial_sale_assigned",
        entityId: sale.id,
        title: "Lead transferido para Vendas",
        body: `Um lead foi transferido para seu Kanban de Vendas. Processo ${sale.id}.`,
        priority: "HIGH",
        sourceModule: "commercial_sales",
        actionUrl: `/commercial-sales/${sale.id}`,
      });
    } catch (notificationError) {
      request.log.error({ err: notificationError }, "Falha ao gerar notificacao de transferencia para Vendas");
    }

    return reply.code(201).send({ data: sanitizeSale(sale, saleCard.stageKey) });
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    if (!OPERATE_SALES_ROLES.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao opera o Kanban Vendas.");
    }
    const input = directSalesCardSchema.parse(request.body);

    const card = await loadScopedCommercialCard(session, input.cardId);
    if (!card) {
      return denyOwnershipAccess({
        action: "commercial_sale_created",
        entityId: input.cardId,
        entityType: "lead_card",
        message: "Card comercial nao encontrado.",
        module: "leads",
        request,
        session,
      });
    }

    // Limited roles take ownership themselves; full-view roles may assign another seller.
    const sellerUserId = isCommercialFullView(session.user.role)
      ? input.sellerUserId ?? card.lead.assignedUserId ?? session.user.id
      : session.user.id;
    await ensureSellerInStore(session.user.storeId, sellerUserId);
    await ensureNoActiveSaleForCard(session.user.storeId, card.id);

    const { sale, saleCard } = await createSaleFromCard(session, card, {
      sellerUserId,
      origin: "direct_seller",
      customerArrivalStatus: input.customerArrivalStatus,
      notes: input.notes,
      action: "commercial_sale_created",
    });

    await emitInternalEvent({
      name: "commercial_sale.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "sale",
      entityId: sale.id,
      payload: { sourceCardId: card.id, leadId: card.leadId, sellerUserId },
    });

    return reply.code(201).send({ data: sanitizeSale(sale, saleCard.stageKey) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!OPERATE_SALES_ROLES.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao opera o Kanban Vendas.");
    }
    const params = saleParamsSchema.parse(request.params);
    const input = salePatchSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    if (!EDITABLE_SALE_STATUSES.has(sale.status)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Processo de vendas nao editavel no status atual.", { status: sale.status });
    }

    const snapshotPatch: Record<string, unknown> = {};
    if (input.hasTradeIn !== undefined) snapshotPatch.hasTradeIn = input.hasTradeIn;
    if (input.notes !== undefined) snapshotPatch.observationNotes = input.notes;

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.sale.updateMany({
        where: { id: sale.id, status: sale.status },
        data: {
          ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
          ...(input.paymentMethodForecast !== undefined ? { paymentMethodForecast: input.paymentMethodForecast } : {}),
          ...(input.hasFinancing !== undefined ? { hasFinancing: input.hasFinancing } : {}),
          ...(input.financingType !== undefined ? { financingType: input.financingType } : {}),
          ...(input.initialDocsStatus !== undefined ? { initialDocsStatus: input.initialDocsStatus } : {}),
          ...(Object.keys(snapshotPatch).length ? { snapshot: mergeSnapshot(sale.snapshot, snapshotPatch) } : {}),
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Processo de vendas foi alterado por outra acao. Recarregue e tente novamente.");
      }

      const next = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "commercial_sale_updated",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input), financingType: next.financingType },
        },
      });
      if (sale.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_sale_updated",
            entityType: "lead",
            entityId: sale.leadId,
            result: "SUCCESS",
            metadata: { saleId: sale.id, changedFields: Object.keys(input) },
          },
        });
      }

      return next;
    });

    const stageKey = await getSaleStageKey(updated.id);
    return {
      data: sanitizeSale(updated, stageKey),
      // Own-financing alert: the value must land in the store account (operational block).
      financingAlert: requiresOwnFinancingAlert(updated.financingType as FinancingType | null),
    };
  });

  app.post("/:id/move", async (request) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!OPERATE_SALES_ROLES.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao opera o Kanban Vendas.");
    }
    const params = saleParamsSchema.parse(request.params);
    const input = salesMoveSchema.parse(request.body);
    const sale = await loadScopedSale(session, params.id);
    if (!EDITABLE_SALE_STATUSES.has(sale.status)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Processo de vendas nao pode ser movido no status atual.", { status: sale.status });
    }
    const card = await prisma.saleCard.findFirst({ where: { saleId: sale.id } });
    if (!card) {
      throw new ApiError("NOT_FOUND", "Card de vendas nao encontrado.");
    }
    const fromStage = card.stageKey;
    if (fromStage === input.toStage) {
      return { data: sanitizeSale(sale, fromStage), unchanged: true };
    }

    const lost = input.toStage === "LOST";
    const updatedSale = await prisma.$transaction(async (tx) => {
      // Concurrency guard on the sale-card stage.
      const changed = await tx.saleCard.updateMany({
        where: { id: card.id, stageKey: fromStage },
        data: { stageKey: input.toStage, position: input.position },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Card de vendas foi alterado por outra acao. Recarregue e tente novamente.");
      }

      let next = sale;
      if (lost) {
        // LOST cancels + soft-deletes the sale, removing it from the open-sales count and lists.
        next = await tx.sale.update({
          where: { id: sale.id },
          data: { status: "CANCELLED", deletedAt: new Date(), snapshot: mergeSnapshot(sale.snapshot, { lostReason: input.reason ?? null }) },
        });
      }

      await tx.saleStageHistory.create({
        data: { storeId: session.user.storeId, saleId: sale.id, fromStage, toStage: input.toStage, actorUserId: session.user.id },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "commercial_sale_stage_changed",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { fromStage, toStage: input.toStage, reason: input.reason ?? null, cancelled: lost },
        },
      });
      if (sale.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_sale_stage_changed",
            entityType: "lead",
            entityId: sale.leadId,
            result: "SUCCESS",
            metadata: { saleId: sale.id, fromStage, toStage: input.toStage },
          },
        });
      }

      return next;
    });

    return { data: sanitizeSale(updatedSale, input.toStage), unchanged: false };
  });

  app.post("/:id/initial-documents", async (request) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!OPERATE_SALES_ROLES.has(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao opera o Kanban Vendas.");
    }
    const params = saleParamsSchema.parse(request.params);
    const input = initialDocumentsSchema.parse(request.body ?? {});
    const sale = await loadScopedSale(session, params.id);
    if (!EDITABLE_SALE_STATUSES.has(sale.status)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Processo de vendas nao editavel no status atual.", { status: sale.status });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Real producer of the technical-delivery prerequisite (buyer documents delivered, S2-US06).
      await tx.saleDocumentChecklist.upsert({
        where: { saleId_itemKey: { saleId: sale.id, itemKey: "buyer_document_delivered" } },
        update: { status: "RECEIVED", isDone: true, completedAt: new Date(), responsibleUserId: sale.sellerUserId },
        create: {
          storeId: session.user.storeId,
          saleId: sale.id,
          itemKey: "buyer_document_delivered",
          label: "Documentos do comprador entregues",
          status: "RECEIVED",
          isDone: true,
          isRequired: true,
          completedAt: new Date(),
          responsibleUserId: sale.sellerUserId,
          metadata: { category: "gate", source: "s2_us06" },
        },
      });

      const next = await tx.sale.update({
        where: { id: sale.id },
        data: {
          initialDocsStatus: input.status,
          ...(input.notes !== undefined ? { snapshot: mergeSnapshot(sale.snapshot, { initialDocsNotes: input.notes }) } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "commercial_sale_initial_documents",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { status: input.status, itemKey: "buyer_document_delivered" },
        },
      });
      if (sale.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_sale_initial_documents",
            entityType: "lead",
            entityId: sale.leadId,
            result: "SUCCESS",
            metadata: { saleId: sale.id, status: input.status },
          },
        });
      }

      return next;
    });

    const stageKey = await getSaleStageKey(result.id);
    return { data: sanitizeSale(result, stageKey) };
  });

  app.post("/:id/close", async (request) => {
    const session = await requirePermission(request, { module: "leads", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!canCloseDeal(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Seu perfil nao pode marcar negocio fechado.");
    }
    const params = saleParamsSchema.parse(request.params);
    const input = closeDealSchema.parse(request.body ?? {});
    const sale = await loadScopedSale(session, params.id);
    if (!EDITABLE_SALE_STATUSES.has(sale.status)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Negocio nao pode ser fechado no status atual.", { status: sale.status });
    }

    // Final values (body can fill what was not set during negotiation).
    const negotiatedValue = input.negotiatedValue ?? (sale.salePrice ? Number(sale.salePrice) : null);
    const paymentMethod = input.paymentMethod ?? sale.paymentMethodForecast;
    const financingType = input.financingType ?? sale.financingType;
    const missing = closingRequirementErrors({ negotiatedValue, paymentMethod });
    if (missing.length > 0) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Negocio fechado exige valor negociado e forma de pagamento prevista.", { missing });
    }

    const closedAt = new Date();
    const card = await prisma.saleCard.findFirst({ where: { saleId: sale.id } });

    const result = await prisma.$transaction(async (tx) => {
      // Concurrency guard: only close from the status we validated.
      const changed = await tx.sale.updateMany({
        where: { id: sale.id, status: sale.status },
        data: {
          status: "DOCUMENTATION",
          closedAt,
          salePrice: negotiatedValue,
          paymentMethodForecast: paymentMethod,
          ...(financingType ? { financingType } : {}),
          ...(input.hasFinancing !== undefined ? { hasFinancing: input.hasFinancing } : {}),
          snapshot: mergeSnapshot(sale.snapshot, {
            closingNotes: input.closingNotes ?? null,
            knownPendencies: input.knownPendencies ?? null,
            closedByUserId: session.user.id,
          }),
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Processo de vendas foi alterado por outra acao. Recarregue e tente novamente.");
      }
      const next = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } });

      if (card) {
        await tx.saleCard.update({ where: { id: card.id }, data: { stageKey: "CLOSED_WON" } });
        await tx.saleStageHistory.create({
          data: { storeId: session.user.storeId, saleId: sale.id, fromStage: card.stageKey, toStage: "CLOSED_WON", actorUserId: session.user.id },
        });
      }

      await createMissingBuyerDocumentChecklistItems(tx, session.user.storeId, next);
      await createMissingSalePaymentChecks(tx, session.user.storeId, next);
      await createMissingSaleInspectionReports(tx, session.user.storeId, next);

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "commercial_sale_closed",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          // Closing moves to the management/documentation queue; it NEVER releases documents/delivery.
          metadata: { negotiatedValue, paymentMethod, financingType, status: "DOCUMENTATION", releasesDocuments: false },
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "buyer_document_checklist_created",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { status: "DOCUMENTATION", customerId: next.customerId, financingType: next.financingType },
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "finance",
          action: "sale_payment_checklist_created",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { status: "DOCUMENTATION", salePrice: next.salePrice?.toString() ?? null, financingType: next.financingType },
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "sale_inspection_reports_created",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { status: "DOCUMENTATION", vehicleId: next.vehicleId },
        },
      });
      if (sale.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_sale_closed",
            entityType: "lead",
            entityId: sale.leadId,
            result: "SUCCESS",
            metadata: { saleId: sale.id, status: "DOCUMENTATION" },
          },
        });
      }

      return next;
    });

    // Own-financing alert is a best-effort side effect (outside the close transaction).
    let financingAlert = false;
    if (requiresOwnFinancingAlert(result.financingType as FinancingType | null)) {
      financingAlert = true;
      try {
        await raiseOwnFinancingAlert(session, result);
      } catch (alertError) {
        request.log.error({ err: alertError }, "Falha ao gerar alerta de financeira propria");
      }
    }

    try {
      const managementUserIds = await activeStoreUserIdsByRoles(session.user.storeId, ["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);
      await notifyActiveUsers({
        storeId: session.user.storeId,
        userIds: managementUserIds,
        entityType: "commercial_sale_documentation_pending",
        entityId: result.id,
        title: "Venda fechada aguardando Gestao/Documentacao",
        body: `O processo de vendas ${result.id} foi fechado e precisa de conferencia documental e acompanhamento administrativo.`,
        priority: "HIGH",
        sourceModule: "commercial_sales",
        actionUrl: `/commercial-sales/${result.id}`,
      });
    } catch (notificationError) {
      request.log.error({ err: notificationError }, "Falha ao gerar notificacao de venda para Gestao/Documentacao");
    }

    await emitInternalEvent({
      name: "commercial_sale.closed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "sale",
      entityId: result.id,
      payload: { leadId: result.leadId, sellerUserId: result.sellerUserId, status: "DOCUMENTATION" },
    });

    return { data: sanitizeSale(result, "CLOSED_WON"), financingAlert, releasesDocuments: false };
  });

  app.post("/:id/confer-documents", async (request) => {
    // Conference is a Management/Administrative action (Administrativo has sales:update, not leads:update).
    const session = await requirePermission(request, { module: "sales", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!isCommercialFullView(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestao/Administracao confere a documentacao.");
    }
    const params = saleParamsSchema.parse(request.params);
    conferDocumentsSchema.parse(request.body ?? {});
    const sale = await loadScopedSale(session, params.id);
    if (sale.status !== "DOCUMENTATION") {
      throw new ApiError("BUSINESS_RULE_ERROR", "Processo nao esta na fila de Gestao/Documentacao.", { status: sale.status });
    }

    await prisma.$transaction(async (tx) => {
      // Real producer of the technical-delivery prerequisite (buyer documents checked, S2-US06).
      await tx.saleDocumentChecklist.upsert({
        where: { saleId_itemKey: { saleId: sale.id, itemKey: "buyer_document_checked" } },
        update: { status: "CHECKED", isDone: true, completedAt: new Date(), checkedAt: new Date(), checkedByUserId: session.user.id },
        create: {
          storeId: session.user.storeId,
          saleId: sale.id,
          itemKey: "buyer_document_checked",
          label: "Documentos do comprador conferidos",
          status: "CHECKED",
          isDone: true,
          isRequired: true,
          completedAt: new Date(),
          checkedAt: new Date(),
          checkedByUserId: session.user.id,
          metadata: { category: "gate", source: "s2_us06" },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_sales",
          action: "commercial_sale_documents_conferred",
          entityType: "sale",
          entityId: sale.id,
          result: "SUCCESS",
          metadata: { itemKey: "buyer_document_checked" },
        },
      });
      if (sale.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_sale_documents_conferred",
            entityType: "lead",
            entityId: sale.leadId,
            result: "SUCCESS",
            metadata: { saleId: sale.id },
          },
        });
      }
    });

    const stageKey = await getSaleStageKey(sale.id);
    return { data: sanitizeSale(sale, stageKey) };
  });
}
