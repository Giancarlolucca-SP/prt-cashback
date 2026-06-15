import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const serviceOrderStatusSchema = z.enum(["OPEN", "SCHEDULED", "RUNNING", "WAITING_PROVIDER", "WAITING_INVOICE", "DONE", "CANCELLED"]);

const providerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  serviceTypes: z.array(z.string().trim().min(2).max(80)).default([]),
  document: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().optional(),
  accessUrl: z.string().trim().max(300).optional(),
  accessLogin: z.string().trim().max(120).optional(),
  accessSecretRef: z.string().trim().max(160).optional(),
});

const recordStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);

const providersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: recordStatusSchema.optional(),
});

const postSaleCustomersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: recordStatusSchema.optional(),
});

const postSaleCustomerSchema = z.object({
  customerId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  lastServiceAt: z.coerce.date().optional(),
  name: z.string().trim().min(2).max(160),
  nextActionAt: z.coerce.date().optional(),
  phone: z.string().trim().max(40).optional(),
  recurrenceStatus: z.string().trim().max(80).optional(),
  totalRevenue: z.number().nonnegative().optional(),
  vehicleInfo: z.string().trim().max(180).optional(),
});

const catalogSchema = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  basePrice: z.number().nonnegative().optional(),
  slaHours: z.number().int().positive().optional(),
});

const catalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(100),
  category: z.string().trim().max(80).optional(),
  status: recordStatusSchema.optional(),
});

const serviceOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: serviceOrderStatusSchema.optional(),
  vehicle_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
});

const serviceOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  postSaleCustomerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  saleId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  type: z.string().trim().min(2).max(80),
  status: serviceOrderStatusSchema.default("OPEN"),
  totalAmount: z.number().nonnegative().optional(),
  startedAt: z.coerce.date().optional(),
});

const serviceOrderParamsSchema = z.object({ id: z.string().uuid() });

