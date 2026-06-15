import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { findFreePort, isUrlReady } from "../scripts/helpers/qa-runner.mjs";

function listenOnFreePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      resolve({ port: address.port, server });
    });
  });
}

test("findFreePort detects listeners bound without an explicit host", async () => {
  const { port, server } = await listenOnFreePort();

  try {
    await assert.rejects(() => findFreePort(port, 1), /No free port found/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("isUrlReady detects healthy and unavailable URLs", async () => {
  const server = http.createServer((request, response) => {
    if (request.url === "/health/ready") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, resolve);
  });

  const address = server.address();

  try {
    assert.equal(await isUrlReady(`http://localhost:${address.port}/health/ready`), true);
    assert.equal(await isUrlReady(`http://localhost:${address.port}/missing`), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
