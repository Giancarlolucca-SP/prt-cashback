import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { canUser } from "../auth/rbac.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const ownershipTypeSchema = z.enum(["OWN", "CONSIGNED", "REPASSE", "TRADE_IN"]);
const inventoryStatusSchema = z.enum(["IN_PREPARATION", "AVAILABLE", "RESERVED", "SOLD", "REPASSE", "REMOVED"]);

const inventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: inventoryStatusSchema.optional(),
  ownership_type: ownershipTypeSchema.optional(),
});

const vehiclePayloadSchema = z.object({
  brand: z.string().trim().min(2).max(80),
  model: z.string().trim().min(1).max(100),
  version: z.string().trim().max(120).optional(),
  yearModel: z.number().int().min(1900).max(2100).optional(),
  yearBuild: z.number().int().min(1900).max(2100).optional(),
  plate: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, "Informe uma placa valida no padrao ABC1234 ou ABC1D23.")
    .optional(),
  vin: z.string().trim().min(6).max(32).optional(),
  color: z.string().trim().max(40).optional(),
  mileage: z.number().int().min(0).optional(),
  fipeCode: z.string().trim().max(40).optional(),
});

const createVehiclePayloadSchema = vehiclePayloadSchema.extend({
  yearModel: z.number().int().min(1900).max(2100),
});

