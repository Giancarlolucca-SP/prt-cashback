#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

const iterations = Number.parseInt(process.argv[2] ?? "3", 10);
const runs = Number.isInteger(iterations) && iterations > 0 ? iterations : 3;
const durations = [];

for (let index = 0; index < runs; index += 1) {
  const startedAt = performance.now();
  execFileSync(process.execPath, [npmCli(), "run", "db:seed"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEED_SKIP_DEMO_DATA: "true",
    },
    stdio: "ignore",
  });
  const durationMs = Math.round(performance.now() - startedAt);
  durations.push(durationMs);
  console.log(`[base-seed] run ${index + 1}/${runs}: ${durationMs}ms`);
}

const sorted = [...durations].sort((a, b) => a - b);
const average = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
console.log(`[base-seed] avg ${average}ms, min ${sorted[0]}ms, max ${sorted[sorted.length - 1]}ms`);
