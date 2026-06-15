#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const startedAt = performance.now();
let checkpointStartedAt = startedAt;

function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

function checkpoint(label) {
  const now = performance.now();
  const durationMs = Math.round(now - checkpointStartedAt);
  const totalMs = Math.round(now - startedAt);
  console.log(`[auth-bootstrap] ${label}: +${durationMs}ms (${totalMs}ms total)`);
  checkpointStartedAt = now;
}

checkpoint("process-start");

const appModule = await import("../apps/api/src/app.js");
checkpoint("import-app");

const dbModule = await import("../apps/api/src/lib/db.js");
checkpoint("import-db");

execFileSync(process.execPath, [npmCli(), "run", "db:seed"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SEED_SKIP_DEMO_DATA: "true",
  },
  stdio: "ignore",
});
checkpoint("db:seed-base");

const app = appModule.buildApp();
checkpoint("build-app");

await app.close();
await dbModule.prisma.$disconnect();
checkpoint("shutdown");
