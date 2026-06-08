import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { enqueueJob, serializeJob } from "../jobs/job-service.js";
import { prisma } from "../lib/db.js";

const queryStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "NEEDS_HUMAN", "CANCELLED"]);

const legalChecksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: queryStatusSchema.optional(),
  vehicle_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
});

const createLegalCheckSchema = z.object({
  vehicleId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  provider: z.string().trim().min(2).max(80),
  status: queryStatusSchema.default("PENDING"),
  result: z.record(z.unknown()).optional(),
  error: z.string().trim().max(1000).optional(),
  checkedAt: z.coerce.date().optional(),
});

const legalCheckParamsSchema = z.object({ id: z.string().uuid() });

const updateLegalCheckSchema = z.object({
  status: queryStatusSchema,
  result: z.record(z.unknown()).optional(),
  error: z.string().trim().max(1000).optional(),
  checkedAt: z.coerce.date().optional(),
});

const externalJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: queryStatusSchema.optional(),
  provider: z.string().trim().max(80).optional(),
  purpose: z.string().trim().max(120).optional(),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
});

const createExternalJobSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  purpose: z.string().trim().min(2).max(120),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  status: queryStatusSchema.default("PENDING"),
  requiresHumanAction: z.boolean().default(false),
  enqueue: z.boolean().default(true),
  payload: z.record(z.unknown()).optional(),
});

const externalJobParamsSchema = z.object({ id: z.string().uuid() });

const externalResultSchema = z.object({
  status: queryStatusSchema,
  result: z.record(z.unknown()).optional(),
  error: z.string().trim().max(1000).optional(),
});

type LegalCheckRecord = {
  id: string;
  storeId: string;
  vehicleId: string | null;
  customerId: string | null;
  provider: string;
  status: string;
  result: unknown;
  error: string | null;
  checkedAt: Date | null;
  createdAt: Date;
};

type ExternalJobRecord = {
  id: string;
  storeId: string | null;
  provider: string;
  purpose: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  requiresHumanAction: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeLegalCheck(check: LegalCheckRecord) {
  return {
    id: check.id,
    vehicleId: check.vehicleId,
    customerId: check.customerId,
    provider: check.provider,
    status: check.status,
    result: check.result,
    error: check.error,
    checkedAt: check.checkedAt?.toISOString() ?? null,
    createdAt: check.createdAt.toISOString(),
  };
}

function sanitizeExternalJob(job: ExternalJobRecord) {
  return {
    id: job.id,
    provider: job.provider,
    purpose: job.purpose,
    entityType: job.entityType,
    entityId: job.entityId,
    status: job.status,
    requiresHumanAction: job.requiresHumanAction,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

async function ensureVehicle(storeId: string, vehicleId?: string | null) {
  if (!vehicleId) return;
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, storeId, deletedAt: null }, select: { id: true } });
  if (!vehicle) throw new ApiError("NOT_FOUND", "Veiculo da consulta nao encontrado.");
}

async function ensureCustomer(storeId: string, customerId?: string | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente da consulta nao encontrado.");
}

async function ensureEntity(storeId: string, entityType?: string, entityId?: string) {
  if (!entityType || !entityId) return;
  if (entityType === "vehicle") return ensureVehicle(storeId, entityId);
  if (entityType === "customer") return ensureCustomer(storeId, entityId);
  if (entityType === "sale") {
    const sale = await prisma.sale.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!sale) throw new ApiError("NOT_FOUND", "Venda da consulta nao encontrada.");
  }
}

async function getLegalCheckOrThrow(storeId: string, id: string) {
  const check = await prisma.legalRestrictionCheck.findFirst({ where: { id, storeId } });
  if (!check) throw new ApiError("NOT_FOUND", "Checagem legal nao encontrada.");
  return check;
}

async function getExternalJobOrThrow(storeId: string, id: string) {
  const job = await prisma.externalQueryJob.findFirst({ where: { id, storeId } });
  if (!job) throw new ApiError("NOT_FOUND", "Job de consulta externa nao encontrado.");
  return job;
}

