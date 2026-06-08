import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const automationStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);

const rulesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: automationStatusSchema.optional(),
  trigger: z.string().trim().max(120).optional(),
});

const ruleSchema = z.object({
  name: z.string().trim().min(2).max(160),
  trigger: z.string().trim().min(2).max(120),
  status: automationStatusSchema.default("DRAFT"),
  definition: z.record(z.unknown()),
});

const updateRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    trigger: z.string().trim().min(2).max(120).optional(),
    status: automationStatusSchema.optional(),
    definition: z.record(z.unknown()).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const ruleParamsSchema = z.object({ id: z.string().uuid() });

const statusSchema = z.object({
  status: automationStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const eventSchema = z.object({
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  status: z.string().trim().min(2).max(60).default("SUCCEEDED"),
  context: z.record(z.unknown()).optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().trim().max(1000).optional(),
});

const testSchema = z.object({
  input: z.record(z.unknown()),
});

type RuleRecord = {
  id: string;
  name: string;
  trigger: string;
  status: string;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeRule(rule: RuleRecord) {
  return {
    id: rule.id,
    name: rule.name,
    trigger: rule.trigger,
    status: rule.status,
    currentVersion: rule.currentVersion,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

async function getRuleOrThrow(storeId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!rule) throw new ApiError("NOT_FOUND", "Regra de automacao nao encontrada.");
  return rule;
}

export async function registerAutomationRoutes(app: FastifyInstance) {
  app.get("/rules", async (request) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const query = rulesQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.trigger ? { trigger: query.trigger } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.automationRule.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.automationRule.count({ where }),
    ]);
    return listResponse(items.map(sanitizeRule), query, total);
  });

  app.get("/rules/:id", async (request) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const params = ruleParamsSchema.parse(request.params);
    const rule = await getRuleOrThrow(session.user.storeId, params.id);
    const [versions, events, tests] = await Promise.all([
      prisma.automationRuleVersion.findMany({ where: { storeId: session.user.storeId, ruleId: rule.id }, orderBy: { version: "desc" } }),
      prisma.automationEvent.findMany({ where: { storeId: session.user.storeId, ruleId: rule.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.automationTest.findMany({ where: { storeId: session.user.storeId, ruleId: rule.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    return {
      data: sanitizeRule(rule),
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        definition: version.definition,
        createdAt: version.createdAt.toISOString(),
      })),
      events: events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      tests: tests.map((test) => ({
        ...test,
        createdAt: test.createdAt.toISOString(),
      })),
    };
  });

  app.post("/rules", async (request, reply) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const input = ruleSchema.parse(request.body);
    const rule = await prisma.$transaction(async (tx) => {
      const created = await tx.automationRule.create({
        data: {
          storeId: session.user.storeId,
          name: input.name,
          trigger: input.trigger,
          status: input.status,
          currentVersion: 1,
        },
      });
      await tx.automationRuleVersion.create({
        data: {
          storeId: session.user.storeId,
          ruleId: created.id,
          version: 1,
          definition: input.definition as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "automation",
          action: "automation_rule_created",
          entityType: "automation_rule",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { trigger: created.trigger, status: created.status, version: 1 },
        },
      });
      return created;
    });
    return reply.code(201).send({ data: sanitizeRule(rule) });
  });

  app.patch("/rules/:id", async (request) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const params = ruleParamsSchema.parse(request.params);
    const input = updateRuleSchema.parse(request.body);
    const current = await getRuleOrThrow(session.user.storeId, params.id);
    const nextVersion = input.definition ? current.currentVersion + 1 : current.currentVersion;

    const rule = await prisma.$transaction(async (tx) => {
      const updated = await tx.automationRule.update({
        where: { id: current.id },
        data: {
          name: input.name,
          trigger: input.trigger,
          status: input.status,
          currentVersion: nextVersion,
        },
      });
      if (input.definition) {
        await tx.automationRuleVersion.create({
          data: {
            storeId: session.user.storeId,
            ruleId: current.id,
            version: nextVersion,
            definition: input.definition as Prisma.InputJsonObject,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "automation",
          action: "automation_rule_updated",
          entityType: "automation_rule",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input), version: updated.currentVersion },
        },
      });
      return updated;
    });
    return { data: sanitizeRule(rule) };
  });

  app.post("/rules/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const params = ruleParamsSchema.parse(request.params);
    const input = statusSchema.parse(request.body);
    const current = await getRuleOrThrow(session.user.storeId, params.id);
    const rule = await prisma.automationRule.update({
      where: { id: current.id },
      data: { status: input.status, deletedAt: input.status === "ARCHIVED" ? new Date() : null },
    });
    await emitInternalEvent({
      name: "automation.triggered",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "automation_rule",
      entityId: rule.id,
      payload: { action: "status_changed", fromStatus: current.status, toStatus: rule.status, reason: input.reason },
    });
    return { data: sanitizeRule(rule) };
  });

  app.post("/rules/:id/events", async (request, reply) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const params = ruleParamsSchema.parse(request.params);
    const input = eventSchema.parse(request.body);
    const rule = await getRuleOrThrow(session.user.storeId, params.id);
    const event = await prisma.automationEvent.create({
      data: {
        storeId: session.user.storeId,
        ruleId: rule.id,
        ruleVersion: rule.currentVersion,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        context: input.context as Prisma.InputJsonObject | undefined,
        result: input.result as Prisma.InputJsonObject | undefined,
        error: input.error,
      },
    });
    await emitInternalEvent({
      name: "automation.triggered",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "automation_event",
      entityId: event.id,
      payload: { ruleId: rule.id, ruleVersion: rule.currentVersion, status: event.status },
    });
    return reply.code(201).send({ data: { ...event, createdAt: event.createdAt.toISOString() } });
  });

  app.post("/rules/:id/tests", async (request, reply) => {
    const session = await requirePermission(request, { module: "automation", action: "manage", scope: "ALL", sensitiveArea: "technical" });
    const params = ruleParamsSchema.parse(request.params);
    const input = testSchema.parse(request.body);
    const rule = await getRuleOrThrow(session.user.storeId, params.id);
    const version = await prisma.automationRuleVersion.findFirst({
      where: { storeId: session.user.storeId, ruleId: rule.id, version: rule.currentVersion },
    });
    const output = {
      matched: true,
      ruleId: rule.id,
      version: rule.currentVersion,
      trigger: rule.trigger,
      definition: version?.definition ?? null,
    };
    const test = await prisma.automationTest.create({
      data: {
        storeId: session.user.storeId,
        ruleId: rule.id,
        input: input.input as Prisma.InputJsonObject,
        output: output as Prisma.InputJsonObject,
        status: "PASSED",
      },
    });
    return reply.code(201).send({ data: { ...test, createdAt: test.createdAt.toISOString() } });
  });
}
