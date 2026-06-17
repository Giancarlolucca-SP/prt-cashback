import type { FastifyInstance } from "fastify";
import type { InventoryStatus as PrismaInventoryStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requireAuth, requirePermission } from "../api/auth-guards.js";
import { canUser } from "../auth/rbac.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const ownershipTypeSchema = z.enum(["OWN", "CONSIGNED", "REPASSE", "TRADE_IN"]);
const inventoryStatusSchema = z.enum(["IN_PREPARATION", "AVAILABLE", "NEGOTIATION", "RESERVED", "SOLD", "REPASSE", "REMOVED"]);
const inventorySortSchema = z
  .enum(["brand_model_asc", "days_in_stock_desc", "days_in_stock_asc", "entry_date_desc", "status_asc", "updated_at_desc", "price_desc", "price_asc"])
  .default("days_in_stock_desc");

const inventoryQuerySchema = z.object({
  entry_date_from: z.coerce.date().optional(),
  entry_date_to: z.coerce.date().optional(),
  has_active_listing: z.coerce.boolean().optional(),
  has_active_service: z.coerce.boolean().optional(),
  has_pending: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  responsible_user_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  sort: inventorySortSchema,
  status: inventoryStatusSchema.optional(),
  stock_location: z.string().trim().max(80).optional(),
  stock_origin: z.string().trim().max(80).optional(),
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
  primaryPhotoAttachmentId: z.string().uuid().nullable().optional(),
  relevantOptions: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Opcionais relevantes") })
    .optional(),
});

const createVehiclePayloadSchema = vehiclePayloadSchema.omit({ primaryPhotoAttachmentId: true }).extend({
  yearModel: z.number().int().min(1900).max(2100),
});

