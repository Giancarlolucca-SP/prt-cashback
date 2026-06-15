import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { findFreePort } from "../scripts/helpers/qa-runner.mjs";

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
