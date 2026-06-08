import type { PermissionEffect, PermissionScopeType, User } from "@prisma/client";
import { prisma } from "../lib/db.js";

export type PermissionInput = {
  module: string;
  action: string;
  scope?: PermissionScopeType;
  sensitiveArea?: string | null;
};

export type PermissionDecision = {
  allowed: boolean;
  reason: "allowed" | "permission_not_found" | "role_missing" | "denied_by_user_override" | "not_granted";
};

function normalizeSensitiveArea(value: string | null | undefined) {
  return value ?? null;
}

export async function canUser(user: User, input: PermissionInput): Promise<PermissionDecision> {
  const permission = await prisma.permission.findFirst({
    where: {
      module: input.module,
      action: input.action,
      scope: input.scope,
      sensitiveArea: normalizeSensitiveArea(input.sensitiveArea),
      status: "ACTIVE",
    },
  });

  if (!permission) {
    return { allowed: false, reason: "permission_not_found" };
  }

  const userOverride = await prisma.userPermission.findFirst({
    where: {
      userId: user.id,
      permissionId: permission.id,
    },
    orderBy: { createdAt: "desc" },
  });

  const denyEffect: PermissionEffect = "DENY";
  const allowEffect: PermissionEffect = "ALLOW";

  if (userOverride?.effect === denyEffect) {
    return { allowed: false, reason: "denied_by_user_override" };
  }

  if (userOverride?.effect === allowEffect) {
    return { allowed: true, reason: "allowed" };
  }

  const role = await prisma.role.findFirst({
    where: {
      storeId: user.storeId,
      code: user.role,
      status: "ACTIVE",
    },
  });

  if (!role) {
    return { allowed: false, reason: "role_missing" };
  }

  const rolePermission = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id,
      },
    },
  });

  return rolePermission
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "not_granted" };
}

export async function listUserPermissions(user: User) {
  const role = await prisma.role.findFirst({
    where: {
      storeId: user.storeId,
      code: user.role,
      status: "ACTIVE",
    },
  });

  if (!role) {
    return [];
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    orderBy: { createdAt: "asc" },
  });

  const deniedOverrides = await prisma.userPermission.findMany({
    where: { userId: user.id, effect: "DENY" },
    select: { permissionId: true },
  });
  const deniedPermissionIds = new Set(deniedOverrides.map((permission) => permission.permissionId));

  const permissions = await prisma.permission.findMany({
    where: {
      id: {
        in: rolePermissions.map((rolePermission) => rolePermission.permissionId),
      },
      status: "ACTIVE",
    },
  });

  return permissions
    .filter((permission) => !deniedPermissionIds.has(permission.id))
    .map((permission) => ({
      module: permission.module,
      action: permission.action,
      scope: permission.scope,
      sensitiveArea: permission.sensitiveArea,
    }));
}
