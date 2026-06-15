#!/usr/bin/env node

import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const apiUrl = process.env.QA_API_URL || "http://localhost:3333";
const preferredWebPort = Number(process.env.QA_AUTO_WEB_PORT || process.env.WEB_PORT || 3000);

function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

async function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port);
  });
}

async function findFreePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 40; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free web port found from ${preferredPort} to ${preferredPort + 39}`);
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }

  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ""}`);
}

function startWeb(port) {
  const webUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "apps/web", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: apiUrl,
    },
    stdio: "inherit",
    shell: false,
  });

  return { child, webUrl };
}

async function stopService(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolveStop) => {
      execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], () => resolveStop());
    });
    return;
  }

  child.kill("SIGTERM");
}

function runCoreQa(webUrl) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [npmCli(), "run", "qa:core:local"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        QA_API_URL: apiUrl,
        QA_WEB_URL: webUrl,
      },
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`qa:core:local exited with ${code ?? 1}`));
    });
  });
}

async function main() {
  await waitForUrl(`${apiUrl}/health/ready`, "API");

  const webPort = await findFreePort(preferredWebPort);
  const { child: webProcess, webUrl } = startWeb(webPort);
  console.log(`qa:core:auto:local Web: ${webUrl}`);

  try {
    await waitForUrl(`${webUrl}/preview`, "Web");
    await runCoreQa(webUrl);
    console.log("qa:core:auto:local ok");
  } finally {
    await stopService(webProcess);
  }
}

main().catch((error) => {
  console.error("qa:core:auto:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
