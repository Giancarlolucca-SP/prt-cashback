import type { Prisma, Store, User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canUser, listUserPermissions } from "../auth/rbac.js";
import { createSessionToken, getBearerToken, getSessionUser, hashSessionToken } from "../auth/session.js";
import { verifyPassword } from "../auth/password.js";
import { prisma } from "../lib/db.js";

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1),
});

const permissionCheckSchema = z.object({
  module: z.string().min(1),
  action: z.string().min(1),
  scope: z
    .enum(["ALL", "OWN_PORTFOLIO", "OWN_LEAD", "OWN_SALE", "LINKED_VEHICLE", "STORE", "NONE"])
    .optional(),
  sensitiveArea: z.string().min(1).nullable().optional(),
});

function publicUser(user: User & { store: Store }) {
  return {
    id: user.id,
    storeId: user.storeId,
    storeName: user.store.name,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

async function auditAuthEvent(input: {
  storeId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  result?: "SUCCESS" | "DENIED" | "FAILED";
  metadata?: Prisma.InputJsonObject;
}) {
  await prisma.auditLog.create({
    data: {
      storeId: input.storeId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      module: "auth",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      result: input.result ?? "SUCCESS",
      metadata: input.metadata,
    },
  });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { store: true },
    });

    if (!user) {
      await auditAuthEvent({
        action: "login_failed",
        entityType: "user",
        entityId: email,
        result: "FAILED",
        metadata: { reason: "user_not_found" },
      });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    if (!user.isActive || user.deletedAt) {
      await auditAuthEvent({
        storeId: user.storeId,
        actorId: user.id,
        actorRole: user.role,
        action: "login_denied",
        entityType: "user",
        entityId: user.id,
        result: "DENIED",
        metadata: { reason: "inactive_user" },
      });
      return reply.code(403).send({ error: "inactive_user" });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      await auditAuthEvent({
        storeId: user.storeId,
        actorId: user.id,
        actorRole: user.role,
        action: "login_failed",
        entityType: "user",
        entityId: user.id,
        result: "FAILED",
        metadata: { reason: "wrong_password" },
      });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const token = createSessionToken();
    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await auditAuthEvent({
      storeId: user.storeId,
      actorId: user.id,
      actorRole: user.role,
      action: "login_success",
      entityType: "user",
      entityId: user.id,
    });

    return {
      token,
      user: publicUser(user),
    };
  });

  app.post("/logout", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    await prisma.userSession.update({
      where: { id: session.session.id },
      data: { revokedAt: new Date() },
    });
    await auditAuthEvent({
      storeId: session.user.storeId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "logout",
      entityType: "user_session",
      entityId: session.session.id,
    });

    return { ok: true };
  });

  app.get("/me", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    return {
      user: publicUser(session.user),
      permissions: await listUserPermissions(session.user),
    };
  });

  app.post("/permissions/check", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const parsed = permissionCheckSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const decision = await canUser(session.user, parsed.data);
    if (!decision.allowed) {
      await auditAuthEvent({
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "permission_denied",
        entityType: "permission",
        entityId: `${parsed.data.module}:${parsed.data.action}`,
        result: "DENIED",
        metadata: {
          reason: decision.reason,
          permission: parsed.data,
        },
      });
      return reply.code(403).send({ allowed: false, reason: decision.reason });
    }

    return { allowed: true };
  });
}
