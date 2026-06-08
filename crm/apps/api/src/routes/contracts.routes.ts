import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const contractQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  status: z.string().trim().max(60).optional(),
});

const generateContractSchema = z.object({
  saleId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  status: z.string().trim().min(2).max(60).default("GENERATED"),
  snapshot: z.record(z.unknown()).optional(),
});

const contractParamsSchema = z.object({
  id: z.string().uuid(),
});

const signContractSchema = z.object({
  signedAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});

const warrantyTermSchema = z.object({
  saleId: z.string().uuid(),
  terms: z.record(z.unknown()),
});

const deliveryChecklistSchema = z.object({
  saleId: z.string().uuid(),
  checklist: z.record(z.unknown()),
  status: z.string().trim().min(2).max(60).default("PENDING"),
  deliveredAt: z.coerce.date().optional(),
});

type ContractRecord = {
  id: string;
  saleId: string;
  templateId: string | null;
  version: number;
  status: string;
  snapshot: unknown;
  generatedAt: Date;
  signedAt: Date | null;
};

function sanitizeContract(contract: ContractRecord) {
  return {
    id: contract.id,
    saleId: contract.saleId,
    templateId: contract.templateId,
    version: contract.version,
    status: contract.status,
    snapshot: contract.snapshot,
    generatedAt: contract.generatedAt.toISOString(),
    signedAt: contract.signedAt?.toISOString() ?? null,
  };
}

async function getSaleOrThrow(storeId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda do contrato nao encontrada.");
  }

  return sale;
}

async function getContractOrThrow(storeId: string, id: string) {
  const contract = await prisma.contract.findFirst({
    where: { id, storeId },
  });

  if (!contract) {
    throw new ApiError("NOT_FOUND", "Contrato nao encontrado.");
  }

  return contract;
}

async function buildSaleSnapshot(storeId: string, saleId: string, extra?: Record<string, unknown>) {
  const sale = await getSaleOrThrow(storeId, saleId);
  const customer = sale.customerId
    ? await prisma.customer.findFirst({ where: { id: sale.customerId, storeId }, select: { id: true, name: true, document: true } })
    : null;
  const vehicle = sale.vehicleId
    ? await prisma.vehicle.findFirst({
        where: { id: sale.vehicleId, storeId },
        select: { id: true, brand: true, model: true, version: true, plate: true, mileage: true },
      })
    : null;

  return {
    sale: {
      id: sale.id,
      type: sale.type,
      status: sale.status,
      salePrice: sale.salePrice?.toString() ?? null,
      grossMargin: sale.grossMargin?.toString() ?? null,
      closedAt: sale.closedAt?.toISOString() ?? null,
    },
    customer,
    vehicle,
    extra: extra ?? {},
  };
}

export async function registerContractRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const query = contractQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contract.findMany({ where, orderBy: { generatedAt: "desc" }, skip, take }),
      prisma.contract.count({ where }),
    ]);

    return listResponse(items.map(sanitizeContract), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = contractParamsSchema.parse(request.params);
    const contract = await getContractOrThrow(session.user.storeId, params.id);

    return { data: sanitizeContract(contract) };
  });

  app.post("/generate", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = generateContractSchema.parse(request.body);
    const sale = await getSaleOrThrow(session.user.storeId, input.saleId);
    const currentVersion = await prisma.contract.count({
      where: { storeId: session.user.storeId, saleId: sale.id },
    });
    const snapshot = await buildSaleSnapshot(session.user.storeId, sale.id, input.snapshot);

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          templateId: input.templateId,
          version: currentVersion + 1,
          status: input.status,
          snapshot: snapshot as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_generated",
          entityType: "contract",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            version: created.version,
            status: created.status,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "contract.generated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "contract",
      entityId: contract.id,
      payload: { saleId: sale.id, version: contract.version, status: contract.status },
    });

    return reply.code(201).send({ data: sanitizeContract(contract) });
  });

  app.post("/:id/sign", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = contractParamsSchema.parse(request.params);
    const input = signContractSchema.parse(request.body);
    const current = await getContractOrThrow(session.user.storeId, params.id);

    const contract = await prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id: current.id },
        data: {
          status: "SIGNED",
          signedAt: input.signedAt ?? new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_signed",
          entityType: "contract",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            reason: input.reason,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "contract.signed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "contract",
      entityId: contract.id,
      payload: { saleId: contract.saleId, signedAt: contract.signedAt?.toISOString() ?? null },
    });

    return { data: sanitizeContract(contract) };
  });

  app.post("/warranty-terms", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = warrantyTermSchema.parse(request.body);
    await getSaleOrThrow(session.user.storeId, input.saleId);

    const warranty = await prisma.$transaction(async (tx) => {
      const created = await tx.warrantyTerm.create({
        data: {
          storeId: session.user.storeId,
          saleId: input.saleId,
          terms: input.terms as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "warranty_term_created",
          entityType: "warranty_term",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { saleId: created.saleId },
        },
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        id: warranty.id,
        saleId: warranty.saleId,
        terms: warranty.terms,
        createdAt: warranty.createdAt.toISOString(),
      },
    });
  });

  app.post("/delivery-checklists", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = deliveryChecklistSchema.parse(request.body);
    await getSaleOrThrow(session.user.storeId, input.saleId);

    const checklist = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryChecklist.create({
        data: {
          storeId: session.user.storeId,
          saleId: input.saleId,
          checklist: input.checklist as Prisma.InputJsonObject,
          status: input.status,
          deliveredAt: input.deliveredAt,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "delivery_checklist_created",
          entityType: "delivery_checklist",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: created.saleId,
            status: created.status,
          },
        },
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        id: checklist.id,
        saleId: checklist.saleId,
        checklist: checklist.checklist,
        status: checklist.status,
        deliveredAt: checklist.deliveredAt?.toISOString() ?? null,
        createdAt: checklist.createdAt.toISOString(),
        updatedAt: checklist.updatedAt.toISOString(),
      },
    });
  });
}
