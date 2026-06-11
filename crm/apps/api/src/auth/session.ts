import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { prisma } from "../lib/db.js";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getSessionUser(request: FastifyRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });

  if (!session || session.revokedAt) {
    return null;
  }

  if (session.forceReauthAt && session.lastSeenAt < session.forceReauthAt) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { store: true },
  });

  if (!user || !user.isActive || user.deletedAt) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return { session, user };
}
