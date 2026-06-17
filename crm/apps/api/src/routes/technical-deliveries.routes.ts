import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { prisma } from "../lib/db.js";

const deliveryStatusSchema = z.enum([
  "AWAITING_PREREQUISITES",
  "READY_TO_SCHEDULE",
  "SCHEDULED",
  "DOCUMENT_GENERATED",
  "PRINTED_PENDING_SIGNATURE",
  "COMPLETED_SIGNED",
  "PENDING_SIGNED_COPY",
  "RESCHEDULED",
  "CANCELLED",
  "BLOCKED",
]);

const technicalDeliveryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  seller_user_id: z.string().uuid().optional(),
  status: deliveryStatusSchema.optional(),
});

const technicalDeliveryParamsSchema = z.object({
  id: z.string().uuid(),
});

const scheduleTechnicalDeliverySchema = z.object({
  saleId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  responsibleUserId: z.string().uuid().optional(),
});

const allowedSchedulerRoles = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);
const requiredBuyerDocumentKeys = ["buyer_document_delivered", "buyer_document_checked"];

const defaultTechnicalDeliveryChecklist = [
  { key: "turn_signals", label: "Piscas/setas" },
  { key: "external_lights", label: "Luzes externas" },
  { key: "door_handles", label: "Macanetas" },
  { key: "locks", label: "Travas" },
  { key: "windows", label: "Vidros" },
  { key: "electronics", label: "Itens eletronicos" },
  { key: "dashboard", label: "Painel" },
  { key: "multimedia", label: "Multimidia, quando houver" },
  { key: "manual", label: "Manual" },
  { key: "spare_key", label: "Chave reserva" },
  { key: "jack", label: "Macaco" },
  { key: "triangle", label: "Triangulo" },
  { key: "spare_tire", label: "Estepe" },
  { key: "required_tools", label: "Ferramentas obrigatorias/disponiveis" },
  { key: "vehicle_360_check", label: "Conferencia 360 do veiculo junto com o cliente" },
  { key: "engine_oil", label: "Oleo do motor: nivel/condicao aparente" },
  { key: "delivery_notes", label: "Observacoes da entrega" },
];

type TechnicalDeliveryRecord = {
  id: string;
  saleId: string;
  vehicleId: string;
  customerId: string;
  sellerUserId: string | null;
  scheduledByUserId: string;
  responsibleUserId: string | null;
  scheduledAt: Date;
  status: string;
  checklistSnapshot: unknown;
  documentGeneratedAt: Date | null;
  documentFileId: string | null;
  printStatus: string;
  printedAt: Date | null;
  signedCopyStatus: string;
  signedCopyFileId: string | null;
  completedAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeTechnicalDelivery(delivery: TechnicalDeliveryRecord) {
  return {
    id: delivery.id,
    saleId: delivery.saleId,
    vehicleId: delivery.vehicleId,
    customerId: delivery.customerId,
    sellerUserId: delivery.sellerUserId,
    scheduledByUserId: delivery.scheduledByUserId,
    responsibleUserId: delivery.responsibleUserId,
    scheduledAt: delivery.scheduledAt.toISOString(),
    status: delivery.status,
    checklistSnapshot: delivery.checklistSnapshot,
    documentGeneratedAt: delivery.documentGeneratedAt?.toISOString() ?? null,
    documentFileId: delivery.documentFileId,
    printStatus: delivery.printStatus,
    printedAt: delivery.printedAt?.toISOString() ?? null,
    signedCopyStatus: delivery.signedCopyStatus,
    signedCopyFileId: delivery.signedCopyFileId,
    completedAt: delivery.completedAt?.toISOString() ?? null,
    cancelReason: delivery.cancelReason,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

function sellerScopedWhere(user: { id: string; role: string }) {
  return user.role === "SELLER" ? { sellerUserId: user.id } : {};
}

function assertCanScheduleTechnicalDelivery(role: string) {
  if (!allowedSchedulerRoles.has(role)) {
    throw new ApiError("FORBIDDEN", "Somente Administrativo, Administrador ou Gestao pode agendar entrega tecnica.");
  }
}

async function ensureUserInStore(storeId: string, userId?: string | null) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel pela entrega tecnica nao encontrado.");
  }
}

async function getSaleReadyForDelivery(storeId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      vehicleId: true,
      sellerUserId: true,
      status: true,
    },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda da entrega tecnica nao encontrada.");
  }

  if (sale.status === "CANCELLED") {
    throw new ApiError("BUSINESS_RULE_ERROR", "Entrega tecnica nao pode ser agendada para venda cancelada.");
  }

  const missingSaleLinks = [
    !sale.customerId ? "customer_id" : null,
    !sale.vehicleId ? "vehicle_id" : null,
    !sale.sellerUserId ? "seller_id" : null,
  ].filter((item): item is string => Boolean(item));

  if (missingSaleLinks.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Venda incompleta para agendar entrega tecnica.", { missingSaleLinks });
  }

  const customerId = sale.customerId;
  const vehicleId = sale.vehicleId;
  const sellerUserId = sale.sellerUserId;

  if (!customerId || !vehicleId || !sellerUserId) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Venda incompleta para agendar entrega tecnica.", { missingSaleLinks });
  }

  return {
    id: sale.id,
    customerId,
    vehicleId,
    sellerUserId,
    status: sale.status,
  };
}