const createInventorySchema = z.object({
  vehicle: createVehiclePayloadSchema,
  ownershipType: ownershipTypeSchema,
  status: inventoryStatusSchema.default("IN_PREPARATION"),
  ownerCustomerId: z.string().uuid().optional(),
  responsibleUserId: z.string().uuid().optional(),
  stockLocation: z.string().trim().max(80).optional(),
  stockOrigin: z.string().trim().max(80).optional(),
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
    responsibleUserId: z.string().uuid().nullable().optional(),
    stockLocation: z.string().trim().max(80).nullable().optional(),
    stockOrigin: z.string().trim().max(80).nullable().optional(),
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

type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;

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
  primaryPhotoAttachmentId: string | null;
  relevantOptions: string | null;
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
  responsibleUserId: string | null;
  stockLocation: string | null;
  stockOrigin: string | null;
  purchaseCost: { toString(): string } | null;
  askingPrice: { toString(): string } | null;
  entryDate: Date;
  exitDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type InventoryServiceSummary = {
  expectedReturnAt: string | null;
  id: string;
  providerName: string | null;
  startedAt: string | null;
  status: string;
  type: string;
  updatedAt: string;
};

function calculateDaysInStock(record: Pick<InventoryRecord, "entryDate" | "exitDate">) {
  const endDate = record.exitDate ?? new Date();
  return Math.max(0, Math.floor((endDate.getTime() - record.entryDate.getTime()) / 86400000));
}

function auditComparableValue(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "toString" in value && typeof value.toString === "function") return value.toString();
  return value;
}

function inventoryAuditChanges(current: { inventory: InventoryRecord; vehicle: VehicleRecord }, input: UpdateInventoryInput) {
  const changes: Array<{ field: string; newValue: unknown; oldValue: unknown }> = [];

  const addChange = (field: string, oldValue: unknown, newValue: unknown) => {
    const normalizedOld = auditComparableValue(oldValue);
    const normalizedNew = auditComparableValue(newValue);
    if (normalizedOld !== normalizedNew) {
      changes.push({ field, oldValue: normalizedOld, newValue: normalizedNew });
    }
  };

  const inventoryFields: Array<keyof Omit<UpdateInventoryInput, "vehicle">> = [
    "ownershipType",
    "status",
    "ownerCustomerId",
    "responsibleUserId",
    "stockLocation",
    "stockOrigin",
    "purchaseCost",
    "askingPrice",
    "entryDate",
    "exitDate",
    "notes",
  ];

  for (const field of inventoryFields) {
    if (field in input) {
      addChange(field, current.inventory[field], input[field]);
    }
  }

  if (input.vehicle) {
    for (const [field, newValue] of Object.entries(input.vehicle)) {
      addChange(`vehicle.${field}`, current.vehicle[field as keyof VehicleRecord], newValue);
    }
  }

  return changes;
}

function buildInventoryOperationalSummary(input: {
  activeListings: number;
  activeServices: number;
  byOwnership: Array<{ ownershipType: string; _count?: { _all?: number } }>;
  byStatus: Array<{ status: string; _count?: { _all?: number } }>;
  relevantPending: number;
  total: number;
}) {
  const countByOwnership = Object.fromEntries(input.byOwnership.map((item) => [item.ownershipType, item._count?._all ?? 0]));
  const countByStatus = Object.fromEntries(input.byStatus.map((item) => [item.status, item._count?._all ?? 0]));
  const own = countByOwnership.OWN ?? 0;
  const consigned = countByOwnership.CONSIGNED ?? 0;

  return {
    total: input.total,
    activeListings: input.activeListings,
    activeServices: input.activeServices,
    relevantPending: input.relevantPending,
    own,
    consigned,
    ownPercent: input.total > 0 ? own / input.total : 0,
    consignedPercent: input.total > 0 ? consigned / input.total : 0,
    byStatus: countByStatus,
  };
}

function inventoryOrderBy(sort: z.infer<typeof inventorySortSchema>) {
  if (sort === "entry_date_desc") return { entryDate: "desc" as const };
  if (sort === "status_asc") return { status: "asc" as const };
  if (sort === "updated_at_desc") return { updatedAt: "desc" as const };
  if (sort === "price_desc") return { askingPrice: "desc" as const };
  if (sort === "price_asc") return { askingPrice: "asc" as const };
  return { entryDate: "asc" as const };
}

function requiresInMemoryInventorySort(sort: z.infer<typeof inventorySortSchema>) {
  return sort === "brand_model_asc" || sort === "days_in_stock_desc" || sort === "days_in_stock_asc";
}

function compareVehicleLabel(a: VehicleRecord | undefined, b: VehicleRecord | undefined) {
  return [a?.brand ?? "", a?.model ?? "", a?.version ?? ""].join(" ").localeCompare([b?.brand ?? "", b?.model ?? "", b?.version ?? ""].join(" "), "pt-BR", {
    sensitivity: "base",
  });
}

function relevantPendingSummary(status: string) {
  if (status === "IN_PREPARATION") return "Veiculo em preparacao";
  if (status === "REMOVED") return "Veiculo removido/inativo";
  return null;
}

const relevantPendingStatuses: PrismaInventoryStatus[] = ["IN_PREPARATION", "REMOVED"];
const relevantPendingWhere: Prisma.VehicleInventoryRecordWhereInput = {
  OR: [{ status: { in: relevantPendingStatuses } }, { askingPrice: null }, { askingPrice: { lte: 0 } }],
};
const withoutRelevantPendingWhere: Prisma.VehicleInventoryRecordWhereInput = {
  AND: [{ status: { notIn: relevantPendingStatuses } }, { askingPrice: { not: null } }, { askingPrice: { gt: 0 } }],
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
    primaryPhotoAttachmentId: vehicle.primaryPhotoAttachmentId,
    hasPrimaryPhoto: Boolean(vehicle.primaryPhotoAttachmentId),
    relevantOptions: vehicle.relevantOptions,
    status: vehicle.status,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

function sanitizeInventory(
  record: InventoryRecord,
  vehicle: VehicleRecord | undefined,
  options: { activeListingsCount?: number; activeService?: InventoryServiceSummary; includeCosts: boolean },
) {
  const activeListingsCount = options.activeListingsCount ?? 0;
  const pendingSummary = relevantPendingSummary(record.status) ?? (Number(record.askingPrice ?? 0) <= 0 ? "Preco anunciado pendente" : null);
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    vehicle: vehicle ? sanitizeVehicle(vehicle) : null,
    ownershipType: record.ownershipType,
    status: record.status,
    ownerCustomerId: record.ownerCustomerId,
    responsibleUserId: record.responsibleUserId,
    stockLocation: record.stockLocation,
    stockOrigin: record.stockOrigin,
    purchaseCost: options.includeCosts ? (record.purchaseCost?.toString() ?? null) : null,
    askingPrice: record.askingPrice?.toString() ?? null,
    entryDate: record.entryDate.toISOString(),
    exitDate: record.exitDate?.toISOString() ?? null,
    daysInStock: calculateDaysInStock(record),
    activeListingsCount,
    activeService: options.activeService ?? null,
    hasActiveService: Boolean(options.activeService),
    hasActiveListing: activeListingsCount > 0,
    hasRelevantPending: pendingSummary !== null,
    notes: record.notes,
    pendingSummary,
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

async function ensureVehiclePrimaryPhoto(input: {
  attachmentId: string | null | undefined;
  storeId: string;
  vehicleId?: string;
}) {
  if (!input.attachmentId) return;

  const attachment = await prisma.fileAttachment.findFirst({
    where: {
      id: input.attachmentId,
      storeId: input.storeId,
      status: "ACTIVE",
      deletedAt: null,
      mimeType: { in: ["image/jpeg", "image/jpg", "image/png"] },
      bucket: { in: ["vehicle-documents", "listing-media"] },
    },
    select: { id: true },
  });

  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Foto principal do veiculo nao encontrada.");
  }

  if (!input.vehicleId) return;

  const link = await prisma.fileAttachmentLink.findFirst({
    where: {
      attachmentId: input.attachmentId,
      storeId: input.storeId,
      entityId: input.vehicleId,
      entityType: "vehicle",
    },
    select: { id: true },
  });

  if (!link) {
    throw new ApiError("NOT_FOUND", "Foto principal do veiculo nao encontrada.");
  }
}

async function requireInventoryCreateAccess(request: Parameters<typeof requireAuth>[0]) {
  const session = await requireAuth(request);
  const [manageDecision, createDecision] = await Promise.all([
    canUser(session.user, {
      module: "inventory",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    }),
    canUser(session.user, {
      module: "inventory",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    }),
  ]);

  if (!manageDecision.allowed && !createDecision.allowed) {
    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "inventory",
        action: "api_forbidden",
        entityType: "permission",
        entityId: "inventory:create",
        result: "DENIED",
        metadata: {
          method: request.method,
          path: request.url,
          permission: { module: "inventory", action: "create", scope: "STORE", sensitiveArea: "general" },
          reason: createDecision.reason,
        },
      },
    });
    throw new ApiError("FORBIDDEN", "Usuario sem permissao para esta acao.", { reason: createDecision.reason });
  }

  return session;
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

