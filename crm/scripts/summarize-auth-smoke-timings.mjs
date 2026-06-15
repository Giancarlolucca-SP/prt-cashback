#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultPath = resolve(process.cwd(), ".dev-logs", "auth-smoke-timings.jsonl");
const timingPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultPath;

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    avg: Math.round(sum / values.length),
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
}

function parseRuns(content) {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return Array.isArray(parsed.checkpoints) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

if (!existsSync(timingPath)) {
  console.log(`No auth smoke timing history found at ${timingPath}`);
  process.exit(0);
}

const runs = parseRuns(readFileSync(timingPath, "utf8"));
if (runs.length === 0) {
  console.log(`No valid auth smoke timing runs found at ${timingPath}`);
  process.exit(0);
}

const successfulRuns = runs.filter((run) => run.success);
const totalSummary = summarize(runs.map((run) => Number(run.totalMs)).filter(Number.isFinite));
const checkpointDurations = new Map();

for (const run of runs) {
  for (const checkpoint of run.checkpoints) {
    if (!checkpoint.label || !Number.isFinite(Number(checkpoint.durationMs))) {
      continue;
    }

    const values = checkpointDurations.get(checkpoint.label) ?? [];
    values.push(Number(checkpoint.durationMs));
    checkpointDurations.set(checkpoint.label, values);
  }
}

console.log(`Auth smoke timing summary: ${timingPath}`);
console.log(`Runs: ${runs.length} (${successfulRuns.length} successful, ${runs.length - successfulRuns.length} failed)`);
console.log(`Total ms: avg ${totalSummary.avg}, min ${totalSummary.min}, max ${totalSummary.max}`);
console.log("");
console.log("Checkpoint ms:");

for (const [label, values] of checkpointDurations) {
  const summary = summarize(values);
  console.log(`- ${label}: avg ${summary.avg}, min ${summary.min}, max ${summary.max}, runs ${values.length}`);
}
