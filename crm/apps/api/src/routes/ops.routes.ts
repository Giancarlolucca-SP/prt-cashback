import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePermission } from "../api/auth-guards.js";
import { paginationQuerySchema } from "../api/pagination.js";
import { prisma } from "../lib/db.js";

const backupStatusSchema = z.object({
  environment: z.enum(["development", "staging", "homologacao", "production"]),
  target: z.enum(["postgresql", "storage", "configuration", "full"]),
  status: z.enum(["STARTED", "SUCCEEDED", "FAILED", "RESTORED", "SKIPPED"]),
  details: z.record(z.unknown()).optional(),
});

const opsPermission = {
  module: "automation",
  action: "manage",
  scope: "ALL" as const,
  sensitiveArea: "technical",
};

async function buildJobStats() {
  const grouped = await prisma.backgroundJob.groupBy({
    by: ["status"],
    _count: {
      _all: true,
    },
  });

  return grouped.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

async function buildAlerts() {
  const failedJobs = await prisma.backgroundJob.count({
    where: {
      status: "FAILED",
      updatedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });
  const stuckJobs = await prisma.backgroundJob.count({
    where: {
      status: "RUNNING",
      startedAt: {
        lt: new Date(Date.now() - 15 * 60 * 1000),
      },
    },
  });
  const failedBackups = await prisma.backupStatusLog.count({
    where: {
      status: "FAILED",
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  return [
    failedJobs > 0
      ? {
          severity: "warning",
          code: "JOBS_FAILED_LAST_24H",
          message: `${failedJobs} job(s) falharam nas ultimas 24h.`,
        }
      : null,
    stuckJobs > 0
      ? {
          severity: "critical",
          code: "JOBS_STUCK_RUNNING",
          message: `${stuckJobs} job(s) estao rodando ha mais de 15 minutos.`,
        }
      : null,
    failedBackups > 0
      ? {
          severity: "critical",
          code: "BACKUP_FAILED_LAST_7D",
          message: `${failedBackups} registro(s) de backup falho nos ultimos 7 dias.`,
        }
      : null,
  ].filter(Boolean);
}

export async function registerOpsRoutes(app: FastifyInstance) {
  app.get("/summary", async (request) => {
    await requirePermission(request, opsPermission);
    const [jobStats, recentFailedJobs, recentBackupLogs, alerts] = await Promise.all([
      buildJobStats(),
      prisma.backgroundJob.findMany({
        where: {
          status: "FAILED",
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          jobType: true,
          entityType: true,
          entityId: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          updatedAt: true,
        },
      }),
      prisma.backupStatusLog.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      }),
      buildAlerts(),
    ]);

    return {
      environment: process.env.APP_ENV || "development",
      nodeEnv: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        provider: "postgresql",
      },
      storage: {
        provider: process.env.SUPABASE_URL ? "supabase" : "dev-adapter",
        configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      jobs: {
        byStatus: jobStats,
        recentFailed: recentFailedJobs,
      },
      backups: {
        recent: recentBackupLogs,
      },
      alerts,
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/backup-status", async (request) => {
    await requirePermission(request, opsPermission);
    const query = paginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.page_size;
    const [items, total] = await Promise.all([
      prisma.backupStatusLog.findMany({
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: query.page_size,
      }),
      prisma.backupStatusLog.count(),
    ]);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.page_size,
    };
  });

  app.post("/backup-status", async (request, reply) => {
    const session = await requirePermission(request, opsPermission);
    const payload = backupStatusSchema.parse(request.body);
    const log = await prisma.backupStatusLog.create({
      data: {
        environment: payload.environment,
        target: payload.target,
        status: payload.status,
        details: payload.details ? (payload.details as Prisma.InputJsonValue) : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "ops",
        action: "backup_status_registered",
        entityType: "backup_status_log",
        entityId: log.id,
        result: "SUCCESS",
        metadata: payload as Prisma.InputJsonValue,
      },
    });

    return reply.code(201).send({ data: log });
  });
}
