import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/db.js";

const honeypotRoutes = [
  "/auth/check-user",
  "/auth/email-exists",
  "/auth/user-exists",
  "/auth/verify-user",
  "/users/exists",
];

async function recordProbe(input: {
  ip: string;
  method: string;
  path: string;
  userAgent?: string;
}) {
  await prisma.securityEvent.create({
    data: {
      type: "honeypot_user_enumeration_probe",
      severity: "high",
      metadata: {
        ip: input.ip,
        method: input.method,
        path: input.path,
        userAgent: input.userAgent,
      },
    },
  });
}

export async function registerSecurityHoneypotRoutes(app: FastifyInstance) {
  for (const path of honeypotRoutes) {
    app.route({
      method: ["GET", "POST"],
      url: path,
      handler: async (request, reply) => {
        await recordProbe({
          ip: request.ip,
          method: request.method,
          path,
          userAgent: request.headers["user-agent"]?.toString(),
        });

        return reply.code(404).send({
          error: {
            code: "NOT_FOUND",
            message: "Recurso nao encontrado.",
            correlationId: request.id,
          },
        });
      },
    });
  }
}
