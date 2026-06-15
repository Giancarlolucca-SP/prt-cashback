import { execFile } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

export function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

export function npmRunArgs(script) {
  return [npmCli(), "run", script];
}

export function localBin(relativePath) {
  return resolve(process.cwd(), relativePath);
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

export async function findFreePort(preferredPort, range = 40) {
  for (let port = preferredPort; port < preferredPort + range; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port found from ${preferredPort} to ${preferredPort + range - 1}`);
}

export async function isUrlReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForUrl(url, label, timeoutMs = 90000) {
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

export async function stopService(child) {
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
  await new Promise((resolveStop) => setTimeout(resolveStop, 1500));
  if (!child.killed && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}
