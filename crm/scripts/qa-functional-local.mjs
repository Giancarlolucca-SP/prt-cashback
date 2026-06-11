#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";

const profiles = [
  { label: "Dono/Gestor", email: "dono@gt3.local", role: "OWNER_MANAGER" },
  { label: "Admin", email: "admin@gt3.local", role: "ADMIN" },
  { label: "Administrativo", email: "administrativo@gt3.local", role: "ADMINISTRATIVE" },
  { label: "Vendedor", email: "vendedor@gt3.local", role: "SELLER" },
  { label: "SDR", email: "sdr@gt3.local", role: "SDR" },
  { label: "Avaliador", email: "avaliador@gt3.local", role: "APPRAISER" },
  { label: "Servicos", email: "servicos@gt3.local", role: "SERVICE_MANAGER" },
];

const webRoutes = [
  "/preview",
  "/resultados",
  "/leads",
  "/clientes",
  "/agendamentos",
  "/vendas",
  "/compras",
  "/estoque",
  "/servicos",
  "/administrativo",
  "/financeiro",
  "/configuracoes",
  "/auditoria",
];

const permissionChecks = [
  ["Dono/Gestor", true, { module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" }],
  ["Dono/Gestor", true, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" }],
  ["Dono/Gestor", true, { module: "users", action: "manage", scope: "ALL", sensitiveArea: "security" }],
  ["Admin", true, { module: "settings", action: "manage", scope: "ALL", sensitiveArea: "technical" }],
  ["Administrativo", true, { module: "finance", action: "manage", scope: "ALL", sensitiveArea: "financial" }],
  ["Administrativo", false, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" }],
  ["Vendedor", true, { module: "sales", action: "create", scope: "STORE", sensitiveArea: "general" }],
  ["Vendedor", true, { module: "commissions", action: "read_own", scope: "OWN_PORTFOLIO", sensitiveArea: "general" }],
  ["Vendedor", false, { module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" }],
  ["Vendedor", false, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" }],
  ["SDR", true, { module: "leads", action: "create", scope: "STORE", sensitiveArea: "general" }],
  ["SDR", false, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" }],
  ["Avaliador", true, { module: "purchases", action: "manage", scope: "STORE", sensitiveArea: "general" }],
  ["Avaliador", false, { module: "finance", action: "read", scope: "ALL", sensitiveArea: "financial" }],
  ["Servicos", true, { module: "services", action: "manage", scope: "STORE", sensitiveArea: "general" }],
  ["Servicos", false, { module: "audit", action: "read", scope: "ALL", sensitiveArea: "audit" }],
];

const endpointChecks = [
  ["Dono/Gestor", "/finance/summary", 200],
  ["Vendedor", "/finance/summary", 403],
  ["Dono/Gestor", "/audit/logs?page=1&page_size=5", 200],
  ["Avaliador", "/audit/logs?page=1&page_size=5", 403],
  ["Dono/Gestor", "/users?page=1&page_size=5", 200],
  ["Vendedor", "/users?page=1&page_size=5", 403],
  ["Servicos", "/services/orders?page=1&page_size=5", 200],
  ["SDR", "/sales?page=1&page_size=5", 403],
];

async function request(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { body, response };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function login(profile) {
  const { body, response } = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: profile.email, password }),
  });
  assert(response.status === 200, `${profile.email} login returned ${response.status}`);
  assert(body?.token, `${profile.email} login did not return token`);
  assert(body.user?.role === profile.role, `${profile.email} expected role ${profile.role}, got ${body.user?.role}`);
  return body.token;
}

async function main() {
  const results = [];
  const sessions = new Map();

  const health = await request("/health/ready");
  assert(health.status === 200, `/health/ready returned ${health.status}`);
  results.push(["readiness", "ok"]);

  for (const profile of profiles) {
    const token = await login(profile);
    sessions.set(profile.label, token);
    results.push([`login:${profile.label}`, profile.role]);
  }

  for (const [label, expectedAllowed, payload] of permissionChecks) {
    const token = sessions.get(label);
    const { body, response } = await requestJson("/auth/permissions/check", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const allowed = response.status === 200 && body?.allowed === true;
    const denied = response.status === 403 && body?.allowed === false;
    assert(expectedAllowed ? allowed : denied, `${label} permission ${payload.module}:${payload.action} expected ${expectedAllowed ? "allow" : "deny"}, got status ${response.status}`);
  }
  results.push(["rbacPermissions", permissionChecks.length]);

  for (const [label, path, expectedStatus] of endpointChecks) {
    const token = sessions.get(label);
    const response = await request(path, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert(response.status === expectedStatus, `${label} ${path} expected ${expectedStatus}, got ${response.status}`);
  }
  results.push(["rbacEndpoints", endpointChecks.length]);

  for (const route of webRoutes) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  results.push(["webRoutes", webRoutes.length]);

  console.log("qa:functional:local ok");
  for (const [label, value] of results) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:functional:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
