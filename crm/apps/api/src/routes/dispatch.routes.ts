import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const dispatchQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().max(60).optional(),
  sale_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
});

const dispatchPayloadSchema = z.object({
  saleId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  status: z.string().trim().min(2).max(60).default("OPEN"),
  channel: z.string().trim().max(80).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const dispatchParamsSchema = z.object({ id: z.string().uuid() });

const updateDispatchSchema = z
  .object({
    providerId: z.string().uuid().nullable().optional(),
    status: z.string().trim().min(2).max(60).optional(),
    channel: z.string().trim().max(80).nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const statusUpdateSchema = z.object({
  status: z.string().trim().min(2).max(60),
  reason: z.string().trim().max(300).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type DispatchRecord = {
  id: string;
  saleId: string;
  providerId: string | null;
  status: string;
  channel: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeDispatch(process: DispatchRecord) {
  return {
    id: process.id,
    saleId: process.saleId,
    providerId: process.providerId,
    status: process.status,
    channel: process.channel,
    metadata: process.metadata,
    createdAt: process.createdAt.toISOString(),
    updatedAt: process.updatedAt.toISOString(),
  };
}

async function ensureSale(storeId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId, deletedAt: null },
    select: { id: true, status: true },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda do processo de despachante nao encontrada.");
  }

  return sale;
}

async function ensureProvider(storeId: string, providerId?: string | null) {
  if (!providerId) return;

  const provider = await prisma.serviceProvider.findFirst({
    where: { id: providerId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!provider) {
    throw new ApiError("NOT_FOUND", "Prestador/despachante nao encontrado.");
  }
}

async function getDispatchOrThrow(storeId: string, id: string) {
  const process = await prisma.dispatcherProcess.findFirst({ where: { id, storeId } });
  if (!process) throw new ApiError("NOT_FOUND", "Processo de despachante nao encontrado.");
  return process;
}

export async function registerDispatchRoutes(app: FastifyInstance) {
  app.get("/processes", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = dispatchQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.provider_id ? { providerId: query.provider_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.dispatcherProcess.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.dispatcherProcess.count({ where }),
    ]);

    return listResponse(items.map(sanitizeDispatch), query, total);
  });

  app.get("/processes/:id", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const process = await getDispatchOrThrow(session.user.storeId, params.id);
    return { data: sanitizeDispatch(process) };
  });

  app.post("/processes", async (request, reply) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = dispatchPayloadSchema.parse(request.body);
    const sale = await ensureSale(session.user.storeId, input.saleId);
    await ensureProvider(session.user.storeId, input.providerId);

    const process = await prisma.$transaction(async (tx) => {
      const created = await tx.dispatcherProcess.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          providerId: input.providerId,
          status: input.status,
          channel: input.channel,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_created",
          entityType: "dispatcher_process",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { saleId: created.saleId, providerId: created.providerId, status: created.status },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "dispatch.process_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatcher_process",
      entityId: process.id,
      payload: { saleId: process.saleId, providerId: process.providerId, status: process.status },
    });

    return reply.code(201).send({ data: sanitizeDispatch(process) });
  });

  app.patch("/processes/:id", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = updateDispatchSchema.parse(request.body);
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    await ensureProvider(session.user.storeId, input.providerId);

    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          providerId: input.providerId,
          status: input.status,
          channel: input.channel,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_updated",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input), fromStatus: current.status, toStatus: updated.status },
        },
      });

      return updated;
    });

    if (input.status && input.status !== current.status) {
      await emitInternalEvent({
        name: "dispatch.process_status_changed",
        storeId: session.user.storeId,
        actorId: session.user.id,
        entityType: "dispatcher_process",
        entityId: process.id,
        payload: { fromStatus: current.status, toStatus: process.status },
      });
    }

    return { data: sanitizeDispatch(process) };
  });

  app.post("/processes/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = statusUpdateSchema.parse(request.body);
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          status: input.status,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonObject) : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_status_changed",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: updated.status, reason: input.reason },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "dispatch.process_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatcher_process",
      entityId: process.id,
      payload: { fromStatus: current.status, toStatus: process.status, reason: input.reason },
    });

    return { data: sanitizeDispatch(process) };
  });
}
