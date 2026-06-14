import assert from "node:assert/strict";
import test from "node:test";

async function loadResolvePrismaLogLevels() {
  const module = await import(`../apps/api/src/lib/db.ts?test=${Date.now()}-${Math.random()}`);
  return module.resolvePrismaLogLevels;
}

test("Prisma log levels can be silenced for expected-conflict smoke tests", async () => {
  const previousPrismaLogLevel = process.env.PRISMA_LOG_LEVEL;
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.PRISMA_LOG_LEVEL = "silent";
    process.env.NODE_ENV = "test";
    assert.deepEqual((await loadResolvePrismaLogLevels())(), []);

    delete process.env.PRISMA_LOG_LEVEL;
    process.env.NODE_ENV = "development";
    assert.deepEqual((await loadResolvePrismaLogLevels())(), ["error", "warn"]);

    process.env.NODE_ENV = "test";
    assert.deepEqual((await loadResolvePrismaLogLevels())(), ["error"]);
  } finally {
    if (previousPrismaLogLevel === undefined) {
      delete process.env.PRISMA_LOG_LEVEL;
    } else {
      process.env.PRISMA_LOG_LEVEL = previousPrismaLogLevel;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
