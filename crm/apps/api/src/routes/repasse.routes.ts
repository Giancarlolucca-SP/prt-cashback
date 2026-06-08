import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const repasseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().max(60).optional(),
  vehicle_id: z.string().uuid().optional(),
});

const createRepasseSchema = z.object({
  vehicleId: z.string().uuid(),
  status: z.string().trim().min(2).max(60).default("DRAFT"),
  price: z.number().nonnegative().optional(),
  channelPlan: z.record(z.unknown()).optional(),
});

const updateRepasseSchema = z
  .object({
    status: z.string().trim().min(2).max(60).optional(),
    price: z.number().nonnegative().nullable().optional(),
    channelPlan: z.record(z.unknown()).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const repasseParamsSchema = z.object({
  id: z.string().uuid(),
});

const recognizeRevenueSchema = z.object({
  saleId: z.string().uuid().optional(),
  amount: z.number().positive(),
  recognizedAt: z.coerce.date().optional(),
  snapshot: z.record(z.unknown()).optional(),
});

type RepasseRecord = {
  id: string;
  vehicleId: string;
  status: string;
  price: { toString(): string } | null;
  channelPlan: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeRepasse(process: RepasseRecord) {
  return {
    id: process.id,
    vehicleId: process.vehicleId,
    status: process.status,
    price: process.price?.toString() ?? null,
    channelPlan: process.channelPlan,
    createdAt: process.createdAt.toISOString(),
    updatedAt: process.updatedAt.toISOString(),
  };
}

async function ensureVehicleInStore(storeId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!vehicle) {
    throw new ApiError("NOT_FOUND", "Veiculo do repasse nao encontrado.");
  }
}

async function ensureSaleInStore(storeId: string, saleId?: string) {
  if (!saleId) return;

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda vinculada ao repasse nao encontrada.");
  }
}

async function getRepasseOrThrow(storeId: string, id: string) {
  const process = await prisma.repasseProcess.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!process) {
    throw new ApiError("NOT_FOUND", "Processo de repasse nao encontrado.");
  }

  return process;
}

export async function registerRepasseRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "repasse",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = repasseQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.repasseProcess.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.repasseProcess.count({ where }),
    ]);

    return listResponse(items.map(sanitizeRepasse), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "repasse",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = repasseParamsSchema.parse(request.params);
    const process = await getRepasseOrThrow(session.user.storeId, params.id);
    const revenues = await prisma.repasseRevenue.findMany({
      where: { storeId: session.user.storeId, repasseProcessId: process.id },
      orderBy: { recognizedAt: "desc" },
    });

    return {
      data: sanitizeRepasse(process),
      revenues: revenues.map((revenue) => ({
        id: revenue.id,
        saleId: revenue.saleId,
        amount: revenue.amount.toString(),
        snapshot: revenue.snapshot,
        recognizedAt: revenue.recognizedAt.toISOString(),
      })),
    };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "repasse",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createRepasseSchema.parse(request.body);
    await ensureVehicleInStore(session.user.storeId, input.vehicleId);

    const process = await prisma.$transaction(async (tx) => {
      const created = await tx.repasseProcess.create({
        data: {
          storeId: session.user.storeId,
          vehicleId: input.vehicleId,
          status: input.status,
          price: input.price,
          channelPlan: input.channelPlan as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.vehicleInventoryRecord.updateMany({
        where: { storeId: session.user.storeId, vehicleId: input.vehicleId, deletedAt: null },
        data: { status: "REPASSE" },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "repasse",
          action: "process_created",
          entityType: "repasse_process",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            vehicleId: created.vehicleId,
            status: created.status,
            price: created.price?.toString() ?? null,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "repasse.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "repasse_process",
      entityId: process.id,
      payload: { vehicleId: process.vehicleId, status: process.status },
    });

    return reply.code(201).send({ data: sanitizeRepasse(process) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "repasse",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = repasseParamsSchema.parse(request.params);
    const input = updateRepasseSchema.parse(request.body);
    const current = await getRepasseOrThrow(session.user.storeId, params.id);

    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.repasseProcess.update({
        where: { id: current.id },
        data: {
          status: input.status,
          price: input.price,
          channelPlan: input.channelPlan as Prisma.InputJsonObject | undefined,
          deletedAt: input.status === "CANCELLED" ? new Date() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "repasse",
          action: "process_updated",
          entityType: "repasse_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            fromStatus: current.status,
            toStatus: updated.status,
            changedFields: Object.keys(input),
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "repasse.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "repasse_process",
      entityId: process.id,
      payload: { fromStatus: current.status, toStatus: process.status },
    });

    return { data: sanitizeRepasse(process) };
  });

  app.post("/:id/revenues", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "repasse",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = repasseParamsSchema.parse(request.params);
    const input = recognizeRevenueSchema.parse(request.body);
    const process = await getRepasseOrThrow(session.user.storeId, params.id);
    await ensureSaleInStore(session.user.storeId, input.saleId);

    const revenue = await prisma.$transaction(async (tx) => {
      const created = await tx.repasseRevenue.create({
        data: {
          storeId: session.user.storeId,
          repasseProcessId: process.id,
          saleId: input.saleId,
          amount: input.amount,
          snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
          recognizedAt: input.recognizedAt,
        },
      });

      await tx.repasseProcess.update({
        where: { id: process.id },
        data: { status: "REVENUE_RECOGNIZED" },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "repasse",
          action: "revenue_recognized",
          entityType: "repasse_revenue",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            repasseProcessId: process.id,
            saleId: created.saleId,
            amount: created.amount.toString(),
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "repasse.revenue_recognized",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "repasse_revenue",
      entityId: revenue.id,
      payload: { repasseProcessId: process.id, amount: revenue.amount.toString() },
    });

    return reply.code(201).send({
      data: {
        id: revenue.id,
        repasseProcessId: revenue.repasseProcessId,
        saleId: revenue.saleId,
        amount: revenue.amount.toString(),
        snapshot: revenue.snapshot,
        recognizedAt: revenue.recognizedAt.toISOString(),
        createdAt: revenue.createdAt.toISOString(),
      },
    });
  });
}
