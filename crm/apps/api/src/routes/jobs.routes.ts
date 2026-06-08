import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../api/auth-guards.js";
import { ApiError } from "../api/errors.js";
import { getPagination, listResponse, paginationQuerySchema } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { enqueueJob, requeueFailedJob, serializeJob } from "../jobs/job-service.js";
import { prisma } from "../lib/db.js";

const jobStatusSchema = z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]);

const jobListQuerySchema = paginationQuerySchema.extend({
  status: jobStatusSchema.optional(),
  job_type: z.string().trim().max(100).optional(),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
});

const documentOcrSchema = z.object({
  attachmentId: z.string().uuid(),
  provider: z.string().trim().max(60).default("manual"),
});

const enqueueGenericJobSchema = z.object({
  jobType: z.string().trim().min(2).max(100),
  entityType: z.string().trim().min(2).max(80).optional(),
  entityId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(6).max(180).optional(),
  payload: z.record(z.unknown()).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).default(3),
});

export async function registerJobRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "automation",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "technical",
    });
    const query = jobListQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.job_type ? { jobType: query.job_type } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: [{ status: "asc" }, { scheduledAt: "desc" }],
        skip,
        take,
      }),
      prisma.backgroundJob.count({ where }),
    ]);

    return listResponse(items.map(serializeJob), query, total);
  });

  app.post("/enqueue", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "automation",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "technical",
    });
    const input = enqueueGenericJobSchema.parse(request.body);

    const { job, created } = await enqueueJob({
      storeId: session.user.storeId,
      jobType: input.jobType,
      entityType: input.entityType,
      entityId: input.entityId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload as Prisma.InputJsonObject | undefined,
      maxAttempts: input.maxAttempts,
    });

    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "automation",
        action: "enqueue_job",
        entityType: "background_job",
        entityId: job.id,
        result: "SUCCESS",
        metadata: {
          jobType: input.jobType,
          idempotentHit: !created,
        },
      },
    });

    return reply.code(created ? 202 : 200).send({
      data: serializeJob(job),
      idempotentHit: !created,
    });
  });

  app.post("/document-ocr", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = documentOcrSchema.parse(request.body);

    const attachment = await prisma.fileAttachment.findFirst({
      where: {
        id: input.attachmentId,
        storeId: session.user.storeId,
        status: "ACTIVE",
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new ApiError("NOT_FOUND", "Arquivo nao encontrado para OCR.");
    }

    const ocrJob = await prisma.documentOcrJob.create({
      data: {
        storeId: session.user.storeId,
        attachmentId: attachment.id,
        provider: input.provider,
      },
    });

    const { job, created } = await enqueueJob({
      storeId: session.user.storeId,
      jobType: "document.ocr",
      entityType: "file_attachment",
      entityId: attachment.id,
      idempotencyKey: `document.ocr:${attachment.id}:${ocrJob.id}`,
      payload: {
        attachmentId: attachment.id,
        ocrJobId: ocrJob.id,
        provider: input.provider,
        mimeType: attachment.mimeType,
        classification: attachment.classification,
      },
      maxAttempts: 3,
    });

    await emitInternalEvent({
      name: "document.uploaded",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "background_job",
      entityId: job.id,
      payload: {
        followUpJob: "document.ocr",
        attachmentId: attachment.id,
        ocrJobId: ocrJob.id,
      },
    });

    return reply.code(created ? 202 : 200).send({
      data: {
        job: serializeJob(job),
        ocrJob: {
          id: ocrJob.id,
          status: ocrJob.status,
          provider: ocrJob.provider,
        },
      },
      idempotentHit: !created,
    });
  });

  app.post("/:id/retry", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "automation",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "technical",
    });
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const job = await requeueFailedJob({
      jobId: params.id,
      storeId: session.user.storeId,
      requestedByUserId: session.user.id,
    });

    if (!job) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Somente jobs com falha podem ser reprocessados por este fluxo.");
    }

    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "automation",
        action: "retry_job",
        entityType: "background_job",
        entityId: job.id,
        result: "SUCCESS",
        metadata: {
          jobType: job.jobType,
          attempts: job.attempts,
        },
      },
    });

    return reply.code(202).send({ data: serializeJob(job) });
  });
}
