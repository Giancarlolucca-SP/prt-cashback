import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "BUSINESS_RULE_ERROR"
  | "RATE_LIMITED"
  | "EXTERNAL_SERVICE_ERROR"
  | "JOB_ENQUEUED"
  | "INTERNAL_ERROR";

const statusByCode: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  BUSINESS_RULE_ERROR: 422,
  RATE_LIMITED: 429,
  EXTERNAL_SERVICE_ERROR: 502,
  JOB_ENQUEUED: 202,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  details?: unknown;
  statusCode: number;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.statusCode = statusByCode[code];
  }
}

export function apiErrorHandler(error: FastifyError | ApiError | ZodError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados invalidos.",
        details: error.flatten(),
        correlationId: request.id,
      },
    });
  }

  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        correlationId: request.id,
      },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return reply.code(409).send({
      error: {
        code: "CONFLICT",
        message: "Registro duplicado para uma restricao unica.",
        details: { target: error.meta?.target },
        correlationId: request.id,
      },
    });
  }

  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : null;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    const code = statusCode === 413 ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
    return reply.code(statusCode).send({
      error: {
        code,
        message: statusCode === 413 ? "Payload excede o tamanho maximo permitido." : error.message,
        correlationId: request.id,
      },
    });
  }

  request.log.error(error);
  return reply.code(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno inesperado.",
      correlationId: request.id,
    },
  });
}
