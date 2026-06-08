import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationQuerySchema, getPagination, listResponse } from "../api/pagination.js";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const createCustomerSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(5).max(32).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(8).max(32).optional(),
  origin: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "Informe ao menos um campo para atualizar.",
});

const customerParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteCustomerSchema = z.object({
  reason: z.string().trim().min(8).max(300),
});

function sanitizeCustomer(customer: {
  id: string;
  type: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  origin: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    document: customer.document,
    email: customer.email,
    phone: customer.phone,
    origin: customer.origin,
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export async function registerCustomerRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = paginationQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { phone: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
              { document: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.customer.count({ where }),
    ]);

    return listResponse(items.map(sanitizeCustomer), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = customerParamsSchema.parse(request.params);

    const customer = await prisma.customer.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new ApiError("NOT_FOUND", "Cliente nao encontrado.");
    }

    return { data: sanitizeCustomer(customer) };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createCustomerSchema.parse(request.body);

    if (input.document) {
      const existing = await prisma.customer.findFirst({
        where: {
          storeId: session.user.storeId,
          document: input.document,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ApiError("CONFLICT", "Cliente ja cadastrado com este documento.", { customerId: existing.id });
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          storeId: session.user.storeId,
          type: input.type,
          name: input.name,
          document: input.document,
          email: input.email,
          phone: input.phone,
          origin: input.origin,
          notes: input.notes,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "customers",
          action: "create",
          entityType: "customer",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            name: created.name,
            hasDocument: Boolean(created.document),
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "customer.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "customer",
      entityId: customer.id,
      payload: { origin: customer.origin },
    });

    return reply.code(201).send({ data: sanitizeCustomer(customer) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "update",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = customerParamsSchema.parse(request.params);
    const input = updateCustomerSchema.parse(request.body);

    const current = await prisma.customer.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new ApiError("NOT_FOUND", "Cliente nao encontrado.");
    }

    if (input.document && input.document !== current.document) {
      const existing = await prisma.customer.findFirst({
        where: {
          storeId: session.user.storeId,
          document: input.document,
          deletedAt: null,
          NOT: { id: current.id },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ApiError("CONFLICT", "Cliente ja cadastrado com este documento.", { customerId: existing.id });
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id: current.id },
        data: {
          ...input,
          updatedByUserId: session.user.id,
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: updated.id,
          type: "customer.updated",
          title: "Cadastro de cliente atualizado",
          metadata: {
            changedFields: Object.keys(input),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "customers",
          action: "update",
          entityType: "customer",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            changedFields: Object.keys(input),
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "customer.updated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "customer",
      entityId: customer.id,
      payload: { changedFields: Object.keys(input) },
    });

    return { data: sanitizeCustomer(customer) };
  });

  app.delete("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "delete",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = customerParamsSchema.parse(request.params);
    const input = deleteCustomerSchema.parse(request.body);

    const current = await prisma.customer.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
      },
    });

    if (!current) {
      throw new ApiError("NOT_FOUND", "Cliente nao encontrado.");
    }

    const customer = await prisma.$transaction(async (tx) => {
      const deleted = await tx.customer.update({
        where: { id: current.id },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
          updatedByUserId: session.user.id,
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: deleted.id,
          type: "customer.deleted",
          title: "Cliente arquivado",
          description: input.reason,
          metadata: {
            reason: input.reason,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "customers",
          action: "delete",
          entityType: "customer",
          entityId: deleted.id,
          result: "SUCCESS",
          metadata: {
            reason: input.reason,
          },
        },
      });

      return deleted;
    });

    await emitInternalEvent({
      name: "customer.deleted",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "customer",
      entityId: customer.id,
      payload: { reason: input.reason },
    });

    return { data: sanitizeCustomer(customer) };
  });
}
