import type { FastifyRequest } from "fastify";
import type { PermissionScopeType } from "@prisma/client";
import { getSessionUser } from "../auth/session.js";
import { canUser } from "../auth/rbac.js";
import { ApiError } from "./errors.js";
import { prisma } from "../lib/db.js";

export type AuthenticatedContext = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export type RoutePermission = {
  module: string;
  action: string;
  scope?: PermissionScopeType;
  sensitiveArea?: string | null;
};

export async function requireAuth(request: FastifyRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    throw new ApiError("UNAUTHENTICATED", "Usuario nao autenticado.");
  }

  return session;
}

export async function requirePermission(request: FastifyRequest, permission: RoutePermission) {
  const session = await requireAuth(request);
  const decision = await canUser(session.user, permission);

  if (!decision.allowed) {
    await prisma.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: permission.module,
        action: "api_forbidden",
        entityType: "permission",
        entityId: `${permission.module}:${permission.action}`,
        result: "DENIED",
        metadata: {
          reason: decision.reason,
          permission,
          path: request.url,
          method: request.method,
        },
      },
    });
    throw new ApiError("FORBIDDEN", "Usuario sem permissao para esta acao.", { reason: decision.reason });
  }

  return session;
}

export async function denyOwnershipAccess(input: {
  action: string;
  entityId: string;
  entityType: string;
  message: string;
  module: string;
  request: FastifyRequest;
  session: AuthenticatedContext;
}): Promise<never> {
  await prisma.auditLog.create({
    data: {
      storeId: input.session.user.storeId,
      actorId: input.session.user.id,
      actorRole: input.session.user.role,
      module: input.module,
      action: "ownership_not_found",
      entityType: input.entityType,
      entityId: input.entityId,
      result: "DENIED",
      metadata: {
        attemptedAction: input.action,
        method: input.request.method,
        path: input.request.url,
      },
    },
  });

  throw new ApiError("NOT_FOUND", input.message);
}
