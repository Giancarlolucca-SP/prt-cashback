import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { enqueueJob, serializeJob } from "../jobs/job-service.js";
import { prisma } from "../lib/db.js";

const webhookParamsSchema = z.object({
  provider: z.string().trim().min(2).max(80),
});

const webhookBodySchema = z.record(z.unknown());

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post("/:provider", async (request, reply) => {
    const params = webhookParamsSchema.parse(request.params);
    const payload = webhookBodySchema.parse(request.body ?? {});
    const idempotencyKey =
      request.headers["x-idempotency-key"]?.toString() ||
      request.headers["x-webhook-id"]?.toString() ||
      (typeof payload.id === "string" ? payload.id : undefined);

    if (!idempotencyKey) {
      throw new ApiError("VALIDATION_ERROR", "Webhook sem chave de idempotencia.");
    }

    const expectedSecret = process.env.WEBHOOK_SHARED_SECRET;
    const receivedSecret = request.headers["x-webhook-secret"]?.toString();

    if (expectedSecret && receivedSecret !== expectedSecret) {
      await prisma.securityEvent.create({
        data: {
          type: "webhook_denied",
          severity: "high",
          metadata: {
            provider: params.provider,
            reason: "invalid_secret",
          },
        },
      });
      throw new ApiError("FORBIDDEN", "Origem de webhook nao autorizada.");
    }

    const { job, created } = await enqueueJob({
      storeId: null,
      jobType: `webhook.${params.provider}`,
      entityType: "webhook",
      entityId: null,
      idempotencyKey: `webhook:${params.provider}:${idempotencyKey}`,
      payload: {
        provider: params.provider,
        headers: {
          idempotencyKey,
          userAgent: request.headers["user-agent"]?.toString(),
        },
        payload: payload as Prisma.InputJsonObject,
      } satisfies Prisma.InputJsonObject,
      maxAttempts: 3,
    });

    await prisma.technicalEvent.create({
      data: {
        level: "info",
        source: "webhook",
        message: created ? "webhook.received" : "webhook.duplicate_ignored",
        metadata: {
          provider: params.provider,
          idempotencyKey,
          jobId: job.id,
        },
      },
    });

    return reply.code(created ? 202 : 200).send({
      data: serializeJob(job),
      idempotentHit: !created,
    });
  });
}
