import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const saleTypeSchema = z.enum(["VEHICLE", "REPASSE", "SERVICE"]);
const saleStatusSchema = z.enum(["DRAFT", "PROPOSAL", "APPROVED", "DOCUMENTATION", "CLOSED", "CANCELLED"]);

const salesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: saleStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  seller_user_id: z.string().uuid().optional(),
});

const createSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  inventoryId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  sellerUserId: z.string().uuid().optional(),
  type: saleTypeSchema.default("VEHICLE"),
  status: saleStatusSchema.default("DRAFT"),
  salePrice: z.number().nonnegative().optional(),
});

const updateSaleSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    sellerUserId: z.string().uuid().nullable().optional(),
    salePrice: z.number().nonnegative().nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const saleParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateSaleStatusSchema = z.object({
  status: saleStatusSchema,
  reason: z.string().trim().max(300).optional(),
  position: z.number().int().min(0).default(0),
});

type SaleRecord = {
  id: string;
  storeId: string;
  customerId: string | null;
  vehicleId: string | null;
  sellerUserId: string | null;
  type: string;
  status: string;
  salePrice: { toString(): string } | null;
  grossMargin: { toString(): string } | null;
  snapshot: unknown;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeSale(sale: SaleRecord) {
  return {
    id: sale.id,
    customerId: sale.customerId,
    vehicleId: sale.vehicleId,
    sellerUserId: sale.sellerUserId,
    type: sale.type,
    status: sale.status,
    salePrice: sale.salePrice?.toString() ?? null,
    grossMargin: sale.grossMargin?.toString() ?? null,
    snapshot: sale.snapshot,
    closedAt: sale.closedAt?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}

async function ensureCustomerInStore(storeId: string, customerId?: string | null) {
  if (!customerId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!customer) {
    throw new ApiError("NOT_FOUND", "Cliente da venda nao encontrado.");
  }
}

async function ensureUserInStore(storeId: string, userId?: string | null) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Vendedor da venda nao encontrado.");
  }
}

async function getVehicleContext(storeId: string, input: { inventoryId?: string; vehicleId?: string }) {
  if (input.inventoryId) {
    const inventory = await prisma.vehicleInventoryRecord.findFirst({
      where: { id: input.inventoryId, storeId, deletedAt: null },
    });

    if (!inventory) {
      throw new ApiError("NOT_FOUND", "Estoque da venda nao encontrado.");
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: inventory.vehicleId, storeId, deletedAt: null },
    });

    if (!vehicle) {
      throw new ApiError("NOT_FOUND", "Veiculo da venda nao encontrado.");
    }

    return { inventory, vehicle };
  }

  if (input.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: input.vehicleId, storeId, deletedAt: null },
    });

    if (!vehicle) {
      throw new ApiError("NOT_FOUND", "Veiculo da venda nao encontrado.");
    }

    const inventory = await prisma.vehicleInventoryRecord.findFirst({
      where: { vehicleId: vehicle.id, storeId, deletedAt: null },
      orderBy: { entryDate: "desc" },
    });

    return { inventory, vehicle };
  }

  return { inventory: null, vehicle: null };
}

async function calculateGrossMargin(input: {
  storeId: string;
  vehicleId?: string | null;
  inventoryId?: string | null;
  salePrice?: number | null;
}) {
  if (!input.salePrice || !input.vehicleId) {
    return null;
  }

  const inventory =
    input.inventoryId
      ? await prisma.vehicleInventoryRecord.findFirst({
          where: { id: input.inventoryId, storeId: input.storeId, deletedAt: null },
        })
      : await prisma.vehicleInventoryRecord.findFirst({
          where: { vehicleId: input.vehicleId, storeId: input.storeId, deletedAt: null },
          orderBy: { entryDate: "desc" },
        });

  const purchaseCost = Number(inventory?.purchaseCost?.toString() ?? 0);
  const costs = await prisma.vehicleCost.findMany({
    where: {
      storeId: input.storeId,
      vehicleId: input.vehicleId,
      deletedAt: null,
      capitalized: true,
    },
    select: { amount: true },
  });
  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount.toString()), 0);

  return input.salePrice - purchaseCost - totalCosts;
}

async function getSaleOrThrow(storeId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda nao encontrada.");
  }

  return sale;
}

