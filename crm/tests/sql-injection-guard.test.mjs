import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const roots = ["apps/api/src", "packages"];
const unsafePatterns = [
  /\.\$queryRawUnsafe\s*\(/,
  /\.\$executeRawUnsafe\s*\(/,
  /Prisma\.raw\s*\(/,
];

function listFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return listFiles(path);
    }

    return /\.(ts|tsx|js|mjs)$/.test(path) ? [path] : [];
  });
}

test("backend does not use unsafe raw SQL helpers", () => {
  const offenders = roots.flatMap(listFiles).flatMap((file) => {
    const content = readFileSync(file, "utf8");
    return unsafePatterns.some((pattern) => pattern.test(content)) ? [file] : [];
  });

  assert.deepEqual(offenders, []);
});
