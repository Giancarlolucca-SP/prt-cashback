import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const queryStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "NEEDS_HUMAN", "CANCELLED"]);

const aiQueryListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  purpose: z.string().trim().max(120).optional(),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
});

const aiQueryLogSchema = z.object({
  purpose: z.string().trim().min(2).max(120),
  model: z.string().trim().max(120).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  costCents: z.number().int().nonnegative().optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
});

const suggestionsQuerySchema = aiQueryListSchema.extend({
  status: queryStatusSchema.optional(),
});

const suggestionSchema = z.object({
  purpose: z.string().trim().min(2).max(120),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  content: z.record(z.unknown()),
  status: queryStatusSchema.default("PENDING"),
});

const suggestionParamsSchema = z.object({ id: z.string().uuid() });

const suggestionStatusSchema = z.object({
  status: queryStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const feedbackSchema = z.object({
  feedback: z.string().trim().min(2).max(80),
  metadata: z.record(z.unknown()).optional(),
});

function sanitizeQueryLog(log: {
  id: string;
  storeId: string | null;
  userId: string | null;
  purpose: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costCents: number | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
}) {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  };
}

function sanitizeSuggestion(suggestion: {
  id: string;
  storeId: string | null;
  userId: string | null;
  purpose: string;
  entityType: string | null;
  entityId: string | null;
  content: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...suggestion,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}

async function ensureEntity(storeId: string, entityType?: string, entityId?: string) {
  if (!entityType || !entityId) return;

  if (entityType === "customer") {
    const customer = await prisma.customer.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!customer) throw new ApiError("NOT_FOUND", "Cliente vinculado a IA nao encontrado.");
    return;
  }

  if (entityType === "lead") {
    const lead = await prisma.lead.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!lead) throw new ApiError("NOT_FOUND", "Lead vinculado a IA nao encontrado.");
    return;
  }

  if (entityType === "vehicle") {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!vehicle) throw new ApiError("NOT_FOUND", "Veiculo vinculado a IA nao encontrado.");
    return;
  }

  if (entityType === "sale") {
    const sale = await prisma.sale.findFirst({ where: { id: entityId, storeId, deletedAt: null }, select: { id: true } });
    if (!sale) throw new ApiError("NOT_FOUND", "Venda vinculada a IA nao encontrada.");
  }
}

async function getSuggestionOrThrow(storeId: string, id: string) {
  const suggestion = await prisma.aiSuggestion.findFirst({ where: { id, storeId } });
  if (!suggestion) throw new ApiError("NOT_FOUND", "Sugestao de IA nao encontrada.");
  return suggestion;
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.get("/query-logs", async (request) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const query = aiQueryListSchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.aiQueryLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.aiQueryLog.count({ where }),
    ]);
    return listResponse(items.map(sanitizeQueryLog), query, total);
  });

  app.post("/query-logs", async (request, reply) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const input = aiQueryLogSchema.parse(request.body);
    await ensureEntity(session.user.storeId, input.entityType, input.entityId);
    const log = await prisma.aiQueryLog.create({
      data: {
        storeId: session.user.storeId,
        userId: session.user.id,
        purpose: input.purpose,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costCents: input.costCents,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    await emitInternalEvent({
      name: "ai.query_logged",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "ai_query_log",
      entityId: log.id,
      payload: { purpose: log.purpose, model: log.model, entityType: log.entityType, entityId: log.entityId },
    });
    return reply.code(201).send({ data: sanitizeQueryLog(log) });
  });

  app.get("/suggestions", async (request) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const query = suggestionsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.aiSuggestion.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.aiSuggestion.count({ where }),
    ]);
    return listResponse(items.map(sanitizeSuggestion), query, total);
  });

  app.get("/suggestions/:id", async (request) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const params = suggestionParamsSchema.parse(request.params);
    const suggestion = await getSuggestionOrThrow(session.user.storeId, params.id);
    const feedback = await prisma.aiSuggestionFeedback.findMany({
      where: { storeId: session.user.storeId, suggestionId: suggestion.id },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: sanitizeSuggestion(suggestion),
      feedback: feedback.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    };
  });

  app.post("/suggestions", async (request, reply) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const input = suggestionSchema.parse(request.body);
    await ensureEntity(session.user.storeId, input.entityType, input.entityId);
    const suggestion = await prisma.aiSuggestion.create({
      data: {
        storeId: session.user.storeId,
        userId: session.user.id,
        purpose: input.purpose,
        entityType: input.entityType,
        entityId: input.entityId,
        content: input.content as Prisma.InputJsonObject,
        status: input.status,
      },
    });
    await emitInternalEvent({
      name: "ai.suggestion_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "ai_suggestion",
      entityId: suggestion.id,
      payload: { purpose: suggestion.purpose, status: suggestion.status, entityType: suggestion.entityType, entityId: suggestion.entityId },
    });
    return reply.code(201).send({ data: sanitizeSuggestion(suggestion) });
  });

  app.post("/suggestions/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const params = suggestionParamsSchema.parse(request.params);
    const input = suggestionStatusSchema.parse(request.body);
    const current = await getSuggestionOrThrow(session.user.storeId, params.id);
    const suggestion = await prisma.aiSuggestion.update({ where: { id: current.id }, data: { status: input.status } });
    await emitInternalEvent({
      name: "ai.suggestion_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "ai_suggestion",
      entityId: suggestion.id,
      payload: { fromStatus: current.status, toStatus: suggestion.status, reason: input.reason },
    });
    return { data: sanitizeSuggestion(suggestion) };
  });

  app.post("/suggestions/:id/feedback", async (request, reply) => {
    const session = await requirePermission(request, { module: "ai", action: "use", scope: "STORE", sensitiveArea: "general" });
    const params = suggestionParamsSchema.parse(request.params);
    const input = feedbackSchema.parse(request.body);
    const suggestion = await getSuggestionOrThrow(session.user.storeId, params.id);
    const feedback = await prisma.aiSuggestionFeedback.create({
      data: {
        storeId: session.user.storeId,
        suggestionId: suggestion.id,
        userId: session.user.id,
        feedback: input.feedback,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });
    await emitInternalEvent({
      name: "ai.feedback_recorded",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "ai_suggestion_feedback",
      entityId: feedback.id,
      payload: { suggestionId: suggestion.id, feedback: feedback.feedback },
    });
    return reply.code(201).send({ data: { ...feedback, createdAt: feedback.createdAt.toISOString() } });
  });
}
