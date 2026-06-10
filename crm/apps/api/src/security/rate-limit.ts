import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/db.js";

type RateLimitProfile = {
  lockMs: number;
  max: number;
  name: string;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  lockedUntil: number;
  windowResetAt: number;
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const profiles = {
  authLogin: { lockMs: 15 * 60_000, max: envNumber("RATE_LIMIT_AUTH_LOGIN_MAX", 20), name: "auth_login", windowMs: 60_000 },
  default: { lockMs: 60_000, max: envNumber("RATE_LIMIT_DEFAULT_MAX", 600), name: "default", windowMs: 60_000 },
  honeypot: { lockMs: 60 * 60_000, max: envNumber("RATE_LIMIT_HONEYPOT_MAX", 3), name: "honeypot_probe", windowMs: 10 * 60_000 },
  sensitive: { lockMs: 10 * 60_000, max: envNumber("RATE_LIMIT_SENSITIVE_MAX", 120), name: "sensitive_endpoint", windowMs: 60_000 },
  webhook: { lockMs: 5 * 60_000, max: envNumber("RATE_LIMIT_WEBHOOK_MAX", 60), name: "webhook", windowMs: 60_000 },
} satisfies Record<string, RateLimitProfile>;

const sensitivePrefixes = [
  "/audit",
  "/compliance",
  "/files",
  "/finance",
  "/jobs",
  "/ops",
  "/settings",
  "/users",
];

const honeypotPaths = new Set([
  "/auth/check-user",
  "/auth/email-exists",
  "/auth/user-exists",
  "/auth/verify-user",
  "/users/exists",
]);

const buckets = new Map<string, RateLimitState>();

function clientKey(request: FastifyRequest, profile: RateLimitProfile) {
  const authorization = request.headers.authorization ?? "";
  const tokenPart = authorization ? createHash("sha256").update(authorization).digest("hex").slice(0, 16) : "anonymous";
  return `${profile.name}:${request.ip}:${tokenPart}:${request.method}:${request.routeOptions.url ?? request.url}`;
}

function profileFor(request: FastifyRequest) {
  const path = request.url.split("?")[0] ?? "/";

  if (honeypotPaths.has(path)) {
    return profiles.honeypot;
  }

  if (request.method === "POST" && path === "/auth/login") {
    return profiles.authLogin;
  }

  if (path.startsWith("/webhooks/")) {
    return profiles.webhook;
  }

  if (sensitivePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return profiles.sensitive;
  }

  return profiles.default;
}

function logRateLimitEvent(request: FastifyRequest, profile: RateLimitProfile, reason: "locked" | "limit_exceeded") {
  void prisma.securityEvent
    .create({
      data: {
        type: "rate_limit",
        severity: profile.name === "honeypot_probe" || profile.name === "auth_login" ? "high" : "medium",
        metadata: {
          ip: request.ip,
          method: request.method,
          path: request.url.split("?")[0],
          profile: profile.name,
          reason,
          userAgent: request.headers["user-agent"]?.toString(),
        },
      },
    })
    .catch((error) => request.log.warn({ error }, "failed_to_record_rate_limit_event"));
}

function rateLimitResponse(reply: FastifyReply, profile: RateLimitProfile, retryAfterSeconds: number) {
  reply.header("retry-after", String(Math.max(1, retryAfterSeconds)));
  return reply.code(429).send({
    error: {
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Tente novamente mais tarde.",
      details: {
        lockoutProfile: profile.name,
      },
    },
  });
}

export function registerRateLimit(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const profile = profileFor(request);
    const key = clientKey(request, profile);
    const now = Date.now();
    const current = buckets.get(key);

    if (current && current.lockedUntil > now) {
      logRateLimitEvent(request, profile, "locked");
      return rateLimitResponse(reply, profile, Math.ceil((current.lockedUntil - now) / 1000));
    }

    if (!current || current.windowResetAt <= now) {
      buckets.set(key, { count: 1, lockedUntil: 0, windowResetAt: now + profile.windowMs });
      return;
    }

    current.count += 1;

    if (current.count > profile.max) {
      current.lockedUntil = now + profile.lockMs;
      logRateLimitEvent(request, profile, "limit_exceeded");
      return rateLimitResponse(reply, profile, Math.ceil(profile.lockMs / 1000));
    }
  });
}

export const rateLimitTestInternals = {
  buckets,
  honeypotPaths,
  profileFor,
  profiles,
};
