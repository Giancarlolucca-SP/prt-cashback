import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationQuerySchema, getPagination, listResponse } from "../api/pagination.js";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const customerBaseSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(5).max(32).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(8).max(32).optional(),
  origin: z.string().trim().min(2).max(80).default("manual"),
  notes: z.string().trim().max(1000).optional(),
});

const createCustomerSchema = customerBaseSchema.refine((input) => Boolean(input.email || input.phone), {
  message: "Informe telefone ou e-mail para cadastrar o cliente.",
  path: ["phone"],
});

const updateCustomerSchema = customerBaseSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "Informe ao menos um campo para atualizar.",
});

const customerListQuerySchema = paginationQuerySchema.extend({
  origin: z.string().trim().max(80).optional(),
  responsible_user_id: z.string().uuid().optional(),
  created_by_user_id: z.string().uuid().optional(),
});

const customerKanbanStatusSchema = z.enum([
  "NEW_LEAD",
  "IN_CONTACT",
  "SCHEDULED",
  "VISITED_STORE",
  "TEST_DRIVE_DONE",
  "NEGOTIATION",
  "WAITING_RETURN",
  "WAITING_PURCHASE_CONFIRMATION",
  "LOST",
]);

const customerParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteCustomerSchema = z.object({
  reason: z.string().trim().min(8).max(300),
});

const updateCustomerKanbanStatusSchema = z.object({
  toStatus: customerKanbanStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const customerKanbanColumns = customerKanbanStatusSchema.options;

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

function customerScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { createdByUserId: user.id };
  }

  return {};
}

function customerListWhere(input: {
  storeId: string;
  user: { id: string; role: string };
  query: z.infer<typeof customerListQuerySchema>;
}) {
  const responsibleUserId = input.query.responsible_user_id ?? input.query.created_by_user_id;

  return {
    storeId: input.storeId,
    deletedAt: null,
    ...customerScopeWhere(input.user),
    ...(input.query.status ? { status: input.query.status } : {}),
    ...(input.query.origin ? { origin: { equals: input.query.origin, mode: "insensitive" as const } } : {}),
    ...(responsibleUserId ? { createdByUserId: responsibleUserId } : {}),
    ...(input.query.search
      ? {
          OR: [
            { name: { contains: input.query.search, mode: "insensitive" as const } },
            { phone: { contains: input.query.search, mode: "insensitive" as const } },
            { email: { contains: input.query.search, mode: "insensitive" as const } },
            { document: { contains: input.query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function metadataStatus(metadata: unknown, key: "fromStatus" | "toStatus") {
  if (!metadata || typeof metadata !== "object" || !(key in metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && customerKanbanColumns.includes(value as (typeof customerKanbanColumns)[number]) ? value : null;
}

async function latestCustomerKanbanStatuses(storeId: string, customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, string>();
  }

  const events = await prisma.customerHistoryEvent.findMany({
    where: {
      storeId,
      customerId: { in: customerIds },
      type: "customer.kanban_status_changed",
    },
    orderBy: { occurredAt: "desc" },
  });
  const statuses = new Map<string, string>();

  for (const event of events) {
    if (statuses.has(event.customerId)) {
      continue;
    }

    statuses.set(event.customerId, metadataStatus(event.metadata, "toStatus") ?? "NEW_LEAD");
  }

  return statuses;
}

export async function registerCustomerRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = customerListQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = customerListWhere({ storeId: session.user.storeId, user: session.user, query });

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

  app.get("/kanban", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = customerListQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = customerListWhere({ storeId: session.user.storeId, user: session.user, query });

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    });
    const statuses = await latestCustomerKanbanStatuses(
      session.user.storeId,
      customers.map((customer) => customer.id),
    );
    const columns = customerKanbanColumns.map((status) => ({
      status,
      items: customers
        .filter((customer) => (statuses.get(customer.id) ?? "NEW_LEAD") === status)
        .map((customer) => ({
          ...sanitizeCustomer(customer),
          operationalStatus: statuses.get(customer.id) ?? "NEW_LEAD",
        })),
    }));

    return { columns };
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
        ...customerScopeWhere(session.user),
      },
    });

    if (!customer) {
      throw new ApiError("NOT_FOUND", "Cliente nao encontrado.");
    }

    return { data: sanitizeCustomer(customer) };
  });

  app.post("/:id/kanban-status", async (request) => {
    const session = await requirePermission(request, {
      module: "customers",
      action: "update_status",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = customerParamsSchema.parse(request.params);
    const input = updateCustomerKanbanStatusSchema.parse(request.body);
    const current = await prisma.customer.findFirst({
      where: {
        id: params.id,
        storeId: session.user.storeId,
        deletedAt: null,
        ...customerScopeWhere(session.user),
      },
    });

    if (!current) {
      throw new ApiError("NOT_FOUND", "Cliente nao encontrado.");
    }

    const statuses = await latestCustomerKanbanStatuses(session.user.storeId, [current.id]);
    const fromStatus = statuses.get(current.id) ?? "NEW_LEAD";

    if (fromStatus === input.toStatus) {
      return {
        data: {
          ...sanitizeCustomer(current),
          operationalStatus: fromStatus,
        },
        unchanged: true,
      };
    }

    const customer = await prisma.$transaction(async (tx) => {
      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: current.id,
          type: "customer.kanban_status_changed",
          title: "Status operacional atualizado",
          description: input.reason,
          metadata: {
            fromStatus,
            toStatus: input.toStatus,
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
          action: "kanban_status_changed",
          entityType: "customer",
          entityId: current.id,
          result: "SUCCESS",
          metadata: {
            fromStatus,
            toStatus: input.toStatus,
            reason: input.reason,
          },
        },
      });

      return tx.customer.update({
        where: { id: current.id },
        data: {
          updatedByUserId: session.user.id,
        },
      });
    });

    await emitInternalEvent({
      name: "customer.kanban_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "customer",
      entityId: customer.id,
      payload: {
        fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
      },
    });

    return {
      data: {
        ...sanitizeCustomer(customer),
        operationalStatus: input.toStatus,
      },
      unchanged: false,
    };
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
        ...customerScopeWhere(session.user),
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
        ...customerScopeWhere(session.user),
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
