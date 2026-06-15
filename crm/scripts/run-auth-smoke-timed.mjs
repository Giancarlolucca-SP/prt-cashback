#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const startedAt = Date.now();
const timingLogPath = resolve(process.cwd(), ".dev-logs", "auth-smoke-timings.jsonl");
const child = spawn(process.execPath, ["--test", "tests/auth-api.test.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AUTH_SMOKE_PROCESS_STARTED_AT: String(startedAt),
    AUTH_SMOKE_TIMING_LOG: timingLogPath,
    AUTH_SMOKE_TIMING: "true",
  },
  stdio: "inherit",
  shell: false,
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`auth smoke timed exited with signal ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