export async function registerSaleRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = salesQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.seller_user_id ? { sellerUserId: query.seller_user_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.sale.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.sale.count({ where }),
    ]);

    return listResponse(items.map(sanitizeSale), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = saleParamsSchema.parse(request.params);
    const sale = await getSaleOrThrow(session.user.storeId, params.id);

    return { data: sanitizeSale(sale) };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createSaleSchema.parse(request.body);
    const sellerUserId = input.sellerUserId ?? session.user.id;

    await ensureCustomerInStore(session.user.storeId, input.customerId);
    await ensureUserInStore(session.user.storeId, sellerUserId);
    const vehicleContext = await getVehicleContext(session.user.storeId, input);
    const grossMargin = await calculateGrossMargin({
      storeId: session.user.storeId,
      vehicleId: vehicleContext.vehicle?.id,
      inventoryId: vehicleContext.inventory?.id,
      salePrice: input.salePrice,
    });

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          storeId: session.user.storeId,
          customerId: input.customerId,
          vehicleId: vehicleContext.vehicle?.id,
          sellerUserId,
          type: input.type,
          status: input.status,
          salePrice: input.salePrice,
          grossMargin,
          snapshot: {
            customerId: input.customerId,
            vehicleId: vehicleContext.vehicle?.id,
            inventoryId: vehicleContext.inventory?.id,
            salePrice: input.salePrice ?? null,
            grossMargin,
            vehicle: vehicleContext.vehicle
              ? {
                  brand: vehicleContext.vehicle.brand,
                  model: vehicleContext.vehicle.model,
                  version: vehicleContext.vehicle.version,
                  plate: vehicleContext.vehicle.plate,
                  mileage: vehicleContext.vehicle.mileage,
                }
              : null,
          },
        },
      });

      await tx.saleCard.create({
        data: {
          storeId: session.user.storeId,
          saleId: created.id,
          stageKey: created.status,
          position: 0,
        },
      });

      await tx.saleStageHistory.create({
        data: {
          storeId: session.user.storeId,
          saleId: created.id,
          fromStage: null,
          toStage: created.status,
          actorUserId: session.user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "sales",
          action: "create",
          entityType: "sale",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            customerId: created.customerId,
            vehicleId: created.vehicleId,
            status: created.status,
            salePrice: created.salePrice?.toString() ?? null,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "sale.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "sale",
      entityId: sale.id,
      payload: { status: sale.status, vehicleId: sale.vehicleId },
    });

    return reply.code(201).send({ data: sanitizeSale(sale) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = saleParamsSchema.parse(request.params);
    const input = updateSaleSchema.parse(request.body);
    const current = await getSaleOrThrow(session.user.storeId, params.id);

    await ensureCustomerInStore(session.user.storeId, input.customerId);
    await ensureUserInStore(session.user.storeId, input.sellerUserId);
    const salePrice = input.salePrice === undefined ? Number(current.salePrice?.toString() ?? 0) : input.salePrice;
    const grossMargin = await calculateGrossMargin({
      storeId: session.user.storeId,
      vehicleId: current.vehicleId,
      salePrice,
    });

    const sale = await prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id: current.id },
        data: {
          customerId: input.customerId,
          sellerUserId: input.sellerUserId,
          salePrice: input.salePrice,
          grossMargin,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "sales",
          action: "update",
          entityType: "sale",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });

      return updated;
    });

    return { data: sanitizeSale(sale) };
  });

  app.post("/:id/status", async (request) => {
    const params = saleParamsSchema.parse(request.params);
    const input = updateSaleStatusSchema.parse(request.body);
    const permission =
      input.status === "APPROVED" || input.status === "CLOSED"
        ? { module: "sales", action: "approve", scope: "ALL" as const, sensitiveArea: "sensitive_approval" }
        : { module: "sales", action: "update", scope: "STORE" as const, sensitiveArea: "general" };
    const session = await requirePermission(request, permission);
    const current = await getSaleOrThrow(session.user.storeId, params.id);

    if (current.status === input.status) {
      return { data: sanitizeSale(current), unchanged: true };
    }

    const sale = await prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id: current.id },
        data: {
          status: input.status,
          closedAt: input.status === "CLOSED" ? new Date() : current.closedAt,
          deletedAt: input.status === "CANCELLED" ? new Date() : null,
        },
      });

      const card = await tx.saleCard.findFirst({
        where: { storeId: session.user.storeId, saleId: updated.id },
      });
      if (card) {
        await tx.saleCard.update({
          where: { id: card.id },
          data: { stageKey: input.status, position: input.position },
        });
      }

      await tx.saleStageHistory.create({
        data: {
          storeId: session.user.storeId,
          saleId: updated.id,
          fromStage: current.status,
          toStage: input.status,
          actorUserId: session.user.id,
        },
      });

      if (input.status === "CLOSED" && updated.vehicleId) {
        await tx.vehicleInventoryRecord.updateMany({
          where: {
            storeId: session.user.storeId,
            vehicleId: updated.vehicleId,
            deletedAt: null,
          },
          data: {
            status: "SOLD",
            exitDate: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "sales",
          action: "status_changed",
          entityType: "sale",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            fromStatus: current.status,
            toStatus: input.status,
            reason: input.reason,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: input.status === "CLOSED" ? "sale.closed" : "sale.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "sale",
      entityId: sale.id,
      payload: { fromStatus: current.status, toStatus: input.status, reason: input.reason },
    });

    return { data: sanitizeSale(sale), unchanged: false };
  });
}
