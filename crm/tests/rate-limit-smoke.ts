import assert from "node:assert/strict";
import { rateLimitTestInternals } from "../apps/api/src/security/rate-limit.js";

function requestFor(url: string, method = "GET") {
  return {
    headers: {},
    ip: "127.0.0.1",
    method,
    routeOptions: { url },
    url,
  };
}

const loginProfile = rateLimitTestInternals.profileFor(requestFor("/auth/login", "POST") as never);
const webhookProfile = rateLimitTestInternals.profileFor(requestFor("/webhooks/evolution", "POST") as never);
const sensitiveProfile = rateLimitTestInternals.profileFor(requestFor("/users", "GET") as never);
const defaultProfile = rateLimitTestInternals.profileFor(requestFor("/customers", "GET") as never);

assert.equal(loginProfile.name, "auth_login");
assert.equal(webhookProfile.name, "webhook");
assert.equal(sensitiveProfile.name, "sensitive_endpoint");
assert.equal(defaultProfile.name, "default");
assert.notEqual(loginProfile.lockMs, webhookProfile.lockMs);
assert.notEqual(sensitiveProfile.lockMs, defaultProfile.lockMs);

for (const path of rateLimitTestInternals.honeypotPaths) {
  const profile = rateLimitTestInternals.profileFor(requestFor(path, "POST") as never);
  assert.equal(profile.name, "honeypot_probe");
}
