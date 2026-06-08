import { buildApp } from "./app.js";
import { readEnv } from "./config/env.js";

async function start() {
  const env = readEnv();
  const app = buildApp();

  await app.listen({
    host: "0.0.0.0",
    port: env.API_PORT
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
