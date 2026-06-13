import type { Prisma, Store, User } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canUser, listUserPermissions } from "../auth/rbac.js";
import { createSessionToken, getBearerToken, getSessionUser, hashSessionToken } from "../auth/session.js";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../auth/password.js";
import { prisma } from "../lib/db.js";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$FW25cqdLasf0lCKIBzAsuA$kkuS7PdRLsh6EKZpqnZhC0SXj5hKJxDXNn7QKn2VPyc";

const loginSchema = z.object({
  email: z.string().email().max(180).transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1).max(120),
});

const permissionCheckSchema = z.object({
  module: z.string().min(1).max(80),
  action: z.string().min(1).max(80),
  scope: z
    .enum(["ALL", "OWN_PORTFOLIO", "OWN_LEAD", "OWN_SALE", "LINKED_VEHICLE", "STORE", "NONE"])
    .optional(),
  sensitiveArea: z.string().min(1).max(80).nullable().optional(),
});

const preferenceKeySchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9._:-]+$/i),
});

const userPreferenceSchema = z.object({
  value: z.record(z.unknown()),
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
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
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
      await verifyPassword(password, user.passwordHash);
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
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
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
    const passwordHash = passwordNeedsRehash(user.passwordHash) ? await hashPassword(password) : user.passwordHash;
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
      data: { lastLoginAt: new Date(), passwordHash },
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

  app.get("/preferences", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const preferences = await prisma.userPreference.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });

    return {
      items: preferences.map((preference) => ({
        key: preference.key,
        value: preference.value,
        updatedAt: preference.updatedAt,
      })),
      page: 1,
      pageSize: preferences.length,
      total: preferences.length,
    };
  });

  app.get("/preferences/:key", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const parsedParams = preferenceKeySchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const preference = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: parsedParams.data.key,
        },
      },
    });

    return {
      data: {
        key: parsedParams.data.key,
        value: preference?.value ?? null,
        updatedAt: preference?.updatedAt ?? null,
      },
    };
  });

  app.put("/preferences/:key", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const parsedParams = preferenceKeySchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const parsedBody = userPreferenceSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const preferenceValue = parsedBody.data.value as Prisma.InputJsonObject;
    const preference = await prisma.userPreference.upsert({
      where: {
        userId_key: {
          userId: session.user.id,
          key: parsedParams.data.key,
        },
      },
      create: {
        userId: session.user.id,
        key: parsedParams.data.key,
        value: preferenceValue,
      },
      update: {
        value: preferenceValue,
      },
    });

    await auditAuthEvent({
      storeId: session.user.storeId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "preference_updated",
      entityType: "user_preference",
      entityId: preference.id,
      metadata: { key: preference.key },
    });

    return {
      data: {
        key: preference.key,
        value: preference.value,
        updatedAt: preference.updatedAt,
      },
    };
  });

  app.delete("/preferences/:key", async (request, reply) => {
    const session = await getSessionUser(request);
    if (!session) {
      return reply.code(401).send({ error: "unauthenticated" });
    }

    const parsedParams = preferenceKeySchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const preference = await prisma.userPreference.findUnique({
      where: {
        userId_key: {
          userId: session.user.id,
          key: parsedParams.data.key,
        },
      },
    });

    if (!preference) {
      return { ok: true };
    }

    await prisma.userPreference.delete({ where: { id: preference.id } });
    await auditAuthEvent({
      storeId: session.user.storeId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "preference_deleted",
      entityType: "user_preference",
      entityId: preference.id,
      metadata: { key: preference.key },
    });

    return { ok: true };
  });
}
