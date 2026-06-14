import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function resolvePrismaLogLevels(): Prisma.LogLevel[] {
  if (process.env.PRISMA_LOG_LEVEL === "silent") {
    return [];
  }

  if (process.env.NODE_ENV === "development") {
    return ["error", "warn"];
  }

  return ["error"];
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: resolvePrismaLogLevels(),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
