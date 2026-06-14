#!/usr/bin/env node

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const preferredApiPort = Number(process.env.QA_AUTO_API_PORT || process.env.API_PORT || 3333);
const preferredWebPort = Number(process.env.QA_AUTO_WEB_PORT || 3001);

function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

function npmRunArgs(script) {
  return [npmCli(), "run", script];
}

function localBin(relativePath) {
  return resolve(process.cwd(), relativePath);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 40; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found from ${preferredPort} to ${preferredPort + 39}`);
}

async function waitForUrl(url, label, timeoutMs = 90000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

async function settleWeb(webUrl) {
  await waitForUrl(`${webUrl}/login`, "Web");
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

function startService(label, command, args, env) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function stopService(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (!child.killed && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function main() {
  console.log("qa:daily:auto:local preflight");
  await run(process.execPath, npmRunArgs("typecheck"));
  await run(process.execPath, npmRunArgs("build:api"));
  await run(process.execPath, npmRunArgs("build:web"));

  const apiPort = await findFreePort(preferredApiPort);
  const webPort = await findFreePort(preferredWebPort);
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;
  const apiProcess = startService("api", process.execPath, [localBin("node_modules/tsx/dist/cli.mjs"), "apps/api/src/server.ts"], { API_PORT: String(apiPort) });
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
    await run(process.execPath, npmRunArgs("qa:commercial:local"), { env: qaEnv });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:customer-history-preferences:local"), { env: qaEnv });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:profile-preferences:local"), { env: qaEnv });
    await settleWeb(webUrl);
    await run(process.execPath, npmRunArgs("qa:visual:local"), { env: qaEnv });

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
  process.exitCode = 1;
});
