import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeRoot = "apps/api/src/routes";
const sensitiveFieldPattern = /^\s*(body|content|description|notes):\s*z\b/;
const routeFieldPattern = /^\s*[A-Za-z][A-Za-z0-9]*:\s*z\b/;

function isStringSchema(line, snippet) {
  return /:\s*z\.string\(\)/.test(line) || (/:\s*z\s*$/.test(line) && /\.string\(\)/.test(snippet));
}

function listRouteFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return listRouteFiles(path);
    }

    return /\.routes\.ts$/.test(path) ? [path] : [];
  });
}

test("sensitive free-text route fields reject remote load vectors", () => {
  const offenders = [];

  for (const file of listRouteFiles(routeRoot)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!sensitiveFieldPattern.test(line)) {
        return;
      }

      const endIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && routeFieldPattern.test(candidate));
      const snippet = lines.slice(index, endIndex === -1 ? index + 20 : endIndex).join("\n");
      if (!isStringSchema(line, snippet)) {
        return;
      }

      if (!/containsRemoteLoadVector/.test(snippet)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(offenders, []);
});
