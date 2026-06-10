import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { hashPassword } from "../auth/password.js";
import { listUserPermissions } from "../auth/rbac.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const userRoleSchema = z.enum(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE", "SELLER", "SDR", "APPRAISER", "SERVICE_MANAGER"]);
const permissionScopeSchema = z.enum(["ALL", "OWN_PORTFOLIO", "OWN_LEAD", "OWN_SALE", "LINKED_VEHICLE", "STORE", "NONE"]);
const permissionEffectSchema = z.enum(["ALLOW", "DENY"]);

const usersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  role: userRoleSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  role: userRoleSchema,
  password: z.string().min(8).max(120),
  mustChangePassword: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const userParamsSchema = z.object({ id: z.string().uuid() });

const permissionOverrideSchema = z.object({
  module: z.string().trim().min(2).max(80),
  action: z.string().trim().min(2).max(80),
  scope: permissionScopeSchema,
  sensitiveArea: z.string().trim().max(80).nullable().optional(),
  effect: permissionEffectSchema,
});

const permissionScopePayloadSchema = z.object({
  module: z.string().trim().min(2).max(80),
  entityType: z.string().trim().max(80).optional(),
  entityId: z.string().uuid().optional(),
  scope: permissionScopeSchema,
});

const transferSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  entityType: z.string().trim().min(2).max(80),
  entityId: z.string().uuid().optional(),
  reason: z.string().trim().max(300).optional(),
});

type UserRecord = {
  id: string;
  storeId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeUser(user: UserRecord) {
  return {
    id: user.id,
    storeId: user.storeId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function getUserOrThrow(storeId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!user) throw new ApiError("NOT_FOUND", "Usuario nao encontrado.");
  return user;
}

async function getPermissionOrThrow(input: z.infer<typeof permissionOverrideSchema>) {
  const permission = await prisma.permission.findFirst({
    where: {
      module: input.module,
      action: input.action,
      scope: input.scope,
      sensitiveArea: input.sensitiveArea ?? null,
      status: "ACTIVE",
    },
  });
  if (!permission) throw new ApiError("NOT_FOUND", "Permissao nao encontrada.");
  return permission;
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const query = usersQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.is_active === undefined ? {} : { isActive: query.is_active }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.user.count({ where }),
    ]);
    return listResponse(items.map(sanitizeUser), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const params = userParamsSchema.parse(request.params);
    const user = await getUserOrThrow(session.user.storeId, params.id);
    const [effectivePermissions, overrides, scopes, transfersFrom, transfersTo] = await Promise.all([
      listUserPermissions(user),
      prisma.userPermission.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.permissionScope.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      prisma.userResponsibilityTransfer.findMany({ where: { storeId: session.user.storeId, fromUserId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.userResponsibilityTransfer.findMany({ where: { storeId: session.user.storeId, toUserId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    const permissions = await prisma.permission.findMany({
      where: { id: { in: overrides.map((override) => override.permissionId) } },
    });
    const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));
    return {
      data: sanitizeUser(user),
      effectivePermissions,
      overrides: overrides.map((override) => ({
        id: override.id,
        effect: override.effect,
        permission: permissionById.get(override.permissionId) ?? null,
        createdAt: override.createdAt.toISOString(),
      })),
      scopes,
      transfersFrom,
      transfersTo,
    };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const input = createUserSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw new ApiError("CONFLICT", "Ja existe usuario com este e-mail.");
    const passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          storeId: session.user.storeId,
          name: input.name,
          email: input.email,
          role: input.role,
          passwordHash,
          isActive: input.isActive,
          mustChangePassword: input.mustChangePassword,
        },
      });
      await tx.permissionScope.create({ data: { userId: created.id, module: "store", scope: "STORE" } });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "users",
          action: "user_created",
          entityType: "user",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { email: created.email, role: created.role },
        },
      });
      return created;
    });

    await emitInternalEvent({
      name: "permission.changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "user",
      entityId: user.id,
      payload: { action: "user_created", role: user.role },
    });
    return reply.code(201).send({ data: sanitizeUser(user) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const params = userParamsSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const current = await getUserOrThrow(session.user.storeId, params.id);
    const user = await prisma.user.update({ where: { id: current.id }, data: input });
    await emitInternalEvent({
      name: "permission.changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "user",
      entityId: user.id,
      payload: { action: "user_updated", changedFields: Object.keys(input) },
    });
    return { data: sanitizeUser(user) };
  });

  app.post("/:id/permissions", async (request, reply) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const params = userParamsSchema.parse(request.params);
    const input = permissionOverrideSchema.parse(request.body);
    const user = await getUserOrThrow(session.user.storeId, params.id);
    const permission = await getPermissionOrThrow(input);
    const override = await prisma.userPermission.upsert({
      where: { userId_permissionId_effect: { userId: user.id, permissionId: permission.id, effect: input.effect } },
      update: {},
      create: { userId: user.id, permissionId: permission.id, effect: input.effect },
    });
    await emitInternalEvent({
      name: "permission.changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "user_permission",
      entityId: override.id,
      payload: { userId: user.id, permissionId: permission.id, effect: override.effect },
    });
    return reply.code(201).send({ data: { id: override.id, userId: user.id, effect: override.effect } });
  });

  app.post("/:id/scopes", async (request, reply) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const params = userParamsSchema.parse(request.params);
    const input = permissionScopePayloadSchema.parse(request.body);
    const user = await getUserOrThrow(session.user.storeId, params.id);
    const scope = await prisma.permissionScope.create({
      data: { userId: user.id, module: input.module, entityType: input.entityType, entityId: input.entityId, scope: input.scope },
    });
    await emitInternalEvent({
      name: "permission.changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "permission_scope",
      entityId: scope.id,
      payload: { userId: user.id, module: scope.module, scope: scope.scope },
    });
    return reply.code(201).send({ data: scope });
  });

  app.post("/responsibility-transfers", async (request, reply) => {
    const session = await requirePermission(request, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" });
    const input = transferSchema.parse(request.body);
    const [fromUser, toUser] = await Promise.all([
      getUserOrThrow(session.user.storeId, input.fromUserId),
      getUserOrThrow(session.user.storeId, input.toUserId),
    ]);
    const transfer = await prisma.userResponsibilityTransfer.create({
      data: {
        storeId: session.user.storeId,
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason,
        transferredBy: session.user.id,
      },
    });
    await emitInternalEvent({
      name: "permission.changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "user_responsibility_transfer",
      entityId: transfer.id,
      payload: { fromUserId: fromUser.id, toUserId: toUser.id, entityType: transfer.entityType, entityId: transfer.entityId },
    });
    return reply.code(201).send({ data: transfer });
  });
}