const serviceOrderStatusUpdateSchema = z.object({
  status: serviceOrderStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const serviceOrderItemSchema = z.object({
  catalogItemId: z.string().uuid().optional(),
  description: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Descricao do item de servico") }),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative().optional(),
  costAmount: z.number().nonnegative().optional(),
});

const serviceCostSchema = z.object({
  providerId: z.string().uuid().optional(),
  description: z
    .string()
    .trim()
    .min(2)
    .max(180)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Descricao do custo de servico") }),
  amount: z.number().positive(),
  occurredAt: z.coerce.date().optional(),
});

const serviceInvoiceSchema = z.object({
  providerId: z.string().uuid().optional(),
  number: z.string().trim().max(80).optional(),
  amount: z.number().nonnegative().optional(),
  issuedAt: z.coerce.date().optional(),
  snapshot: z.record(z.unknown()).optional(),
});

type ServiceOrderRecord = {
  id: string;
  customerId: string | null;
  postSaleCustomerId: string | null;
  vehicleId: string | null;
  saleId: string | null;
  providerId: string | null;
  type: string;
  status: string;
  totalAmount: { toString(): string } | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PostSaleCustomerRecord = {
  id: string;
  customerId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  vehicleInfo: string | null;
  recurrenceStatus: string | null;
  totalRevenue: { toString(): string } | null;
  lastServiceAt: Date | null;
  nextActionAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ServiceProviderRecord = {
  id: string;
  name: string;
  serviceTypes: string[];
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  accessUrl: string | null;
  accessLogin: string | null;
  accessSecretRef: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeProvider(provider: ServiceProviderRecord) {
  return {
    id: provider.id,
    name: provider.name,
    serviceTypes: provider.serviceTypes,
    document: provider.document,
    contactName: provider.contactName,
    phone: provider.phone,
    email: provider.email,
    accessUrl: provider.accessUrl,
    accessLogin: provider.accessLogin,
    hasSecret: Boolean(provider.accessSecretRef),
    status: provider.status,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

function sanitizePostSaleCustomer(customer: PostSaleCustomerRecord) {
  return {
    id: customer.id,
    customerId: customer.customerId,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    vehicleInfo: customer.vehicleInfo,
    recurrenceStatus: customer.recurrenceStatus,
    totalRevenue: customer.totalRevenue?.toString() ?? null,
    lastServiceAt: customer.lastServiceAt?.toISOString() ?? null,
    nextActionAt: customer.nextActionAt?.toISOString() ?? null,
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function sanitizeOrder(order: ServiceOrderRecord) {
  return {
    id: order.id,
    customerId: order.customerId,
    postSaleCustomerId: order.postSaleCustomerId,
    vehicleId: order.vehicleId,
    saleId: order.saleId,
    providerId: order.providerId,
    type: order.type,
    status: order.status,
    totalAmount: order.totalAmount?.toString() ?? null,
    startedAt: order.startedAt?.toISOString() ?? null,
    finishedAt: order.finishedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

async function ensureProvider(storeId: string, providerId?: string | null) {
  if (!providerId) return;
  const provider = await prisma.serviceProvider.findFirst({ where: { id: providerId, storeId, deletedAt: null }, select: { id: true } });
  if (!provider) throw new ApiError("NOT_FOUND", "Prestador nao encontrado.");
}

async function ensureVehicle(storeId: string, vehicleId?: string | null) {
  if (!vehicleId) return;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, storeId, deletedAt: null }, select: { id: true } });
  if (!vehicle) throw new ApiError("NOT_FOUND", "Veiculo da OS nao encontrado.");
}

async function ensureSale(storeId: string, saleId?: string | null) {
  if (!saleId) return;
  const sale = await prisma.sale.findFirst({ where: { id: saleId, storeId, deletedAt: null }, select: { id: true } });
  if (!sale) throw new ApiError("NOT_FOUND", "Venda da OS nao encontrada.");
}

async function ensureCustomer(storeId: string, customerId?: string | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente da OS nao encontrado.");
}

async function ensurePostSaleCustomer(storeId: string, postSaleCustomerId?: string | null) {
  if (!postSaleCustomerId) return;
  const customer = await prisma.postSaleCustomer.findFirst({ where: { id: postSaleCustomerId, storeId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente de pos-venda nao encontrado.");
}

async function getOrderOrThrow(storeId: string, id: string) {
  const order = await prisma.serviceOrder.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!order) throw new ApiError("NOT_FOUND", "Ordem de servico nao encontrada.");
  return order;
}

export async function registerServiceRoutes(app: FastifyInstance) {
  app.get("/post-sale/customers", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = postSaleCustomersQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.postSaleCustomer.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.postSaleCustomer.count({ where }),
    ]);
    return listResponse(items.map(sanitizePostSaleCustomer), query, total);
  });

  app.post("/post-sale/customers", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = postSaleCustomerSchema.parse(request.body);
    await ensureCustomer(session.user.storeId, input.customerId);
    const customer = await prisma.postSaleCustomer.create({ data: { storeId: session.user.storeId, ...input } });
    return reply.code(201).send({ data: sanitizePostSaleCustomer(customer) });
  });

  app.get("/providers", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = providersQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.serviceProvider.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take }),
      prisma.serviceProvider.count({ where }),
    ]);
    return listResponse(items.map(sanitizeProvider), query, total);
  });

  app.post("/providers", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = providerSchema.parse(request.body);
    const provider = await prisma.serviceProvider.create({ data: { storeId: session.user.storeId, ...input } });
    return reply.code(201).send({ data: provider });
  });

  app.post("/catalog", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = catalogSchema.parse(request.body);
    const item = await prisma.serviceCatalogItem.upsert({
      where: { storeId_name: { storeId: session.user.storeId, name: input.name } },
      update: { category: input.category, basePrice: input.basePrice, slaHours: input.slaHours },
      create: { storeId: session.user.storeId, ...input },
    });
    return reply.code(201).send({
      data: { ...item, basePrice: item.basePrice?.toString() ?? null },
    });
  });

  app.get("/catalog", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = catalogQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.serviceCatalogItem.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], skip, take }),
      prisma.serviceCatalogItem.count({ where }),
    ]);
    return listResponse(items.map((item) => ({ ...item, basePrice: item.basePrice?.toString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })), query, total);
  });

  app.get("/orders", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = serviceOrdersQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.provider_id ? { providerId: query.provider_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.serviceOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.serviceOrder.count({ where }),
    ]);
    return listResponse(items.map(sanitizeOrder), query, total);
  });

  app.get("/orders/:id", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = serviceOrderParamsSchema.parse(request.params);
    const order = await getOrderOrThrow(session.user.storeId, params.id);
    const [items, costs, invoices] = await Promise.all([
      prisma.serviceOrderItem.findMany({ where: { storeId: session.user.storeId, serviceOrderId: order.id } }),
      prisma.serviceCost.findMany({ where: { storeId: session.user.storeId, serviceOrderId: order.id } }),
      prisma.serviceInvoice.findMany({ where: { storeId: session.user.storeId, serviceOrderId: order.id } }),
    ]);
    return {
      data: sanitizeOrder(order),
      items: items.map((item) => ({ ...item, quantity: item.quantity.toString(), unitPrice: item.unitPrice?.toString() ?? null, costAmount: item.costAmount?.toString() ?? null })),
      costs: costs.map((cost) => ({ ...cost, amount: cost.amount.toString(), occurredAt: cost.occurredAt.toISOString() })),
      invoices: invoices.map((invoice) => ({ ...invoice, amount: invoice.amount?.toString() ?? null, issuedAt: invoice.issuedAt?.toISOString() ?? null })),
    };
  });

  app.post("/orders", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = serviceOrderSchema.parse(request.body);
    await ensureCustomer(session.user.storeId, input.customerId);
    await ensurePostSaleCustomer(session.user.storeId, input.postSaleCustomerId);
    await ensureVehicle(session.user.storeId, input.vehicleId);
    await ensureSale(session.user.storeId, input.saleId);
    await ensureProvider(session.user.storeId, input.providerId);
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceOrder.create({ data: { storeId: session.user.storeId, ...input } });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "services",
          action: "service_order_created",
          entityType: "service_order",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { vehicleId: created.vehicleId, providerId: created.providerId, status: created.status },
        },
      });
      return created;
    });
    await emitInternalEvent({
      name: "service_order.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "service_order",
      entityId: order.id,
      payload: { status: order.status, vehicleId: order.vehicleId },
    });
    return reply.code(201).send({ data: sanitizeOrder(order) });
  });

  app.post("/orders/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = serviceOrderParamsSchema.parse(request.params);
    const input = serviceOrderStatusUpdateSchema.parse(request.body);
    const current = await getOrderOrThrow(session.user.storeId, params.id);
    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOrder.update({
        where: { id: current.id },
        data: {
          status: input.status,
          finishedAt: input.status === "DONE" ? new Date() : current.finishedAt,
          deletedAt: input.status === "CANCELLED" ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "services",
          action: "service_order_status_changed",
          entityType: "service_order",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: input.status, reason: input.reason },
        },
      });
      return updated;
    });
    await emitInternalEvent({
      name: input.status === "WAITING_PROVIDER" ? "service_order.delayed" : "service_order.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "service_order",
      entityId: order.id,
      payload: { fromStatus: current.status, toStatus: order.status, reason: input.reason },
    });
    return { data: sanitizeOrder(order) };
  });

  app.post("/orders/:id/items", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = serviceOrderParamsSchema.parse(request.params);
    const input = serviceOrderItemSchema.parse(request.body);
    const order = await getOrderOrThrow(session.user.storeId, params.id);
    const item = await prisma.serviceOrderItem.create({
      data: {
        storeId: session.user.storeId,
        serviceOrderId: order.id,
        catalogItemId: input.catalogItemId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        costAmount: input.costAmount,
      },
    });
    return reply.code(201).send({ data: { ...item, quantity: item.quantity.toString(), unitPrice: item.unitPrice?.toString() ?? null, costAmount: item.costAmount?.toString() ?? null } });
  });

  app.post("/orders/:id/costs", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = serviceOrderParamsSchema.parse(request.params);
    const input = serviceCostSchema.parse(request.body);
    const order = await getOrderOrThrow(session.user.storeId, params.id);
    await ensureProvider(session.user.storeId, input.providerId);
    const cost = await prisma.serviceCost.create({
      data: { storeId: session.user.storeId, serviceOrderId: order.id, providerId: input.providerId, description: input.description, amount: input.amount, occurredAt: input.occurredAt },
    });
    return reply.code(201).send({ data: { ...cost, amount: cost.amount.toString(), occurredAt: cost.occurredAt.toISOString() } });
  });

  app.post("/orders/:id/invoices", async (request, reply) => {
    const session = await requirePermission(request, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = serviceOrderParamsSchema.parse(request.params);
    const input = serviceInvoiceSchema.parse(request.body);
    const order = await getOrderOrThrow(session.user.storeId, params.id);
    await ensureProvider(session.user.storeId, input.providerId);
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceInvoice.create({
        data: {
          storeId: session.user.storeId,
          serviceOrderId: order.id,
          providerId: input.providerId,
          number: input.number,
          amount: input.amount,
          issuedAt: input.issuedAt,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        },
      });
      if (input.providerId && input.amount) {
        await tx.providerPayable.create({
          data: {
            storeId: session.user.storeId,
            providerId: input.providerId,
            serviceOrderId: order.id,
            amount: input.amount,
            status: "PENDING",
          },
        });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "services",
          action: "service_invoice_created",
          entityType: "service_invoice",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { serviceOrderId: order.id, amount: created.amount?.toString() ?? null },
        },
      });
      return created;
    });
    return reply.code(201).send({ data: { ...invoice, amount: invoice.amount?.toString() ?? null, issuedAt: invoice.issuedAt?.toISOString() ?? null } });
  });
}
