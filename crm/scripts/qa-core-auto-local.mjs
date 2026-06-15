#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { findFreePort, npmCli, stopService, waitForUrl } from "./helpers/qa-runner.mjs";

const apiUrl = process.env.QA_API_URL || "http://localhost:3333";
const preferredWebPort = Number(process.env.QA_AUTO_WEB_PORT || process.env.WEB_PORT || 3000);

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
