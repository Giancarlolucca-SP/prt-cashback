import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const queryStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "NEEDS_HUMAN", "CANCELLED"]);

const ocrJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: queryStatusSchema.optional(),
  attachment_id: z.string().uuid().optional(),
});

const ocrJobParamsSchema = z.object({ id: z.string().uuid() });

const updateOcrJobSchema = z.object({
  status: queryStatusSchema,
  result: z.record(z.unknown()).optional(),
  error: z.string().trim().max(1000).optional(),
});

const extractedFieldSchema = z.object({
  fieldKey: z.string().trim().min(2).max(120),
  value: z.string().trim().max(1000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reviewed: z.boolean().default(false),
});

const reviewFieldSchema = z.object({
  value: z.string().trim().max(1000).optional(),
  reviewed: z.boolean().default(true),
});

const fieldParamsSchema = z.object({ fieldId: z.string().uuid() });

type OcrJobRecord = {
  id: string;
  storeId: string | null;
  attachmentId: string;
  status: string;
  provider: string | null;
  result: unknown;
  error: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeOcrJob(job: OcrJobRecord) {
  return {
    id: job.id,
    storeId: job.storeId,
    attachmentId: job.attachmentId,
    status: job.status,
    provider: job.provider,
    result: job.result,
    error: job.error,
    reviewedByUserId: job.reviewedByUserId,
    reviewedAt: job.reviewedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function sanitizeExtractedField(field: {
  id: string;
  storeId: string | null;
  ocrJobId: string;
  fieldKey: string;
  value: string | null;
  confidence: { toString(): string } | null;
  reviewed: boolean;
  createdAt: Date;
}) {
  return {
    id: field.id,
    storeId: field.storeId,
    ocrJobId: field.ocrJobId,
    fieldKey: field.fieldKey,
    value: field.value,
    confidence: field.confidence?.toString() ?? null,
    reviewed: field.reviewed,
    createdAt: field.createdAt.toISOString(),
  };
}

async function getOcrJobOrThrow(storeId: string, id: string) {
  const job = await prisma.documentOcrJob.findFirst({ where: { id, storeId } });
  if (!job) throw new ApiError("NOT_FOUND", "Job de OCR nao encontrado.");
  return job;
}

export async function registerOcrRoutes(app: FastifyInstance) {
  app.get("/jobs", async (request) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const query = ocrJobsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.attachment_id ? { attachmentId: query.attachment_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.documentOcrJob.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.documentOcrJob.count({ where }),
    ]);
    return listResponse(items.map(sanitizeOcrJob), query, total);
  });

  app.get("/jobs/:id", async (request) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const params = ocrJobParamsSchema.parse(request.params);
    const job = await getOcrJobOrThrow(session.user.storeId, params.id);
    const fields = await prisma.documentExtractedField.findMany({
      where: { storeId: session.user.storeId, ocrJobId: job.id },
      orderBy: { createdAt: "asc" },
    });
    return { data: sanitizeOcrJob(job), fields: fields.map(sanitizeExtractedField) };
  });

  app.post("/jobs/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const params = ocrJobParamsSchema.parse(request.params);
    const input = updateOcrJobSchema.parse(request.body);
    const current = await getOcrJobOrThrow(session.user.storeId, params.id);
    const job = await prisma.documentOcrJob.update({
      where: { id: current.id },
      data: {
        status: input.status,
        result: input.result as Prisma.InputJsonObject | undefined,
        error: input.error,
        reviewedByUserId: input.status === "SUCCEEDED" || input.status === "FAILED" ? session.user.id : current.reviewedByUserId,
        reviewedAt: input.status === "SUCCEEDED" || input.status === "FAILED" ? new Date() : current.reviewedAt,
      },
    });
    await emitInternalEvent({
      name: "ocr.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "document_ocr_job",
      entityId: job.id,
      payload: { fromStatus: current.status, toStatus: job.status },
    });
    return { data: sanitizeOcrJob(job) };
  });

  app.post("/jobs/:id/fields", async (request, reply) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const params = ocrJobParamsSchema.parse(request.params);
    const input = extractedFieldSchema.parse(request.body);
    const job = await getOcrJobOrThrow(session.user.storeId, params.id);
    const field = await prisma.documentExtractedField.create({
      data: {
        storeId: session.user.storeId,
        ocrJobId: job.id,
        fieldKey: input.fieldKey,
        value: input.value,
        confidence: input.confidence,
        reviewed: input.reviewed,
      },
    });
    await emitInternalEvent({
      name: "ocr.field_extracted",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "document_extracted_field",
      entityId: field.id,
      payload: { ocrJobId: job.id, fieldKey: field.fieldKey, confidence: field.confidence?.toString() ?? null },
    });
    return reply.code(201).send({ data: sanitizeExtractedField(field) });
  });

  app.post("/fields/:fieldId/review", async (request) => {
    const session = await requirePermission(request, { module: "documents", action: "manage", scope: "STORE", sensitiveArea: "documents" });
    const params = fieldParamsSchema.parse(request.params);
    const input = reviewFieldSchema.parse(request.body);
    const current = await prisma.documentExtractedField.findFirst({ where: { id: params.fieldId, storeId: session.user.storeId } });
    if (!current) throw new ApiError("NOT_FOUND", "Campo extraido nao encontrado.");
    const field = await prisma.documentExtractedField.update({
      where: { id: current.id },
      data: { value: input.value, reviewed: input.reviewed },
    });
    await emitInternalEvent({
      name: "ocr.field_reviewed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "document_extracted_field",
      entityId: field.id,
      payload: { ocrJobId: field.ocrJobId, fieldKey: field.fieldKey, reviewed: field.reviewed },
    });
    return { data: sanitizeExtractedField(field) };
  });
}
