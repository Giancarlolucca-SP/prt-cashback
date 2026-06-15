#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findFreePort, isUrlReady, localBin, npmRunArgs, stopService, waitForUrl } from "./helpers/qa-runner.mjs";

const preferredApiPort = Number(process.env.QA_AUTO_API_PORT || process.env.API_PORT || 3333);
const preferredWebPort = Number(process.env.QA_AUTO_WEB_PORT || 3001);
const logDir = resolve(process.cwd(), ".dev-logs");
const runId = (process.env.QA_AUTO_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14))
  .replace(/[^A-Za-z0-9_-]/g, "")
  .slice(0, 64) || "run";
const logLines = [];
const maxLogChars = 500000;

function appendLog(message) {
  const text = String(message);
  logLines.push(text);

  let totalLength = logLines.reduce((total, line) => total + line.length, 0);
  while (totalLength > maxLogChars && logLines.length > 1) {
    totalLength -= logLines.shift().length;
  }
}

function streamAndLog(stream, target, label) {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    appendLog(`[${label}] ${text}`);
    target.write(`[${label}] ${text}`);
  });
}

function writeFailureLog(error) {
  mkdirSync(logDir, { recursive: true });
  const logPath = resolve(logDir, `qa-daily-auto-${runId}.failure.log`);
  const content = [
    `qa:daily:auto:local failed at ${new Date().toISOString()}`,
    `cwd: ${process.cwd()}`,
    `node: ${process.version}`,
    `preferredApiPort: ${preferredApiPort}`,
    `preferredWebPort: ${preferredWebPort}`,
    "",
    "error:",
    error?.stack ?? error?.message ?? String(error),
    "",
    "captured output:",
    ...logLines,
  ].join("\n");

  writeFileSync(logPath, content, "utf8");
  return logPath;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const label = options.label ?? args[2] ?? command;
    appendLog(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    streamAndLog(child.stdout, process.stdout, label);
    streamAndLog(child.stderr, process.stderr, label);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        appendLog(`ok: ${command} ${args.join(" ")}`);
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function settleWeb(webUrl) {
  await waitForUrl(`${webUrl}/login`, "Web");
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

function startService(label, command, args, env) {
  appendLog(`$ ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  streamAndLog(child.stdout, process.stdout, label);
  streamAndLog(child.stderr, process.stderr, label);
  return child;
}

async function main() {
  console.log("qa:daily:auto:local preflight");
  appendLog("qa:daily:auto:local preflight");
  if (process.env.QA_AUTO_FAIL_FAST === "true") {
    throw new Error("Forced QA daily auto failure for log test");
  }

  await run(process.execPath, npmRunArgs("typecheck"), { label: "typecheck" });
  await run(process.execPath, npmRunArgs("build:api"), { label: "build:api" });
  await run(process.execPath, npmRunArgs("build:web"), { label: "build:web" });

  let apiPort = preferredApiPort;
  const webPort = await findFreePort(preferredWebPort);
  let apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;
  let apiProcess = null;
  let apiLogSuffix = "";

  if (await isUrlReady(`${apiUrl}/health/ready`)) {
    apiLogSuffix = " (reusing existing API)";
    console.log(`qa:daily:auto:local API existente: ${apiUrl}`);
  } else {
    apiPort = await findFreePort(preferredApiPort);
    apiUrl = `http://localhost:${apiPort}`;
    apiProcess = startService("api", process.execPath, [localBin("node_modules/tsx/dist/cli.mjs"), "apps/api/src/server.ts"], { API_PORT: String(apiPort) });
  }

  appendLog(`apiUrl: ${apiUrl}${apiLogSuffix}`);
  appendLog(`webUrl: ${webUrl}`);
  const webProcess = startService("web", process.execPath, [localBin("node_modules/next/dist/bin/next"), "dev", "apps/web", "-p", String(webPort)], {
    NEXT_PUBLIC_API_URL: apiUrl,
  });

  try {
    await waitForUrl(`${apiUrl}/health/ready`, "API");
    await waitForUrl(`${webUrl}/login`, "Web");

    const qaEnv = {
      QA_API_URL: apiUrl,
      QA_WEB_URL: webUrl,
    };
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:commercial:local"), { env: qaEnv, label: "qa:commercial:local" });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:customer-history-preferences:local"), { env: qaEnv, label: "qa:customer-history-preferences:local" });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:lead-history:local"), { env: qaEnv, label: "qa:lead-history:local" });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:profile-preferences:local"), { env: qaEnv, label: "qa:profile-preferences:local" });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:visual:local"), { env: qaEnv, label: "qa:visual:local" });

    console.log("qa:daily:auto:local ok");
    console.log(`- API: ${apiUrl}`);
    console.log(`- Web: ${webUrl}`);
  } finally {
    await Promise.all([stopService(webProcess), stopService(apiProcess)]);
  }
}

main().catch((error) => {
  console.error("qa:daily:auto:local failed");
  console.error(error.message);
  const logPath = writeFailureLog(error);
  console.error(`Failure log: ${logPath}`);
  process.exitCode = 1;
});
