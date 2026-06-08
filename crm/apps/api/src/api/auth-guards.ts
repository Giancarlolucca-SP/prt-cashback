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
