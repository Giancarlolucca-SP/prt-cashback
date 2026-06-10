import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { paginationQuerySchema, getPagination, listResponse } from "../api/pagination.js";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const customerBaseSchema = z.object({
  type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  name: z.string().trim().min(2).max(160),
  document: z.string().trim().min(5).max(32).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(8).max(32).optional(),
  birthDate: z.coerce.date().optional(),
  origin: z.string().trim().min(2).max(80).default("manual"),
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do cliente") })
    .optional(),
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
  birth_month: z.coerce.number().int().min(1).max(12).optional(),
  purchase_done: z.enum(["true", "false"]).optional(),
  visit_done: z.enum(["true", "false"]).optional(),
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

const createMinimalLeadSchema = z.object({
  email: z.string().email().optional(),
  interest: z.string().trim().max(180).optional(),
  name: z.string().trim().min(2).max(160),
  notes: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do lead") })
    .optional(),
  origin: z.string().trim().min(2).max(80).default("manual"),
  phone: z.string().trim().min(8).max(32).optional(),
}).refine((input) => Boolean(input.email || input.phone), {
  message: "Informe telefone ou e-mail para cadastrar o lead minimo.",
  path: ["phone"],
});

function sanitizeCustomer(customer: {
  id: string;
  type: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  birthDate: Date | null;
  origin: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  primaryInterest?: string | null;
}) {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    document: customer.document,
    email: customer.email,
    phone: customer.phone,
    birthDate: customer.birthDate?.toISOString() ?? null,
    origin: customer.origin,
    primaryInterest: customer.primaryInterest ?? null,
    status: customer.status,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function sanitizeCustomerSale(sale: {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  sellerUserId: string | null;
  type: string;
  status: string;
  salePrice: { toString(): string } | null;
  grossMargin: { toString(): string } | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: sale.id,
    customerId: sale.customerId,
    vehicleId: sale.vehicleId,
    sellerUserId: sale.sellerUserId,
    type: sale.type,
    status: sale.status,
    salePrice: sale.salePrice?.toString() ?? null,
    grossMargin: sale.grossMargin?.toString() ?? null,
    closedAt: sale.closedAt?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    updatedAt: sale.updatedAt.toISOString(),
  };
}

function sanitizeCustomerPurchaseLead(lead: {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  source: string | null;
  status: string;
  askingPrice: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: lead.id,
    customerId: lead.customerId,
    vehicleId: lead.vehicleId,
    source: lead.source,
    status: lead.status,
    askingPrice: lead.askingPrice?.toString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function sanitizeCustomerEvaluation(evaluation: {
  id: string;
  purchaseLeadId: string | null;
  customerId: string | null;
  vehicleId: string | null;
  requestedPrice: { toString(): string } | null;
  suggestedPrice: { toString(): string } | null;
  decision: string;
  evaluatedAt: Date;
  createdAt: Date;
}) {
  return {
    id: evaluation.id,
    purchaseLeadId: evaluation.purchaseLeadId,
    customerId: evaluation.customerId,
    vehicleId: evaluation.vehicleId,
    requestedPrice: evaluation.requestedPrice?.toString() ?? null,
    suggestedPrice: evaluation.suggestedPrice?.toString() ?? null,
    decision: evaluation.decision,
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
    createdAt: evaluation.createdAt.toISOString(),
  };
}

function sanitizeCustomerHistoryEvent(event: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: unknown;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
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
}): Prisma.CustomerWhereInput {
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

function intersectIds(current: string[] | null, next: string[]) {
  if (current === null) {
    return next;
  }

  const nextIds = new Set(next);
  return current.filter((id) => nextIds.has(id));
}

async function customerOperationalFilters(input: {
  storeId: string;
  query: z.infer<typeof customerListQuerySchema>;
}): Promise<Prisma.CustomerWhereInput[]> {
  let includeIds: string[] | null = null;
  const excludedIds = new Set<string>();

  if (input.query.birth_month) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM customers
      WHERE store_id = ${input.storeId}
        AND deleted_at IS NULL
        AND birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM birth_date) = ${input.query.birth_month}
    `;
    includeIds = intersectIds(includeIds, rows.map((row) => row.id));
  }

  if (input.query.purchase_done) {
    const sales = await prisma.sale.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        status: "CLOSED",
        customerId: { not: null },
      },
      distinct: ["customerId"],
      select: { customerId: true },
    });
    const ids = sales.flatMap((sale) => (sale.customerId ? [sale.customerId] : []));

    if (input.query.purchase_done === "true") {
      includeIds = intersectIds(includeIds, ids);
    } else {
      ids.forEach((id) => excludedIds.add(id));
    }
  }

  if (input.query.visit_done) {
    const appointments = await prisma.appointment.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        status: "DONE",
        customerId: { not: null },
      },
      distinct: ["customerId"],
      select: { customerId: true },
    });
    const ids = appointments.flatMap((appointment) => (appointment.customerId ? [appointment.customerId] : []));

    if (input.query.visit_done === "true") {
      includeIds = intersectIds(includeIds, ids);
    } else {
      ids.forEach((id) => excludedIds.add(id));
    }
  }

  const filters: Prisma.CustomerWhereInput[] = [];
  if (includeIds !== null) {
    filters.push({ id: { in: includeIds } });
  }
  if (excludedIds.size > 0) {
    filters.push({ id: { notIn: Array.from(excludedIds) } });
  }

  return filters;
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

async function primaryInterestsByCustomer(storeId: string, customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, string>();
  }

  const leads = await prisma.lead.findMany({
    where: {
      storeId,
      customerId: { in: customerIds },
      deletedAt: null,
      interest: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      customerId: true,
      interest: true,
    },
  });
  const interests = new Map<string, string>();

  for (const lead of leads) {
    if (!lead.customerId || !lead.interest || interests.has(lead.customerId)) {
      continue;
    }

    interests.set(lead.customerId, lead.interest);
  }

  return interests;
}

function withPrimaryInterest<T extends { id: string }>(customer: T, interests: Map<string, string>) {
  return {
    ...customer,
    primaryInterest: interests.get(customer.id) ?? null,
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
    const query = customerListQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const baseWhere = customerListWhere({ storeId: session.user.storeId, user: session.user, query });
    const operationalFilters = await customerOperationalFilters({ storeId: session.user.storeId, query });
    const where: Prisma.CustomerWhereInput = operationalFilters.length > 0 ? { AND: [baseWhere, ...operationalFilters] } : baseWhere;

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.customer.count({ where }),
    ]);
    const interests = await primaryInterestsByCustomer(
      session.user.storeId,
      items.map((customer) => customer.id),
    );

    return listResponse(items.map((customer) => sanitizeCustomer(withPrimaryInterest(customer, interests))), query, total);
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
    const baseWhere = customerListWhere({ storeId: session.user.storeId, user: session.user, query });
    const operationalFilters = await customerOperationalFilters({ storeId: session.user.storeId, query });
    const where: Prisma.CustomerWhereInput = operationalFilters.length > 0 ? { AND: [baseWhere, ...operationalFilters] } : baseWhere;

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
    const interests = await primaryInterestsByCustomer(
      session.user.storeId,
      customers.map((customer) => customer.id),
    );
    const columns = customerKanbanColumns.map((status) => ({
      status,
      items: customers
        .filter((customer) => (statuses.get(customer.id) ?? "NEW_LEAD") === status)
        .map((customer) => ({
          ...sanitizeCustomer(withPrimaryInterest(customer, interests)),
          operationalStatus: statuses.get(customer.id) ?? "NEW_LEAD",
        })),
    }));

    return { columns };
  });

  app.post("/minimal-leads", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "leads",
      action: "create",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createMinimalLeadSchema.parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          storeId: session.user.storeId,
          type: "PERSON",
          name: input.name,
          email: input.email,
          phone: input.phone,
          origin: input.origin,
          notes: input.notes,
          createdByUserId: session.user.id,
          updatedByUserId: session.user.id,
        },
      });

      const lead = await tx.lead.create({
        data: {
          storeId: session.user.storeId,
          customerId: customer.id,
          assignedUserId: session.user.id,
          source: input.origin,
          title: input.name,
          status: "NEW",
          interest: input.interest,
        },
      });

      await tx.leadCard.create({
        data: {
          storeId: session.user.storeId,
          leadId: lead.id,
          boardKey: "leads",
          stageKey: lead.status,
          position: 0,
        },
      });

      await tx.leadStageHistory.create({
        data: {
          storeId: session.user.storeId,
          leadId: lead.id,
          fromStage: null,
          toStage: lead.status,
          actorUserId: session.user.id,
          reason: "Lead minimo criado",
        },
      });

      await tx.customerHistoryEvent.create({
        data: {
          storeId: session.user.storeId,
          customerId: customer.id,
          type: "customer.minimal_lead_created",
          title: "Lead minimo criado",
          description: input.notes,
          metadata: {
            leadId: lead.id,
            origin: input.origin,
            interest: input.interest,
          },
        },
      });

      await tx.auditLog.createMany({
        data: [
          {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "customers",
            action: "create_minimal_lead_customer",
            entityType: "customer",
            entityId: customer.id,
            result: "SUCCESS",
            metadata: {
              leadId: lead.id,
              origin: input.origin,
            },
          },
          {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "create_minimal_lead",
            entityType: "lead",
            entityId: lead.id,
            result: "SUCCESS",
            metadata: {
              customerId: customer.id,
              source: lead.source,
            },
          },
        ],
      });

      return { customer, lead };
    });

    await emitInternalEvent({
      name: "customer.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "customer",
      entityId: result.customer.id,
      payload: { origin: result.customer.origin, source: "minimal_lead" },
    });
    await emitInternalEvent({
      name: "lead.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "lead",
      entityId: result.lead.id,
      payload: { customerId: result.customer.id, source: result.lead.source },
    });

    return reply.code(201).send({
      data: {
        customer: sanitizeCustomer({ ...result.customer, primaryInterest: result.lead.interest }),
        lead: {
          id: result.lead.id,
          customerId: result.lead.customerId,
          assignedUserId: result.lead.assignedUserId,
          source: result.lead.source,
          status: result.lead.status,
          title: result.lead.title,
        },
      },
    });
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

    const interests = await primaryInterestsByCustomer(session.user.storeId, [customer.id]);

    return { data: sanitizeCustomer(withPrimaryInterest(customer, interests)) };
  });

  app.get("/:id/history", async (request) => {
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

    const [sales, purchaseLeads, evaluations, events] = await Promise.all([
      prisma.sale.findMany({
        where: { storeId: session.user.storeId, customerId: customer.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.purchaseLead.findMany({
        where: { storeId: session.user.storeId, customerId: customer.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.vehicleEvaluation.findMany({
        where: { storeId: session.user.storeId, customerId: customer.id },
        orderBy: { evaluatedAt: "desc" },
        take: 10,
      }),
      prisma.customerHistoryEvent.findMany({
        where: { storeId: session.user.storeId, customerId: customer.id },
        orderBy: { occurredAt: "desc" },
        take: 20,
      }),
    ]);
    const interests = await primaryInterestsByCustomer(session.user.storeId, [customer.id]);

    return {
      customer: sanitizeCustomer(withPrimaryInterest(customer, interests)),
      sales: sales.map(sanitizeCustomerSale),
      purchaseLeads: purchaseLeads.map(sanitizeCustomerPurchaseLead),
      evaluations: evaluations.map(sanitizeCustomerEvaluation),
      events: events.map(sanitizeCustomerHistoryEvent),
    };
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
      return denyOwnershipAccess({
        action: "update_status",
        entityId: params.id,
        entityType: "customer",
        message: "Cliente nao encontrado.",
        module: "customers",
        request,
        session,
      });
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
          birthDate: input.birthDate,
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
      return denyOwnershipAccess({
        action: "update",
        entityId: params.id,
        entityType: "customer",
        message: "Cliente nao encontrado.",
        module: "customers",
        request,
        session,
      });
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
      return denyOwnershipAccess({
        action: "delete",
        entityId: params.id,
        entityType: "customer",
        message: "Cliente nao encontrado.",
        module: "customers",
        request,
        session,
      });
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