async function ensureDeliveryPrerequisites(storeId: string, saleId: string) {
  const [signedContract, buyerDocumentChecklist, paidIncome] = await Promise.all([
    prisma.contract.findFirst({
      where: {
        storeId,
        saleId,
        status: "SIGNED",
        signedAt: { not: null },
      },
      select: { id: true, signedAt: true },
      orderBy: { signedAt: "desc" },
    }),
    prisma.saleDocumentChecklist.findMany({
      where: {
        storeId,
        saleId,
        itemKey: { in: requiredBuyerDocumentKeys },
      },
      select: { itemKey: true, isDone: true, completedAt: true },
    }),
    prisma.financialTransaction.findFirst({
      where: {
        storeId,
        entityType: "sale",
        entityId: saleId,
        type: "INCOME",
        status: "PAID",
        deletedAt: null,
      },
      select: { id: true, paidAt: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const checklistByKey = new Map(buyerDocumentChecklist.map((item) => [item.itemKey, item]));
  const buyerDocumentsReady = requiredBuyerDocumentKeys.every((key) => checklistByKey.get(key)?.isDone === true);
  const pendingPrerequisites = [
    !signedContract ? "contract_signed" : null,
    !buyerDocumentsReady ? "buyer_documents_checked" : null,
    !paidIncome ? "payment_confirmed" : null,
  ].filter((item): item is string => Boolean(item));

  if (pendingPrerequisites.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Entrega tecnica ainda nao liberada.", { pendingPrerequisites });
  }

  if (!signedContract || !paidIncome) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Entrega tecnica ainda nao liberada.", { pendingPrerequisites });
  }

  return {
    signedContractId: signedContract.id,
    signedAt: signedContract.signedAt?.toISOString() ?? null,
    paidTransactionId: paidIncome.id,
    paidAt: paidIncome.paidAt?.toISOString() ?? null,
    buyerDocumentKeys: requiredBuyerDocumentKeys,
  };
}

export async function registerTechnicalDeliveryRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = technicalDeliveryQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.TechnicalDeliveryWhereInput = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.seller_user_id ? { sellerUserId: query.seller_user_id } : {}),
      ...sellerScopedWhere(session.user),
    };

    const [items, total] = await Promise.all([
      prisma.technicalDelivery.findMany({ where, orderBy: { scheduledAt: "asc" }, skip, take }),
      prisma.technicalDelivery.count({ where }),
    ]);

    return listResponse(items.map(sanitizeTechnicalDelivery), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = technicalDeliveryParamsSchema.parse(request.params);
    const delivery = await prisma.technicalDelivery.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        ...sellerScopedWhere(session.user),
      },
    });

    if (!delivery) {
      throw new ApiError("NOT_FOUND", "Entrega tecnica nao encontrada.");
    }

    return { data: sanitizeTechnicalDelivery(delivery) };
  });

  app.post("/schedule", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    assertCanScheduleTechnicalDelivery(session.user.role);
    const input = scheduleTechnicalDeliverySchema.parse(request.body);
    const sale = await getSaleReadyForDelivery(session.user.storeId, input.saleId);
    await ensureUserInStore(session.user.storeId, input.responsibleUserId);
    const prerequisites = await ensureDeliveryPrerequisites(session.user.storeId, sale.id);
    const responsibleUserId = input.responsibleUserId ?? session.user.id;
    const existing = await prisma.technicalDelivery.findFirst({
      where: { storeId: session.user.storeId, saleId: sale.id },
    });

    const result = await prisma.$transaction(async (tx) => {
      const delivery = existing
        ? await tx.technicalDelivery.update({
            where: { id: existing.id },
            data: {
              scheduledAt: input.scheduledAt,
              scheduledByUserId: session.user.id,
              responsibleUserId,
              status: "RESCHEDULED",
              cancelReason: null,
            },
          })
        : await tx.technicalDelivery.create({
            data: {
              storeId: session.user.storeId,
              saleId: sale.id,
              vehicleId: sale.vehicleId,
              customerId: sale.customerId,
              sellerUserId: sale.sellerUserId,
              scheduledByUserId: session.user.id,
              responsibleUserId,
              scheduledAt: input.scheduledAt,
              status: "SCHEDULED",
              checklistSnapshot: defaultTechnicalDeliveryChecklist as Prisma.InputJsonValue,
              printStatus: "PENDING",
              signedCopyStatus: "PENDING",
            },
          });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "technical_deliveries",
          action: existing ? "technical_delivery_rescheduled" : "technical_delivery_scheduled",
          entityType: "technical_delivery",
          entityId: delivery.id,
          result: "SUCCESS",
          metadata: {
            saleId: delivery.saleId,
            vehicleId: delivery.vehicleId,
            customerId: delivery.customerId,
            sellerUserId: delivery.sellerUserId,
            previousScheduledAt: existing?.scheduledAt.toISOString() ?? null,
            scheduledAt: delivery.scheduledAt.toISOString(),
            responsibleUserId: delivery.responsibleUserId,
            prerequisites,
          },
        },
      });

      return { delivery, created: !existing };
    });

    return reply.code(result.created ? 201 : 200).send({ data: sanitizeTechnicalDelivery(result.delivery) });
  });
}
