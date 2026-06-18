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
  CUSTOMER_ARRIVAL_STATUSES,
  canTransferToSales,
  type CustomerArrivalStatus,
} from "../services/sales-transition.js";

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

type SaleRecord = Prisma.SaleGetPayload<Record<string, never>>;

function sanitizeSale(sale: SaleRecord, stageKey: string | null) {
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

    return listResponse(items.map((sale) => sanitizeSale(sale, stageBySaleId.get(sale.id) ?? null)), query, total);
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
    return { data: sanitizeSale(sale, card?.stageKey ?? null) };
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
}
