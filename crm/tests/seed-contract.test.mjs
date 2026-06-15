import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("auth smoke uses base seed without demo operational data", () => {
  const seed = readFileSync("packages/db/prisma/seed.mjs", "utf8");
  const authSmoke = readFileSync("tests/auth-api-smoke.ts", "utf8");
  const readme = readFileSync("README.md", "utf8");

  assert.match(seed, /SEED_SKIP_DEMO_DATA/);
  assert.match(seed, /SEED_REUSE_DEV_PASSWORD_HASH/);
  assert.match(seed, /findUnique\(\{\s*where: \{ email \},\s*select: \{ passwordHash: true \},/);
  assert.match(seed, /if \(!skipDemoData\)\s*\{\s*await seedDemoData\(store, userByRole\);/);
  assert.match(authSmoke, /SEED_SKIP_DEMO_DATA:\s*"true"/);
  assert.match(authSmoke, /SEED_REUSE_DEV_PASSWORD_HASH:\s*"true"/);
  assert.match(readme, /SEED_SKIP_DEMO_DATA=true npm run db:seed/);
  assert.match(readme, /SEED_REUSE_DEV_PASSWORD_HASH=true/);
});