const createInventorySchema = z.object({
  vehicle: createVehiclePayloadSchema,
  ownershipType: ownershipTypeSchema,
  status: inventoryStatusSchema.default("IN_PREPARATION"),
  ownerCustomerId: z.string().uuid().optional(),
  purchaseCost: z.number().nonnegative().optional(),
  askingPrice: z.number().nonnegative().optional(),
  entryDate: z.coerce.date(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do estoque") })
    .optional(),
});

const updateInventorySchema = z
  .object({
    vehicle: vehiclePayloadSchema.partial().optional(),
    ownershipType: ownershipTypeSchema.optional(),
    status: inventoryStatusSchema.optional(),
    ownerCustomerId: z.string().uuid().nullable().optional(),
    purchaseCost: z.number().nonnegative().nullable().optional(),
    askingPrice: z.number().nonnegative().nullable().optional(),
    entryDate: z.coerce.date().optional(),
    exitDate: z.coerce.date().nullable().optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do estoque") })
      .nullable()
      .optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const inventoryParamsSchema = z.object({
  id: z.string().uuid(),
});

const addVehicleCostSchema = z.object({
  category: z.string().trim().min(2).max(80),
  description: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Descricao do custo do veiculo") }),
  amount: z.number().positive(),
  occurredAt: z.coerce.date().optional(),
  capitalized: z.boolean().default(true),
});

type VehicleRecord = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  yearModel: number | null;
  yearBuild: number | null;
  plate: string | null;
  vin: string | null;
  color: string | null;
  mileage: number | null;
  fipeCode: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type InventoryRecord = {
  id: string;
  vehicleId: string;
  ownershipType: string;
  status: string;
  ownerCustomerId: string | null;
  purchaseCost: { toString(): string } | null;
  askingPrice: { toString(): string } | null;
  entryDate: Date;
  exitDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeVehicle(vehicle: VehicleRecord) {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    yearModel: vehicle.yearModel,
    yearBuild: vehicle.yearBuild,
    plate: vehicle.plate,
    vin: vehicle.vin,
    color: vehicle.color,
    mileage: vehicle.mileage,
    fipeCode: vehicle.fipeCode,
    status: vehicle.status,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

function sanitizeInventory(record: InventoryRecord, vehicle: VehicleRecord | undefined, options: { includeCosts: boolean }) {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    vehicle: vehicle ? sanitizeVehicle(vehicle) : null,
    ownershipType: record.ownershipType,
    status: record.status,
    ownerCustomerId: record.ownerCustomerId,
    purchaseCost: options.includeCosts ? (record.purchaseCost?.toString() ?? null) : null,
    askingPrice: record.askingPrice?.toString() ?? null,
    entryDate: record.entryDate.toISOString(),
    exitDate: record.exitDate?.toISOString() ?? null,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function canReadInventoryCosts(user: Parameters<typeof canUser>[0]) {
  const decision = await canUser(user, {
    module: "inventory",
    action: "read_costs",
    scope: "ALL",
    sensitiveArea: "margin",
  });

  return decision.allowed;
}

function sanitizeInventoryDocument(input: {
  attachment: {
    id: string;
    originalName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    classification: string | null;
    status: string;
    uploadedByUserId: string | null;
    createdAt: Date;
  };
  link: {
    entityType: string;
    entityId: string;
    purpose: string | null;
  };
}) {
  return {
    id: input.attachment.id,
    originalName: input.attachment.originalName,
    mimeType: input.attachment.mimeType,
    sizeBytes: input.attachment.sizeBytes,
    classification: input.attachment.classification,
    status: input.attachment.status,
    uploadedByUserId: input.attachment.uploadedByUserId,
    entityType: input.link.entityType,
    entityId: input.link.entityId,
    purpose: input.link.purpose,
    createdAt: input.attachment.createdAt.toISOString(),
  };
}

function sanitizeActiveListing(listing: {
  id: string;
  title: string;
  description: string | null;
  askingPrice: { toString(): string } | null;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    askingPrice: listing.askingPrice?.toString() ?? null,
    status: listing.status,
    updatedAt: listing.updatedAt.toISOString(),
  };
}

async function ensureCustomerInStore(storeId: string, customerId?: string | null) {
  if (!customerId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!customer) {
    throw new ApiError("NOT_FOUND", "Proprietario/consignante nao encontrado.");
  }
}

function enforceConsignedInventoryRules(input: {
  ownerCustomerId?: string | null;
  ownershipType: string;
  purchaseCost?: number | string | { toString(): string } | null;
}) {
  if (input.ownershipType !== "CONSIGNED") {
    return;
  }

  const purchaseCost = Number(input.purchaseCost?.toString() ?? 0);

  if (!input.ownerCustomerId) {
    throw new ApiError("VALIDATION_ERROR", "Veiculo consignado exige consignante vinculado.");
  }

  if (purchaseCost <= 0) {
    throw new ApiError("VALIDATION_ERROR", "Veiculo consignado exige valor acordado com o proprietario.");
  }
}

function enforceCommonInventoryScope(input: { ownershipType?: string; status?: string }) {
  if (input.ownershipType === "REPASSE" || input.status === "REPASSE") {
    throw new ApiError("VALIDATION_ERROR", "Repasse e um modulo separado e nao entra no estoque comum da loja.");
  }
}

async function getInventoryOrThrow(storeId: string, id: string) {
  const inventory = await prisma.vehicleInventoryRecord.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!inventory) {
    throw new ApiError("NOT_FOUND", "Item de estoque nao encontrado.");
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: inventory.vehicleId, storeId, deletedAt: null },
  });

  if (!vehicle) {
    throw new ApiError("NOT_FOUND", "Veiculo do estoque nao encontrado.");
  }

  return { inventory, vehicle };
}

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const includeCosts = await canReadInventoryCosts(session.user);
    const query = inventoryQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const searchYear = query.search && /^\d{4}$/.test(query.search) ? Number(query.search) : null;

    const matchingVehicleIds = query.search
      ? (
          await prisma.vehicle.findMany({
            where: {
              storeId: session.user.storeId,
              deletedAt: null,
              OR: [
                { brand: { contains: query.search, mode: "insensitive" } },
                { model: { contains: query.search, mode: "insensitive" } },
                { version: { contains: query.search, mode: "insensitive" } },
                { plate: { contains: query.search, mode: "insensitive" } },
                { color: { contains: query.search, mode: "insensitive" } },
                ...(searchYear ? [{ yearModel: searchYear }, { yearBuild: searchYear }] : []),
              ],
            },
            select: { id: true },
          })
        ).map((vehicle) => vehicle.id)
      : null;

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownership_type ? { ownershipType: query.ownership_type } : {}),
      ...(!query.status && !query.ownership_type
        ? {
            NOT: [{ status: "REPASSE" as const }, { ownershipType: "REPASSE" as const }],
          }
        : {}),
      ...(matchingVehicleIds ? { vehicleId: { in: matchingVehicleIds } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.vehicleInventoryRecord.findMany({
        where,
        orderBy: { entryDate: "desc" },
        skip,
        take,
      }),
      prisma.vehicleInventoryRecord.count({ where }),
    ]);
    const vehicles = await prisma.vehicle.findMany({
      where: { id: { in: items.map((item) => item.vehicleId) }, storeId: session.user.storeId },
    });
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    return listResponse(
      items.map((item) => sanitizeInventory(item, vehicleById.get(item.vehicleId), { includeCosts })),
      query,
      total,
    );
  });

  app.get("/:id/detail", async (request) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = inventoryParamsSchema.parse(request.params);
    const includeCosts = await canReadInventoryCosts(session.user);
    const { inventory, vehicle } = await getInventoryOrThrow(session.user.storeId, params.id);
    const links = await prisma.fileAttachmentLink.findMany({
      where: {
        storeId: session.user.storeId,
        OR: [
          { entityType: "vehicle", entityId: vehicle.id },
          { entityType: "vehicle_inventory", entityId: inventory.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    const attachments = links.length
      ? await prisma.fileAttachment.findMany({
          where: {
            id: { in: links.map((link) => link.attachmentId) },
            storeId: session.user.storeId,
            deletedAt: null,
          },
        })
      : [];
    const attachmentById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
    const activeListings = await prisma.listing.findMany({
      where: {
        storeId: session.user.storeId,
        vehicleId: vehicle.id,
        deletedAt: null,
        status: { in: ["PENDING", "PUBLISHED"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    return {
      data: sanitizeInventory(inventory, vehicle, { includeCosts }),
      documents: links.flatMap((link) => {
        const attachment = attachmentById.get(link.attachmentId);
        return attachment ? [sanitizeInventoryDocument({ attachment, link })] : [];
      }),
      activeListings: activeListings.map(sanitizeActiveListing),
    };
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = inventoryParamsSchema.parse(request.params);
    const includeCosts = await canReadInventoryCosts(session.user);
    const { inventory, vehicle } = await getInventoryOrThrow(session.user.storeId, params.id);

    return { data: sanitizeInventory(inventory, vehicle, { includeCosts }) };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createInventorySchema.parse(request.body);

    enforceCommonInventoryScope(input);
    enforceConsignedInventoryRules(input);
    await ensureCustomerInStore(session.user.storeId, input.ownerCustomerId);

    if (input.vehicle.plate) {
      const existing = await prisma.vehicle.findFirst({
        where: { storeId: session.user.storeId, plate: input.vehicle.plate, deletedAt: null },
        select: { id: true },
      });

      if (existing) {
        throw new ApiError("CONFLICT", "Veiculo ja cadastrado com esta placa.", { vehicleId: existing.id });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          storeId: session.user.storeId,
          ...input.vehicle,
        },
      });

      const inventory = await tx.vehicleInventoryRecord.create({
        data: {
          storeId: session.user.storeId,
          vehicleId: vehicle.id,
          ownershipType: input.ownershipType,
          status: input.status,
          ownerCustomerId: input.ownerCustomerId,
          purchaseCost: input.purchaseCost,
          askingPrice: input.askingPrice,
          entryDate: input.entryDate,
          notes: input.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "inventory",
          action: "create",
          entityType: "vehicle_inventory",
          entityId: inventory.id,
          result: "SUCCESS",
          metadata: {
            vehicleId: vehicle.id,
            plate: vehicle.plate,
            ownershipType: inventory.ownershipType,
            status: inventory.status,
          },
        },
      });

      return { inventory, vehicle };
    });

    await emitInternalEvent({
      name: "inventory.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "vehicle_inventory",
      entityId: result.inventory.id,
      payload: { vehicleId: result.vehicle.id, status: result.inventory.status },
    });

    return reply.code(201).send({ data: sanitizeInventory(result.inventory, result.vehicle, { includeCosts: await canReadInventoryCosts(session.user) }) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = inventoryParamsSchema.parse(request.params);
    const input = updateInventorySchema.parse(request.body);
    enforceCommonInventoryScope(input);
    const current = await getInventoryOrThrow(session.user.storeId, params.id);
    const nextOwnershipType = input.ownershipType ?? current.inventory.ownershipType;
    const nextOwnerCustomerId = input.ownerCustomerId === undefined ? current.inventory.ownerCustomerId : input.ownerCustomerId;
    const nextPurchaseCost = input.purchaseCost === undefined ? current.inventory.purchaseCost : input.purchaseCost;
    const statusChanged = input.status !== undefined && input.status !== current.inventory.status;
    const ownershipTypeChanged = input.ownershipType !== undefined && input.ownershipType !== current.inventory.ownershipType;

    enforceConsignedInventoryRules({
      ownerCustomerId: nextOwnerCustomerId,
      ownershipType: nextOwnershipType,
      purchaseCost: nextPurchaseCost,
    });
    await ensureCustomerInStore(session.user.storeId, input.ownerCustomerId);

    const result = await prisma.$transaction(async (tx) => {
      const vehicle = input.vehicle
        ? await tx.vehicle.update({
            where: { id: current.vehicle.id },
            data: input.vehicle,
          })
        : current.vehicle;

      const inventory = await tx.vehicleInventoryRecord.update({
        where: { id: current.inventory.id },
        data: {
          ownershipType: input.ownershipType,
          status: input.status,
          ownerCustomerId: input.ownerCustomerId,
          purchaseCost: input.purchaseCost,
          askingPrice: input.askingPrice,
          entryDate: input.entryDate,
          exitDate: input.exitDate,
          notes: input.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "inventory",
          action: "update",
          entityType: "vehicle_inventory",
          entityId: inventory.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });

      if (statusChanged) {
        await tx.vehicleStatusHistory.create({
          data: {
            storeId: session.user.storeId,
            vehicleId: vehicle.id,
            fromStatus: current.inventory.status,
            toStatus: inventory.status,
            actorUserId: session.user.id,
            reason: "inventory_status_update",
          },
        });

        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "inventory",
            action: "status_changed",
            entityType: "vehicle_inventory",
            entityId: inventory.id,
            result: "SUCCESS",
            metadata: {
              vehicleId: vehicle.id,
              fromStatus: current.inventory.status,
              toStatus: inventory.status,
            },
          },
        });
      }

      if (ownershipTypeChanged) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "inventory",
            action: "ownership_type_changed",
            entityType: "vehicle_inventory",
            entityId: inventory.id,
            result: "SUCCESS",
            metadata: {
              vehicleId: vehicle.id,
              fromOwnershipType: current.inventory.ownershipType,
              toOwnershipType: inventory.ownershipType,
            },
          },
        });
      }

      return { inventory, vehicle };
    });

    if (input.askingPrice && input.askingPrice !== Number(current.inventory.askingPrice?.toString() ?? 0)) {
      await emitInternalEvent({
        name: "vehicle.price_changed",
        storeId: session.user.storeId,
        actorId: session.user.id,
        entityType: "vehicle_inventory",
        entityId: result.inventory.id,
        payload: { vehicleId: result.vehicle.id, askingPrice: String(input.askingPrice) },
      });
    }

    return { data: sanitizeInventory(result.inventory, result.vehicle, { includeCosts: await canReadInventoryCosts(session.user) }) };
  });

  app.post("/:id/costs", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "inventory",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = inventoryParamsSchema.parse(request.params);
    const input = addVehicleCostSchema.parse(request.body);
    const { inventory } = await getInventoryOrThrow(session.user.storeId, params.id);

    const cost = await prisma.$transaction(async (tx) => {
      const created = await tx.vehicleCost.create({
        data: {
          storeId: session.user.storeId,
          vehicleId: inventory.vehicleId,
          inventoryId: inventory.id,
          category: input.category,
          description: input.description,
          amount: input.amount,
          occurredAt: input.occurredAt,
          capitalized: input.capitalized,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "inventory",
          action: "cost_created",
          entityType: "vehicle_cost",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            inventoryId: inventory.id,
            vehicleId: inventory.vehicleId,
            category: created.category,
            amount: created.amount.toString(),
          },
        },
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        id: cost.id,
        inventoryId: cost.inventoryId,
        vehicleId: cost.vehicleId,
        category: cost.category,
        description: cost.description,
        amount: cost.amount.toString(),
        occurredAt: cost.occurredAt.toISOString(),
        capitalized: cost.capitalized,
      },
    });
  });
}