async function ensureUserInStore(storeId: string, userId?: string | null) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, deletedAt: null, isActive: true },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel do estoque nao encontrado.");
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
    enforceCommonInventoryScope({ ownershipType: query.ownership_type, status: query.status });
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

    const activeListingVehicleIds =
      query.has_active_listing === undefined
        ? null
        : (
            await prisma.listing.findMany({
              where: {
                storeId: session.user.storeId,
                deletedAt: null,
                status: { in: ["PENDING", "PUBLISHED"] },
              },
              distinct: ["vehicleId"],
              select: { vehicleId: true },
            })
          ).map((listing) => listing.vehicleId);
    const activeServiceVehicleIds =
      query.has_active_service === undefined
        ? null
        : (
            await prisma.serviceOrder.findMany({
              where: {
                storeId: session.user.storeId,
                deletedAt: null,
                status: { notIn: ["DONE", "CANCELLED"] },
                vehicleId: { not: null },
              },
              distinct: ["vehicleId"],
              select: { vehicleId: true },
            })
          )
            .map((order) => order.vehicleId)
            .filter((vehicleId): vehicleId is string => Boolean(vehicleId));

    const commonInventoryGuards: Prisma.VehicleInventoryRecordWhereInput[] = [];
    if (!query.status) commonInventoryGuards.push({ status: { notIn: ["REPASSE", "REMOVED"] } });
    if (!query.ownership_type) commonInventoryGuards.push({ ownershipType: { not: "REPASSE" } });
    if (query.responsible_user_id) commonInventoryGuards.push({ responsibleUserId: query.responsible_user_id });
    if (query.stock_origin) commonInventoryGuards.push({ stockOrigin: { contains: query.stock_origin, mode: "insensitive" } });
    if (query.stock_location) commonInventoryGuards.push({ stockLocation: { contains: query.stock_location, mode: "insensitive" } });
    if (query.has_pending === true) commonInventoryGuards.push(relevantPendingWhere);
    if (query.has_pending === false) commonInventoryGuards.push(withoutRelevantPendingWhere);
    if (query.has_active_listing === true && activeListingVehicleIds) commonInventoryGuards.push({ vehicleId: { in: activeListingVehicleIds } });
    if (query.has_active_listing === false && activeListingVehicleIds) commonInventoryGuards.push({ vehicleId: { notIn: activeListingVehicleIds } });
    if (query.has_active_service === true && activeServiceVehicleIds) commonInventoryGuards.push({ vehicleId: { in: activeServiceVehicleIds } });
    if (query.has_active_service === false && activeServiceVehicleIds) commonInventoryGuards.push({ vehicleId: { notIn: activeServiceVehicleIds } });
    if (query.entry_date_from || query.entry_date_to) {
      commonInventoryGuards.push({
        entryDate: {
          ...(query.entry_date_from ? { gte: query.entry_date_from } : {}),
          ...(query.entry_date_to ? { lte: query.entry_date_to } : {}),
        },
      });
    }
    if (matchingVehicleIds) commonInventoryGuards.push({ vehicleId: { in: matchingVehicleIds } });

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownership_type ? { ownershipType: query.ownership_type } : {}),
      ...(commonInventoryGuards.length ? { AND: commonInventoryGuards } : {}),
    };

    const inMemorySort = requiresInMemoryInventorySort(query.sort);
    const [rawItems, total, byOwnership, byStatus, allMatchingInventoryVehicles] = await Promise.all([
      prisma.vehicleInventoryRecord.findMany({
        where,
        orderBy: inventoryOrderBy(query.sort),
        ...(inMemorySort ? {} : { skip, take }),
      }),
      prisma.vehicleInventoryRecord.count({ where }),
      prisma.vehicleInventoryRecord.groupBy({
        by: ["ownershipType"],
        where,
        _count: { _all: true },
      }),
      prisma.vehicleInventoryRecord.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.vehicleInventoryRecord.findMany({
        where,
        select: { vehicleId: true },
      }),
    ]);
    const allMatchingVehicleIds = [...new Set(allMatchingInventoryVehicles.map((item) => item.vehicleId))];
    const [summaryRelevantPending, summaryActiveListings, summaryActiveServices] = allMatchingVehicleIds.length
      ? await Promise.all([
          prisma.vehicleInventoryRecord.count({
            where: {
              ...where,
              AND: [...(Array.isArray(where.AND) ? where.AND : []), relevantPendingWhere],
            },
          }),
          prisma.listing.findMany({
            where: {
              storeId: session.user.storeId,
              vehicleId: { in: allMatchingVehicleIds },
              deletedAt: null,
              status: { in: ["PENDING", "PUBLISHED"] },
            },
            distinct: ["vehicleId"],
            select: { vehicleId: true },
          }),
          prisma.serviceOrder.findMany({
            where: {
              storeId: session.user.storeId,
              vehicleId: { in: allMatchingVehicleIds },
              deletedAt: null,
              status: { notIn: ["DONE", "CANCELLED"] },
            },
            distinct: ["vehicleId"],
            select: { vehicleId: true },
          }),
        ])
      : [0, [], []];
    const rawVehicles = await prisma.vehicle.findMany({
      where: { id: { in: rawItems.map((item) => item.vehicleId) }, storeId: session.user.storeId },
    });
    const rawVehicleById = new Map(rawVehicles.map((vehicle) => [vehicle.id, vehicle]));
    const items = inMemorySort
      ? [...rawItems]
          .sort((a, b) => {
            if (query.sort === "brand_model_asc") return compareVehicleLabel(rawVehicleById.get(a.vehicleId), rawVehicleById.get(b.vehicleId));
            const direction = query.sort === "days_in_stock_asc" ? 1 : -1;
            return (calculateDaysInStock(a) - calculateDaysInStock(b)) * direction;
          })
          .slice(skip, skip + take)
      : rawItems;
    const itemVehicleIds = new Set(items.map((item) => item.vehicleId));
    const vehicles = rawVehicles.filter((vehicle) => itemVehicleIds.has(vehicle.id));
    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const activeListingCounts = items.length
      ? await prisma.listing.groupBy({
          by: ["vehicleId"],
          where: {
            storeId: session.user.storeId,
            vehicleId: { in: items.map((item) => item.vehicleId) },
            deletedAt: null,
            status: { in: ["PENDING", "PUBLISHED"] },
          },
          _count: { _all: true },
        })
      : [];
    const activeListingCountByVehicleId = new Map(activeListingCounts.map((item) => [item.vehicleId, item._count._all]));
    const activeServiceOrders = items.length
      ? await prisma.serviceOrder.findMany({
          where: {
            storeId: session.user.storeId,
            vehicleId: { in: items.map((item) => item.vehicleId) },
            deletedAt: null,
            status: { notIn: ["DONE", "CANCELLED"] },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            expectedReturnAt: true,
            providerId: true,
            startedAt: true,
            status: true,
            type: true,
            updatedAt: true,
            vehicleId: true,
          },
        })
      : [];
    const activeServiceProviders = activeServiceOrders.some((order) => order.providerId)
      ? await prisma.serviceProvider.findMany({
          where: {
            id: { in: activeServiceOrders.map((order) => order.providerId).filter((providerId): providerId is string => Boolean(providerId)) },
            storeId: session.user.storeId,
            deletedAt: null,
          },
          select: { id: true, name: true },
        })
      : [];
    const serviceProviderNameById = new Map(activeServiceProviders.map((provider) => [provider.id, provider.name]));
    const activeServiceByVehicleId = new Map<string, InventoryServiceSummary>();
    for (const order of activeServiceOrders) {
      if (!order.vehicleId || activeServiceByVehicleId.has(order.vehicleId)) continue;
      activeServiceByVehicleId.set(order.vehicleId, {
        id: order.id,
        expectedReturnAt: order.expectedReturnAt?.toISOString() ?? null,
        providerName: order.providerId ? serviceProviderNameById.get(order.providerId) ?? null : null,
        startedAt: order.startedAt?.toISOString() ?? null,
        status: order.status,
        type: order.type,
        updatedAt: order.updatedAt.toISOString(),
      });
    }

    return {
      ...listResponse(
        items.map((item) =>
          sanitizeInventory(item, vehicleById.get(item.vehicleId), {
            activeListingsCount: activeListingCountByVehicleId.get(item.vehicleId) ?? 0,
            activeService: activeServiceByVehicleId.get(item.vehicleId),
            includeCosts,
          }),
        ),
        query,
        total,
      ),
      summary: buildInventoryOperationalSummary({
        activeListings: summaryActiveListings.length,
        activeServices: summaryActiveServices.length,
        byOwnership,
        byStatus,
        relevantPending: summaryRelevantPending,
        total,
      }),
    };
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
    const activeService = await prisma.serviceOrder.findFirst({
      where: {
        storeId: session.user.storeId,
        vehicleId: vehicle.id,
        deletedAt: null,
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        expectedReturnAt: true,
        providerId: true,
        startedAt: true,
        status: true,
        type: true,
        updatedAt: true,
      },
    });
    const activeServiceProvider = activeService?.providerId
      ? await prisma.serviceProvider.findFirst({
          where: { id: activeService.providerId, storeId: session.user.storeId, deletedAt: null },
          select: { name: true },
        })
      : null;

    return {
      data: sanitizeInventory(inventory, vehicle, {
        activeService: activeService
          ? {
              id: activeService.id,
              expectedReturnAt: activeService.expectedReturnAt?.toISOString() ?? null,
              providerName: activeServiceProvider?.name ?? null,
              startedAt: activeService.startedAt?.toISOString() ?? null,
              status: activeService.status,
              type: activeService.type,
              updatedAt: activeService.updatedAt.toISOString(),
            }
          : undefined,
        includeCosts,
      }),
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
    const session = await requireInventoryCreateAccess(request);
    const input = createInventorySchema.parse(request.body);
    const includeCosts = await canReadInventoryCosts(session.user);

    enforceCommonInventoryScope(input);
    if (input.purchaseCost !== undefined && !includeCosts) {
      throw new ApiError("FORBIDDEN", "Usuario sem permissao para informar custo de compra.");
    }
    enforceConsignedInventoryRules(input);
    await ensureCustomerInStore(session.user.storeId, input.ownerCustomerId);
    await ensureUserInStore(session.user.storeId, input.responsibleUserId);

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
          responsibleUserId: input.responsibleUserId,
          stockLocation: input.stockLocation,
          stockOrigin: input.stockOrigin,
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

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "inventory",
          action: "create",
          entityType: "vehicle",
          entityId: vehicle.id,
          result: "SUCCESS",
          metadata: {
            brand: vehicle.brand,
            inventoryId: inventory.id,
            model: vehicle.model,
            plate: vehicle.plate,
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

    return reply.code(201).send({ data: sanitizeInventory(result.inventory, result.vehicle, { includeCosts }) });
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
    const changes = inventoryAuditChanges(current, input);
    const changedFields = changes.map((change) => change.field);
    const vehicleChanges = changes
      .filter((change) => change.field.startsWith("vehicle."))
      .map((change) => ({
        ...change,
        field: change.field.replace(/^vehicle\./, ""),
      }));

    enforceConsignedInventoryRules({
      ownerCustomerId: nextOwnerCustomerId,
      ownershipType: nextOwnershipType,
      purchaseCost: nextPurchaseCost,
    });
    await ensureCustomerInStore(session.user.storeId, input.ownerCustomerId);
    await ensureUserInStore(session.user.storeId, input.responsibleUserId);
    await ensureVehiclePrimaryPhoto({
      attachmentId: input.vehicle?.primaryPhotoAttachmentId,
      storeId: session.user.storeId,
      vehicleId: current.vehicle.id,
    });

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
          responsibleUserId: input.responsibleUserId,
          stockLocation: input.stockLocation,
          stockOrigin: input.stockOrigin,
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
          metadata: { changedFields, changes } as Prisma.InputJsonObject,
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

      if (vehicleChanges.length > 0) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "inventory",
            action: "update",
            entityType: "vehicle",
            entityId: vehicle.id,
            result: "SUCCESS",
            metadata: {
              changedFields: vehicleChanges.map((change) => change.field),
              changes: vehicleChanges,
              inventoryId: inventory.id,
            } as Prisma.InputJsonObject,
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
