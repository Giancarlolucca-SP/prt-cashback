import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { prisma } from "../lib/db.js";

const auditResultSchema = z.enum(["SUCCESS", "DENIED", "FAILED"]);

const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  module: z.string().trim().max(80).optional(),
  action: z.string().trim().max(120).optional(),
  actor_id: z.string().uuid().optional(),
  entity_type: z.string().trim().max(80).optional(),
  entity_id: z.string().uuid().optional(),
  result: auditResultSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const technicalQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  level: z.string().trim().max(40).optional(),
  source: z.string().trim().max(80).optional(),
  message: z.string().trim().max(160).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const securityQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  user_id: z.string().uuid().optional(),
  type: z.string().trim().max(80).optional(),
  severity: z.string().trim().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function createdAtWhere(from?: Date, to?: Date) {
  return from || to
    ? {
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      }
    : {};
}

function sanitizeDateFields<T extends { createdAt: Date }>(record: T) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
  };
}

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get("/logs", async (request) => {
    const session = await requirePermission(request, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" });
    const query = auditQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.actor_id ? { actorId: query.actor_id } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      ...(query.result ? { result: query.result } : {}),
      ...createdAtWhere(query.from, query.to),
    };
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);
    return listResponse(items.map(sanitizeDateFields), query, total);
  });

  app.get("/technical-events", async (request) => {
    const session = await requirePermission(request, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" });
    const query = technicalQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.level ? { level: query.level } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.message ? { message: { contains: query.message, mode: "insensitive" as const } } : {}),
      ...createdAtWhere(query.from, query.to),
    };
    const [items, total] = await Promise.all([
      prisma.technicalEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.technicalEvent.count({ where }),
    ]);
    return listResponse(items.map(sanitizeDateFields), query, total);
  });

  app.get("/security-events", async (request) => {
    const session = await requirePermission(request, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" });
    const query = securityQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.user_id ? { userId: query.user_id } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...createdAtWhere(query.from, query.to),
    };
    const [items, total] = await Promise.all([
      prisma.securityEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.securityEvent.count({ where }),
    ]);
    return listResponse(items.map(sanitizeDateFields), query, total);
  });

  app.get("/summary", async (request) => {
    const session = await requirePermission(request, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" });
    const [auditByResult, technicalByLevel, securityBySeverity] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["result"], where: { storeId: session.user.storeId }, _count: { _all: true } }),
      prisma.technicalEvent.groupBy({ by: ["level"], where: { storeId: session.user.storeId }, _count: { _all: true } }),
      prisma.securityEvent.groupBy({ by: ["severity"], where: { storeId: session.user.storeId }, _count: { _all: true } }),
    ]);
    const toMap = (rows: Array<Record<string, unknown> & { _count: { _all: number } }>, key: string) =>
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[String(row[key])] = row._count._all;
        return acc;
      }, {});
    return {
      auditByResult: toMap(auditByResult, "result"),
      technicalByLevel: toMap(technicalByLevel, "level"),
      securityBySeverity: toMap(securityBySeverity, "severity"),
    };
  });
}
