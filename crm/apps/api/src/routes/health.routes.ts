import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Database unavailable",
    };
  }
}

async function checkJobs() {
  const stuckSince = new Date(Date.now() - 15 * 60 * 1000);
  const [failedLastDay, stuckRunning] = await Promise.all([
    prisma.backgroundJob.count({
      where: {
        status: "FAILED",
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.backgroundJob.count({
      where: {
        status: "RUNNING",
        startedAt: {
          lt: stuckSince,
        },
      },
    }),
  ]);

  return {
    status: failedLastDay > 0 || stuckRunning > 0 ? "attention" : "ok",
    failedLastDay,
    stuckRunning,
  };
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/", async () => ({
    status: "ok",
    service: "crm-api",
    timestamp: new Date().toISOString()
  }));

  app.get("/ready", async (_request, reply) => {
    const database = await checkDatabase();
    const jobs = database.status === "ok" ? await checkJobs() : { status: "not_checked" };
    const storageConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const ready = database.status === "ok";

    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      service: "crm-api",
      environment: process.env.APP_ENV || "development",
      checks: {
        api: { status: "ok" },
        database,
        storage: {
          status: storageConfigured ? "configured" : "dev_adapter_or_not_configured",
        },
        jobs,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
