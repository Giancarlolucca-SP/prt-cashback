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
  requiresOwnFinancingAlert,
  type CustomerArrivalStatus,
  type FinancingType,
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

const financingTypeSchema = z.enum(["STORE_PARTNER", "CUSTOMER_OWN", "NOT_APPLICABLE"]);
const initialDocStatusSchema = z.enum(["PENDING", "PARTIAL", "COLLECTED"]);

// Statuses in which the sales process is still editable/negotiable.
const EDITABLE_SALE_STATUSES: ReadonlySet<string> = new Set(["DRAFT", "PROPOSAL", "APPROVED"]);

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
      const next = await tx.sale.update({
        where: { id: sale.id },
        data: {
          ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
          ...(input.paymentMethodForecast !== undefined ? { paymentMethodForecast: input.paymentMethodForecast } : {}),
          ...(input.hasFinancing !== undefined ? { hasFinancing: input.hasFinancing } : {}),
          ...(input.financingType !== undefined ? { financingType: input.financingType } : {}),
          ...(input.initialDocsStatus !== undefined ? { initialDocsStatus: input.initialDocsStatus } : {}),
          ...(Object.keys(snapshotPatch).length ? { snapshot: mergeSnapshot(sale.snapshot, snapshotPatch) } : {}),
        },
      });

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
        update: { isDone: true, completedAt: new Date() },
        create: {
          storeId: session.user.storeId,
          saleId: sale.id,
          itemKey: "buyer_document_delivered",
          label: "Documentos do comprador entregues",
          isDone: true,
          completedAt: new Date(),
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
}