export async function registerComplianceRoutes(app: FastifyInstance) {
  app.get("/legal-checks", async (request) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const query = legalChecksQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.legalRestrictionCheck.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.legalRestrictionCheck.count({ where }),
    ]);
    return listResponse(items.map(sanitizeLegalCheck), query, total);
  });

  app.post("/legal-checks", async (request, reply) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const input = createLegalCheckSchema.parse(request.body);
    await ensureVehicle(session.user.storeId, input.vehicleId);
    await ensureCustomer(session.user.storeId, input.customerId);
    const check = await prisma.legalRestrictionCheck.create({
      data: {
        storeId: session.user.storeId,
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        provider: input.provider,
        status: input.status,
        result: input.result as Prisma.InputJsonObject | undefined,
        error: input.error,
        checkedAt: input.checkedAt,
      },
    });
    await emitInternalEvent({
      name: "compliance.legal_check_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "legal_restriction_check",
      entityId: check.id,
      payload: { provider: check.provider, status: check.status, vehicleId: check.vehicleId, customerId: check.customerId },
    });
    return reply.code(201).send({ data: sanitizeLegalCheck(check) });
  });

  app.post("/legal-checks/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const params = legalCheckParamsSchema.parse(request.params);
    const input = updateLegalCheckSchema.parse(request.body);
    const current = await getLegalCheckOrThrow(session.user.storeId, params.id);
    const check = await prisma.legalRestrictionCheck.update({
      where: { id: current.id },
      data: {
        status: input.status,
        result: input.result as Prisma.InputJsonObject | undefined,
        error: input.error,
        checkedAt: input.checkedAt ?? (input.status === "SUCCEEDED" || input.status === "FAILED" ? new Date() : current.checkedAt),
      },
    });
    await emitInternalEvent({
      name: "compliance.legal_check_completed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "legal_restriction_check",
      entityId: check.id,
      payload: { fromStatus: current.status, toStatus: check.status },
    });
    return { data: sanitizeLegalCheck(check) };
  });

  app.get("/external-jobs", async (request) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const query = externalJobsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.externalQueryJob.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.externalQueryJob.count({ where }),
    ]);
    return listResponse(items.map(sanitizeExternalJob), query, total);
  });

  app.get("/external-jobs/:id", async (request) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const params = externalJobParamsSchema.parse(request.params);
    const job = await getExternalJobOrThrow(session.user.storeId, params.id);
    const results = await prisma.externalQueryResult.findMany({ where: { storeId: session.user.storeId, jobId: job.id }, orderBy: { createdAt: "desc" } });
    return {
      data: sanitizeExternalJob(job),
      results: results.map((result) => ({ ...result, createdAt: result.createdAt.toISOString() })),
    };
  });

  app.post("/external-jobs", async (request, reply) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const input = createExternalJobSchema.parse(request.body);
    await ensureEntity(session.user.storeId, input.entityType, input.entityId);
    const externalJob = await prisma.externalQueryJob.create({
      data: {
        storeId: session.user.storeId,
        provider: input.provider,
        purpose: input.purpose,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        requiresHumanAction: input.requiresHumanAction,
      },
    });
    const backgroundJob = input.enqueue
      ? await enqueueJob({
          storeId: session.user.storeId,
          jobType: `external-query.${input.provider}`,
          entityType: "external_query_job",
          entityId: externalJob.id,
          idempotencyKey: `external-query:${externalJob.id}`,
          payload: {
            externalJobId: externalJob.id,
            provider: input.provider,
            purpose: input.purpose,
            entityType: input.entityType,
            entityId: input.entityId,
            payload: (input.payload ?? {}) as Prisma.InputJsonObject,
          },
        })
      : null;
    await emitInternalEvent({
      name: "external_query.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "external_query_job",
      entityId: externalJob.id,
      payload: { provider: externalJob.provider, purpose: externalJob.purpose, backgroundJobId: backgroundJob?.job.id },
    });
    return reply.code(backgroundJob?.created ? 202 : 201).send({
      data: sanitizeExternalJob(externalJob),
      backgroundJob: backgroundJob ? serializeJob(backgroundJob.job) : null,
      idempotentHit: backgroundJob ? !backgroundJob.created : false,
    });
  });

  app.post("/external-jobs/:id/results", async (request, reply) => {
    const session = await requirePermission(request, { module: "suppliers", action: "manage", scope: "ALL", sensitiveArea: "credentials" });
    const params = externalJobParamsSchema.parse(request.params);
    const input = externalResultSchema.parse(request.body);
    const current = await getExternalJobOrThrow(session.user.storeId, params.id);
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.externalQueryResult.create({
        data: {
          storeId: session.user.storeId,
          jobId: current.id,
          status: input.status,
          result: input.result as Prisma.InputJsonObject | undefined,
          error: input.error,
        },
      });
      await tx.externalQueryJob.update({
        where: { id: current.id },
        data: { status: input.status, requiresHumanAction: input.status === "NEEDS_HUMAN" ? true : current.requiresHumanAction },
      });
      return created;
    });
    await emitInternalEvent({
      name: "external_query.result_recorded",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "external_query_result",
      entityId: result.id,
      payload: { jobId: current.id, fromStatus: current.status, toStatus: result.status },
    });
    return reply.code(201).send({ data: { ...result, createdAt: result.createdAt.toISOString() } });
  });
}
