#!/usr/bin/env node

const apiBaseUrl = process.env.SMOKE_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.SMOKE_WEB_URL || "http://localhost:3000";
const email = process.env.SMOKE_EMAIL || "dono@gt3.local";
const password = process.env.SMOKE_PASSWORD || "Gt3@2026dev";

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${path} returned ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  return response.json();
}

async function checkList(path, token) {
  const body = await requestJson(path, {
    headers: { authorization: `Bearer ${token}` },
  });
  const count = Array.isArray(body.items) ? body.items.length : 0;
  if (count === 0) {
    throw new Error(`${path} returned no items`);
  }
  return count;
}

async function main() {
  const checks = [];
  const health = await requestJson("/health");
  checks.push(["health", health.status]);

  const login = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = login.token;
  if (!token) throw new Error("login did not return token");

  const session = await requestJson("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  checks.push(["session", session.user?.email ?? "unknown"]);

  const listChecks = [
    ["/customers?page=1&page_size=5", "customers"],
    ["/leads?page=1&page_size=5", "leads"],
    ["/inventory?page=1&page_size=5", "inventory"],
    ["/sales?page=1&page_size=5", "sales"],
    ["/services/orders?page=1&page_size=5", "serviceOrders"],
    ["/services/providers?page=1&page_size=5", "providers"],
    ["/services/post-sale/customers?page=1&page_size=5", "postSaleCustomers"],
  ];

  for (const [path, label] of listChecks) {
    checks.push([label, await checkList(path, token)]);
  }

  const finance = await requestJson("/finance/summary", {
    headers: { authorization: `Bearer ${token}` },
  });
  checks.push(["financeNet", finance.totals?.net ?? 0]);

  const webRoutes = [
    "/",
    "/preview",
    "/resultados",
    "/leads",
    "/clientes",
    "/conversas",
    "/agendamentos",
    "/vendas",
    "/pos-venda",
    "/relacionamento",
    "/kanbans",
    "/compras",
    "/avaliacoes",
    "/fornecedores",
    "/repasse",
    "/estoque",
    "/anuncios",
    "/servicos",
    "/administrativo",
    "/documentos",
    "/financeiro",
    "/comissoes",
    "/automacoes",
    "/configuracoes",
    "/site-loja",
    "/auditoria",
  ];

  for (const route of webRoutes) {
    const response = await fetch(`${webBaseUrl}${route}`);
    if (!response.ok) {
      throw new Error(`${route} returned ${response.status}`);
    }
  }
  checks.push(["webRoutes", webRoutes.length]);

  console.log("smoke:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("smoke:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
