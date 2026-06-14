#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--test", "tests/auth-api.test.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
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
