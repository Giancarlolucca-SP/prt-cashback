import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildApp } from "../apps/api/src/app.js";
import { prisma } from "../apps/api/src/lib/db.js";

const timingEnabled = process.env.AUTH_SMOKE_TIMING === "true";
const timingLogPath = process.env.AUTH_SMOKE_TIMING_LOG;
const processStartedAt = Number(process.env.AUTH_SMOKE_PROCESS_STARTED_AT);
const scriptStartedAt = Date.now();
const timingStartedAt = Number.isFinite(processStartedAt) && processStartedAt > 0 ? processStartedAt : scriptStartedAt;
let checkpointStartedAt = timingStartedAt;
const checkpoints: Array<{ label: string; durationMs: number; totalMs: number }> = [];
let smokeSucceeded = false;

function checkpoint(label: string) {
  if (!timingEnabled) {
    return;
  }

  const now = Date.now();
  const durationMs = now - checkpointStartedAt;
  const totalMs = now - timingStartedAt;
  checkpoints.push({ label, durationMs, totalMs });
  console.log(`[auth-smoke] ${label}: +${durationMs}ms (${totalMs}ms total)`);
  checkpointStartedAt = now;
}

function writeTimingHistory(success: boolean) {
  if (!timingEnabled || !timingLogPath) {
    return;
  }

  const finishedAt = Date.now();
  mkdirSync(dirname(timingLogPath), { recursive: true });
  appendFileSync(
    timingLogPath,
    `${JSON.stringify({
      finishedAt: new Date(finishedAt).toISOString(),
      success,
      totalMs: finishedAt - timingStartedAt,
      checkpoints,
    })}\n`,
    "utf8",
  );
}

checkpoint("module-load");

execSync("npm run db:seed", {
  cwd: process.cwd(),
  stdio: "ignore",
  env: {
    ...process.env,
    SEED_SKIP_DEMO_DATA: "true",
    SEED_REUSE_DEV_PASSWORD_HASH: "true",
  },
});
checkpoint("db:seed");

const app = buildApp();
checkpoint("app-bootstrap");
const runToken = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
let uniqueCounter = 0;

function uniqueToken(prefix: string) {
  uniqueCounter += 1;
  return `${prefix}-${runToken}-${uniqueCounter}`;
}

function uniquePlate(prefix: string) {
  uniqueCounter += 1;
  const letters = `${prefix}AAA`.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 3).padEnd(3, "A");
  const seed = Date.now() + process.pid * 997 + uniqueCounter * 389 + Math.floor(Math.random() * 26000);
  const number = String(seed % 10);
  const letter = String.fromCharCode(65 + (Math.floor(seed / 10) % 26));
  const suffix = String(Math.floor(seed / 260) % 100).padStart(2, "0");
  return `${letters}${number}${letter}${suffix}`;
}

function dateWindowAround(date: Date) {
  return {
    from: new Date(date.getTime() - 60000).toISOString(),
    to: new Date(date.getTime() + 60000).toISOString(),
  };
}

try {
  const invalidLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "vendedor@gt3.local",
      password: "senha-errada",
    },
  });
  assert.equal(invalidLogin.statusCode, 401);
  assert.equal(invalidLogin.json().error, "invalid_credentials");

  const unknownUserLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "usuario.inexistente@gt3.local",
      password: "senha-errada",
    },
  });
  assert.equal(unknownUserLogin.statusCode, 401);
  assert.deepEqual(unknownUserLogin.json(), invalidLogin.json());

  const oversizedPasswordLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "vendedor@gt3.local",
      password: "x".repeat(121),
    },
  });
  assert.equal(oversizedPasswordLogin.statusCode, 400);

  const sellerLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "vendedor@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(sellerLogin.statusCode, 200);
  const sellerBody = sellerLogin.json() as { token: string; user: { id: string; role: string } };
  assert.equal(sellerBody.user.role, "SELLER");
  assert.ok(sellerBody.token);

  const sellerMe = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
  });
  assert.equal(sellerMe.statusCode, 200);
  assert.equal(sellerMe.json().user.email, "vendedor@gt3.local");

  const sellerFinanceCheck = await app.inject({
    method: "POST",
    url: "/auth/permissions/check",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
    payload: {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    },
  });
  assert.equal(sellerFinanceCheck.statusCode, 403);
  assert.equal(sellerFinanceCheck.json().allowed, false);

  const ownerLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "dono@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(ownerLogin.statusCode, 200);
  const ownerBody = ownerLogin.json() as { token: string; user: { id: string; storeId: string } };

  await prisma.userPreference.deleteMany({
    where: {
      key: "customer_history_timeline",
      userId: { in: [ownerBody.user.id, sellerBody.user.id] },
    },
  });

  const oversizedPayload = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      name: "Cliente Payload Grande",
      phone: "11999990099",
      notes: "x".repeat(300 * 1024),
    }),
  });
  assert.equal(oversizedPayload.statusCode, 413);
  assert.equal(oversizedPayload.json().error.code, "PAYLOAD_TOO_LARGE");

  const ownerFinanceCheck = await app.inject({
    method: "POST",
    url: "/auth/permissions/check",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
    },
  });
  assert.equal(ownerFinanceCheck.statusCode, 200);
  assert.equal(ownerFinanceCheck.json().allowed, true);

  const missingOwnerPreference = await app.inject({
    method: "GET",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(missingOwnerPreference.statusCode, 200);
  assert.equal(missingOwnerPreference.json().data.value, null);

  const saveOwnerPreference = await app.inject({
    method: "PUT",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      value: {
        filter: "appointment",
        search: "retorno",
      },
    },
  });
  assert.equal(saveOwnerPreference.statusCode, 200);
  assert.deepEqual(saveOwnerPreference.json().data.value, {
    filter: "appointment",
    search: "retorno",
  });

  const getOwnerPreference = await app.inject({
    method: "GET",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getOwnerPreference.statusCode, 200);
  assert.deepEqual(getOwnerPreference.json().data.value, {
    filter: "appointment",
    search: "retorno",
  });

  const listOwnerPreferences = await app.inject({
    method: "GET",
    url: "/auth/preferences",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listOwnerPreferences.statusCode, 200);
  assert.ok(
    (listOwnerPreferences.json().items as Array<{ key: string }>).some(
      (preference) => preference.key === "customer_history_timeline",
    ),
  );

  const sellerPreferenceIsolation = await app.inject({
    method: "GET",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
  });
  assert.equal(sellerPreferenceIsolation.statusCode, 200);
  assert.equal(sellerPreferenceIsolation.json().data.value, null);

  const deleteOwnerPreference = await app.inject({
    method: "DELETE",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(deleteOwnerPreference.statusCode, 200);
  assert.equal(deleteOwnerPreference.json().ok, true);

  const deletedOwnerPreference = await app.inject({
    method: "GET",
    url: "/auth/preferences/customer_history_timeline",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(deletedOwnerPreference.statusCode, 200);
  assert.equal(deletedOwnerPreference.json().data.value, null);
  checkpoint("auth/preferences");

  const healthReady = await app.inject({
    method: "GET",
    url: "/health/ready",
  });
  assert.equal(healthReady.statusCode, 200);
  assert.equal(healthReady.json().checks.database.status, "ok");

  const sellerOpsSummary = await app.inject({
    method: "GET",
    url: "/ops/summary",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
  });
  assert.equal(sellerOpsSummary.statusCode, 403);

  const backupStatusPayload = {
    environment: "development",
    target: "postgresql",
    status: "SUCCEEDED",
    details: {
      source: "automated-test",
    },
  };
  const registerBackupStatus = await app.inject({
    method: "POST",
    url: "/ops/backup-status",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: backupStatusPayload,
  });
  assert.equal(registerBackupStatus.statusCode, 201);
  assert.equal(registerBackupStatus.json().data.status, "SUCCEEDED");

  const opsSummary = await app.inject({
    method: "GET",
    url: "/ops/summary",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(opsSummary.statusCode, 200);
  assert.equal(opsSummary.json().environment, process.env.APP_ENV || "development");

  const listBackupStatus = await app.inject({
    method: "GET",
    url: "/ops/backup-status?page=1&page_size=5",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listBackupStatus.statusCode, 200);
  assert.ok(listBackupStatus.json().total >= 1);

  const logout = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
  });
  assert.equal(logout.statusCode, 200);

  const revokedMe = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${sellerBody.token}`,
    },
  });
  assert.equal(revokedMe.statusCode, 401);
  checkpoint("ops/session");

  const unauthenticatedCustomers = await app.inject({
    method: "GET",
    url: "/customers",
  });
  assert.equal(unauthenticatedCustomers.statusCode, 401);
  assert.equal(unauthenticatedCustomers.json().error.code, "UNAUTHENTICATED");

  const invalidCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "A",
    },
  });
  assert.equal(invalidCustomer.statusCode, 400);
  assert.equal(invalidCustomer.json().error.code, "VALIDATION_ERROR");

  const customerWithoutContact = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Cliente Sem Contato",
      origin: "qa-api",
    },
  });
  assert.equal(customerWithoutContact.statusCode, 400);
  assert.equal(customerWithoutContact.json().error.code, "VALIDATION_ERROR");

  const emailOnlyCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      email: `${uniqueToken("cliente.email")}@gt3.local`,
      name: "Cliente Somente Email API",
      origin: "qa-email",
    },
  });
  assert.equal(emailOnlyCustomer.statusCode, 201);
  assert.equal(emailOnlyCustomer.json().data.phone, null);

  const document = uniqueToken("QA-DOC");
  const createCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Cliente Contrato API",
      document,
      phone: "11999990000",
      birthDate: "1990-06-15",
      origin: "qa-api",
    },
  });
  assert.equal(createCustomer.statusCode, 201);
  assert.equal(createCustomer.json().data.name, "Cliente Contrato API");
  assert.ok(createCustomer.json().data.birthDate);

  const duplicatedCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Cliente Duplicado API",
      document,
      phone: "11999990001",
    },
  });
  assert.equal(duplicatedCustomer.statusCode, 409);
  assert.equal(duplicatedCustomer.json().error.code, "CONFLICT");

  const concurrentDocument = uniqueToken("QA-RACE");
  const concurrentCustomerPayload = {
    document: concurrentDocument,
    name: "Cliente Concorrente API",
    phone: "11999990002",
  };
  const concurrentCustomers = await Promise.all([
    app.inject({
      method: "POST",
      url: "/customers",
      headers: {
        authorization: `Bearer ${ownerBody.token}`,
      },
      payload: concurrentCustomerPayload,
    }),
    app.inject({
      method: "POST",
      url: "/customers",
      headers: {
        authorization: `Bearer ${ownerBody.token}`,
      },
      payload: concurrentCustomerPayload,
    }),
  ]);
  assert.deepEqual(
    concurrentCustomers.map((response) => response.statusCode).sort(),
    [201, 409],
  );
  const concurrentCustomerCount = await prisma.customer.count({
    where: {
      storeId: ownerBody.user.storeId,
      document: concurrentDocument,
      deletedAt: null,
    },
  });
  assert.equal(concurrentCustomerCount, 1);

  const listCustomers = await app.inject({
    method: "GET",
    url: "/customers?page=1&page_size=5&search=Contrato",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomers.statusCode, 200);
  const customersBody = listCustomers.json() as { items: Array<{ name: string }>; page: number; pageSize: number; total: number };
  assert.equal(customersBody.page, 1);
  assert.equal(customersBody.pageSize, 5);
  assert.ok(customersBody.total >= 1);
  assert.ok(customersBody.items.some((customer) => customer.name === "Cliente Contrato API"));

  const listCustomersByOrigin = await app.inject({
    method: "GET",
    url: "/customers?page=1&page_size=5&origin=qa-api",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomersByOrigin.statusCode, 200);
  assert.ok(listCustomersByOrigin.json().items.every((customer: { origin: string }) => customer.origin === "qa-api"));

  const listCustomersByBirthMonth = await app.inject({
    method: "GET",
    url: "/customers?page=1&page_size=5&birth_month=6",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomersByBirthMonth.statusCode, 200);
  assert.ok(listCustomersByBirthMonth.json().items.some((customer: { id: string }) => customer.id === createCustomer.json().data.id));

  const createdCustomerId = createCustomer.json().data.id as string;

  const getCustomer = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getCustomer.statusCode, 200);
  assert.equal(getCustomer.json().data.document, document);

  const updateCustomer = await app.inject({
    method: "PATCH",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      email: "cliente.contrato.api@gt3.local",
      notes: "Atualizado pelo contrato de API.",
    },
  });
  assert.equal(updateCustomer.statusCode, 200);
  assert.equal(updateCustomer.json().data.email, "cliente.contrato.api@gt3.local");

  const customerUpdateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=customers&action=update&entity_type=customer&entity_id=${createdCustomerId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerUpdateAudit.statusCode, 200);
  const customerUpdateLog = customerUpdateAudit.json().items.find((log: { metadata: { changedFields?: string[] } | null }) =>
    log.metadata?.changedFields?.includes("email"),
  );
  assert.ok(customerUpdateLog);
  assert.ok(customerUpdateLog.metadata.changes.some((change: { field: string; newValue: string }) => change.field === "email" && change.newValue === "cl***@gt3.local"));

  const serviceToken = uniqueToken("QA");
  const createProvider = await app.inject({
    method: "POST",
    url: "/services/providers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      accessLogin: `qa.${serviceToken.toLowerCase()}`,
      accessSecretRef: `vault://qa/${serviceToken}`,
      accessUrl: "https://prestador.qa.local",
      contactName: "Contato QA",
      name: `Prestador ${serviceToken}`,
      phone: "11988887777",
      serviceTypes: ["PPF", "Polimento"],
    },
  });
  assert.equal(createProvider.statusCode, 201);
  assert.equal(createProvider.json().data.name, `Prestador ${serviceToken}`);

  const listProviders = await app.inject({
    method: "GET",
    url: "/services/providers?page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listProviders.statusCode, 200);
  assert.ok(listProviders.json().items.some((provider: { name: string; hasSecret: boolean }) => provider.name === `Prestador ${serviceToken}` && provider.hasSecret));

  const postSaleCatalogName = `Servico ${serviceToken}`;
  const postSaleCatalogCategory = `QA-${serviceToken}`;
  const createCatalogItem = await app.inject({
    method: "POST",
    url: "/services/catalog",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      basePrice: 990,
      category: postSaleCatalogCategory,
      name: postSaleCatalogName,
      slaHours: 4,
    },
  });
  assert.equal(createCatalogItem.statusCode, 201);
  assert.equal(createCatalogItem.json().data.basePrice, "990");

  const listCatalog = await app.inject({
    method: "GET",
    url: `/services/catalog?page=1&page_size=100&category=${encodeURIComponent(postSaleCatalogCategory)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCatalog.statusCode, 200);
  assert.ok(listCatalog.json().items.some((item: { name: string }) => item.name === postSaleCatalogName));

  const createPostSaleCustomer = await app.inject({
    method: "POST",
    url: "/services/post-sale/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      email: "cliente.posvenda.qa@gt3.local",
      name: `Cliente Pos-venda ${serviceToken}`,
      phone: "11977776666",
      recurrenceStatus: "Retorno QA",
      totalRevenue: 1234,
      vehicleInfo: "Veiculo QA",
    },
  });
  assert.equal(createPostSaleCustomer.statusCode, 201);
  assert.equal(createPostSaleCustomer.json().data.customerId, createdCustomerId);
  const postSaleCustomerId = createPostSaleCustomer.json().data.id as string;

  const listPostSaleCustomers = await app.inject({
    method: "GET",
    url: "/services/post-sale/customers?page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listPostSaleCustomers.statusCode, 200);
  assert.ok(listPostSaleCustomers.json().items.some((customer: { id: string }) => customer.id === postSaleCustomerId));

  const createPostSaleOrder = await app.inject({
    method: "POST",
    url: "/services/orders",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      postSaleCustomerId,
      providerId: createProvider.json().data.id,
      status: "SCHEDULED",
      totalAmount: 990,
      type: postSaleCatalogName,
    },
  });
  assert.equal(createPostSaleOrder.statusCode, 201);
  assert.equal(createPostSaleOrder.json().data.postSaleCustomerId, postSaleCustomerId);
  assert.equal(createPostSaleOrder.json().data.totalAmount, "990");
  checkpoint("customers/services-base");

  const unauthenticatedLeads = await app.inject({
    method: "GET",
    url: "/leads",
  });
  assert.equal(unauthenticatedLeads.statusCode, 401);
  assert.equal(unauthenticatedLeads.json().error.code, "UNAUTHENTICATED");

  const invalidLead = await app.inject({
    method: "POST",
    url: "/leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      title: "A",
    },
  });
  assert.equal(invalidLead.statusCode, 400);
  assert.equal(invalidLead.json().error.code, "VALIDATION_ERROR");

  const leadSearchToken = uniqueToken("Civic");
  const createLead = await app.inject({
    method: "POST",
    url: "/leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      title: `Interesse ${leadSearchToken} Touring`,
      source: "site",
      interest: `Honda ${leadSearchToken} Touring 2021`,
      temperature: 82,
    },
  });
  assert.equal(createLead.statusCode, 201);
  assert.equal(createLead.json().data.customerId, createdCustomerId);
  assert.equal(createLead.json().data.status, "NEW");
  const createdLeadId = createLead.json().data.id as string;

  const createdLeadCard = await prisma.leadCard.findFirst({
    where: {
      leadId: createdLeadId,
      boardKey: "leads",
    },
  });
  assert.ok(createdLeadCard);

  const leadCardCreateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=create&entity_type=lead_card&entity_id=${createdLeadCard.id}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(leadCardCreateAudit.statusCode, 200);
  assert.ok(
    leadCardCreateAudit
      .json()
      .items.some(
        (log: { metadata: { leadId?: string; boardKey?: string; stageKey?: string; position?: number } }) =>
          log.metadata.leadId === createdLeadId &&
          log.metadata.boardKey === "leads" &&
          log.metadata.stageKey === "NEW" &&
          log.metadata.position === 0,
      ),
  );

  const listLeads = await app.inject({
    method: "GET",
    url: `/leads?page=1&page_size=5&search=${encodeURIComponent(leadSearchToken)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listLeads.statusCode, 200);
  assert.ok(listLeads.json().items.some((lead: { id: string }) => lead.id === createdLeadId));

  const getLead = await app.inject({
    method: "GET",
    url: `/leads/${createdLeadId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getLead.statusCode, 200);
  assert.equal(getLead.json().data.interest, `Honda ${leadSearchToken} Touring 2021`);

  const customerWithPrimaryInterest = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerWithPrimaryInterest.statusCode, 200);
  assert.equal(customerWithPrimaryInterest.json().data.primaryInterest, `Honda ${leadSearchToken} Touring 2021`);

  const listCustomerPrimaryInterest = await app.inject({
    method: "GET",
    url: `/customers?page=1&page_size=5&search=${encodeURIComponent("Cliente Contrato API")}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomerPrimaryInterest.statusCode, 200);
  assert.ok(
    listCustomerPrimaryInterest
      .json()
      .items.some(
        (customer: { id: string; primaryInterest: string | null }) =>
          customer.id === createdCustomerId && customer.primaryInterest === `Honda ${leadSearchToken} Touring 2021`,
      ),
  );

  const updateLead = await app.inject({
    method: "PATCH",
    url: `/leads/${createdLeadId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      temperature: 91,
      nextActionAt: "2026-06-08T13:00:00.000Z",
    },
  });
  assert.equal(updateLead.statusCode, 200);
  assert.equal(updateLead.json().data.temperature, 91);
  assert.equal(updateLead.json().data.nextActionAt, "2026-06-08T13:00:00.000Z");

  const moveLeadStage = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/stage`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      toStage: "CONTACTED",
      reason: "Primeiro contato realizado em QA",
      position: 2,
    },
  });
  assert.equal(moveLeadStage.statusCode, 200);
  assert.equal(moveLeadStage.json().data.status, "CONTACTED");
  assert.equal(moveLeadStage.json().unchanged, false);

  const leadCardMoveAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=pipeline_moved&entity_type=lead_card&entity_id=${createdLeadCard.id}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(leadCardMoveAudit.statusCode, 200);
  assert.ok(
    leadCardMoveAudit
      .json()
      .items.some(
        (log: {
          metadata: {
            leadId?: string;
            fromStage?: string;
            toStage?: string;
            fromPosition?: number | null;
            toPosition?: number;
            reason?: string | null;
          };
        }) =>
          log.metadata.leadId === createdLeadId &&
          log.metadata.fromStage === "NEW" &&
          log.metadata.toStage === "CONTACTED" &&
          log.metadata.fromPosition === 0 &&
          log.metadata.toPosition === 2 &&
          log.metadata.reason === "Primeiro contato realizado em QA",
      ),
  );

  const moveLeadToLostWithoutReason = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/stage`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      toStage: "LOST",
    },
  });
  assert.equal(moveLeadToLostWithoutReason.statusCode, 400);

  const moveLeadToLostWithReason = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/stage`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      toStage: "LOST",
      reason: "Cliente informou que comprou em outra loja",
    },
  });
  assert.equal(moveLeadToLostWithReason.statusCode, 200);
  assert.equal(moveLeadToLostWithReason.json().data.status, "LOST");

  const leadStageHistory = await prisma.leadStageHistory.findFirst({
    where: {
      leadId: createdLeadId,
      fromStage: "NEW",
      toStage: "CONTACTED",
    },
  });
  assert.ok(leadStageHistory);

  const lostLeadStageHistory = await prisma.leadStageHistory.findFirst({
    where: {
      leadId: createdLeadId,
      fromStage: "CONTACTED",
      toStage: "LOST",
      reason: "Cliente informou que comprou em outra loja",
    },
  });
  assert.ok(lostLeadStageHistory);

  const defaultLeadOutcomeReasons = await app.inject({
    method: "GET",
    url: "/leads/outcome-reasons",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(defaultLeadOutcomeReasons.statusCode, 200);
  assert.ok(
    defaultLeadOutcomeReasons
      .json()
      .items.some((item: { stage: string; reasons: string[] }) => item.stage === "LOST" && item.reasons.length > 0),
  );

  const configuredLostReason = `QA perda ${leadSearchToken}`;
  const createLeadOutcomeReason = await app.inject({
    method: "POST",
    url: "/settings/categories",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      domain: "lead_outcome_reason",
      metadata: { stage: "LOST" },
      name: configuredLostReason,
      status: "ACTIVE",
    },
  });
  assert.equal(createLeadOutcomeReason.statusCode, 201);

  const configuredLeadOutcomeReasons = await app.inject({
    method: "GET",
    url: "/leads/outcome-reasons",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(configuredLeadOutcomeReasons.statusCode, 200);
  assert.ok(
    configuredLeadOutcomeReasons
      .json()
      .items.some((item: { stage: string; reasons: string[] }) => item.stage === "LOST" && item.reasons.includes(configuredLostReason)),
  );

  const followUpDueAtDate = new Date(Date.now() + 2 * 86400000 + uniqueCounter * 60000);
  const followUpDueAt = followUpDueAtDate.toISOString();
  const followUpWindow = dateWindowAround(followUpDueAtDate);
  const scheduleLeadFollowUp = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/follow-ups`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      dueAt: followUpDueAt,
      notes: "Retomar proposta comercial em QA",
      type: "Retorno WhatsApp",
    },
  });
  assert.equal(scheduleLeadFollowUp.statusCode, 201);
  assert.equal(scheduleLeadFollowUp.json().data.nextActionAt, followUpDueAt);
  assert.equal(scheduleLeadFollowUp.json().followUp.type, "Retorno WhatsApp");

  const createdFollowUp = scheduleLeadFollowUp.json().followUp as { id: string };

  const listLeadFollowUps = await app.inject({
    method: "GET",
    url: `/leads/follow-ups?from=${encodeURIComponent(followUpWindow.from)}&to=${encodeURIComponent(followUpWindow.to)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listLeadFollowUps.statusCode, 200);
  assert.ok(
    listLeadFollowUps
      .json()
      .items.some((followUp: { id: string; lead: { id: string } | null }) => followUp.id === createdFollowUp.id && followUp.lead?.id === createdLeadId),
  );

  const completeLeadFollowUp = await app.inject({
    method: "POST",
    url: `/leads/follow-ups/${createdFollowUp.id}/complete`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      notes: "Follow-up concluido em QA",
    },
  });
  assert.equal(completeLeadFollowUp.statusCode, 200);
  assert.ok(completeLeadFollowUp.json().data.completedAt);
  assert.equal(completeLeadFollowUp.json().data.notes, "Follow-up concluido em QA");
  assert.equal(completeLeadFollowUp.json().unchanged, false);

  const listPendingFollowUpsAfterComplete = await app.inject({
    method: "GET",
    url: `/leads/follow-ups?from=${encodeURIComponent(followUpWindow.from)}&to=${encodeURIComponent(followUpWindow.to)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listPendingFollowUpsAfterComplete.statusCode, 200);
  assert.ok(!listPendingFollowUpsAfterComplete.json().items.some((followUp: { id: string }) => followUp.id === createdFollowUp.id));

  const listCompletedLeadFollowUps = await app.inject({
    method: "GET",
    url: `/leads/follow-ups?include_completed=true&page_size=100&from=${encodeURIComponent(followUpWindow.from)}&to=${encodeURIComponent(followUpWindow.to)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCompletedLeadFollowUps.statusCode, 200);
  assert.ok(
    listCompletedLeadFollowUps
      .json()
      .items.some((followUp: { id: string; completedAt: string | null }) => followUp.id === createdFollowUp.id && followUp.completedAt),
  );

  const convertibleFollowUpDueAtDate = new Date(followUpDueAtDate.getTime() + 3600000);
  const convertibleFollowUpDueAt = convertibleFollowUpDueAtDate.toISOString();
  const scheduleConvertibleFollowUp = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/follow-ups`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      dueAt: convertibleFollowUpDueAt,
      notes: "Converter follow-up em visita na loja",
      type: "Confirmar visita",
    },
  });
  assert.equal(scheduleConvertibleFollowUp.statusCode, 201);
  const convertibleFollowUpId = scheduleConvertibleFollowUp.json().followUp.id as string;

  const convertFollowUpToAppointment = await app.inject({
    method: "POST",
    url: `/leads/follow-ups/${convertibleFollowUpId}/appointment`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      endsAt: new Date(convertibleFollowUpDueAtDate.getTime() + 3600000).toISOString(),
      notes: "Cliente confirmou visita presencial",
      startsAt: convertibleFollowUpDueAt,
      title: "Visita convertida de follow-up",
      type: "Visita loja",
    },
  });
  assert.equal(convertFollowUpToAppointment.statusCode, 201);
  assert.equal(convertFollowUpToAppointment.json().appointment.leadId, createdLeadId);
  assert.equal(convertFollowUpToAppointment.json().appointment.startsAt, convertibleFollowUpDueAt);
  assert.ok(convertFollowUpToAppointment.json().followUp.completedAt);

  const convertedFollowUp = await prisma.followUp.findUniqueOrThrow({
    where: { id: convertibleFollowUpId },
  });
  assert.ok(convertedFollowUp.completedAt);

  const convertedAppointment = await prisma.appointment.findFirst({
    where: {
      leadId: createdLeadId,
      title: "Visita convertida de follow-up",
    },
  });
  assert.ok(convertedAppointment);

  const customerHistoryAfterFollowUpAppointment = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}/history`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerHistoryAfterFollowUpAppointment.statusCode, 200);
  assert.ok(
    customerHistoryAfterFollowUpAppointment
      .json()
      .appointments.some(
        (appointment: { id: string; leadId: string | null; origin: string }) =>
          appointment.id === convertedAppointment.id && appointment.leadId === createdLeadId && appointment.origin === "follow_up",
      ),
  );
  assert.ok(
    customerHistoryAfterFollowUpAppointment
      .json()
      .timeline.some(
        (item: { entityId: string; kind: string; description: string }) =>
          item.entityId === convertedAppointment.id && item.kind === "appointment" && item.description.includes("Origem follow-up"),
      ),
  );

  const leadHistory = await app.inject({
    method: "GET",
    url: `/leads/${createdLeadId}/history`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(leadHistory.statusCode, 200);
  assert.equal(leadHistory.json().lead.id, createdLeadId);
  assert.ok(
    leadHistory
      .json()
      .stageHistory.some((item: { fromStage: string; toStage: string }) => item.fromStage === "CONTACTED" && item.toStage === "LOST"),
  );
  assert.ok(leadHistory.json().followUps.some((followUp: { id: string }) => followUp.id === createdFollowUp.id));
  assert.ok(leadHistory.json().appointments.some((appointment: { id: string }) => appointment.id === convertedAppointment.id));
  assert.ok(leadHistory.json().events.some((event: { action: string }) => event.action === "follow_up_scheduled"));
  checkpoint("leads/follow-ups");

  const appraiserLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "avaliador@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(appraiserLogin.statusCode, 200);
  const appraiserToken = appraiserLogin.json().token as string;

  const appraiserCommunications = await app.inject({
    method: "GET",
    url: "/communications/threads",
    headers: {
      authorization: `Bearer ${appraiserToken}`,
    },
  });
  assert.equal(appraiserCommunications.statusCode, 403);
  assert.equal(appraiserCommunications.json().error.code, "FORBIDDEN");

  const createCommunicationChannel = await app.inject({
    method: "POST",
    url: "/communications/channels",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      type: "whatsapp",
      name: uniqueToken("WhatsApp QA"),
      settings: {
        defaultSender: "5511999999999",
      },
    },
  });
  assert.equal(createCommunicationChannel.statusCode, 201);
  assert.equal(createCommunicationChannel.json().data.type, "whatsapp");
  const communicationChannelId = createCommunicationChannel.json().data.id as string;

  const createWhatsappInstance = await app.inject({
    method: "POST",
    url: "/communications/whatsapp-instances",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Instancia QA",
      instanceKey: uniqueToken("whatsapp-qa"),
      settings: {
        provider: "dev",
      },
    },
  });
  assert.equal(createWhatsappInstance.statusCode, 201);
  assert.equal(createWhatsappInstance.json().data.status, "ACTIVE");

  const createEmailAccount = await app.inject({
    method: "POST",
    url: "/communications/email-accounts",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      email: `${uniqueToken("qa")}@gt3.local`,
      name: "Atendimento QA",
      settings: {
        provider: "smtp-dev",
      },
    },
  });
  assert.equal(createEmailAccount.statusCode, 201);
  assert.equal(createEmailAccount.json().data.status, "ACTIVE");

  const createThread = await app.inject({
    method: "POST",
    url: "/communications/threads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      leadId: createdLeadId,
      channelId: communicationChannelId,
      subject: "Atendimento Civic QA",
      status: "OPEN",
    },
  });
  assert.equal(createThread.statusCode, 201);
  assert.equal(createThread.json().data.customerId, createdCustomerId);
  const threadId = createThread.json().data.id as string;

  const receiveMessage = await app.inject({
    method: "POST",
    url: `/communications/threads/${threadId}/messages`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      direction: "INBOUND",
      sender: "5511988887777",
      recipient: "5511999999999",
      body: "Tenho interesse no Civic.",
      receivedAt: "2026-06-06T10:30:00.000Z",
      metadata: {
        externalId: "msg-in-qa",
      },
    },
  });
  assert.equal(receiveMessage.statusCode, 201);
  assert.equal(receiveMessage.json().data.direction, "INBOUND");

  const sendMessage = await app.inject({
    method: "POST",
    url: `/communications/threads/${threadId}/messages`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      direction: "OUTBOUND",
      sender: "5511999999999",
      recipient: "5511988887777",
      body: "Perfeito, vamos agendar uma visita.",
      sentAt: "2026-06-06T10:35:00.000Z",
    },
  });
  assert.equal(sendMessage.statusCode, 201);
  assert.equal(sendMessage.json().data.direction, "OUTBOUND");

  const blockedTrackerMessage = await app.inject({
    method: "POST",
    url: `/communications/threads/${threadId}/messages`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      direction: "INBOUND",
      sender: "5511988887777",
      recipient: "5511999999999",
      body: '<img src="https://tracker.example/pixel.png" width="1" height="1">',
    },
  });
  assert.equal(blockedTrackerMessage.statusCode, 400);
  assert.equal(blockedTrackerMessage.json().error.code, "VALIDATION_ERROR");

  const sendEmail = await app.inject({
    method: "POST",
    url: "/communications/emails",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      threadId,
      direction: "OUTBOUND",
      subject: "Proposta Civic QA",
      fromAddress: "atendimento@gt3.local",
      toAddresses: ["cliente.contrato.api@gt3.local"],
      body: "Segue proposta do Civic para avaliacao.",
    },
  });
  assert.equal(sendEmail.statusCode, 201);
  assert.equal(sendEmail.json().data.threadId, threadId);

  const setChannelPreference = await app.inject({
    method: "POST",
    url: "/communications/preferences",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      channel: "whatsapp",
      allowed: true,
    },
  });
  assert.equal(setChannelPreference.statusCode, 201);
  assert.equal(setChannelPreference.json().data.allowed, true);

  const getThread = await app.inject({
    method: "GET",
    url: `/communications/threads/${threadId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getThread.statusCode, 200);
  assert.equal(getThread.json().messages.length, 2);
  assert.equal(getThread.json().emails.length, 1);

  const appraiserAi = await app.inject({
    method: "GET",
    url: "/ai/suggestions",
    headers: {
      authorization: `Bearer ${appraiserToken}`,
    },
  });
  assert.equal(appraiserAi.statusCode, 403);
  assert.equal(appraiserAi.json().error.code, "FORBIDDEN");

  const createAiQueryLog = await app.inject({
    method: "POST",
    url: "/ai/query-logs",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      purpose: "lead_followup_copy",
      model: "dev-local",
      inputTokens: 120,
      outputTokens: 45,
      costCents: 2,
      entityType: "lead",
      entityId: createdLeadId,
    },
  });
  assert.equal(createAiQueryLog.statusCode, 201);
  assert.equal(createAiQueryLog.json().data.purpose, "lead_followup_copy");

  const createAiSuggestion = await app.inject({
    method: "POST",
    url: "/ai/suggestions",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      purpose: "lead_followup_copy",
      entityType: "lead",
      entityId: createdLeadId,
      status: "SUCCEEDED",
      content: {
        message: "Ola! Posso te enviar mais detalhes do Civic Touring?",
        confidence: 0.91,
      },
    },
  });
  assert.equal(createAiSuggestion.statusCode, 201);
  assert.equal(createAiSuggestion.json().data.entityId, createdLeadId);
  const aiSuggestionId = createAiSuggestion.json().data.id as string;

  const listAiSuggestions = await app.inject({
    method: "GET",
    url: `/ai/suggestions?entity_type=lead&entity_id=${createdLeadId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listAiSuggestions.statusCode, 200);
  assert.ok(listAiSuggestions.json().items.some((suggestion: { id: string }) => suggestion.id === aiSuggestionId));

  const updateAiSuggestionStatus = await app.inject({
    method: "POST",
    url: `/ai/suggestions/${aiSuggestionId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "NEEDS_HUMAN",
      reason: "Revisao humana solicitada em QA",
    },
  });
  assert.equal(updateAiSuggestionStatus.statusCode, 200);
  assert.equal(updateAiSuggestionStatus.json().data.status, "NEEDS_HUMAN");

  const addAiFeedback = await app.inject({
    method: "POST",
    url: `/ai/suggestions/${aiSuggestionId}/feedback`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      feedback: "useful",
      metadata: {
        edited: true,
      },
    },
  });
  assert.equal(addAiFeedback.statusCode, 201);
  assert.equal(addAiFeedback.json().data.feedback, "useful");

  const getAiSuggestion = await app.inject({
    method: "GET",
    url: `/ai/suggestions/${aiSuggestionId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getAiSuggestion.statusCode, 200);
  assert.equal(getAiSuggestion.json().feedback.length, 1);
  checkpoint("communication/ai");

  const unauthenticatedAppointments = await app.inject({
    method: "GET",
    url: "/appointments",
  });
  assert.equal(unauthenticatedAppointments.statusCode, 401);
  assert.equal(unauthenticatedAppointments.json().error.code, "UNAUTHENTICATED");

  const invalidAppointment = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      type: "visita",
      title: "A",
      startsAt: "2026-06-08T14:00:00.000Z",
      endsAt: "2026-06-08T13:00:00.000Z",
    },
  });
  assert.equal(invalidAppointment.statusCode, 400);
  assert.equal(invalidAppointment.json().error.code, "VALIDATION_ERROR");

  const createAppointment = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      leadId: createdLeadId,
      type: "test_drive",
      title: "Test drive Civic Touring",
      startsAt: "2026-06-08T14:00:00.000Z",
      endsAt: "2026-06-08T15:00:00.000Z",
      notes: "Cliente quer avaliar financiamento depois do test drive.",
    },
  });
  assert.equal(createAppointment.statusCode, 201);
  assert.equal(createAppointment.json().data.leadId, createdLeadId);
  assert.equal(createAppointment.json().data.status, "SCHEDULED");
  const createdAppointmentId = createAppointment.json().data.id as string;

  const listAppointments = await app.inject({
    method: "GET",
    url: "/appointments?page=1&page_size=5&status=SCHEDULED",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listAppointments.statusCode, 200);
  assert.ok(listAppointments.json().items.some((appointment: { id: string }) => appointment.id === createdAppointmentId));

  const getAppointment = await app.inject({
    method: "GET",
    url: `/appointments/${createdAppointmentId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getAppointment.statusCode, 200);
  assert.equal(getAppointment.json().data.title, "Test drive Civic Touring");

  const updateAppointment = await app.inject({
    method: "PATCH",
    url: `/appointments/${createdAppointmentId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      startsAt: "2026-06-08T16:00:00.000Z",
      endsAt: "2026-06-08T17:00:00.000Z",
    },
  });
  assert.equal(updateAppointment.statusCode, 200);
  assert.equal(updateAppointment.json().data.startsAt, "2026-06-08T16:00:00.000Z");

  const confirmAppointment = await app.inject({
    method: "POST",
    url: `/appointments/${createdAppointmentId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "CONFIRMED",
      reason: "Cliente confirmou por WhatsApp",
    },
  });
  assert.equal(confirmAppointment.statusCode, 200);
  assert.equal(confirmAppointment.json().data.status, "CONFIRMED");

  const finishAppointment = await app.inject({
    method: "POST",
    url: `/appointments/${createdAppointmentId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "DONE",
      reason: "Visita concluida em QA",
    },
  });
  assert.equal(finishAppointment.statusCode, 200);
  assert.equal(finishAppointment.json().data.status, "DONE");

  const createCancellableAppointment = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      type: "ligacao",
      title: "Ligacao de confirmacao cancelavel",
      startsAt: "2026-06-09T14:00:00.000Z",
      notes: "Agenda criada para validar cancelamento no historico.",
    },
  });
  assert.equal(createCancellableAppointment.statusCode, 201);
  const cancellableAppointmentId = createCancellableAppointment.json().data.id as string;

  const cancelAppointment = await app.inject({
    method: "POST",
    url: `/appointments/${cancellableAppointmentId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "CANCELLED",
      reason: "Cliente pediu para cancelar a ligacao.",
    },
  });
  assert.equal(cancelAppointment.statusCode, 200);
  assert.equal(cancelAppointment.json().data.status, "CANCELLED");

  const listCustomersByVisit = await app.inject({
    method: "GET",
    url: "/customers?page=1&page_size=5&visit_done=true",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomersByVisit.statusCode, 200);
  assert.ok(listCustomersByVisit.json().items.some((customer: { id: string }) => customer.id === createdCustomerId));

  const unauthenticatedInventory = await app.inject({
    method: "GET",
    url: "/inventory",
  });
  assert.equal(unauthenticatedInventory.statusCode, 401);
  assert.equal(unauthenticatedInventory.json().error.code, "UNAUTHENTICATED");

  const sellerInventoryLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "vendedor@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(sellerInventoryLogin.statusCode, 200);
  const sellerInventoryLoginBody = sellerInventoryLogin.json() as { token: string; user: { id: string } };
  const sellerInventoryToken = sellerInventoryLoginBody.token;
  const sellerUserId = sellerInventoryLoginBody.user.id;

  const sellerInventoryCreate = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      vehicle: {
        brand: "Honda",
        model: "Civic",
        yearModel: 2023,
        plate: uniquePlate("SV"),
      },
      ownershipType: "OWN",
      askingPrice: 125000,
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(sellerInventoryCreate.statusCode, 201);
  assert.equal(sellerInventoryCreate.json().data.purchaseCost, null);
  assert.equal(sellerInventoryCreate.json().data.askingPrice, "125000");

  const sellerInventoryCreateWithCost = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      vehicle: {
        brand: "Honda",
        model: "Fit",
        yearModel: 2022,
        plate: uniquePlate("SC"),
      },
      ownershipType: "OWN",
      askingPrice: 89000,
      purchaseCost: 76000,
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(sellerInventoryCreateWithCost.statusCode, 403);
  assert.equal(sellerInventoryCreateWithCost.json().error.code, "FORBIDDEN");

  const invalidInventoryVehicle = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Honda",
        model: "Civic",
        plate: "INVALIDA",
      },
      ownershipType: "OWN",
      status: "IN_PREPARATION",
    },
  });
  assert.equal(invalidInventoryVehicle.statusCode, 400);
  assert.equal(invalidInventoryVehicle.json().error.code, "VALIDATION_ERROR");

  const invalidConsignedInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Volkswagen",
        model: "T-Cross",
        yearModel: 2022,
        plate: uniquePlate("CS"),
      },
      ownershipType: "CONSIGNED",
      status: "IN_PREPARATION",
      askingPrice: 118000,
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(invalidConsignedInventory.statusCode, 400);
  assert.equal(invalidConsignedInventory.json().error.code, "VALIDATION_ERROR");

  const inventoryPlate = uniquePlate("QA");
  const createInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Honda",
        model: "Civic",
        version: "Touring",
        yearModel: 2099,
        yearBuild: 2020,
        plate: inventoryPlate,
        color: "Prata",
        mileage: 42000,
        relevantOptions: "Teto solar, multimidia e bancos em couro",
      },
      ownershipType: "OWN",
      status: "IN_PREPARATION",
      responsibleUserId: sellerUserId,
      stockLocation: "Patio QA",
      stockOrigin: "Compra direta QA",
      purchaseCost: 101000,
      askingPrice: 124900,
      entryDate: "2026-06-06T12:00:00.000Z",
      notes: "Entrada criada pelo contrato de API.",
    },
  });
  assert.equal(createInventory.statusCode, 201);
  assert.equal(createInventory.json().data.vehicle.plate, inventoryPlate);
  assert.equal(createInventory.json().data.vehicle.relevantOptions, "Teto solar, multimidia e bancos em couro");
  assert.equal(createInventory.json().data.responsibleUserId, sellerUserId);
  assert.equal(createInventory.json().data.stockLocation, "Patio QA");
  assert.equal(createInventory.json().data.stockOrigin, "Compra direta QA");
  assert.equal(createInventory.json().data.purchaseCost, "101000");
  const inventoryId = createInventory.json().data.id as string;
  const inventoryVehicleId = createInventory.json().data.vehicle.id as string;

  const vehicleCreateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=inventory&action=create&entity_type=vehicle&entity_id=${inventoryVehicleId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(vehicleCreateAudit.statusCode, 200);
  assert.ok(
    vehicleCreateAudit
      .json()
      .items.some((log: { metadata: { inventoryId?: string; plate?: string } }) => log.metadata.inventoryId === inventoryId && log.metadata.plate === inventoryPlate),
  );

  const createVehicleInterestLead = await app.inject({
    method: "POST",
    url: "/leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      title: "Interesse em veiculo do estoque QA",
      source: "showroom",
      interest: "Honda Civic Touring em estoque",
      vehicleId: inventoryVehicleId,
    },
  });
  assert.equal(createVehicleInterestLead.statusCode, 201);
  assert.equal(createVehicleInterestLead.json().data.vehicleId, inventoryVehicleId);
  assert.equal(createVehicleInterestLead.json().data.vehicle.brand, "Honda");
  assert.equal(createVehicleInterestLead.json().data.vehicle.model, "Civic");

  const createMinimalLeadWithVehicle = await app.inject({
    method: "POST",
    url: "/customers/minimal-leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      email: `lead.veiculo.${leadSearchToken.toLowerCase()}@gt3.local`,
      interest: "Honda Civic Touring em estoque",
      name: `Lead Minimo Veiculo ${leadSearchToken}`,
      origin: "Loja",
      vehicleId: inventoryVehicleId,
    },
  });
  assert.equal(createMinimalLeadWithVehicle.statusCode, 201);
  assert.equal(createMinimalLeadWithVehicle.json().data.lead.vehicleId, inventoryVehicleId);
  const minimalLeadWithVehicleId = createMinimalLeadWithVehicle.json().data.lead.id as string;
  const minimalLeadWithVehicleCard = await prisma.leadCard.findFirst({
    where: {
      leadId: minimalLeadWithVehicleId,
      boardKey: "leads",
    },
  });
  assert.ok(minimalLeadWithVehicleCard);

  const minimalLeadCardAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=create&entity_type=lead_card&entity_id=${minimalLeadWithVehicleCard.id}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(minimalLeadCardAudit.statusCode, 200);
  assert.ok(
    minimalLeadCardAudit
      .json()
      .items.some(
        (log: { metadata: { leadId?: string; vehicleId?: string | null; boardKey?: string; stageKey?: string } }) =>
          log.metadata.leadId === minimalLeadWithVehicleId &&
          log.metadata.vehicleId === inventoryVehicleId &&
          log.metadata.boardKey === "leads" &&
          log.metadata.stageKey === "NEW",
      ),
  );

  const prepareVehiclePrimaryPhoto = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "listing-media",
      originalName: "Foto Principal Civic.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4096,
      classification: "vehicle_primary_photo",
      link: {
        entityType: "vehicle",
        entityId: inventoryVehicleId,
        purpose: "primary_photo",
      },
    },
  });
  assert.equal(prepareVehiclePrimaryPhoto.statusCode, 201);
  const primaryPhotoAttachmentId = prepareVehiclePrimaryPhoto.json().data.id as string;

  const vehicleDocumentAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=documents&action=document_attached&entity_type=vehicle&entity_id=${inventoryVehicleId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(vehicleDocumentAudit.statusCode, 200);
  assert.ok(
    vehicleDocumentAudit
      .json()
      .items.some(
        (log: { metadata: { attachmentId?: string; classification?: string | null; purpose?: string | null } }) =>
          log.metadata.attachmentId === primaryPhotoAttachmentId &&
          log.metadata.classification === "vehicle_primary_photo" &&
          log.metadata.purpose === "primary_photo",
      ),
  );

  const updatePrimaryPhoto = await app.inject({
    method: "PATCH",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        primaryPhotoAttachmentId,
      },
    },
  });
  assert.equal(updatePrimaryPhoto.statusCode, 200);
  assert.equal(updatePrimaryPhoto.json().data.vehicle.primaryPhotoAttachmentId, primaryPhotoAttachmentId);
  assert.equal(updatePrimaryPhoto.json().data.vehicle.hasPrimaryPhoto, true);

  const consignedPlate = uniquePlate("CS");
  const createConsignedInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Volkswagen",
        model: "T-Cross",
        version: "Highline",
        yearModel: 2022,
        plate: consignedPlate,
        color: "Branco",
        mileage: 22000,
      },
      ownershipType: "CONSIGNED",
      status: "IN_PREPARATION",
      ownerCustomerId: createdCustomerId,
      purchaseCost: 102000,
      askingPrice: 119900,
      entryDate: "2026-06-06T12:00:00.000Z",
      notes: "Consignado com valor acordado em QA.",
    },
  });
  assert.equal(createConsignedInventory.statusCode, 201);
  assert.equal(createConsignedInventory.json().data.ownerCustomerId, createdCustomerId);
  assert.equal(createConsignedInventory.json().data.purchaseCost, "102000");
  const consignedInventoryId = createConsignedInventory.json().data.id as string;

  const prepareConsignedContract = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "vehicle-documents",
      originalName: "Contrato Consignacao T-Cross.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      classification: "consignment_contract",
      link: {
        entityType: "vehicle_inventory",
        entityId: consignedInventoryId,
        purpose: "consignment_contract",
      },
    },
  });
  assert.equal(prepareConsignedContract.statusCode, 201);
  const consignedContractAttachmentId = prepareConsignedContract.json().data.id as string;

  const inventoryDocumentAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=documents&action=document_attached&entity_type=vehicle_inventory&entity_id=${consignedInventoryId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryDocumentAudit.statusCode, 200);
  assert.ok(
    inventoryDocumentAudit
      .json()
      .items.some(
        (log: { metadata: { attachmentId?: string; classification?: string | null; purpose?: string | null } }) =>
          log.metadata.attachmentId === consignedContractAttachmentId &&
          log.metadata.classification === "consignment_contract" &&
          log.metadata.purpose === "consignment_contract",
      ),
  );

  const consignedInventoryDetail = await app.inject({
    method: "GET",
    url: `/inventory/${consignedInventoryId}/detail`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(consignedInventoryDetail.statusCode, 200);
  assert.ok(
    consignedInventoryDetail
      .json()
      .documents.some(
        (document: { classification: string | null; entityType: string; purpose: string | null }) =>
          document.classification === "consignment_contract" &&
          document.entityType === "vehicle_inventory" &&
          document.purpose === "consignment_contract",
      ),
  );

  const changeOwnershipType = await app.inject({
    method: "PATCH",
    url: `/inventory/${consignedInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      ownershipType: "TRADE_IN",
    },
  });
  assert.equal(changeOwnershipType.statusCode, 200);
  assert.equal(changeOwnershipType.json().data.ownershipType, "TRADE_IN");

  const inventoryOwnershipAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=inventory&action=ownership_type_changed&entity_type=vehicle_inventory&entity_id=${consignedInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryOwnershipAudit.statusCode, 200);
  assert.ok(
    inventoryOwnershipAudit
      .json()
      .items.some(
        (log: { metadata: { fromOwnershipType?: string; toOwnershipType?: string } }) =>
          log.metadata.fromOwnershipType === "CONSIGNED" && log.metadata.toOwnershipType === "TRADE_IN",
      ),
  );

  const duplicateInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Honda",
        model: "Civic",
        yearModel: 2021,
        plate: inventoryPlate,
      },
      ownershipType: "OWN",
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(duplicateInventory.statusCode, 409);
  assert.equal(duplicateInventory.json().error.code, "CONFLICT");

  const removedInventoryPlate = uniquePlate("RM");
  const removedInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Renault",
        model: "Duster",
        yearModel: 2020,
        plate: removedInventoryPlate,
      },
      ownershipType: "OWN",
      status: "REMOVED",
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(removedInventory.statusCode, 201);
  const removedInventoryId = removedInventory.json().data.id as string;

  const soldDaysPlate = uniquePlate("SD");
  const createSoldDaysInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Fiat",
        model: "Pulse",
        yearModel: 2023,
        plate: soldDaysPlate,
      },
      ownershipType: "OWN",
      status: "AVAILABLE",
      entryDate: "2026-06-01T12:00:00.000Z",
      askingPrice: 89900,
    },
  });
  assert.equal(createSoldDaysInventory.statusCode, 201);
  const soldDaysInventoryId = createSoldDaysInventory.json().data.id as string;

  const closeSoldDaysInventory = await app.inject({
    method: "PATCH",
    url: `/inventory/${soldDaysInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SOLD",
      exitDate: "2026-06-11T12:00:00.000Z",
    },
  });
  assert.equal(closeSoldDaysInventory.statusCode, 200);
  assert.equal(closeSoldDaysInventory.json().data.daysInStock, 10);

  const listSoldDaysInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&status=SOLD&search=${encodeURIComponent(soldDaysPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listSoldDaysInventory.statusCode, 200);
  const soldDaysItem = listSoldDaysInventory.json().items.find((item: { id: string }) => item.id === soldDaysInventoryId);
  assert.ok(soldDaysItem);
  assert.equal(soldDaysItem.exitDate, "2026-06-11T12:00:00.000Z");
  assert.equal(soldDaysItem.daysInStock, 10);

  const pricePendingPlate = uniquePlate("PP");
  const createPricePendingInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Hyundai",
        model: "HB20",
        yearModel: 2024,
        plate: pricePendingPlate,
      },
      ownershipType: "OWN",
      status: "AVAILABLE",
      entryDate: "2026-06-06T12:00:00.000Z",
    },
  });
  assert.equal(createPricePendingInventory.statusCode, 201);
  const pricePendingInventoryId = createPricePendingInventory.json().data.id as string;

  const listPricePendingInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&has_pending=true&search=${encodeURIComponent(pricePendingPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listPricePendingInventory.statusCode, 200);
  const pricePendingItem = listPricePendingInventory.json().items.find((item: { id: string }) => item.id === pricePendingInventoryId);
  assert.ok(pricePendingItem);
  assert.equal(pricePendingItem.hasRelevantPending, true);
  assert.equal(pricePendingItem.pendingSummary, "Preco anunciado pendente");
  assert.equal(listPricePendingInventory.json().summary.relevantPending, 1);

  const listInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=5&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventory.statusCode, 200);
  const listedInventoryItem = listInventory.json().items.find((item: { id: string }) => item.id === inventoryId);
  assert.ok(listedInventoryItem);
  assert.equal(typeof listedInventoryItem.daysInStock, "number");
  assert.ok(listedInventoryItem.daysInStock >= 0);
  assert.equal(listedInventoryItem.hasRelevantPending, true);
  assert.equal(listedInventoryItem.pendingSummary, "Veiculo em preparacao");
  assert.equal(listedInventoryItem.vehicle.primaryPhotoAttachmentId, primaryPhotoAttachmentId);
  assert.equal(listedInventoryItem.vehicle.hasPrimaryPhoto, true);
  assert.ok(listInventory.json().summary.total >= 1);
  assert.ok(listInventory.json().summary.own >= 1);
  assert.equal(typeof listInventory.json().summary.ownPercent, "number");
  assert.equal(typeof listInventory.json().summary.byStatus.IN_PREPARATION, "number");
  assert.equal(typeof listInventory.json().summary.activeListings, "number");
  assert.equal(typeof listInventory.json().summary.activeServices, "number");
  assert.ok(listInventory.json().summary.relevantPending >= listInventory.json().summary.byStatus.IN_PREPARATION);

  const listInventoryByResponsible = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&responsible_user_id=${sellerUserId}&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByResponsible.statusCode, 200);
  assert.ok(listInventoryByResponsible.json().items.some((item: { id: string }) => item.id === inventoryId));

  const listInventoryByOriginLocation = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&stock_origin=${encodeURIComponent("compra direta")}&stock_location=${encodeURIComponent("patio")}&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByOriginLocation.statusCode, 200);
  assert.ok(listInventoryByOriginLocation.json().items.some((item: { id: string }) => item.id === inventoryId));

  const listInventoryWithPending = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&has_pending=true&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryWithPending.statusCode, 200);
  assert.ok(listInventoryWithPending.json().items.some((item: { id: string }) => item.id === inventoryId));

  const listInventoryByEntryPeriod = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&entry_date_from=2026-06-06T00:00:00.000Z&entry_date_to=2026-06-06T23:59:59.999Z&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByEntryPeriod.statusCode, 200);
  assert.ok(listInventoryByEntryPeriod.json().items.some((item: { id: string }) => item.id === inventoryId));

  const listInventoryOutsideEntryPeriod = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&entry_date_from=2026-06-07T00:00:00.000Z&entry_date_to=2026-06-07T23:59:59.999Z&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryOutsideEntryPeriod.statusCode, 200);
  assert.ok(!listInventoryOutsideEntryPeriod.json().items.some((item: { id: string }) => item.id === inventoryId));

  const defaultInventoryWithoutRemoved = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(defaultInventoryWithoutRemoved.statusCode, 200);
  assert.ok(!defaultInventoryWithoutRemoved.json().items.some((item: { id: string }) => item.id === removedInventoryId));

  const listRemovedInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&status=REMOVED&search=${encodeURIComponent(removedInventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listRemovedInventory.statusCode, 200);
  assert.ok(listRemovedInventory.json().items.some((item: { id: string }) => item.id === removedInventoryId));

  const listInventoryByDaysInStock = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&sort=days_in_stock_desc",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByDaysInStock.statusCode, 200);
  const daysInStockOrder = listInventoryByDaysInStock.json().items.map((item: { daysInStock: number }) => item.daysInStock);
  assert.deepEqual(daysInStockOrder, [...daysInStockOrder].sort((a, b) => b - a));

  const listInventoryByBrandModel = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&sort=brand_model_asc",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByBrandModel.statusCode, 200);
  const brandModelOrder = listInventoryByBrandModel
    .json()
    .items.map((item: { vehicle: { brand: string; model: string; version: string | null } | null }) => `${item.vehicle?.brand ?? ""} ${item.vehicle?.model ?? ""} ${item.vehicle?.version ?? ""}`);
  assert.deepEqual(brandModelOrder, [...brandModelOrder].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })));

  const listInventoryByStatus = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&sort=status_asc",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByStatus.statusCode, 200);
  const statusOrder = listInventoryByStatus.json().items.map((item: { status: string }) => item.status);
  assert.deepEqual(statusOrder, [...statusOrder].sort());

  const listInventoryByYear = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&search=2099",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByYear.statusCode, 200);
  assert.ok(listInventoryByYear.json().items.some((item: { id: string }) => item.id === inventoryId));

  const getInventory = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getInventory.statusCode, 200);
  assert.equal(getInventory.json().data.vehicle.model, "Civic");
  assert.equal(getInventory.json().data.vehicle.relevantOptions, "Teto solar, multimidia e bancos em couro");

  const sellerListInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=5&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerListInventory.statusCode, 200);
  const sellerListItem = sellerListInventory.json().items.find((item: { id: string }) => item.id === inventoryId);
  assert.ok(sellerListItem);
  assert.equal(sellerListItem.purchaseCost, null);
  assert.equal(sellerListItem.askingPrice, "124900");
  assert.equal(typeof sellerListItem.daysInStock, "number");
  assert.ok(sellerListInventory.json().summary.total >= 1);

  const sellerGetInventory = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerGetInventory.statusCode, 200);
  assert.equal(sellerGetInventory.json().data.purchaseCost, null);
  assert.equal(sellerGetInventory.json().data.askingPrice, "124900");

  const inventoryDetailWithoutListings = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}/detail`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryDetailWithoutListings.statusCode, 200);
  assert.equal(inventoryDetailWithoutListings.json().data.id, inventoryId);
  assert.equal(inventoryDetailWithoutListings.json().data.vehicle.primaryPhotoAttachmentId, primaryPhotoAttachmentId);
  assert.ok(
    inventoryDetailWithoutListings
      .json()
      .documents.some(
        (document: { id: string; classification: string | null; entityType: string; purpose: string | null }) =>
          document.id === primaryPhotoAttachmentId &&
          document.classification === "vehicle_primary_photo" &&
          document.entityType === "vehicle" &&
          document.purpose === "primary_photo",
      ),
  );
  assert.deepEqual(inventoryDetailWithoutListings.json().activeListings, []);

  const sellerInventoryDetail = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}/detail`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerInventoryDetail.statusCode, 200);
  assert.equal(sellerInventoryDetail.json().data.purchaseCost, null);
  assert.equal(sellerInventoryDetail.json().data.askingPrice, "124900");

  const updateInventory = await app.inject({
    method: "PATCH",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "AVAILABLE",
      askingPrice: 122900,
      vehicle: {
        mileage: 42100,
      },
    },
  });
  assert.equal(updateInventory.statusCode, 200);
  assert.equal(updateInventory.json().data.status, "AVAILABLE");
  assert.equal(updateInventory.json().data.askingPrice, "122900");

  const inventoryStatusHistory = await prisma.vehicleStatusHistory.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      vehicleId: inventoryVehicleId,
      fromStatus: "IN_PREPARATION",
      toStatus: "AVAILABLE",
    },
  });
  assert.ok(inventoryStatusHistory);
  assert.equal(inventoryStatusHistory.actorUserId, ownerBody.user.id);

  const inventoryStatusAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=inventory&action=status_changed&entity_type=vehicle_inventory&entity_id=${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryStatusAudit.statusCode, 200);
  assert.ok(
    inventoryStatusAudit
      .json()
      .items.some((log: { metadata: { fromStatus?: string; toStatus?: string } }) => log.metadata.fromStatus === "IN_PREPARATION" && log.metadata.toStatus === "AVAILABLE"),
  );

  const inventoryUpdateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=inventory&action=update&entity_type=vehicle_inventory&entity_id=${inventoryId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryUpdateAudit.statusCode, 200);
  const inventoryUpdateLog = inventoryUpdateAudit.json().items.find((log: { metadata: { changedFields?: string[] } | null }) =>
    log.metadata?.changedFields?.includes("askingPrice"),
  );
  assert.ok(inventoryUpdateLog);
  assert.ok(
    inventoryUpdateLog.metadata.changes.some(
      (change: { field: string; newValue: string; oldValue: string }) =>
        change.field === "askingPrice" && change.oldValue === "124900" && change.newValue === "122900",
    ),
  );
  assert.ok(
    inventoryUpdateLog.metadata.changes.some(
      (change: { field: string; newValue: string; oldValue: string }) =>
        change.field === "vehicle.mileage" && change.oldValue === "42000" && change.newValue === "42100",
    ),
  );

  const vehicleUpdateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=inventory&action=update&entity_type=vehicle&entity_id=${inventoryVehicleId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(vehicleUpdateAudit.statusCode, 200);
  assert.ok(
    vehicleUpdateAudit
      .json()
      .items.some((log: { metadata: { changes?: Array<{ field: string; newValue: string; oldValue: string }>; inventoryId?: string } }) =>
        log.metadata.inventoryId === inventoryId &&
        log.metadata.changes?.some((change) => change.field === "mileage" && change.oldValue === "42000" && change.newValue === "42100"),
      ),
  );

  const moveInventoryToNegotiation = await app.inject({
    method: "PATCH",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "NEGOTIATION",
    },
  });
  assert.equal(moveInventoryToNegotiation.statusCode, 200);
  assert.equal(moveInventoryToNegotiation.json().data.status, "NEGOTIATION");

  const listInventoryInNegotiation = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&status=NEGOTIATION&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryInNegotiation.statusCode, 200);
  assert.ok(listInventoryInNegotiation.json().items.some((item: { id: string; status: string }) => item.id === inventoryId && item.status === "NEGOTIATION"));

  const returnInventoryToAvailable = await app.inject({
    method: "PATCH",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "AVAILABLE",
    },
  });
  assert.equal(returnInventoryToAvailable.statusCode, 200);
  assert.equal(returnInventoryToAvailable.json().data.status, "AVAILABLE");

  const addInventoryCost = await app.inject({
    method: "POST",
    url: `/inventory/${inventoryId}/costs`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      category: "preparacao",
      description: "Polimento tecnico",
      amount: 850,
      occurredAt: "2026-06-06T15:00:00.000Z",
      capitalized: true,
    },
  });
  assert.equal(addInventoryCost.statusCode, 201);
  assert.equal(addInventoryCost.json().data.amount, "850");

  const sellerServices = await app.inject({
    method: "GET",
    url: "/services/orders",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerServices.statusCode, 403);
  assert.equal(sellerServices.json().error.code, "FORBIDDEN");

  const providerName = uniqueToken("Oficina QA");
  const createServiceProvider = await app.inject({
    method: "POST",
    url: "/services/providers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: providerName,
      serviceTypes: ["preparacao", "mecanica", "despachante"],
      contactName: "Carlos Servicos",
      phone: "11988887777",
      email: "despachante.qa@gt3.local",
      preferredDispatchChannel: "MANUAL_PHYSICAL",
    },
  });
  assert.equal(createServiceProvider.statusCode, 201);
  assert.equal(createServiceProvider.json().data.name, providerName);
  const serviceProviderId = createServiceProvider.json().data.id as string;

  const catalogName = uniqueToken("Polimento QA");
  const createServiceCatalog = await app.inject({
    method: "POST",
    url: "/services/catalog",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: catalogName,
      category: "preparacao",
      basePrice: 900,
      slaHours: 24,
    },
  });
  assert.equal(createServiceCatalog.statusCode, 201);
  assert.equal(createServiceCatalog.json().data.basePrice, "900");
  const serviceCatalogId = createServiceCatalog.json().data.id as string;

  const createServiceOrder = await app.inject({
    method: "POST",
    url: "/services/orders",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      vehicleId: inventoryVehicleId,
      providerId: serviceProviderId,
      type: "preparacao",
      status: "OPEN",
      totalAmount: 900,
      startedAt: "2026-06-06T16:00:00.000Z",
      expectedReturnAt: "2026-06-09T16:00:00.000Z",
    },
  });
  assert.equal(createServiceOrder.statusCode, 201);
  assert.equal(createServiceOrder.json().data.vehicleId, inventoryVehicleId);
  assert.equal(createServiceOrder.json().data.totalAmount, "900");
  assert.equal(createServiceOrder.json().data.expectedReturnAt, "2026-06-09T16:00:00.000Z");
  const serviceOrderId = createServiceOrder.json().data.id as string;

  const listServiceOrders = await app.inject({
    method: "GET",
    url: `/services/orders?vehicle_id=${inventoryVehicleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listServiceOrders.statusCode, 200);
  assert.ok(listServiceOrders.json().items.some((order: { id: string }) => order.id === serviceOrderId));

  const listInventoryWithActiveService = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryWithActiveService.statusCode, 200);
  const inventoryItemWithActiveService = listInventoryWithActiveService.json().items.find((item: { id: string }) => item.id === inventoryId);
  assert.equal(inventoryItemWithActiveService.hasActiveService, true);
  assert.equal(inventoryItemWithActiveService.activeService.id, serviceOrderId);
  assert.equal(inventoryItemWithActiveService.activeService.providerName, providerName);
  assert.equal(inventoryItemWithActiveService.activeService.expectedReturnAt, "2026-06-09T16:00:00.000Z");
  assert.equal(listInventoryWithActiveService.json().summary.activeServices, 1);

  const detailInventoryWithActiveService = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}/detail`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(detailInventoryWithActiveService.statusCode, 200);
  assert.equal(detailInventoryWithActiveService.json().data.hasActiveService, true);
  assert.equal(detailInventoryWithActiveService.json().data.activeService.id, serviceOrderId);
  assert.equal(detailInventoryWithActiveService.json().data.activeService.providerName, providerName);
  assert.equal(detailInventoryWithActiveService.json().data.activeService.expectedReturnAt, "2026-06-09T16:00:00.000Z");

  const filteredInventoryWithActiveService = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&has_active_service=true&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(filteredInventoryWithActiveService.statusCode, 200);
  assert.ok(filteredInventoryWithActiveService.json().items.some((item: { id: string }) => item.id === inventoryId));

  const addServiceItem = await app.inject({
    method: "POST",
    url: `/services/orders/${serviceOrderId}/items`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      catalogItemId: serviceCatalogId,
      description: "Polimento tecnico completo",
      quantity: 1,
      unitPrice: 900,
      costAmount: 600,
    },
  });
  assert.equal(addServiceItem.statusCode, 201);
  assert.equal(addServiceItem.json().data.unitPrice, "900");

  const addServiceCost = await app.inject({
    method: "POST",
    url: `/services/orders/${serviceOrderId}/costs`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      providerId: serviceProviderId,
      description: "Custo de preparacao",
      amount: 600,
      occurredAt: "2026-06-06T17:00:00.000Z",
    },
  });
  assert.equal(addServiceCost.statusCode, 201);
  assert.equal(addServiceCost.json().data.amount, "600");

  const addServiceInvoice = await app.inject({
    method: "POST",
    url: `/services/orders/${serviceOrderId}/invoices`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      providerId: serviceProviderId,
      number: uniqueToken("NF-QA"),
      amount: 600,
      issuedAt: "2026-06-06T18:00:00.000Z",
      snapshot: {
        source: "qa-service",
        vehicleId: inventoryVehicleId,
      },
    },
  });
  assert.equal(addServiceInvoice.statusCode, 201);
  assert.equal(addServiceInvoice.json().data.amount, "600");

  const finishServiceOrder = await app.inject({
    method: "POST",
    url: `/services/orders/${serviceOrderId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "DONE",
      reason: "Servico concluido no smoke test",
    },
  });
  assert.equal(finishServiceOrder.statusCode, 200);
  assert.equal(finishServiceOrder.json().data.status, "DONE");

  const getServiceOrder = await app.inject({
    method: "GET",
    url: `/services/orders/${serviceOrderId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getServiceOrder.statusCode, 200);
  assert.equal(getServiceOrder.json().data.id, serviceOrderId);
  assert.ok(getServiceOrder.json().items.some((item: { catalogItemId: string }) => item.catalogItemId === serviceCatalogId));
  assert.ok(getServiceOrder.json().costs.some((cost: { providerId: string }) => cost.providerId === serviceProviderId));
  assert.ok(getServiceOrder.json().invoices.some((invoice: { providerId: string }) => invoice.providerId === serviceProviderId));
  checkpoint("appointments/inventory/services");

  const sellerPurchases = await app.inject({
    method: "GET",
    url: "/purchases/leads",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerPurchases.statusCode, 403);
  assert.equal(sellerPurchases.json().error.code, "FORBIDDEN");

  const createPurchaseLead = await app.inject({
    method: "POST",
    url: "/purchases/leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      vehicleId: inventoryVehicleId,
      source: "indicacao-qa",
      askingPrice: 98000,
    },
  });
  assert.equal(createPurchaseLead.statusCode, 201);
  assert.equal(createPurchaseLead.json().data.customerId, createdCustomerId);
  assert.equal(createPurchaseLead.json().data.askingPrice, "98000");
  const purchaseLeadId = createPurchaseLead.json().data.id as string;

  const createEvaluation = await app.inject({
    method: "POST",
    url: "/purchases/evaluations",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      purchaseLeadId,
      requestedPrice: 98000,
      fipeValue: 104000,
      suggestedPrice: 95500,
      expectedPrepCost: 1800,
      expectedMargin: 9000,
      snapshot: {
        source: "qa-purchase",
      },
      evaluatedAt: "2026-06-06T19:00:00.000Z",
    },
  });
  assert.equal(createEvaluation.statusCode, 201);
  assert.equal(createEvaluation.json().data.purchaseLeadId, purchaseLeadId);
  assert.equal(createEvaluation.json().data.suggestedPrice, "95500");
  const evaluationId = createEvaluation.json().data.id as string;

  const addEvaluationChecklist = await app.inject({
    method: "POST",
    url: `/purchases/evaluations/${evaluationId}/checklist`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      itemKey: "paint_condition",
      label: "Estado da pintura",
      value: "Bom",
      metadata: {
        score: 8,
      },
    },
  });
  assert.equal(addEvaluationChecklist.statusCode, 201);
  assert.equal(addEvaluationChecklist.json().data.itemKey, "paint_condition");

  const approveEvaluation = await app.inject({
    method: "POST",
    url: `/purchases/evaluations/${evaluationId}/approval`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "APPROVED",
      reason: "Compra aprovada pelo smoke test",
      snapshot: {
        maxPrice: 96000,
      },
    },
  });
  assert.equal(approveEvaluation.statusCode, 201);
  assert.equal(approveEvaluation.json().data.decision, "APPROVED_BUY");
  assert.equal(approveEvaluation.json().approval.status, "APPROVED");

  const createPurchasePayment = await app.inject({
    method: "POST",
    url: "/purchases/payments",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      purchaseLeadId,
      amount: 95500,
      status: "PENDING",
      snapshot: {
        source: "qa-payment",
      },
    },
  });
  assert.equal(createPurchasePayment.statusCode, 201);
  assert.equal(createPurchasePayment.json().data.amount, "95500");
  const purchasePaymentId = createPurchasePayment.json().data.id as string;

  const settlePurchasePayment = await app.inject({
    method: "POST",
    url: `/purchases/payments/${purchasePaymentId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "PAID",
      paidAt: "2026-06-06T20:00:00.000Z",
      reason: "Pagamento concluido no smoke test",
    },
  });
  assert.equal(settlePurchasePayment.statusCode, 200);
  assert.equal(settlePurchasePayment.json().data.status, "PAID");

  const getPurchaseLead = await app.inject({
    method: "GET",
    url: `/purchases/leads/${purchaseLeadId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getPurchaseLead.statusCode, 200);
  assert.equal(getPurchaseLead.json().data.status, "PURCHASED");
  assert.ok(getPurchaseLead.json().evaluations.some((evaluation: { id: string }) => evaluation.id === evaluationId));
  assert.ok(getPurchaseLead.json().payments.some((payment: { id: string }) => payment.id === purchasePaymentId));

  const sellerListings = await app.inject({
    method: "GET",
    url: "/listings",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerListings.statusCode, 403);
  assert.equal(sellerListings.json().error.code, "FORBIDDEN");

  const createListing = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: inventoryVehicleId,
      title: "Honda Civic Touring QA",
      description: "Anuncio criado pelo contrato de API.",
      askingPrice: 122900,
      status: "DRAFT",
    },
  });
  assert.equal(createListing.statusCode, 201);
  assert.equal(createListing.json().data.vehicleId, inventoryVehicleId);
  assert.equal(createListing.json().data.askingPrice, "122900");
  const listingId = createListing.json().data.id as string;

  const listingChannel = await app.inject({
    method: "POST",
    url: "/listings/channels",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Site GT3 QA",
      type: "site",
      settings: {
        visibility: "public",
      },
    },
  });
  assert.equal(listingChannel.statusCode, 201);
  const listingChannelId = listingChannel.json().data.id as string;

  const publishListing = await app.inject({
    method: "POST",
    url: `/listings/${listingId}/publications`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channelId: listingChannelId,
      externalId: uniqueToken("qa-listing"),
      status: "PUBLISHED",
      metadata: {
        source: "smoke-test",
      },
    },
  });
  assert.equal(publishListing.statusCode, 201);
  assert.equal(publishListing.json().data.status, "PUBLISHED");

  const getListing = await app.inject({
    method: "GET",
    url: `/listings/${listingId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getListing.statusCode, 200);
  assert.equal(getListing.json().data.status, "PUBLISHED");
  assert.ok(getListing.json().publications.some((publication: { channelId: string }) => publication.channelId === listingChannelId));

  const inventoryDetailWithListing = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}/detail`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryDetailWithListing.statusCode, 200);
  assert.ok(
    inventoryDetailWithListing
      .json()
      .activeListings.some((listing: { id: string; status: string; title: string }) => listing.id === listingId && listing.status === "PUBLISHED" && listing.title === "Honda Civic Touring QA"),
  );

  const inventoryListWithActiveListing = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(inventoryListWithActiveListing.statusCode, 200);
  const inventoryItemWithActiveListing = inventoryListWithActiveListing.json().items.find((item: { id: string }) => item.id === inventoryId);
  assert.ok(inventoryItemWithActiveListing);
  assert.equal(inventoryItemWithActiveListing.hasActiveListing, true);
  assert.equal(inventoryItemWithActiveListing.activeListingsCount, 1);
  assert.equal(inventoryListWithActiveListing.json().summary.activeListings, 1);

  const filteredInventoryWithActiveListing = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&has_active_listing=true&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(filteredInventoryWithActiveListing.statusCode, 200);
  assert.ok(filteredInventoryWithActiveListing.json().items.some((item: { id: string }) => item.id === inventoryId));

  const listingMetricDate = new Date(Date.now() + 172800000).toISOString();
  const listingMetric = await app.inject({
    method: "POST",
    url: `/listings/${listingId}/metrics`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channelId: listingChannelId,
      metricDate: listingMetricDate,
      views: 100,
      clicks: 12,
      leads: 4,
      costPerLead: 18.5,
      score: 82,
    },
  });
  assert.equal(listingMetric.statusCode, 201);
  assert.equal(listingMetric.json().data.ctr, "0.12");
  assert.equal(listingMetric.json().data.conversionRate, "0.04");

  const sellerCampaigns = await app.inject({
    method: "GET",
    url: "/campaigns",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerCampaigns.statusCode, 403);
  assert.equal(sellerCampaigns.json().error.code, "FORBIDDEN");

  const campaignName = uniqueToken("Campanha QA");
  const createCampaign = await app.inject({
    method: "POST",
    url: "/campaigns",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: campaignName,
      channel: "meta-ads",
      status: "ACTIVE",
      startsAt: "2026-06-06T00:00:00.000Z",
      endsAt: "2026-06-30T23:59:59.000Z",
    },
  });
  assert.equal(createCampaign.statusCode, 201);
  assert.equal(createCampaign.json().data.name, campaignName);
  const campaignId = createCampaign.json().data.id as string;

  const updateCampaign = await app.inject({
    method: "PATCH",
    url: `/campaigns/${campaignId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channel: "google-ads",
    },
  });
  assert.equal(updateCampaign.statusCode, 200);
  assert.equal(updateCampaign.json().data.channel, "google-ads");

  const addCampaignCost = await app.inject({
    method: "POST",
    url: `/campaigns/${campaignId}/costs`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 1200,
      occurredAt: "2026-06-07T12:00:00.000Z",
    },
  });
  assert.equal(addCampaignCost.statusCode, 201);
  assert.equal(addCampaignCost.json().data.amount, "1200");

  const addCampaignResult = await app.inject({
    method: "POST",
    url: `/campaigns/${campaignId}/results`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      resultDate: "2026-06-07T00:00:00.000Z",
      data: {
        impressions: 10000,
        clicks: 320,
        leads: 16,
        sales: 2,
      },
    },
  });
  assert.equal(addCampaignResult.statusCode, 201);
  assert.equal(addCampaignResult.json().data.data.leads, 16);

  const campaignSummary = await app.inject({
    method: "GET",
    url: `/campaigns/${campaignId}/summary`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(campaignSummary.statusCode, 200);
  assert.equal(campaignSummary.json().summary.totalCost, "1200.00");
  assert.equal(campaignSummary.json().summary.costPerLead, "75.00");
  assert.equal(campaignSummary.json().summary.ctr, "0.0320");

  const pauseCampaign = await app.inject({
    method: "POST",
    url: `/campaigns/${campaignId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "INACTIVE",
      reason: "Campanha pausada no smoke test",
    },
  });
  assert.equal(pauseCampaign.statusCode, 200);
  assert.equal(pauseCampaign.json().data.status, "INACTIVE");

  const getCampaign = await app.inject({
    method: "GET",
    url: `/campaigns/${campaignId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getCampaign.statusCode, 200);
  assert.equal(getCampaign.json().costs.length, 1);
  assert.equal(getCampaign.json().results.length, 1);

  const repassePlate = uniquePlate("RP");
  const invalidCommonRepasseInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Toyota",
        model: "Corolla",
        yearModel: 2018,
        plate: repassePlate,
      },
      ownershipType: "REPASSE",
      status: "REPASSE",
      askingPrice: 76500,
      entryDate: "2026-06-06T13:00:00.000Z",
    },
  });
  assert.equal(invalidCommonRepasseInventory.statusCode, 400);
  assert.equal(invalidCommonRepasseInventory.json().error.code, "VALIDATION_ERROR");

  const repasseInventoryPlate = uniquePlate("R2");
  const createRepasseInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Toyota",
        model: "Corolla",
        version: "XEi Repasse",
        yearModel: 2018,
        plate: repasseInventoryPlate,
        color: "Preto",
        mileage: 88000,
      },
      ownershipType: "TRADE_IN",
      status: "IN_PREPARATION",
      askingPrice: 76500,
      entryDate: "2026-06-06T13:00:00.000Z",
    },
  });
  assert.equal(createRepasseInventory.statusCode, 201);
  const repasseVehicleId = createRepasseInventory.json().data.vehicle.id as string;
  const repasseInventoryId = createRepasseInventory.json().data.id as string;

  const sellerRepasseList = await app.inject({
    method: "GET",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerRepasseList.statusCode, 403);
  assert.equal(sellerRepasseList.json().error.code, "FORBIDDEN");

  const invalidRepasseStatus = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "PENDING_AI_REVIEW",
      price: 76000,
    },
  });
  assert.equal(invalidRepasseStatus.statusCode, 400);
  assert.equal(invalidRepasseStatus.json().error.code, "VALIDATION_ERROR");

  const createCancelledRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "CANCELLED",
      price: 76000,
    },
  });
  assert.equal(createCancelledRepasse.statusCode, 400);
  assert.equal(createCancelledRepasse.json().error.code, "VALIDATION_ERROR");

  const createRecognizedRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "REVENUE_RECOGNIZED",
      price: 76000,
    },
  });
  assert.equal(createRecognizedRepasse.statusCode, 400);
  assert.equal(createRecognizedRepasse.json().error.code, "VALIDATION_ERROR");

  const createSoldRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "SOLD",
      price: 76000,
    },
  });
  assert.equal(createSoldRepasse.statusCode, 400);
  assert.equal(createSoldRepasse.json().error.code, "VALIDATION_ERROR");

  const createRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "DRAFT",
      price: 76000,
      channelPlan: {
        whatsapp: ["lista-repasse", "lojistas-vip"],
        instagram: true,
      },
    },
  });
  assert.equal(createRepasse.statusCode, 201);
  assert.equal(createRepasse.json().data.vehicleId, repasseVehicleId);
  assert.equal(createRepasse.json().data.price, "76000");
  const repasseId = createRepasse.json().data.id as string;

  const duplicateRepasseForSameVehicle = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: repasseVehicleId,
      status: "DRAFT",
      price: 75900,
      channelPlan: {
        whatsapp: ["lista-repasse"],
      },
    },
  });
  assert.equal(duplicateRepasseForSameVehicle.statusCode, 400);
  assert.equal(duplicateRepasseForSameVehicle.json().error.code, "VALIDATION_ERROR");

  const defaultInventoryWithoutRepasse = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(defaultInventoryWithoutRepasse.statusCode, 200);
  assert.ok(!defaultInventoryWithoutRepasse.json().items.some((item: { id: string }) => item.id === repasseInventoryId));

  const listInventoryByRepasseStatus = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&status=REPASSE",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByRepasseStatus.statusCode, 400);
  assert.equal(listInventoryByRepasseStatus.json().error.code, "VALIDATION_ERROR");

  const listInventoryByRepasseOwnership = await app.inject({
    method: "GET",
    url: "/inventory?page=1&page_size=100&ownership_type=REPASSE",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventoryByRepasseOwnership.statusCode, 400);
  assert.equal(listInventoryByRepasseOwnership.json().error.code, "VALIDATION_ERROR");

  const repasseInventory = await app.inject({
    method: "GET",
    url: `/inventory/${repasseInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(repasseInventory.statusCode, 200);
  assert.equal(repasseInventory.json().data.status, "REPASSE");

  const createRepasseInterestLead = await app.inject({
    method: "POST",
    url: "/leads",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      title: "Interesse bloqueado em repasse QA",
      source: "showroom",
      interest: "Toyota Corolla repasse",
      vehicleId: repasseVehicleId,
    },
  });
  assert.equal(createRepasseInterestLead.statusCode, 404);
  assert.equal(createRepasseInterestLead.json().error.code, "NOT_FOUND");

  const invalidRepasseTransition = await app.inject({
    method: "PATCH",
    url: `/repasse/${repasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "ARCHIVED_BY_AI",
    },
  });
  assert.equal(invalidRepasseTransition.statusCode, 400);
  assert.equal(invalidRepasseTransition.json().error.code, "VALIDATION_ERROR");

  const noPriceRepasseInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Nissan",
        model: "Kicks",
        version: "Repasse sem preco",
        yearModel: 2019,
        plate: uniquePlate("NP"),
      },
      ownershipType: "TRADE_IN",
      status: "IN_PREPARATION",
      entryDate: "2026-06-06T13:20:00.000Z",
    },
  });
  assert.equal(noPriceRepasseInventory.statusCode, 201);
  const noPriceRepasseVehicleId = noPriceRepasseInventory.json().data.vehicle.id as string;

  const createNoPriceRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: noPriceRepasseVehicleId,
      status: "READY",
    },
  });
  assert.equal(createNoPriceRepasse.statusCode, 201);
  const noPriceRepasseId = createNoPriceRepasse.json().data.id as string;

  const sellNoPriceRepasse = await app.inject({
    method: "PATCH",
    url: `/repasse/${noPriceRepasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SOLD",
    },
  });
  assert.equal(sellNoPriceRepasse.statusCode, 400);
  assert.equal(sellNoPriceRepasse.json().error.code, "VALIDATION_ERROR");

  const cancelRepassePlate = uniquePlate("RC");
  const cancelRepasseInventory = await app.inject({
    method: "POST",
    url: "/inventory",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicle: {
        brand: "Fiat",
        model: "Pulse",
        version: "Drive Repasse",
        yearModel: 2020,
        plate: cancelRepassePlate,
      },
      ownershipType: "TRADE_IN",
      status: "IN_PREPARATION",
      askingPrice: 70500,
      entryDate: "2026-06-06T13:30:00.000Z",
    },
  });
  assert.equal(cancelRepasseInventory.statusCode, 201);
  const cancelRepasseVehicleId = cancelRepasseInventory.json().data.vehicle.id as string;
  const cancelRepasseInventoryId = cancelRepasseInventory.json().data.id as string;

  const createCancelableRepasse = await app.inject({
    method: "POST",
    url: "/repasse",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: cancelRepasseVehicleId,
      status: "READY",
      price: 70000,
    },
  });
  assert.equal(createCancelableRepasse.statusCode, 201);
  const cancelableRepasseId = createCancelableRepasse.json().data.id as string;

  const cancelRepasse = await app.inject({
    method: "PATCH",
    url: `/repasse/${cancelableRepasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "CANCELLED",
    },
  });
  assert.equal(cancelRepasse.statusCode, 200);
  assert.equal(cancelRepasse.json().data.status, "CANCELLED");

  const getCancelledRepasse = await app.inject({
    method: "GET",
    url: `/repasse/${cancelableRepasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getCancelledRepasse.statusCode, 200);
  assert.equal(getCancelledRepasse.json().data.status, "CANCELLED");

  const listCancelledRepasse = await app.inject({
    method: "GET",
    url: "/repasse?page=1&page_size=20&status=CANCELLED",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCancelledRepasse.statusCode, 200);
  assert.ok(listCancelledRepasse.json().items.some((item: { id: string }) => item.id === cancelableRepasseId));

  const restoredInventory = await app.inject({
    method: "GET",
    url: `/inventory/${cancelRepasseInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(restoredInventory.statusCode, 200);
  assert.equal(restoredInventory.json().data.status, "IN_PREPARATION");

  const defaultInventoryAfterRepasseCancel = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=20&search=${encodeURIComponent(cancelRepassePlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(defaultInventoryAfterRepasseCancel.statusCode, 200);
  assert.ok(defaultInventoryAfterRepasseCancel.json().items.some((item: { id: string }) => item.id === cancelRepasseInventoryId));

  const repasseCancelStatusHistory = await prisma.vehicleStatusHistory.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      vehicleId: cancelRepasseVehicleId,
      fromStatus: "REPASSE",
      toStatus: "IN_PREPARATION",
      reason: "repasse_cancelled",
    },
  });
  assert.ok(repasseCancelStatusHistory);
  assert.equal(repasseCancelStatusHistory.actorUserId, ownerBody.user.id);

  const revenueForCancelledRepasse = await app.inject({
    method: "POST",
    url: `/repasse/${cancelableRepasseId}/revenues`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 1200,
      snapshot: {
        source: "qa-cancelled-repasse",
      },
    },
  });
  assert.equal(revenueForCancelledRepasse.statusCode, 400);
  assert.equal(revenueForCancelledRepasse.json().error.code, "VALIDATION_ERROR");

  const updateCancelledRepasse = await app.inject({
    method: "PATCH",
    url: `/repasse/${cancelableRepasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SENT",
      price: 71000,
    },
  });
  assert.equal(updateCancelledRepasse.statusCode, 400);
  assert.equal(updateCancelledRepasse.json().error.code, "VALIDATION_ERROR");

  const updateRepasse = await app.inject({
    method: "PATCH",
    url: `/repasse/${repasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SENT",
      price: 75500,
      channelPlan: {
        whatsapp: ["lista-repasse"],
        instagram: true,
        individualBuyer: "Comprador QA",
      },
    },
  });
  assert.equal(updateRepasse.statusCode, 200);
  assert.equal(updateRepasse.json().data.status, "SENT");
  assert.equal(updateRepasse.json().data.price, "75500");

  const revenueBeforeSoldRepasse = await app.inject({
    method: "POST",
    url: `/repasse/${repasseId}/revenues`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 2500,
      snapshot: {
        source: "qa-repasse-antes-venda",
      },
    },
  });
  assert.equal(revenueBeforeSoldRepasse.statusCode, 400);
  assert.equal(revenueBeforeSoldRepasse.json().error.code, "VALIDATION_ERROR");

  const markRepasseSold = await app.inject({
    method: "PATCH",
    url: `/repasse/${repasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SOLD",
    },
  });
  assert.equal(markRepasseSold.statusCode, 200);
  assert.equal(markRepasseSold.json().data.status, "SOLD");

  const repasseRecognizedAt = new Date(Date.now() + 259200000).toISOString();
  const repasseRevenue = await app.inject({
    method: "POST",
    url: `/repasse/${repasseId}/revenues`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 2500,
      recognizedAt: repasseRecognizedAt,
      snapshot: {
        source: "qa-repasse",
        vehicleId: repasseVehicleId,
      },
    },
  });
  assert.equal(repasseRevenue.statusCode, 201);
  assert.equal(repasseRevenue.json().data.amount, "2500");

  const getRepasse = await app.inject({
    method: "GET",
    url: `/repasse/${repasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getRepasse.statusCode, 200);
  assert.equal(getRepasse.json().data.status, "REVENUE_RECOGNIZED");
  assert.ok(getRepasse.json().revenues.some((revenue: { amount: string }) => revenue.amount === "2500"));

  const duplicateRepasseRevenue = await app.inject({
    method: "POST",
    url: `/repasse/${repasseId}/revenues`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 900,
      snapshot: {
        source: "qa-repasse-duplicado",
      },
    },
  });
  assert.equal(duplicateRepasseRevenue.statusCode, 400);
  assert.equal(duplicateRepasseRevenue.json().error.code, "VALIDATION_ERROR");

  const updateRecognizedRepasse = await app.inject({
    method: "PATCH",
    url: `/repasse/${repasseId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SENT",
      price: 75200,
    },
  });
  assert.equal(updateRecognizedRepasse.statusCode, 400);
  assert.equal(updateRecognizedRepasse.json().error.code, "VALIDATION_ERROR");
  checkpoint("purchases/listings/repasse");

  const unauthenticatedSales = await app.inject({
    method: "GET",
    url: "/sales",
  });
  assert.equal(unauthenticatedSales.statusCode, 401);
  assert.equal(unauthenticatedSales.json().error.code, "UNAUTHENTICATED");

  const invalidSale = await app.inject({
    method: "POST",
    url: "/sales",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      inventoryId: "id-invalido",
    },
  });
  assert.equal(invalidSale.statusCode, 400);
  assert.equal(invalidSale.json().error.code, "VALIDATION_ERROR");

  const createSale = await app.inject({
    method: "POST",
    url: "/sales",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      customerId: createdCustomerId,
      inventoryId,
      type: "VEHICLE",
      status: "PROPOSAL",
      salePrice: 123500,
    },
  });
  assert.equal(createSale.statusCode, 201);
  assert.equal(createSale.json().data.customerId, createdCustomerId);
  assert.equal(createSale.json().data.status, "PROPOSAL");
  assert.equal(createSale.json().data.grossMargin, "21650");
  const saleId = createSale.json().data.id as string;

  const listSales = await app.inject({
    method: "GET",
    url: "/sales?page=1&page_size=5&status=PROPOSAL",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listSales.statusCode, 200);
  assert.ok(listSales.json().items.some((sale: { id: string }) => sale.id === saleId));

  const getSale = await app.inject({
    method: "GET",
    url: `/sales/${saleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getSale.statusCode, 200);
  assert.equal(getSale.json().data.salePrice, "123500");

  const updateSale = await app.inject({
    method: "PATCH",
    url: `/sales/${saleId}`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      salePrice: 124000,
    },
  });
  assert.equal(updateSale.statusCode, 200);
  assert.equal(updateSale.json().data.grossMargin, "22150");

  const sellerApproveSale = await app.inject({
    method: "POST",
    url: `/sales/${saleId}/status`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      status: "APPROVED",
      reason: "Tentativa de aprovacao sem permissao sensivel",
    },
  });
  assert.equal(sellerApproveSale.statusCode, 403);
  assert.equal(sellerApproveSale.json().error.code, "FORBIDDEN");

  const approveSale = await app.inject({
    method: "POST",
    url: `/sales/${saleId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "APPROVED",
      reason: "Condicoes aprovadas pelo gestor em QA",
    },
  });
  assert.equal(approveSale.statusCode, 200);
  assert.equal(approveSale.json().data.status, "APPROVED");

  const closeSale = await app.inject({
    method: "POST",
    url: `/sales/${saleId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "CLOSED",
      reason: "Venda concluida em QA",
    },
  });
  assert.equal(closeSale.statusCode, 200);
  assert.equal(closeSale.json().data.status, "CLOSED");
  assert.ok(closeSale.json().data.closedAt);

  const listCustomersByPurchase = await app.inject({
    method: "GET",
    url: "/customers?page=1&page_size=5&purchase_done=true",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listCustomersByPurchase.statusCode, 200);
  assert.ok(listCustomersByPurchase.json().items.some((customer: { id: string }) => customer.id === createdCustomerId));

  const customerHistory = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}/history`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerHistory.statusCode, 200);
  assert.ok(customerHistory.json().sales.some((sale: { id: string }) => sale.id === saleId));
  assert.ok(customerHistory.json().purchaseLeads.some((lead: { id: string }) => lead.id === purchaseLeadId));
  assert.ok(customerHistory.json().evaluations.some((evaluation: { id: string }) => evaluation.id === evaluationId));
  assert.ok(customerHistory.json().appointments.some((appointment: { id: string }) => appointment.id === createdAppointmentId));
  assert.ok(customerHistory.json().timeline.some((item: { kind: string; entityId: string }) => item.kind === "appointment" && item.entityId === createdAppointmentId));
  assert.ok(
    customerHistory.json().events.some(
      (event: { metadata: { appointmentId?: string; status?: string } | null; type: string }) =>
        event.type === "customer.appointment_created" && event.metadata?.appointmentId === createdAppointmentId && event.metadata?.status === "SCHEDULED",
    ),
  );
  assert.ok(
    customerHistory.json().events.some(
      (event: { metadata: { appointmentId?: string; changedFields?: string[]; toStartsAt?: string } | null; type: string }) =>
        event.type === "customer.appointment_updated" &&
        event.metadata?.appointmentId === createdAppointmentId &&
        event.metadata.changedFields?.includes("startsAt") &&
        event.metadata.toStartsAt === "2026-06-08T16:00:00.000Z",
    ),
  );
  assert.ok(
    customerHistory.json().events.some(
      (event: { metadata: { appointmentId?: string; fromStatus?: string; toStatus?: string } | null; type: string }) =>
        event.type === "customer.appointment_status_changed" &&
        event.metadata?.appointmentId === createdAppointmentId &&
        event.metadata.fromStatus === "CONFIRMED" &&
        event.metadata.toStatus === "DONE",
    ),
  );
  assert.ok(
    customerHistory.json().events.some(
      (event: { metadata: { appointmentId?: string; fromStatus?: string; toStatus?: string } | null; type: string }) =>
        event.type === "customer.appointment_status_changed" &&
        event.metadata?.appointmentId === cancellableAppointmentId &&
        event.metadata.fromStatus === "SCHEDULED" &&
        event.metadata.toStatus === "CANCELLED",
    ),
  );
  assert.ok(
    customerHistory
      .json()
      .events.some(
        (event: { metadata: { actorRole?: string; origin?: string } | null; title: string; type: string }) =>
          event.type === "customer.created" &&
          event.title === "Cliente criado" &&
          event.metadata?.origin === "qa-api" &&
          event.metadata?.actorRole === ownerBody.user.role,
      ),
  );
  assert.ok(customerHistory.json().events.length >= 1);

  const blockedCustomerHistoryTracker = await app.inject({
    method: "POST",
    url: `/customers/${createdCustomerId}/history-notes`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      description: '<img src="https://tracker.example/customer-history.png">',
      noteType: "OBSERVATION",
    },
  });
  assert.equal(blockedCustomerHistoryTracker.statusCode, 400);
  assert.equal(blockedCustomerHistoryTracker.json().error.code, "VALIDATION_ERROR");

  const createCustomerHistoryNote = await app.inject({
    method: "POST",
    url: `/customers/${createdCustomerId}/history-notes`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      description: "Cliente pediu retorno com proposta revisada.",
      noteType: "FOLLOW_UP",
    },
  });
  assert.equal(createCustomerHistoryNote.statusCode, 201);
  const customerHistoryNoteId = createCustomerHistoryNote.json().data.id as string;
  assert.equal(createCustomerHistoryNote.json().data.type, "customer.manual_note_created");
  assert.equal(createCustomerHistoryNote.json().data.description, "Cliente pediu retorno com proposta revisada.");

  const customerHistoryAfterManualNote = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}/history`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerHistoryAfterManualNote.statusCode, 200);
  assert.ok(customerHistoryAfterManualNote.json().events.some((event: { id: string }) => event.id === customerHistoryNoteId));
  assert.ok(
    customerHistoryAfterManualNote
      .json()
      .timeline.some((item: { entityId: string; kind: string; title: string }) => item.entityId === customerHistoryNoteId && item.kind === "event" && item.title === "Observacao manual registrada"),
  );

  const soldInventory = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(soldInventory.statusCode, 200);
  assert.equal(soldInventory.json().data.status, "SOLD");

  const sellerFinanceList = await app.inject({
    method: "GET",
    url: "/finance/transactions",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerFinanceList.statusCode, 403);
  assert.equal(sellerFinanceList.json().error.code, "FORBIDDEN");

  const financeDueDate = new Date(Date.now() + 86400000);
  const financeDueAt = financeDueDate.toISOString();
  const summaryFrom = new Date(financeDueDate.getTime() - 1000).toISOString();
  const summaryTo = new Date(financeDueDate.getTime() + 1000).toISOString();

  const createSaleIncome = await app.inject({
    method: "POST",
    url: "/finance/transactions",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      type: "INCOME",
      status: "SCHEDULED",
      description: "Receita venda Civic Touring",
      amount: 124000,
      dueAt: financeDueAt,
      entityType: "sale",
      entityId: saleId,
      snapshot: {
        source: "qa-sale-close",
      },
    },
  });
  assert.equal(createSaleIncome.statusCode, 201);
  assert.equal(createSaleIncome.json().data.entityId, saleId);
  const incomeTransactionId = createSaleIncome.json().data.id as string;

  const createInventoryExpense = await app.inject({
    method: "POST",
    url: "/finance/transactions",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      type: "EXPENSE",
      status: "PENDING",
      description: "Despesa operacional vinculada ao estoque",
      amount: 1200,
      dueAt: financeDueAt,
      entityType: "vehicle_inventory",
      entityId: inventoryId,
    },
  });
  assert.equal(createInventoryExpense.statusCode, 201);
  assert.equal(createInventoryExpense.json().data.amount, "1200");

  const listFinance = await app.inject({
    method: "GET",
    url: `/finance/transactions?entity_type=sale&entity_id=${saleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listFinance.statusCode, 200);
  assert.ok(listFinance.json().items.some((transaction: { id: string }) => transaction.id === incomeTransactionId));

  const settleIncome = await app.inject({
    method: "POST",
    url: `/finance/transactions/${incomeTransactionId}/settle`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "PAID",
      paidAt: financeDueAt,
      reason: "Recebimento confirmado em QA",
    },
  });
  assert.equal(settleIncome.statusCode, 200);
  assert.equal(settleIncome.json().data.status, "PAID");
  assert.equal(settleIncome.json().data.paidAt, financeDueAt);

  const financeSummary = await app.inject({
    method: "GET",
    url: `/finance/summary?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(financeSummary.statusCode, 200);
  assert.ok(financeSummary.json().totals.income >= 124000);
  assert.ok(financeSummary.json().totals.expense >= 1200);
  assert.ok(financeSummary.json().totals.net >= 122800);

  const sellerCommissionsGlobal = await app.inject({
    method: "GET",
    url: "/commissions",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerCommissionsGlobal.statusCode, 403);
  assert.equal(sellerCommissionsGlobal.json().error.code, "FORBIDDEN");

  const adHocCommissionRule = await app.inject({
    method: "POST",
    url: "/commissions/calculate",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      userId: sellerUserId,
      basis: "GROSS_MARGIN_PERCENT",
      value: 10,
    },
  });
  assert.equal(adHocCommissionRule.statusCode, 400);
  assert.equal(adHocCommissionRule.json().error.code, "VALIDATION_ERROR");

  const createCommissionRule = await app.inject({
    method: "POST",
    url: "/commissions/rules",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "QA 10% margem bruta",
      basis: "GROSS_MARGIN_PERCENT",
      value: 10,
      snapshot: {
        source: "smoke-test",
      },
    },
  });
  assert.equal(createCommissionRule.statusCode, 201);
  assert.equal(createCommissionRule.json().data.basis, "GROSS_MARGIN_PERCENT");
  assert.equal(createCommissionRule.json().data.value, "10");
  const commissionRuleId = createCommissionRule.json().data.id as string;

  const calculateCommission = await app.inject({
    method: "POST",
    url: "/commissions/calculate",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      userId: sellerUserId,
      ruleId: commissionRuleId,
    },
  });
  assert.equal(calculateCommission.statusCode, 201);
  assert.equal(calculateCommission.json().data.userId, sellerUserId);
  assert.equal(calculateCommission.json().data.amount, "2215");
  assert.equal(calculateCommission.json().data.ruleId, commissionRuleId);
  const commissionId = calculateCommission.json().data.id as string;

  const sellerOwnCommissions = await app.inject({
    method: "GET",
    url: "/commissions/mine",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerOwnCommissions.statusCode, 200);
  assert.ok(sellerOwnCommissions.json().items.some((commission: { id: string }) => commission.id === commissionId));

  const adjustCommission = await app.inject({
    method: "POST",
    url: `/commissions/${commissionId}/adjustments`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      amount: 100,
      reason: "Bonus operacional em QA",
    },
  });
  assert.equal(adjustCommission.statusCode, 201);
  assert.equal(adjustCommission.json().data.commission.amount, "2315");

  const approveCommission = await app.inject({
    method: "POST",
    url: `/commissions/${commissionId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "APPROVED",
      reason: "Comissao validada em QA",
    },
  });
  assert.equal(approveCommission.statusCode, 200);
  assert.equal(approveCommission.json().data.status, "APPROVED");
  assert.ok(approveCommission.json().data.approvedAt);

  const payCommission = await app.inject({
    method: "POST",
    url: `/commissions/${commissionId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "PAID",
      reason: "Pagamento validado em QA",
    },
  });
  assert.equal(payCommission.statusCode, 200);
  assert.equal(payCommission.json().data.status, "PAID");
  assert.ok(payCommission.json().data.paidAt);

  const generateContract = await app.inject({
    method: "POST",
    url: "/contracts/generate",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      status: "GENERATED",
      snapshot: {
        qa: true,
        note: "Contrato gerado no smoke test",
      },
    },
  });
  assert.equal(generateContract.statusCode, 201);
  assert.equal(generateContract.json().data.saleId, saleId);
  assert.equal(generateContract.json().data.version, 1);
  assert.equal(generateContract.json().data.status, "GENERATED");
  const contractId = generateContract.json().data.id as string;
  assert.equal(generateContract.json().warrantyTerm.saleId, saleId);
  assert.equal(generateContract.json().warrantyTerm.sourceContractId, contractId);
  assert.equal(generateContract.json().warrantyTerm.status, "READY_TO_PRINT");
  const warrantyTermId = generateContract.json().warrantyTerm.id as string;

  const listContracts = await app.inject({
    method: "GET",
    url: `/contracts?sale_id=${saleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listContracts.statusCode, 200);
  assert.ok(listContracts.json().items.some((contract: { id: string }) => contract.id === contractId));

  const getContract = await app.inject({
    method: "GET",
    url: `/contracts/${contractId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getContract.statusCode, 200);
  assert.equal(getContract.json().data.snapshot.sale.id, saleId);

  const signContract = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/sign`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      signedAt: financeDueAt,
      reason: "Assinatura validada em QA",
    },
  });
  assert.equal(signContract.statusCode, 200);
  assert.equal(signContract.json().data.status, "SIGNED");
  assert.equal(signContract.json().data.signedAt, financeDueAt);

  const blockedTechnicalDeliverySchedule = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      scheduledAt: new Date(new Date(financeDueAt).getTime() + 3600000).toISOString(),
    },
  });
  assert.equal(blockedTechnicalDeliverySchedule.statusCode, 422);
  assert.equal(blockedTechnicalDeliverySchedule.json().error.code, "BUSINESS_RULE_ERROR");
  assert.ok(blockedTechnicalDeliverySchedule.json().error.details.pendingPrerequisites.includes("buyer_documents_checked"));
  assert.ok(blockedTechnicalDeliverySchedule.json().error.details.pendingPrerequisites.includes("warranty_term_signed"));

  const listWarrantyTerms = await app.inject({
    method: "GET",
    url: `/contracts/warranty-terms?sale_id=${saleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listWarrantyTerms.statusCode, 200);
  assert.ok(listWarrantyTerms.json().items.some((term: { id: string; generatedFileId: string | null }) => term.id === warrantyTermId && Boolean(term.generatedFileId)));

  const warrantyTermDocument = await app.inject({
    method: "GET",
    url: `/contracts/warranty-terms/${warrantyTermId}/document?format=html`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(warrantyTermDocument.statusCode, 200);
  assert.match(warrantyTermDocument.body, /Termo de Garantia de 90 Dias/);

  const sellerWarrantySummaryBeforeSignature = await app.inject({
    method: "GET",
    url: `/contracts/sales/${saleId}/signature-summary`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerWarrantySummaryBeforeSignature.statusCode, 200);
  assert.ok(sellerWarrantySummaryBeforeSignature.json().data.pendingItems.includes("warranty_term_signed"));

  const printWarrantyTerm = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${warrantyTermId}/print`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      printerConfigured: true,
    },
  });
  assert.equal(printWarrantyTerm.statusCode, 200);
  assert.equal(printWarrantyTerm.json().data.status, "PRINTED");
  assert.ok(printWarrantyTerm.json().data.printedAt);

  const reprintWarrantyTerm = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${warrantyTermId}/print`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      printerConfigured: true,
      reason: "Cliente solicitou segunda via para assinatura fisica",
    },
  });
  assert.equal(reprintWarrantyTerm.statusCode, 200);
  assert.equal(reprintWarrantyTerm.json().data.status, "REPRINTED");
  assert.equal(reprintWarrantyTerm.json().data.reprintCount, 1);

  const blockedWarrantyWaiverWithoutReason = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${warrantyTermId}/confirm-signature`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      signedStatus: "WAIVED",
    },
  });
  assert.equal(blockedWarrantyWaiverWithoutReason.statusCode, 400);
  assert.equal(blockedWarrantyWaiverWithoutReason.json().error.code, "VALIDATION_ERROR");

  const confirmWarrantySignature = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${warrantyTermId}/confirm-signature`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      signedStatus: "SIGNED",
      observation: "Termo assinado fisicamente pelo comprador no smoke US06",
      allDocumentsSignedStatus: "ALL_SIGNED",
    },
  });
  assert.equal(confirmWarrantySignature.statusCode, 200);
  assert.equal(confirmWarrantySignature.json().data.signedStatus, "SIGNED");
  assert.equal(confirmWarrantySignature.json().data.allDocumentsSignedStatus, "ALL_SIGNED");

  const sellerWarrantySummaryAfterSignature = await app.inject({
    method: "GET",
    url: `/contracts/sales/${saleId}/signature-summary`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerWarrantySummaryAfterSignature.statusCode, 200);
  assert.equal(sellerWarrantySummaryAfterSignature.json().data.warrantyTerm.signedStatus, "SIGNED");
  assert.ok(!sellerWarrantySummaryAfterSignature.json().data.pendingItems.includes("warranty_term_signed"));
  const deliveryChecklist = await app.inject({
    method: "POST",
    url: "/contracts/delivery-checklists",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      status: "DELIVERED",
      deliveredAt: financeDueAt,
      checklist: {
        documentosEntregues: true,
        manualChaveReserva: true,
      },
    },
  });
  assert.equal(deliveryChecklist.statusCode, 201);
  assert.equal(deliveryChecklist.json().data.status, "DELIVERED");
  assert.equal(deliveryChecklist.json().data.deliveredAt, financeDueAt);

  await prisma.saleDocumentChecklist.createMany({
    data: [
      {
        storeId: ownerBody.user.storeId,
        saleId,
        itemKey: "buyer_document_delivered",
        label: "Documentos do comprador entregues",
        isDone: true,
        completedAt: new Date(financeDueAt),
      },
      {
        storeId: ownerBody.user.storeId,
        saleId,
        itemKey: "buyer_document_checked",
        label: "Documentos do comprador conferidos",
        isDone: true,
        completedAt: new Date(financeDueAt),
      },
    ],
  });

  const administrativeLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "administrativo@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(administrativeLogin.statusCode, 200);
  const administrativeBody = administrativeLogin.json() as { token: string; user: { id: string } };
  const technicalDeliveryAt = new Date(new Date(financeDueAt).getTime() + 7200000).toISOString();

  const sellerScheduleTechnicalDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
    payload: {
      saleId,
      scheduledAt: technicalDeliveryAt,
    },
  });
  assert.equal(sellerScheduleTechnicalDelivery.statusCode, 403);

  await prisma.saleInspectionReport.createMany({
    data: [
      {
        storeId: ownerBody.user.storeId,
        saleId,
        vehicleId: inventoryVehicleId,
        customerId: createdCustomerId,
        reportType: "CAUTIONARY",
        status: "PENDING",
        metadata: { source: "smoke_technical_delivery_setup" },
      },
      {
        storeId: ownerBody.user.storeId,
        saleId,
        vehicleId: inventoryVehicleId,
        customerId: createdCustomerId,
        reportType: "TRANSFER",
        status: "PENDING",
        metadata: { source: "smoke_technical_delivery_setup" },
      },
    ],
    skipDuplicates: true,
  });

  const technicalDeliveryInspectionReports = await app.inject({
    method: "GET",
    url: `/contracts/inspection-reports?sale_id=${saleId}&page_size=10`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(technicalDeliveryInspectionReports.statusCode, 200);
  assert.equal(technicalDeliveryInspectionReports.json().summary.blockedForRelease, true);
  type TechnicalDeliveryInspectionReport = {
    id: string;
    reportType: string;
    isRequired: boolean;
  };
  const technicalDeliveryReportItems = technicalDeliveryInspectionReports.json().items as TechnicalDeliveryInspectionReport[];
  const technicalDeliveryCautionaryReport = technicalDeliveryReportItems.find((item) => item.reportType === "CAUTIONARY");
  const technicalDeliveryTransferReport = technicalDeliveryReportItems.find((item) => item.reportType === "TRANSFER");
  assert.ok(technicalDeliveryCautionaryReport);
  assert.ok(technicalDeliveryTransferReport);

  const technicalDeliveryCautionaryUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "vehicle-documents",
      originalName: "laudo-cautelar-entrega-tecnica.pdf",
      mimeType: "application/pdf",
      sizeBytes: 24567,
      classification: "cautionary_report",
      link: { entityType: "vehicle", entityId: inventoryVehicleId, purpose: "cautionary_report" },
    },
  });
  assert.equal(technicalDeliveryCautionaryUpload.statusCode, 201);

  const technicalDeliveryTransferUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "laudo-transferencia-entrega-tecnica.pdf",
      mimeType: "application/pdf",
      sizeBytes: 25678,
      classification: "transfer_report",
      link: { entityType: "sale", entityId: saleId, purpose: "transfer_report" },
    },
  });
  assert.equal(technicalDeliveryTransferUpload.statusCode, 201);

  const checkTechnicalDeliveryCautionaryReport = await app.inject({
    method: "PATCH",
    url: `/contracts/inspection-reports/${technicalDeliveryCautionaryReport.id}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      reportFileId: technicalDeliveryCautionaryUpload.json().data.id,
      reportDate: financeDueAt,
      status: "CHECKED",
      replacementReason: "Atualizacao validada no smoke de entrega tecnica",
      notes: "Laudo cautelar conferido antes da entrega tecnica",
    },
  });
  assert.equal(checkTechnicalDeliveryCautionaryReport.statusCode, 200);

  const checkTechnicalDeliveryTransferReport = await app.inject({
    method: "PATCH",
    url: `/contracts/inspection-reports/${technicalDeliveryTransferReport.id}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      reportFileId: technicalDeliveryTransferUpload.json().data.id,
      reportDate: financeDueAt,
      status: "CHECKED",
      notes: "Laudo de transferencia conferido antes da entrega tecnica",
    },
  });
  assert.equal(checkTechnicalDeliveryTransferReport.statusCode, 200);
  assert.equal(checkTechnicalDeliveryTransferReport.json().summary.blockedForRelease, false);

  const scheduleTechnicalDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: {
      authorization: `Bearer ${administrativeBody.token}`,
    },
    payload: {
      saleId,
      scheduledAt: technicalDeliveryAt,
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(scheduleTechnicalDelivery.statusCode, 201);
  assert.equal(scheduleTechnicalDelivery.json().data.saleId, saleId);
  assert.equal(scheduleTechnicalDelivery.json().data.status, "SCHEDULED");
  assert.equal(scheduleTechnicalDelivery.json().data.vehicleId, inventoryVehicleId);
  assert.equal(scheduleTechnicalDelivery.json().data.customerId, createdCustomerId);
  const technicalDeliveryId = scheduleTechnicalDelivery.json().data.id as string;

  const sellerTechnicalDeliveryNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=technical_delivery_scheduled&entity_id=${technicalDeliveryId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerTechnicalDeliveryNotification.statusCode, 200);
  assert.ok(
    sellerTechnicalDeliveryNotification
      .json()
      .items.some(
        (notification: { actionUrl: string; dueAt: string; priority: string; sourceModule: string; status: string }) =>
          notification.priority === "HIGH" &&
          notification.status === "NEW" &&
          notification.sourceModule === "technical_deliveries" &&
          notification.actionUrl === `/technical-deliveries/${technicalDeliveryId}` &&
          notification.dueAt === technicalDeliveryAt,
      ),
  );

  const sellerTechnicalDeliveries = await app.inject({
    method: "GET",
    url: `/technical-deliveries?sale_id=${saleId}`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerTechnicalDeliveries.statusCode, 200);
  const sellerTechnicalDeliveryItem = sellerTechnicalDeliveries.json().items.find((delivery: { id: string }) => delivery.id === technicalDeliveryId);
  assert.ok(sellerTechnicalDeliveryItem);
  assert.equal(sellerTechnicalDeliveryItem.activeNotifications.count, 1);
  assert.equal(sellerTechnicalDeliveryItem.activeNotifications.highestPriority, "HIGH");
  assert.ok(sellerTechnicalDeliveryItem.activeNotifications.types.includes("technical_delivery_scheduled"));

  const rescheduledTechnicalDeliveryAt = new Date(new Date(financeDueAt).getTime() + 10800000).toISOString();
  const rescheduleTechnicalDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: {
      authorization: `Bearer ${administrativeBody.token}`,
    },
    payload: {
      saleId,
      scheduledAt: rescheduledTechnicalDeliveryAt,
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(rescheduleTechnicalDelivery.statusCode, 200);
  assert.equal(rescheduleTechnicalDelivery.json().data.status, "RESCHEDULED");
  assert.equal(rescheduleTechnicalDelivery.json().data.scheduledAt, rescheduledTechnicalDeliveryAt);

  const sellerTechnicalDeliveryRescheduledNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=technical_delivery_scheduled&entity_id=${technicalDeliveryId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerTechnicalDeliveryRescheduledNotification.statusCode, 200);
  assert.ok(
    sellerTechnicalDeliveryRescheduledNotification
      .json()
      .items.some(
        (notification: { dueAt: string; title: string }) =>
          notification.dueAt === rescheduledTechnicalDeliveryAt && notification.title === "Entrega tecnica reagendada",
      ),
  );

  const technicalDeliveryAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=technical_deliveries&action=technical_delivery_rescheduled&entity_type=technical_delivery&entity_id=${technicalDeliveryId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(technicalDeliveryAudit.statusCode, 200);
  assert.ok(
    technicalDeliveryAudit
      .json()
      .items.some(
        (log: { metadata: { saleId?: string; previousScheduledAt?: string | null; scheduledAt?: string } }) =>
          log.metadata.saleId === saleId &&
          log.metadata.previousScheduledAt === technicalDeliveryAt &&
          log.metadata.scheduledAt === rescheduledTechnicalDeliveryAt,
      ),
  );

  // --- Technical delivery lifecycle: cancel, document, print, signed copy (S2-US06) ---

  // Cancel: permission by role (seller forbidden) + happy path (administrative).
  const sellerCancelTechnicalDelivery = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/cancel`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { reason: "Tentativa de cancelamento pelo vendedor em QA" },
  });
  assert.equal(sellerCancelTechnicalDelivery.statusCode, 403);

  const cancelTechnicalDelivery = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/cancel`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { reason: "Cliente desistiu da entrega tecnica em QA" },
  });
  assert.equal(cancelTechnicalDelivery.statusCode, 200);
  assert.equal(cancelTechnicalDelivery.json().data.status, "CANCELLED");

  // Rescheduling revives a cancelled delivery (clears the cancellation).
  const reviveTechnicalDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { saleId, scheduledAt: rescheduledTechnicalDeliveryAt, responsibleUserId: administrativeBody.user.id },
  });
  assert.equal(reviveTechnicalDelivery.statusCode, 200);
  assert.equal(reviveTechnicalDelivery.json().data.status, "RESCHEDULED");

  // Generate document: not found (404), seller forbidden (403), administrative happy path (201).
  const generateUnknownDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/00000000-0000-4000-8000-000000000000/generate-document",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(generateUnknownDelivery.statusCode, 404);

  const sellerGenerateDocument = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/generate-document`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerGenerateDocument.statusCode, 403);

  const generateTechnicalDeliveryDocument = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/generate-document`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(generateTechnicalDeliveryDocument.statusCode, 201);
  assert.equal(generateTechnicalDeliveryDocument.json().data.status, "DOCUMENT_GENERATED");
  assert.ok(generateTechnicalDeliveryDocument.json().data.documentFileId);
  assert.ok((generateTechnicalDeliveryDocument.json().document.number as string).startsWith("ET-"));

  const documentGeneratedAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=technical_deliveries&action=technical_delivery_document_generated&entity_type=technical_delivery&entity_id=${technicalDeliveryId}&page=1&page_size=5`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(documentGeneratedAudit.statusCode, 200);
  assert.ok(documentGeneratedAudit.json().items.some((log: { metadata: { documentId?: string } }) => Boolean(log.metadata.documentId)));

  // Get document: unauthenticated (401), not found (404), seller views own (200), print-ready HTML.
  const unauthenticatedDocument = await app.inject({
    method: "GET",
    url: `/technical-deliveries/${technicalDeliveryId}/document`,
  });
  assert.equal(unauthenticatedDocument.statusCode, 401);

  const unknownDeliveryDocument = await app.inject({
    method: "GET",
    url: "/technical-deliveries/00000000-0000-4000-8000-000000000000/document",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(unknownDeliveryDocument.statusCode, 404);

  const sellerViewDocument = await app.inject({
    method: "GET",
    url: `/technical-deliveries/${technicalDeliveryId}/document`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerViewDocument.statusCode, 200);
  assert.equal(sellerViewDocument.json().document.customer.name, "Cliente Contrato API");
  assert.ok((sellerViewDocument.json().html as string).includes("Piscas/setas"));

  const documentHtml = await app.inject({
    method: "GET",
    url: `/technical-deliveries/${technicalDeliveryId}/document?format=html`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(documentHtml.statusCode, 200);
  assert.match(documentHtml.headers["content-type"] as string, /text\/html/);
  assert.ok(documentHtml.body.includes("Entrega Tecnica"));

  // Print: seller forbidden (403), administrative happy path (200, manual PDF when no printer).
  const sellerPrintTechnicalDelivery = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/print`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {},
  });
  assert.equal(sellerPrintTechnicalDelivery.statusCode, 403);

  const printTechnicalDelivery = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/print`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {},
  });
  assert.equal(printTechnicalDelivery.statusCode, 200);
  assert.equal(printTechnicalDelivery.json().data.status, "PRINTED_PENDING_SIGNATURE");
  assert.equal(printTechnicalDelivery.json().data.printStatus, "PRINTED");
  assert.equal(printTechnicalDelivery.json().print.mode, "manual_pdf");

  const ownerTechnicalDeliveryWithPendingNotification = await app.inject({
    method: "GET",
    url: `/technical-deliveries/${technicalDeliveryId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerTechnicalDeliveryWithPendingNotification.statusCode, 200);
  assert.ok(ownerTechnicalDeliveryWithPendingNotification.json().data.activeNotifications.count >= 2);
  assert.equal(ownerTechnicalDeliveryWithPendingNotification.json().data.activeNotifications.highestPriority, "HIGH");
  assert.ok(ownerTechnicalDeliveryWithPendingNotification.json().data.activeNotifications.types.includes("technical_delivery_signed_copy_pending"));

  const signedCopyPendingNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=technical_delivery_signed_copy_pending&entity_id=${technicalDeliveryId}&status=NEW&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(signedCopyPendingNotification.statusCode, 200);
  assert.ok(
    signedCopyPendingNotification
      .json()
      .items.some(
        (notification: { actionUrl: string; priority: string; sourceModule: string; userId: string }) =>
          notification.userId === ownerBody.user.id &&
          notification.priority === "HIGH" &&
          notification.sourceModule === "technical_deliveries" &&
          notification.actionUrl === `/technical-deliveries/${technicalDeliveryId}`,
      ),
  );

  // Signed copy: upload the scanned page, then register it (links to the vehicle digital folder).
  const signedCopyUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "vehicle-documents",
      originalName: "via-assinada-entrega-tecnica.pdf",
      mimeType: "application/pdf",
      sizeBytes: 23456,
      classification: "signed_copy",
      link: { entityType: "vehicle", entityId: inventoryVehicleId },
    },
  });
  assert.equal(signedCopyUpload.statusCode, 201);
  const signedCopyFileId = signedCopyUpload.json().data.id as string;

  const sellerRegisterSignedCopy = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/signed-copy`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { signedCopyFileId },
  });
  assert.equal(sellerRegisterSignedCopy.statusCode, 403);

  const registerSignedCopy = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/signed-copy`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { signedCopyFileId },
  });
  assert.equal(registerSignedCopy.statusCode, 200);
  assert.equal(registerSignedCopy.json().data.status, "COMPLETED_SIGNED");
  assert.equal(registerSignedCopy.json().data.signedCopyStatus, "RECEIVED");
  assert.equal(registerSignedCopy.json().data.signedCopyFileId, signedCopyFileId);

  const signedCopyResolvedNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=technical_delivery_signed_copy_pending&entity_id=${technicalDeliveryId}&status=RESOLVED&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(signedCopyResolvedNotification.statusCode, 200);
  assert.ok(
    signedCopyResolvedNotification
      .json()
      .items.some(
        (notification: { resolvedByUserId: string; status: string }) =>
          notification.status === "RESOLVED" && notification.resolvedByUserId === administrativeBody.user.id,
      ),
  );

  const sellerDeliveryResolvedNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=technical_delivery_scheduled&entity_id=${technicalDeliveryId}&status=RESOLVED&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerDeliveryResolvedNotification.statusCode, 200);
  assert.ok(
    sellerDeliveryResolvedNotification
      .json()
      .items.some((notification: { resolvedByUserId: string; status: string }) => notification.status === "RESOLVED" && notification.resolvedByUserId === administrativeBody.user.id),
  );

  const sellerCompletedTechnicalDelivery = await app.inject({
    method: "GET",
    url: `/technical-deliveries/${technicalDeliveryId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerCompletedTechnicalDelivery.statusCode, 200);
  assert.equal(sellerCompletedTechnicalDelivery.json().data.activeNotifications.count, 0);

  const signedCopyVehicleLink = await prisma.fileAttachmentLink.findFirst({
    where: {
      attachmentId: signedCopyFileId,
      entityType: "vehicle",
      entityId: inventoryVehicleId,
      purpose: "technical_delivery_signed_copy",
    },
  });
  assert.ok(signedCopyVehicleLink);

  const signedCopyTransitionAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=technical_deliveries&action=technical_delivery_status_changed&entity_type=technical_delivery&entity_id=${technicalDeliveryId}&page=1&page_size=20`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(signedCopyTransitionAudit.statusCode, 200);
  assert.ok(
    signedCopyTransitionAudit
      .json()
      .items.some(
        (log: { metadata: { toStatus?: string; action?: string } }) =>
          log.metadata.toStatus === "COMPLETED_SIGNED" && log.metadata.action === "register_signed_copy",
      ),
  );

  // Blocked transitions once completed: signed copy again (422) and cancel (422, terminal).
  const duplicateSignedCopy = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/signed-copy`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { signedCopyFileId },
  });
  assert.equal(duplicateSignedCopy.statusCode, 422);

  const cancelCompletedTechnicalDelivery = await app.inject({
    method: "POST",
    url: `/technical-deliveries/${technicalDeliveryId}/cancel`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { reason: "Tentativa de cancelar entrega ja concluida em QA" },
  });
  assert.equal(cancelCompletedTechnicalDelivery.statusCode, 422);
  checkpoint("technical-deliveries/lifecycle");

  const sellerDispatch = await app.inject({
    method: "GET",
    url: "/dispatch/processes",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerDispatch.statusCode, 403);
  assert.equal(sellerDispatch.json().error.code, "FORBIDDEN");

  const incompleteDispatch = await app.inject({
    method: "POST",
    url: "/dispatch/processes",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      providerId: serviceProviderId,
      status: "AWAITING_DOCUMENTS",
      metadata: {
        protocol: uniqueToken("DSP-QA-INCOMPLETE"),
        vehicleId: inventoryVehicleId,
      },
    },
  });
  assert.equal(incompleteDispatch.statusCode, 201);
  assert.equal(incompleteDispatch.json().data.packageStatus, "AWAITING_DOCUMENTS");
  assert.ok(
    incompleteDispatch
      .json()
      .package.missingDocuments.some((item: { key: string; reason: string }) => item.key === "transfer_mode" && item.reason === "transfer_mode_missing"),
  );
  const incompleteDispatchId = incompleteDispatch.json().data.id as string;

  const blockedDispatchSend = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${incompleteDispatchId}/send-package`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {},
  });
  assert.equal(blockedDispatchSend.statusCode, 422);
  assert.equal(blockedDispatchSend.json().error.code, "BUSINESS_RULE_ERROR");
  assert.ok(blockedDispatchSend.json().error.details.missingDocuments.some((item: { key: string }) => item.key === "transfer_mode"));

  const buyerIdentityForDispatch = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "customer-documents",
      originalName: "documento-comprador-despachante.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1100,
      classification: "buyer_identity_document",
      link: { entityType: "customer", entityId: createdCustomerId, purpose: "person_identity_document" },
    },
  });
  assert.equal(buyerIdentityForDispatch.statusCode, 201);
  const buyerIdentityForDispatchId = buyerIdentityForDispatch.json().data.id as string;

  const buyerAddressForDispatch = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "customer-documents",
      originalName: "comprovante-residencia-despachante.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      classification: "buyer_address_proof",
      link: { entityType: "customer", entityId: createdCustomerId, purpose: "person_address_proof" },
    },
  });
  assert.equal(buyerAddressForDispatch.statusCode, 201);
  const buyerAddressForDispatchId = buyerAddressForDispatch.json().data.id as string;

  const signedContractForDispatch = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "contrato-assinado-despachante.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2200,
      classification: "signed_contract",
      link: { entityType: "contract", entityId: contractId, purpose: "signed_contract" },
    },
  });
  assert.equal(signedContractForDispatch.statusCode, 201);

  await prisma.saleDocumentChecklist.upsert({
    where: { saleId_itemKey: { saleId, itemKey: "person_identity_document" } },
    update: {
      status: "CHECKED",
      isDone: true,
      attachmentId: buyerIdentityForDispatchId,
      completedAt: new Date(financeDueAt),
      checkedAt: new Date(financeDueAt),
      checkedByUserId: ownerBody.user.id,
    },
    create: {
      storeId: ownerBody.user.storeId,
      saleId,
      itemKey: "person_identity_document",
      label: "RG ou CNH do comprador",
      status: "CHECKED",
      isDone: true,
      attachmentId: buyerIdentityForDispatchId,
      completedAt: new Date(financeDueAt),
      checkedAt: new Date(financeDueAt),
      checkedByUserId: ownerBody.user.id,
    },
  });
  await prisma.saleDocumentChecklist.upsert({
    where: { saleId_itemKey: { saleId, itemKey: "person_address_proof" } },
    update: {
      status: "CHECKED",
      isDone: true,
      attachmentId: buyerAddressForDispatchId,
      issueDate: new Date(financeDueAt),
      completedAt: new Date(financeDueAt),
      checkedAt: new Date(financeDueAt),
      checkedByUserId: ownerBody.user.id,
    },
    create: {
      storeId: ownerBody.user.storeId,
      saleId,
      itemKey: "person_address_proof",
      label: "Comprovante de residencia do comprador",
      status: "CHECKED",
      isDone: true,
      attachmentId: buyerAddressForDispatchId,
      issueDate: new Date(financeDueAt),
      completedAt: new Date(financeDueAt),
      checkedAt: new Date(financeDueAt),
      checkedByUserId: ownerBody.user.id,
      metadata: { category: "address_proof", maxAgeDays: 92 },
    },
  });

  const createDispatch = await app.inject({
    method: "POST",
    url: "/dispatch/processes",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      providerId: serviceProviderId,
      status: "AWAITING_DOCUMENTS",
      transferMode: "GREEN_RECEIPT_PHYSICAL",
      metadata: {
        protocol: uniqueToken("DSP-QA"),
        vehicleId: inventoryVehicleId,
      },
    },
  });
  assert.equal(createDispatch.statusCode, 201);
  assert.equal(createDispatch.json().data.saleId, saleId);
  assert.equal(createDispatch.json().data.providerId, serviceProviderId);
  assert.equal(createDispatch.json().data.transferMode, "GREEN_RECEIPT_PHYSICAL");
  assert.equal(createDispatch.json().data.dispatcherPreferredChannel, "MANUAL_PHYSICAL");
  assert.equal(createDispatch.json().package.ready, true);
  assert.equal(createDispatch.json().package.physicalDeliveryRequired, true);
  const dispatchId = createDispatch.json().data.id as string;

  const listDispatch = await app.inject({
    method: "GET",
    url: `/dispatch/processes?sale_id=${saleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listDispatch.statusCode, 200);
  assert.ok(listDispatch.json().items.some((process: { id: string }) => process.id === dispatchId));

  const reviewDispatchPackage = await app.inject({
    method: "GET",
    url: `/dispatch/processes/${dispatchId}/package`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(reviewDispatchPackage.statusCode, 200);
  assert.equal(reviewDispatchPackage.json().package.ready, true);
  assert.equal(reviewDispatchPackage.json().package.preferredChannel, "MANUAL_PHYSICAL");
  assert.ok(
    reviewDispatchPackage
      .json()
      .package.documentsIncluded.some((document: { key: string; attachmentId: string | null }) => document.key === "transfer_report" && Boolean(document.attachmentId)),
  );

  const printDispatchPackage = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/print-package`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      printerConfigured: false,
      notes: "Recibo verde exige entrega fisica ao despachante",
    },
  });
  assert.equal(printDispatchPackage.statusCode, 200);
  assert.equal(printDispatchPackage.json().data.status, "PRINTED");
  assert.equal(printDispatchPackage.json().data.packageStatus, "PRINTED");
  assert.ok(printDispatchPackage.json().print.documents.length >= 5);

  const sendDispatchPackage = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/send-package`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {},
  });
  assert.equal(sendDispatchPackage.statusCode, 200);
  assert.equal(sendDispatchPackage.json().delivery.channel, "MANUAL_PHYSICAL");
  assert.equal(sendDispatchPackage.json().delivery.physicalDeliveryRequired, true);

  const protocolUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "protocolo-despachante.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1300,
      classification: "dispatcher_protocol",
      link: { entityType: "sale", entityId: saleId, purpose: "dispatcher_protocol" },
    },
  });
  assert.equal(protocolUpload.statusCode, 201);
  const protocolFileId = protocolUpload.json().data.id as string;

  const deliverDispatchPackage = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/deliver`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      deliveredAt: financeDueAt,
      protocolNumber: "DSP-QA-PROTOCOLO",
      protocolFileId,
      notes: "Pacote fisico entregue ao despachante no smoke test",
    },
  });
  assert.equal(deliverDispatchPackage.statusCode, 200);
  assert.equal(deliverDispatchPackage.json().data.status, "PROTOCOL_RECEIVED");
  assert.equal(deliverDispatchPackage.json().data.protocolNumber, "DSP-QA-PROTOCOLO");
  assert.equal(deliverDispatchPackage.json().data.protocolFileId, protocolFileId);

  const sellerDispatchStatus = await app.inject({
    method: "GET",
    url: `/dispatch/processes/by-sale/${saleId}`,
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerDispatchStatus.statusCode, 200);
  assert.equal(sellerDispatchStatus.json().data.id, dispatchId);
  assert.equal(sellerDispatchStatus.json().data.status, "PROTOCOL_RECEIVED");

  const finishDispatch = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "COMPLETED",
      reason: "Transferencia finalizada no smoke test",
      metadata: {
        stage: "completed",
      },
    },
  });
  assert.equal(finishDispatch.statusCode, 200);
  assert.equal(finishDispatch.json().data.status, "COMPLETED");
  // --- Sprint 3 US08: document ready from dispatcher and assisted buyer notice ---
  const documentReadyWithoutProof = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/document-ready`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { sourceChannel: "MANUAL" },
  });
  assert.equal(documentReadyWithoutProof.statusCode, 400);

  const vehicleDocumentReadyUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "documento-veiculo-pronto.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1600,
      classification: "vehicle_document_ready",
      link: { entityType: "sale", entityId: saleId, purpose: "vehicle_document_ready_received" },
    },
  });
  assert.equal(vehicleDocumentReadyUpload.statusCode, 201);
  const vehicleDocumentReadyFileId = vehicleDocumentReadyUpload.json().data.id as string;

  const sellerCannotRegisterDocumentReady = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/document-ready`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {
      sourceChannel: "WHATSAPP",
      receivedFrom: "Despachante QA",
      fileId: vehicleDocumentReadyFileId,
      documentType: "CRLV_TRANSFERRED",
    },
  });
  assert.equal(sellerCannotRegisterDocumentReady.statusCode, 403);

  const registerDocumentReady = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/document-ready`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      sourceChannel: "WHATSAPP",
      receivedFrom: "Despachante QA",
      fileId: vehicleDocumentReadyFileId,
      documentType: "CRLV_TRANSFERRED",
      linkConfidence: "MANUAL",
      status: "LINKED",
    },
  });
  assert.equal(registerDocumentReady.statusCode, 201);
  assert.equal(registerDocumentReady.json().data.saleId, saleId);
  assert.equal(registerDocumentReady.json().data.fileId, vehicleDocumentReadyFileId);
  assert.equal(registerDocumentReady.json().data.status, "LINKED");
  assert.equal(registerDocumentReady.json().process.status, "COMPLETED");
  const documentReadyId = registerDocumentReady.json().data.id as string;

  const vehicleDocumentReadySaleLink = await prisma.fileAttachmentLink.findFirst({
    where: { attachmentId: vehicleDocumentReadyFileId, entityType: "sale", entityId: saleId, purpose: "vehicle_document_ready" },
  });
  assert.ok(vehicleDocumentReadySaleLink);

  const notifyBuyerDocumentReady = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/document-ready/${documentReadyId}/notify-buyer`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {},
  });
  assert.equal(notifyBuyerDocumentReady.statusCode, 201);
  assert.equal(notifyBuyerDocumentReady.json().data.documentReadyId, documentReadyId);
  assert.equal(notifyBuyerDocumentReady.json().data.channel, "WHATSAPP");
  assert.equal(notifyBuyerDocumentReady.json().data.attachmentFileId, vehicleDocumentReadyFileId);
  assert.equal(notifyBuyerDocumentReady.json().data.status, "PENDING");
  assert.equal(notifyBuyerDocumentReady.json().delivery.mode, "assisted_whatsapp_prepared");
  assert.equal(notifyBuyerDocumentReady.json().delivery.providerApproved, false);
  assert.match(notifyBuyerDocumentReady.json().data.messageTextSnapshot, /documento do veiculo/i);
  const buyerDocumentReadyNotificationId = notifyBuyerDocumentReady.json().data.id as string;

  const markBuyerNoticeSent = await app.inject({
    method: "PATCH",
    url: `/dispatch/processes/${dispatchId}/document-ready/${documentReadyId}/notifications/${buyerDocumentReadyNotificationId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { status: "SENT", sentAt: financeDueAt },
  });
  assert.equal(markBuyerNoticeSent.statusCode, 200);
  assert.equal(markBuyerNoticeSent.json().data.status, "SENT");
  assert.equal(markBuyerNoticeSent.json().data.sentAt, financeDueAt);

  const resendBuyerDocumentReady = await app.inject({
    method: "POST",
    url: `/dispatch/processes/${dispatchId}/document-ready/${documentReadyId}/notify-buyer`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      channel: "EMAIL",
      recipientContact: "cliente.contrato.api@gt3.local",
      status: "SENT",
      sentAt: financeDueAt,
      messageText: "Ola, Cliente Contrato API. Reenviamos o documento pronto do veiculo em anexo.",
    },
  });
  assert.equal(resendBuyerDocumentReady.statusCode, 201);
  assert.equal(resendBuyerDocumentReady.json().data.channel, "EMAIL");
  assert.equal(resendBuyerDocumentReady.json().data.status, "SENT");
  assert.equal(resendBuyerDocumentReady.json().data.retryCount, 1);
  assert.equal(resendBuyerDocumentReady.json().delivery.mode, "manual_send_registered");

  const sellerDocumentReadyView = await app.inject({
    method: "GET",
    url: `/dispatch/processes/${dispatchId}/document-ready`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerDocumentReadyView.statusCode, 200);
  assert.equal(sellerDocumentReadyView.json().data.documents[0].id, documentReadyId);
  assert.equal(sellerDocumentReadyView.json().data.documents[0].notificationAttempts.length, 2);

  const documentReadyAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=dispatch&action=buyer_document_ready_notification_requested&entity_type=buyer_document_ready_notification&page=1&page_size=20`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(documentReadyAudit.statusCode, 200);
  assert.ok(documentReadyAudit.json().items.some((log: { metadata: { documentReadyId?: string } }) => log.metadata.documentReadyId === documentReadyId));

  const getDispatch = await app.inject({
    method: "GET",
    url: `/dispatch/processes/${dispatchId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getDispatch.statusCode, 200);
  assert.equal(getDispatch.json().data.id, dispatchId);
  assert.equal(getDispatch.json().data.metadata.stage, "completed");
  checkpoint("sales/finance/contracts/dispatch");
  const prepareUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "customer-documents",
      originalName: "CNH Cliente Contrato.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      classification: "customer_personal",
      link: {
        entityType: "customer",
        entityId: createdCustomerId,
        purpose: "identity_document",
      },
    },
  });
  assert.equal(prepareUpload.statusCode, 201);
  const attachmentId = prepareUpload.json().data.id as string;
  assert.equal(prepareUpload.json().upload.metadataPersisted, true);
  assert.equal(prepareUpload.json().upload.bucket, "customer-documents");

  const downloadAttachment = await app.inject({
    method: "GET",
    url: `/files/${attachmentId}/download`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(downloadAttachment.statusCode, 200);
  assert.match(downloadAttachment.json().data.url, /^dev-storage:\/\/customer-documents\//);

  const uploadWithExecutableExtension = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "customer-documents",
      originalName: "Contrato Cliente.pdf.exe",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      classification: "customer_personal",
      link: {
        entityType: "customer",
        entityId: createdCustomerId,
        purpose: "identity_document",
      },
    },
  });
  assert.equal(uploadWithExecutableExtension.statusCode, 400);

  const uploadWithMimeMismatch = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "customer-documents",
      originalName: "Contrato Cliente.pdf",
      mimeType: "image/png",
      sizeBytes: 1024,
      classification: "customer_personal",
      link: {
        entityType: "customer",
        entityId: createdCustomerId,
        purpose: "identity_document",
      },
    },
  });
  assert.equal(uploadWithMimeMismatch.statusCode, 400);

  const uploadLinkedToMissingEntity = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "customer-documents",
      originalName: "Contrato Cliente.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      classification: "customer_personal",
      link: {
        entityType: "customer",
        entityId: "00000000-0000-4000-8000-000000000000",
        purpose: "identity_document",
      },
    },
  });
  assert.equal(uploadLinkedToMissingEntity.statusCode, 404);

  const sensitiveUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      bucket: "service-documents",
      originalName: "NF Prestador.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      classification: "provider_invoice",
      link: {
        entityType: "customer",
        entityId: createdCustomerId,
        purpose: "provider_invoice",
      },
    },
  });
  assert.equal(sensitiveUpload.statusCode, 201);

  const sellerLoginAgain = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "vendedor@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(sellerLoginAgain.statusCode, 200);
  const sellerTokenAgain = sellerLoginAgain.json().token as string;

  const sellerUploadOtherCustomerDocument = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      bucket: "customer-documents",
      originalName: "Tentativa Fora Carteira.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      classification: "customer_personal",
      link: {
        entityType: "customer",
        entityId: createdCustomerId,
        purpose: "identity_document",
      },
    },
  });
  assert.equal(sellerUploadOtherCustomerDocument.statusCode, 404);

  const sellerCreateCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      name: "Cliente Carteira Vendedor",
      phone: "11997776666",
      origin: "qa-seller",
    },
  });
  assert.equal(sellerCreateCustomer.statusCode, 201);
  const sellerCustomerId = sellerCreateCustomer.json().data.id as string;

  const sellerOwnCustomer = await app.inject({
    method: "GET",
    url: `/customers/${sellerCustomerId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerOwnCustomer.statusCode, 200);

  const sellerMoveOwnCustomer = await app.inject({
    method: "POST",
    url: `/customers/${sellerCustomerId}/kanban-status`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      toStatus: "NEGOTIATION",
      reason: "Cliente avancou para negociacao no atendimento.",
    },
  });
  assert.equal(sellerMoveOwnCustomer.statusCode, 200);
  assert.equal(sellerMoveOwnCustomer.json().data.operationalStatus, "NEGOTIATION");

  const sellerPrepareSalesHandoff = await app.inject({
    method: "POST",
    url: `/customers/${sellerCustomerId}/kanban-status`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      toStatus: "WAITING_PURCHASE_CONFIRMATION",
      reason: "Cliente aguardando confirmacao de compra apos proposta alinhada.",
    },
  });
  assert.equal(sellerPrepareSalesHandoff.statusCode, 200);
  assert.equal(sellerPrepareSalesHandoff.json().data.operationalStatus, "WAITING_PURCHASE_CONFIRMATION");

  const sellerCustomerHistoryAfterHandoff = await app.inject({
    method: "GET",
    url: `/customers/${sellerCustomerId}/history`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerCustomerHistoryAfterHandoff.statusCode, 200);
  assert.ok(
    sellerCustomerHistoryAfterHandoff
      .json()
      .events.some(
        (event: { metadata: { nextWorkflow?: string; toStatus?: string } | null; title: string; type: string }) =>
          event.type === "customer.sales_handoff_prepared" &&
          event.title === "Passagem futura para vendas preparada" &&
          event.metadata?.toStatus === "WAITING_PURCHASE_CONFIRMATION" &&
          event.metadata?.nextWorkflow === "sales_documentation_kanban",
      ),
  );

  const sellerKanban = await app.inject({
    method: "GET",
    url: "/customers/kanban?page=1&page_size=20",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerKanban.statusCode, 200);
  assert.ok(
    sellerKanban
      .json()
      .columns.some((column: { status: string; items: Array<{ id: string }> }) => column.status === "WAITING_PURCHASE_CONFIRMATION" && column.items.some((item) => item.id === sellerCustomerId)),
  );

  const sellerOtherCustomer = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerOtherCustomer.statusCode, 404);

  const sellerMoveOtherCustomer = await app.inject({
    method: "POST",
    url: `/customers/${createdCustomerId}/kanban-status`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      toStatus: "WAITING_RETURN",
      reason: "Tentativa indevida fora da carteira.",
    },
  });
  assert.equal(sellerMoveOtherCustomer.statusCode, 404);

  const sellerNoteOtherCustomer = await app.inject({
    method: "POST",
    url: `/customers/${createdCustomerId}/history-notes`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      description: "Tentativa de observacao fora da carteira.",
      noteType: "OBSERVATION",
    },
  });
  assert.equal(sellerNoteOtherCustomer.statusCode, 404);

  const sellerScheduleOtherCustomer = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      customerId: createdCustomerId,
      type: "ligacao",
      title: "Tentativa fora da carteira",
      startsAt: "2026-06-09T14:00:00.000Z",
      notes: "Nao deve criar agendamento em cliente de outro responsavel.",
    },
  });
  assert.equal(sellerScheduleOtherCustomer.statusCode, 404);
  assert.equal(sellerScheduleOtherCustomer.json().error.code, "NOT_FOUND");

  const sellerUpdateOtherCustomer = await app.inject({
    method: "PATCH",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      email: "tentativa-fora-carteira@qa.local",
    },
  });
  assert.equal(sellerUpdateOtherCustomer.statusCode, 403);

  const sellerUpdateOtherLead = await app.inject({
    method: "PATCH",
    url: `/leads/${createdLeadId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      temperature: 42,
    },
  });
  assert.equal(sellerUpdateOtherLead.statusCode, 404);

  const sellerMoveOtherLeadStage = await app.inject({
    method: "POST",
    url: `/leads/${createdLeadId}/stage`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      toStage: "NEGOTIATION",
      reason: "Tentativa indevida fora da carteira.",
    },
  });
  assert.equal(sellerMoveOtherLeadStage.statusCode, 404);

  const sellerUpdateOtherAppointment = await app.inject({
    method: "PATCH",
    url: `/appointments/${createdAppointmentId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      notes: "Tentativa indevida fora da carteira.",
    },
  });
  assert.equal(sellerUpdateOtherAppointment.statusCode, 404);

  const sellerChangeOtherAppointmentStatus = await app.inject({
    method: "POST",
    url: `/appointments/${createdAppointmentId}/status`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      status: "NO_SHOW",
      reason: "Tentativa indevida fora da carteira.",
    },
  });
  assert.equal(sellerChangeOtherAppointmentStatus.statusCode, 404);

  const sdrLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: "sdr@gt3.local",
      password: "Gt3@2026dev",
    },
  });
  assert.equal(sdrLogin.statusCode, 200);
  const sdrToken = sdrLogin.json().token as string;

  const sdrFullCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${sdrToken}`,
    },
    payload: {
      name: "Cliente Completo SDR",
      phone: "11996665555",
      origin: "qa-sdr",
    },
  });
  assert.equal(sdrFullCustomer.statusCode, 403);

  const sdrMinimalLead = await app.inject({
    method: "POST",
    url: "/customers/minimal-leads",
    headers: {
      authorization: `Bearer ${sdrToken}`,
    },
    payload: {
      interest: "Financiamento de hatch automatico",
      name: "Lead Minimo SDR",
      origin: "qa-sdr",
      phone: "11995554444",
    },
  });
  assert.equal(sdrMinimalLead.statusCode, 201);
  assert.equal(sdrMinimalLead.json().data.customer.name, "Lead Minimo SDR");
  assert.equal(sdrMinimalLead.json().data.lead.status, "NEW");

  const sdrCustomer = await app.inject({
    method: "GET",
    url: `/customers/${sdrMinimalLead.json().data.customer.id}`,
    headers: {
      authorization: `Bearer ${sdrToken}`,
    },
  });
  assert.equal(sdrCustomer.statusCode, 200);

  // --- Commercial Kanban board (S2-US01): stages, manual creation, listing, move, reassign ---
  const sdrUserId = sdrLogin.json().user.id as string;

  const commercialStages = await app.inject({
    method: "GET",
    url: "/commercial-kanban/stages",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialStages.statusCode, 200);
  assert.equal(commercialStages.json().items.length, 9);
  assert.equal(commercialStages.json().items[0].key, "NEW_LEAD");

  // Appraiser cannot create commercial cards (no leads:create).
  const appraiserCreateCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${appraiserToken}` },
    payload: { name: "Lead via ligacao" },
  });
  assert.equal(appraiserCreateCard.statusCode, 403);

  // Validation: name is required.
  const invalidCommercialCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: {},
  });
  assert.equal(invalidCommercialCard.statusCode, 400);
  assert.equal(invalidCommercialCard.json().error.code, "VALIDATION_ERROR");

  // SDR creates a card manually from a phone call (no full customer record required).
  const commercialCardSource = uniqueToken("commercial-card");
  const sdrCreateCommercialCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: {
      name: "Interessado Ligacao QA",
      phone: "11990001111",
      vehicleId: inventoryVehicleId,
      source: commercialCardSource,
      channel: "telefone",
      note: "Pediu retorno a tarde.",
    },
  });
  assert.equal(sdrCreateCommercialCard.statusCode, 201);
  assert.equal(sdrCreateCommercialCard.json().data.stage, "NEW_LEAD");
  assert.equal(sdrCreateCommercialCard.json().data.assignedUserId, sdrUserId);
  const commercialCardId = sdrCreateCommercialCard.json().data.id as string;

  // SDR sees own card; another seller (different portfolio) does not.
  const sdrListCommercialCards = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(commercialCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrListCommercialCards.statusCode, 200);
  assert.ok(sdrListCommercialCards.json().items.some((card: { id: string }) => card.id === commercialCardId));

  const sellerListCommercialCards = await app.inject({
    method: "GET",
    url: "/commercial-kanban/cards?page_size=100",
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerListCommercialCards.statusCode, 200);
  assert.ok(!sellerListCommercialCards.json().items.some((card: { id: string }) => card.id === commercialCardId));

  // Move rules: SDR advances early stages + forwards to negotiation, but cannot confirm purchase.
  const sdrMoveScheduled = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { toStage: "SCHEDULED" },
  });
  assert.equal(sdrMoveScheduled.statusCode, 200);
  assert.equal(sdrMoveScheduled.json().data.stage, "SCHEDULED");

  const sdrMoveForbidden = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { toStage: "AWAITING_PURCHASE_CONFIRMATION" },
  });
  assert.equal(sdrMoveForbidden.statusCode, 403);

  const sdrMoveVisited = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { toStage: "VISITED" },
  });
  assert.equal(sdrMoveVisited.statusCode, 200);

  const sdrForwardNegotiation = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { toStage: "NEGOTIATION", notes: "Encaminhado para negociacao direta." },
  });
  assert.equal(sdrForwardNegotiation.statusCode, 200);

  // A seller from another portfolio cannot move this card (out of scope -> 404).
  const otherSellerMoveCard = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { toStage: "AWAITING_RETURN" },
  });
  assert.equal(otherSellerMoveCard.statusCode, 404);

  // Moving to LOST requires a reason and archives the card.
  const moveLostWithoutReason = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { toStage: "LOST" },
  });
  assert.equal(moveLostWithoutReason.statusCode, 400);

  const moveLostWithReason = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${commercialCardId}/move`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { toStage: "LOST", reason: "Cliente comprou em outra loja" },
  });
  assert.equal(moveLostWithReason.statusCode, 200);
  assert.equal(moveLostWithReason.json().data.stage, "LOST");
  assert.equal(moveLostWithReason.json().data.archived, true);
  assert.equal(moveLostWithReason.json().data.lostReason, "Cliente comprou em outra loja");

  // Archived (LOST) card leaves the default active view but stays filterable.
  const activeViewCommercialCards = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?origin=${encodeURIComponent(commercialCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(activeViewCommercialCards.statusCode, 200);
  assert.ok(!activeViewCommercialCards.json().items.some((card: { id: string }) => card.id === commercialCardId));

  const lostViewCommercialCards = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=LOST&origin=${encodeURIComponent(commercialCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(lostViewCommercialCards.statusCode, 200);
  assert.ok(lostViewCommercialCards.json().items.some((card: { id: string }) => card.id === commercialCardId));

  const commercialMoveAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=commercial_card_moved&entity_type=lead_card&entity_id=${commercialCardId}&page=1&page_size=20`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialMoveAudit.statusCode, 200);
  assert.ok(commercialMoveAudit.json().items.some((log: { metadata: { toStage?: string } }) => log.metadata.toStage === "LOST"));

  // Responsible change: manager-only, reason required.
  const reassignSourceCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Lead para troca de responsavel", source: "ligacao_loja" },
  });
  assert.equal(reassignSourceCard.statusCode, 201);
  const reassignCardId = reassignSourceCard.json().data.id as string;

  const sellerReassign = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${reassignCardId}/assign`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { assignedUserId: administrativeBody.user.id, reason: "Tentativa sem permissao em QA" },
  });
  assert.equal(sellerReassign.statusCode, 403);

  const sdrReassign = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${reassignCardId}/assign`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { assignedUserId: administrativeBody.user.id, reason: "Tentativa sem permissao em QA" },
  });
  assert.equal(sdrReassign.statusCode, 403);

  const reassignWithoutReason = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${reassignCardId}/assign`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { assignedUserId: administrativeBody.user.id },
  });
  assert.equal(reassignWithoutReason.statusCode, 400);

  const reassignCommercialCard = await app.inject({
    method: "POST",
    url: `/commercial-kanban/cards/${reassignCardId}/assign`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { assignedUserId: administrativeBody.user.id, reason: "Redistribuicao de carteira em QA" },
  });
  assert.equal(reassignCommercialCard.statusCode, 200);
  assert.equal(reassignCommercialCard.json().data.assignedUserId, administrativeBody.user.id);
  assert.equal(reassignCommercialCard.json().data.previousAssignedUserId, sdrUserId);
  checkpoint("commercial-kanban");

  // --- Commercial agenda (S2-US02): create, mandatory links, scope, transitions, next-on-card ---
  const agendaCardSource = uniqueToken("agenda-card");
  const agendaCardWithVehicle = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Agenda Card Veiculo", phone: "11990002222", customerId: createdCustomerId, vehicleId: inventoryVehicleId, source: agendaCardSource },
  });
  assert.equal(agendaCardWithVehicle.statusCode, 201);
  assert.equal(agendaCardWithVehicle.json().data.customerId, createdCustomerId);
  const agendaCardId = agendaCardWithVehicle.json().data.id as string;

  const agendaCardNoVehicle = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Agenda Card 0km", source: agendaCardSource },
  });
  assert.equal(agendaCardNoVehicle.statusCode, 201);
  const agendaCardNoVehicleId = agendaCardNoVehicle.json().data.id as string;

  // Appraiser has no appointments:manage -> forbidden.
  const appraiserCreateAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${appraiserToken}` },
    payload: { cardId: agendaCardId, type: "VISIT", startsAt: "2027-03-10T14:00:00.000Z" },
  });
  assert.equal(appraiserCreateAppointment.statusCode, 403);

  // Mandatory link: a card with no vehicle and no interest cannot be scheduled.
  const missingVehicleAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardNoVehicleId, type: "FOLLOW_UP", startsAt: "2027-03-10T14:00:00.000Z" },
  });
  assert.equal(missingVehicleAppointment.statusCode, 422);
  assert.ok(missingVehicleAppointment.json().error.details.missingLinks.includes("vehicle_or_interest"));

  // 0km/order interest satisfies the vehicle link without a physical vehicle.
  const interestAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: {
      cardId: agendaCardNoVehicleId,
      type: "FOLLOW_UP",
      startsAt: "2027-03-11T14:00:00.000Z",
      vehicleInterest: { brand: "Toyota", model: "Corolla Cross", note: "0km encomenda" },
    },
  });
  assert.equal(interestAppointment.statusCode, 201);

  // SDR creates a visit on its own card.
  const createCommercialAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, type: "VISIT", startsAt: "2027-03-10T14:00:00.000Z", notes: "Cliente confirmou interesse." },
  });
  assert.equal(createCommercialAppointment.statusCode, 201);
  assert.equal(createCommercialAppointment.json().data.status, "SCHEDULED");
  assert.equal(createCommercialAppointment.json().data.cardId, agendaCardId);
  assert.equal(createCommercialAppointment.json().data.vehicleId, inventoryVehicleId);
  const appointmentId = createCommercialAppointment.json().data.id as string;

  const sdrAppointmentNotification = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=commercial_appointment_scheduled&entity_id=${appointmentId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrAppointmentNotification.statusCode, 200);
  assert.ok(
    sdrAppointmentNotification
      .json()
      .items.some(
        (notification: { actionUrl: string; priority: string; sourceModule: string; status: string }) =>
          notification.priority === "HIGH" &&
          notification.status === "NEW" &&
          notification.sourceModule === "commercial_agenda" &&
          notification.actionUrl === `/commercial-agenda/appointments/${appointmentId}`,
      ),
  );

  const sellerAppointmentNotificationScope = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=commercial_appointment_scheduled&entity_id=${appointmentId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerAppointmentNotificationScope.statusCode, 200);
  assert.equal(sellerAppointmentNotificationScope.json().items.length, 0);

  // Next appointment shows up on the Kanban card.
  const cardWithNextAppointment = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(agendaCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(cardWithNextAppointment.statusCode, 200);
  const agendaCardView = cardWithNextAppointment.json().items.find((card: { id: string }) => card.id === agendaCardId);
  assert.ok(agendaCardView);
  assert.equal(agendaCardView.nextAppointment.id, appointmentId);
  assert.equal(agendaCardView.nextAppointment.type, "VISIT");
  assert.equal(agendaCardView.nextAppointment.activeNotifications.count, 1);
  assert.equal(agendaCardView.nextAppointment.activeNotifications.highestPriority, "HIGH");
  assert.ok(agendaCardView.nextAppointment.activeNotifications.types.includes("commercial_appointment_scheduled"));

  // Scope: SDR sees own agenda; another seller does not.
  const sdrAgenda = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments?card_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrAgenda.statusCode, 200);
  assert.ok(sdrAgenda.json().items.some((appointment: { id: string }) => appointment.id === appointmentId));

  const sellerAgenda = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments?card_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerAgenda.statusCode, 200);
  assert.ok(!sellerAgenda.json().items.some((appointment: { id: string }) => appointment.id === appointmentId));

  const ownerAgenda = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments?card_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerAgenda.statusCode, 200);
  assert.ok(ownerAgenda.json().items.some((appointment: { id: string }) => appointment.id === appointmentId));

  // Scope guard (review fix #1): a limited role cannot widen scope via responsible_user_id.
  const sdrAgendaSpoofed = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments?page_size=100&responsible_user_id=${ownerBody.user.id}`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrAgendaSpoofed.statusCode, 200);
  assert.ok(
    sdrAgendaSpoofed.json().items.every((appointment: { responsibleUserId: string }) => appointment.responsibleUserId === sdrUserId),
  );

  // Permission guard (review fix #2): a limited role cannot assign to someone else's agenda.
  const sdrCreateForOther = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, type: "CALL", startsAt: "2027-05-02T10:00:00.000Z", responsibleUserId: ownerBody.user.id },
  });
  assert.equal(sdrCreateForOther.statusCode, 201);
  assert.equal(sdrCreateForOther.json().data.responsibleUserId, sdrUserId);

  // A seller from another portfolio cannot transition this appointment (out of scope -> 404).
  const otherSellerConfirm = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${appointmentId}/confirm`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(otherSellerConfirm.statusCode, 404);

  // Transitions: confirm -> reschedule (preserves link) -> blocked re-confirm.
  const confirmCommercialAppointment = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${appointmentId}/confirm`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(confirmCommercialAppointment.statusCode, 200);
  assert.equal(confirmCommercialAppointment.json().data.status, "CONFIRMED");

  const rescheduleAppointment = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${appointmentId}/reschedule`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { startsAt: "2027-03-12T16:00:00.000Z", reason: "Cliente pediu outro horario" },
  });
  assert.equal(rescheduleAppointment.statusCode, 201);
  assert.equal(rescheduleAppointment.json().data.status, "SCHEDULED");
  assert.equal(rescheduleAppointment.json().data.rescheduleFromId, appointmentId);
  assert.equal(rescheduleAppointment.json().previous.status, "RESCHEDULED");
  const rescheduledAppointmentId = rescheduleAppointment.json().data.id as string;

  const blockedReconfirm = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${appointmentId}/confirm`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(blockedReconfirm.statusCode, 422);

  // No-show with justification on the rescheduled appointment.
  const noShowAppointment = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${rescheduledAppointmentId}/no-show`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { reason: "Cliente nao compareceu e nao avisou" },
  });
  assert.equal(noShowAppointment.statusCode, 200);
  assert.equal(noShowAppointment.json().data.status, "NO_SHOW");
  assert.equal(noShowAppointment.json().data.noShowReason, "Cliente nao compareceu e nao avisou");

  // Attended -> completed happy path on a fresh appointment.
  const attendableAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, type: "TEST_DRIVE", startsAt: "2027-04-01T10:00:00.000Z" },
  });
  assert.equal(attendableAppointment.statusCode, 201);
  const attendableAppointmentId = attendableAppointment.json().data.id as string;

  const markAttended = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${attendableAppointmentId}/attended`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(markAttended.statusCode, 200);
  assert.equal(markAttended.json().data.status, "ATTENDED");

  const markCompleted = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${attendableAppointmentId}/complete`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(markCompleted.statusCode, 200);
  assert.equal(markCompleted.json().data.status, "COMPLETED");

  // Confirmation window projection (review fix #3): a visit within 1h is flagged needsConfirmation.
  const soonStartsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const soonVisit = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, type: "VISIT", startsAt: soonStartsAt },
  });
  assert.equal(soonVisit.statusCode, 201);
  const soonVisitId = soonVisit.json().data.id as string;

  const soonVisitView = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments/${soonVisitId}`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(soonVisitView.statusCode, 200);
  assert.equal(soonVisitView.json().data.needsConfirmation, true);
  // The far-future visit is not within the confirmation window.
  const farVisitView = await app.inject({
    method: "GET",
    url: `/commercial-agenda/appointments/${attendableAppointmentId}`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(farVisitView.statusCode, 200);
  assert.equal(farVisitView.json().data.needsConfirmation, false);

  // Reschedule preserves the original duration when no endsAt is provided (review fix #9).
  const timedAppointment = await app.inject({
    method: "POST",
    url: "/commercial-agenda/appointments",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, type: "VISIT", startsAt: "2027-06-01T10:00:00.000Z", endsAt: "2027-06-01T11:00:00.000Z" },
  });
  assert.equal(timedAppointment.statusCode, 201);
  const timedAppointmentId = timedAppointment.json().data.id as string;

  const rescheduleTimed = await app.inject({
    method: "POST",
    url: `/commercial-agenda/appointments/${timedAppointmentId}/reschedule`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { startsAt: "2027-06-02T15:00:00.000Z" },
  });
  assert.equal(rescheduleTimed.statusCode, 201);
  assert.equal(rescheduleTimed.json().data.startsAt, "2027-06-02T15:00:00.000Z");
  // 1h duration preserved -> ends at 16:00.
  assert.equal(rescheduleTimed.json().data.endsAt, "2027-06-02T16:00:00.000Z");

  const appointmentStatusAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=commercial_appointments&action=commercial_appointment_status_changed&entity_type=commercial_appointment&entity_id=${appointmentId}&page=1&page_size=20`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(appointmentStatusAudit.statusCode, 200);
  assert.ok(appointmentStatusAudit.json().items.some((log: { metadata: { toStatus?: string } }) => log.metadata.toStatus === "RESCHEDULED"));
  checkpoint("commercial-agenda");

  // --- Commercial interactions (S2-US03): register, write-permission scope, list scope ---
  const sdrInteraction = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: {
      cardId: agendaCardId,
      interactionType: "CALL",
      channel: "WHATSAPP",
      result: "CONTACT_MADE",
      notes: "Cliente pediu retorno a tarde.",
      nextActionType: "CALL",
      nextActionAt: "2027-07-01T13:00:00.000Z",
    },
  });
  assert.equal(sdrInteraction.statusCode, 201);
  assert.equal(sdrInteraction.json().data.interactionType, "CALL");
  assert.equal(sdrInteraction.json().data.channel, "WHATSAPP");
  assert.equal(sdrInteraction.json().data.nextActionStatus, "PENDING");
  const interactionId = sdrInteraction.json().data.id as string;
  const interactionLeadId = sdrInteraction.json().data.leadId as string;

  // Validation: card is required.
  const invalidInteraction = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { interactionType: "CALL" },
  });
  assert.equal(invalidInteraction.statusCode, 400);

  // Appraiser has no leads:update -> forbidden.
  const appraiserInteraction = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${appraiserToken}` },
    payload: { cardId: agendaCardId, interactionType: "CALL" },
  });
  assert.equal(appraiserInteraction.statusCode, 403);

  // Write-permission scope: SDR cannot register on a card outside its portfolio (404).
  const sdrInteractionForeign = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: reassignCardId, interactionType: "CALL" },
  });
  assert.equal(sdrInteractionForeign.statusCode, 404);

  // Scope guard on list: responsible_user_id cannot widen scope; the SDR is scoped to its OWN cards
  // and never sees interactions on cards it does not own (a manager interaction on a foreign card).
  const ownerForeignInteraction = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { cardId: reassignCardId, interactionType: "NOTE", notes: "Interacao em card de outro responsavel." },
  });
  assert.equal(ownerForeignInteraction.statusCode, 201);
  const ownerForeignInteractionId = ownerForeignInteraction.json().data.id as string;

  const sdrInteractionsSpoofed = await app.inject({
    method: "GET",
    url: `/commercial-interactions?page_size=100&responsible_user_id=${ownerBody.user.id}`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrInteractionsSpoofed.statusCode, 200);
  assert.ok(sdrInteractionsSpoofed.json().items.some((it: { id: string }) => it.id === interactionId));
  assert.ok(!sdrInteractionsSpoofed.json().items.some((it: { id: string }) => it.id === ownerForeignInteractionId));

  // Interaction appears in the lead history (lead-scoped audit).
  const interactionLeadAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=commercial_interaction_registered&entity_type=lead&entity_id=${interactionLeadId}&page=1&page_size=5`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(interactionLeadAudit.statusCode, 200);
  assert.ok(
    interactionLeadAudit.json().items.some((log: { metadata: { interactionId?: string } }) => log.metadata.interactionId === interactionId),
  );

  // Scope axis (review fix #2): the card owner sees interactions a manager registered on the card.
  const ownerInteractionOnSdrCard = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { cardId: agendaCardId, interactionType: "NOTE", notes: "Gestor registrou observacao no card do SDR." },
  });
  assert.equal(ownerInteractionOnSdrCard.statusCode, 201);
  assert.equal(ownerInteractionOnSdrCard.json().data.responsibleUserId, ownerBody.user.id);
  const ownerInteractionId = ownerInteractionOnSdrCard.json().data.id as string;

  const sdrSeesOwnerInteraction = await app.inject({
    method: "GET",
    url: `/commercial-interactions?card_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrSeesOwnerInteraction.statusCode, 200);
  assert.ok(sdrSeesOwnerInteraction.json().items.some((it: { id: string }) => it.id === ownerInteractionId));

  // Resolve the follow-up (complete); a second resolve is blocked (no pending follow-up).
  const completeFollowUp = await app.inject({
    method: "POST",
    url: `/commercial-interactions/${interactionId}/follow-up`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { action: "complete" },
  });
  assert.equal(completeFollowUp.statusCode, 200);
  assert.equal(completeFollowUp.json().data.nextActionStatus, "DONE");
  assert.equal(completeFollowUp.json().data.followUpOverdue, false);

  const reCompleteFollowUp = await app.inject({
    method: "POST",
    url: `/commercial-interactions/${interactionId}/follow-up`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { action: "complete" },
  });
  assert.equal(reCompleteFollowUp.statusCode, 422);

  // The API rejects a follow-up scheduled in the past (review fix #4).
  const pastFollowUp = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, interactionType: "CALL", nextActionType: "CALL", nextActionAt: "2020-01-01T10:00:00.000Z" },
  });
  assert.equal(pastFollowUp.statusCode, 400);

  // Seed an overdue follow-up directly (past nextActionAt is no longer accepted by the API),
  // so the scan has an overdue condition to detect.
  await prisma.commercialInteraction.create({
    data: {
      storeId: ownerBody.user.storeId,
      cardId: agendaCardId,
      leadId: interactionLeadId,
      responsibleUserId: sdrUserId,
      interactionType: "CONTACT_ATTEMPT",
      occurredAt: new Date(),
      nextActionType: "CALL",
      nextActionAt: new Date("2020-01-01T10:00:00.000Z"),
      nextActionStatus: "PENDING",
      createdByUserId: sdrUserId,
    },
  });
  await prisma.lead.update({
    where: { id: interactionLeadId },
    data: {
      lastInteractionAt: new Date(),
      lastInteractionType: "CONTACT_ATTEMPT",
      lastInteractionResult: "NO_RESPONSE",
      nextActionAt: new Date("2020-01-01T10:00:00.000Z"),
      nextActionType: "CALL",
    },
  });

  const notificationReassignSource = uniqueToken("notification-reassign");
  const notificationReassignCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Lead para reatribuicao via notificacao", source: notificationReassignSource },
  });
  assert.equal(notificationReassignCard.statusCode, 201);
  const notificationReassignCardId = notificationReassignCard.json().data.id as string;
  const notificationReassignLeadId = notificationReassignCard.json().data.leadId as string;

  await prisma.commercialInteraction.create({
    data: {
      storeId: ownerBody.user.storeId,
      cardId: notificationReassignCardId,
      leadId: notificationReassignLeadId,
      responsibleUserId: sdrUserId,
      interactionType: "CONTACT_ATTEMPT",
      occurredAt: new Date(),
      nextActionType: "CALL",
      nextActionAt: new Date("2020-01-01T10:00:00.000Z"),
      nextActionStatus: "PENDING",
      createdByUserId: sdrUserId,
    },
  });
  await prisma.lead.update({
    where: { id: notificationReassignLeadId },
    data: {
      lastInteractionAt: new Date(),
      lastInteractionType: "CONTACT_ATTEMPT",
      lastInteractionResult: "NO_RESPONSE",
      nextActionAt: new Date("2020-01-01T10:00:00.000Z"),
      nextActionType: "CALL",
    },
  });

  // Only management can run the scan.
  const scanForbidden = await app.inject({
    method: "POST",
    url: "/commercial-interactions/scan-followups",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(scanForbidden.statusCode, 403);

  const scanFollowUps = await app.inject({
    method: "POST",
    url: "/commercial-interactions/scan-followups",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(scanFollowUps.statusCode, 200);
  assert.ok(scanFollowUps.json().data.notificationsCreated >= 1);

  const ownerOverdueNotifications = await app.inject({
    method: "GET",
    url: "/notifications?entity_type=follow_up_overdue&page_size=100",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerOverdueNotifications.statusCode, 200);
  const agendaOverdueNotification = ownerOverdueNotifications.json().items.find((n: { entityId: string }) => n.entityId === agendaCardId);
  assert.ok(agendaOverdueNotification);
  assert.equal(agendaOverdueNotification.context.cardId, agendaCardId);
  assert.equal(agendaOverdueNotification.context.leadId, interactionLeadId);
  assert.equal(agendaOverdueNotification.context.customer.id, createdCustomerId);
  assert.equal(agendaOverdueNotification.context.customer.name, "Cliente Contrato API");
  assert.equal(agendaOverdueNotification.context.vehicle.id, inventoryVehicleId);
  assert.ok(agendaOverdueNotification.context.vehicle.label);
  assert.equal(agendaOverdueNotification.context.responsibleUser.id, sdrUserId);
  assert.equal(agendaOverdueNotification.context.stageKey, "NEW_LEAD");

  const sdrOverdueNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=follow_up_overdue&entity_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrOverdueNotifications.statusCode, 200);
  assert.ok(
    sdrOverdueNotifications
      .json()
      .items.some(
        (notification: { userId: string; priority: string; sourceModule: string; actionUrl: string }) =>
          notification.userId === sdrUserId &&
          notification.priority === "CRITICAL" &&
          notification.sourceModule === "commercial_interactions" &&
          notification.actionUrl === `/commercial-kanban/cards/${agendaCardId}`,
      ),
  );

  const sellerForeignOverdueNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=follow_up_overdue&entity_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerForeignOverdueNotifications.statusCode, 200);
  assert.equal(sellerForeignOverdueNotifications.json().items.length, 0);

  const notificationReassignAlert = ownerOverdueNotifications
    .json()
    .items.find((n: { id: string; entityId: string }) => n.entityId === notificationReassignCardId);
  assert.ok(notificationReassignAlert);

  const sellerNotificationReassign = await app.inject({
    method: "POST",
    url: `/notifications/${notificationReassignAlert.id}/reassign`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { assignedUserId: sellerUserId, reason: "Tentativa sem permissao pela notificacao" },
  });
  assert.equal(sellerNotificationReassign.statusCode, 403);

  const ownerNotificationReassign = await app.inject({
    method: "POST",
    url: `/notifications/${notificationReassignAlert.id}/reassign`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { assignedUserId: sellerUserId, reason: "Redistribuicao operacional via notificacao" },
  });
  assert.equal(ownerNotificationReassign.statusCode, 200);
  assert.equal(ownerNotificationReassign.json().reassignment.entityType, "lead_card");
  assert.equal(ownerNotificationReassign.json().reassignment.entityId, notificationReassignCardId);
  assert.equal(ownerNotificationReassign.json().reassignment.previousAssignedUserId, sdrUserId);
  assert.equal(ownerNotificationReassign.json().reassignment.assignedUserId, sellerUserId);

  const sellerReassignedNotificationCard = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(notificationReassignSource)}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerReassignedNotificationCard.statusCode, 200);
  assert.ok(
    sellerReassignedNotificationCard
      .json()
      .items.some((card: { id: string; assignedUserId: string }) => card.id === notificationReassignCardId && card.assignedUserId === sellerUserId),
  );

  const sellerReassignedCardNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=follow_up_overdue&entity_id=${notificationReassignCardId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerReassignedCardNotifications.statusCode, 200);
  assert.ok(
    sellerReassignedCardNotifications
      .json()
      .items.some((notification: { userId: string }) => notification.userId === sellerUserId),
  );

  const notificationReassignAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=notifications&action=notification_responsible_reassigned&entity_type=notification&entity_id=${notificationReassignAlert.id}&page=1&page_size=5`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(notificationReassignAudit.statusCode, 200);
  assert.ok(
    notificationReassignAudit
      .json()
      .items.some(
        (log: { metadata: { targetEntityId?: string; toUserId?: string } }) =>
          log.metadata.targetEntityId === notificationReassignCardId && log.metadata.toUserId === sellerUserId,
      ),
  );

  const leadNotificationReassignAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=leads&action=commercial_responsible_changed&entity_type=lead&entity_id=${notificationReassignLeadId}&page=1&page_size=5`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(leadNotificationReassignAudit.statusCode, 200);
  assert.ok(
    leadNotificationReassignAudit
      .json()
      .items.some(
        (log: { metadata: { notificationId?: string; toUserId?: string; source?: string } }) =>
          log.metadata.notificationId === notificationReassignAlert.id && log.metadata.toUserId === sellerUserId && log.metadata.source === "notification",
      ),
  );

  // Re-running dedups: no new notification for the same card+reason while still unread.
  const scanFollowUpsAgain = await app.inject({
    method: "POST",
    url: "/commercial-interactions/scan-followups",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(scanFollowUpsAgain.statusCode, 200);
  assert.ok(scanFollowUpsAgain.json().data.deduped >= 1);

  // Dedup by active condition, not readAt (review fix #3): reading the alert must NOT recreate it.
  await prisma.notification.updateMany({
    where: { storeId: ownerBody.user.storeId, entityType: "follow_up_overdue", entityId: agendaCardId },
    data: { readAt: new Date() },
  });
  const overdueNotifCountBefore = await prisma.notification.count({
    where: { storeId: ownerBody.user.storeId, entityType: "follow_up_overdue", entityId: agendaCardId },
  });
  const scanAfterRead = await app.inject({
    method: "POST",
    url: "/commercial-interactions/scan-followups",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(scanAfterRead.statusCode, 200);
  const overdueNotifCountAfter = await prisma.notification.count({
    where: { storeId: ownerBody.user.storeId, entityType: "follow_up_overdue", entityId: agendaCardId },
  });
  assert.equal(overdueNotifCountAfter, overdueNotifCountBefore);

  // Card projection: last interaction + overdue follow-up indicator surface on the Kanban card.
  const cardWithInteraction = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(agendaCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(cardWithInteraction.statusCode, 200);
  const projectedCard = cardWithInteraction.json().items.find((card: { id: string }) => card.id === agendaCardId);
  assert.ok(projectedCard);
  assert.equal(projectedCard.lastInteractionType, "CONTACT_ATTEMPT");
  assert.equal(projectedCard.followUpOverdue, true);

  const ownerCardWithInteraction = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(agendaCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerCardWithInteraction.statusCode, 200);
  const ownerProjectedCard = ownerCardWithInteraction.json().items.find((card: { id: string }) => card.id === agendaCardId);
  assert.ok(ownerProjectedCard);
  assert.ok(ownerProjectedCard.activeNotifications.count >= 1);
  assert.equal(ownerProjectedCard.activeNotifications.highestPriority, "CRITICAL");
  assert.ok(ownerProjectedCard.activeNotifications.types.includes("follow_up_overdue"));

  // Multi follow-up projection (review fix #1): the card reflects the EARLIEST pending follow-up,
  // and resolving one pending follow-up must not hide the other.
  const multiFollowUpSource = uniqueToken("multi-follow-up");
  const multiFollowUpCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Card Multi Follow-up", source: multiFollowUpSource },
  });
  assert.equal(multiFollowUpCard.statusCode, 201);
  const multiFollowUpCardId = multiFollowUpCard.json().data.id as string;

  const followUpFar = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: multiFollowUpCardId, interactionType: "CALL", nextActionType: "CALL", nextActionAt: "2030-01-10T10:00:00.000Z" },
  });
  assert.equal(followUpFar.statusCode, 201);

  const followUpNear = await app.inject({
    method: "POST",
    url: "/commercial-interactions",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: multiFollowUpCardId, interactionType: "CONTACT_ATTEMPT", nextActionType: "CONFIRM_VISIT", nextActionAt: "2029-01-10T10:00:00.000Z" },
  });
  assert.equal(followUpNear.statusCode, 201);
  const followUpNearId = followUpNear.json().data.id as string;

  const readMultiFollowUpCard = async () => {
    const res = await app.inject({
      method: "GET",
      url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(multiFollowUpSource)}&page_size=100`,
      headers: { authorization: `Bearer ${sdrToken}` },
    });
    return res.json().items.find((card: { id: string }) => card.id === multiFollowUpCardId);
  };
  const cardBeforeResolve = await readMultiFollowUpCard();
  assert.equal(cardBeforeResolve.nextActionAt, "2029-01-10T10:00:00.000Z");

  const resolveNearFollowUp = await app.inject({
    method: "POST",
    url: `/commercial-interactions/${followUpNearId}/follow-up`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { action: "complete" },
  });
  assert.equal(resolveNearFollowUp.statusCode, 200);
  const cardAfterResolve = await readMultiFollowUpCard();
  assert.equal(cardAfterResolve.nextActionAt, "2030-01-10T10:00:00.000Z");

  // overdue_only is parsed explicitly (review fix #5): "false" must NOT behave like true.
  const overdueOnlyFalse = await app.inject({
    method: "GET",
    url: `/commercial-interactions?card_id=${agendaCardId}&overdue_only=false&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(overdueOnlyFalse.statusCode, 200);
  // The non-overdue NOTE interaction is present when overdue_only=false.
  assert.ok(overdueOnlyFalse.json().items.some((it: { id: string }) => it.id === ownerInteractionId));

  const overdueOnlyTrue = await app.inject({
    method: "GET",
    url: `/commercial-interactions?card_id=${agendaCardId}&overdue_only=true&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(overdueOnlyTrue.statusCode, 200);
  // ...but filtered out when overdue_only=true (it has no overdue follow-up).
  assert.ok(!overdueOnlyTrue.json().items.some((it: { id: string }) => it.id === ownerInteractionId));

  // --- Commercial alerts (S2-US05 stage 3): materialize real conditions into commercial_alerts ---
  const commercialAlertScanForbidden = await app.inject({
    method: "POST",
    url: "/commercial-alerts/scan",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(commercialAlertScanForbidden.statusCode, 403);

  const commercialAlertScan = await app.inject({
    method: "POST",
    url: "/commercial-alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialAlertScan.statusCode, 200);
  assert.ok(commercialAlertScan.json().data.alertsCreated >= 1);
  assert.ok(commercialAlertScan.json().data.byType.follow_up_overdue >= 1);
  assert.ok(commercialAlertScan.json().data.byType.visit_confirmation_due >= 1);
  assert.ok(commercialAlertScan.json().data.notificationsCreated >= 1);
  assert.equal(commercialAlertScan.json().data.notificationsFailed, 0);

  const visitConfirmationNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=visit_confirmation_due&entity_id=${soonVisitId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(visitConfirmationNotifications.statusCode, 200);
  const visitConfirmationNotification = visitConfirmationNotifications
    .json()
    .items.find((notification: { userId: string }) => notification.userId === sdrUserId);
  assert.ok(visitConfirmationNotification);
  assert.equal(visitConfirmationNotification.priority, "HIGH");
  assert.equal(visitConfirmationNotification.sourceModule, "commercial_alerts");
  assert.equal(visitConfirmationNotification.actionUrl, `/commercial-agenda/appointments/${soonVisitId}`);
  assert.equal(visitConfirmationNotification.context.appointmentId, soonVisitId);
  assert.equal(visitConfirmationNotification.context.cardId, agendaCardId);
  assert.equal(visitConfirmationNotification.context.leadId, interactionLeadId);
  assert.equal(visitConfirmationNotification.context.customer.id, createdCustomerId);
  assert.equal(visitConfirmationNotification.context.vehicle.id, inventoryVehicleId);
  assert.equal(visitConfirmationNotification.context.responsibleUser.id, sdrUserId);

  const cardWithCommercialAlertNotification = await app.inject({
    method: "GET",
    url: `/commercial-kanban/cards?stage=NEW_LEAD&origin=${encodeURIComponent(agendaCardSource)}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(cardWithCommercialAlertNotification.statusCode, 200);
  const cardWithVisitConfirmation = cardWithCommercialAlertNotification.json().items.find((card: { id: string }) => card.id === agendaCardId);
  assert.ok(cardWithVisitConfirmation);
  assert.equal(cardWithVisitConfirmation.nextAppointment.id, soonVisitId);
  assert.ok(cardWithVisitConfirmation.nextAppointment.activeNotifications.types.includes("visit_confirmation_due"));
  assert.equal(cardWithVisitConfirmation.nextAppointment.activeNotifications.highestPriority, "HIGH");

  const activeFollowUpAlert = await prisma.commercialAlert.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      cardId: agendaCardId,
      alertType: "follow_up_overdue",
      status: { in: ["PENDING", "VIEWED"] },
    },
  });
  assert.ok(activeFollowUpAlert);
  assert.equal(activeFollowUpAlert.responsibleUserId, sdrUserId);
  assert.equal(activeFollowUpAlert.metadata?.dedupKey, `follow_up_overdue:${agendaCardId}`);

  const sdrCommercialAlerts = await app.inject({
    method: "GET",
    url: "/commercial-alerts?type=follow_up_overdue&severity=CRITICAL&page_size=100",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCommercialAlerts.statusCode, 200);
  assert.ok(sdrCommercialAlerts.json().items.some((item: { id: string }) => item.id === activeFollowUpAlert.id));
  assert.ok(sdrCommercialAlerts.json().items.every((item: { responsibleUserId: string | null }) => item.responsibleUserId === sdrUserId));

  const sdrCannotWidenCommercialAlerts = await app.inject({
    method: "GET",
    url: `/commercial-alerts?responsible_user_id=${ownerBody.user.id}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCannotWidenCommercialAlerts.statusCode, 200);
  assert.ok(
    sdrCannotWidenCommercialAlerts.json().items.every((item: { responsibleUserId: string | null }) => item.responsibleUserId === sdrUserId),
  );

  const managementCommercialAlerts = await app.inject({
    method: "GET",
    url: `/commercial-alerts?target=management&type=follow_up_overdue&severity=CRITICAL&responsible_user_id=${sdrUserId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(managementCommercialAlerts.statusCode, 200);
  assert.ok(managementCommercialAlerts.json().items.some((item: { id: string }) => item.id === activeFollowUpAlert.id));
  assert.ok(managementCommercialAlerts.json().items.every((item: { targetRole: string | null }) => item.targetRole === "MANAGEMENT"));

  const otherSellerCannotViewCommercialAlert = await app.inject({
    method: "POST",
    url: `/commercial-alerts/${activeFollowUpAlert.id}/view`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { reason: "Tentativa fora da carteira" },
  });
  assert.equal(otherSellerCannotViewCommercialAlert.statusCode, 404);

  const viewCommercialAlert = await app.inject({
    method: "POST",
    url: `/commercial-alerts/${activeFollowUpAlert.id}/view`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { reason: "Alerta assumido pelo responsavel" },
  });
  assert.equal(viewCommercialAlert.statusCode, 200);
  assert.equal(viewCommercialAlert.json().data.status, "VIEWED");
  assert.equal(viewCommercialAlert.json().data.resolvedAt, null);
  const viewedAlertAudit = await prisma.auditLog.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      module: "commercial_alerts",
      action: "commercial_alert_viewed",
      entityType: "commercial_alert",
      entityId: activeFollowUpAlert.id,
    },
  });
  assert.ok(viewedAlertAudit);
  assert.equal(viewedAlertAudit.actorId, sdrUserId);

  const manualAlertCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { name: "Card Alertas Manuais QA", source: uniqueToken("manual-alert-card") },
  });
  assert.equal(manualAlertCard.statusCode, 201);
  const manualAlertCardId = manualAlertCard.json().data.id as string;
  const manualAlertLeadId = manualAlertCard.json().data.leadId as string;
  const manualResolveAlert = await prisma.commercialAlert.create({
    data: {
      storeId: ownerBody.user.storeId,
      alertType: "lead_attention",
      severity: "LOW",
      status: "PENDING",
      card: { connect: { id: manualAlertCardId } },
      leadId: manualAlertLeadId,
      responsibleUserId: sdrUserId,
      targetUserId: sdrUserId,
      reason: "Smoke de resolucao manual.",
      suggestedAction: "Resolver manualmente no teste.",
      triggeredAt: new Date(),
      metadata: { source: "auth-smoke", action: "manual-resolve" },
    },
  });
  const manualDismissAlert = await prisma.commercialAlert.create({
    data: {
      storeId: ownerBody.user.storeId,
      alertType: "missing_next_action",
      severity: "MEDIUM",
      status: "PENDING",
      card: { connect: { id: manualAlertCardId } },
      leadId: manualAlertLeadId,
      responsibleUserId: sdrUserId,
      targetUserId: sdrUserId,
      reason: "Smoke de dispensa manual.",
      suggestedAction: "Dispensar manualmente no teste.",
      triggeredAt: new Date(),
      metadata: { source: "auth-smoke", action: "manual-dismiss" },
    },
  });

  const resolveCommercialAlert = await app.inject({
    method: "POST",
    url: `/commercial-alerts/${manualResolveAlert.id}/resolve`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { reason: "Pendencia conferida pela gestao" },
  });
  assert.equal(resolveCommercialAlert.statusCode, 200);
  assert.equal(resolveCommercialAlert.json().data.status, "RESOLVED");
  assert.equal(resolveCommercialAlert.json().data.resolvedByUserId, ownerBody.user.id);

  const resolveCommercialAlertAgain = await app.inject({
    method: "POST",
    url: `/commercial-alerts/${manualResolveAlert.id}/resolve`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { reason: "Tentativa duplicada" },
  });
  assert.equal(resolveCommercialAlertAgain.statusCode, 409);

  const dismissCommercialAlert = await app.inject({
    method: "POST",
    url: `/commercial-alerts/${manualDismissAlert.id}/dismiss`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { reason: "Alerta nao se aplica apos contato manual" },
  });
  assert.equal(dismissCommercialAlert.statusCode, 200);
  assert.equal(dismissCommercialAlert.json().data.status, "DISMISSED");
  assert.equal(dismissCommercialAlert.json().data.resolvedByUserId, sdrUserId);

  const resolvedManualAudit = await prisma.auditLog.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      module: "commercial_alerts",
      action: "commercial_alert_resolved",
      entityType: "commercial_alert",
      entityId: manualResolveAlert.id,
    },
  });
  assert.ok(resolvedManualAudit);
  assert.equal(resolvedManualAudit.actorId, ownerBody.user.id);
  const dismissedManualAudit = await prisma.auditLog.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      module: "commercial_alerts",
      action: "commercial_alert_dismissed",
      entityType: "commercial_alert",
      entityId: manualDismissAlert.id,
    },
  });
  assert.ok(dismissedManualAudit);
  assert.equal(dismissedManualAudit.actorId, sdrUserId);

  const commercialAlertScanAgain = await app.inject({
    method: "POST",
    url: "/commercial-alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialAlertScanAgain.statusCode, 200);
  assert.ok(commercialAlertScanAgain.json().data.alertsRefreshed >= 1);
  const activeFollowUpAlertCount = await prisma.commercialAlert.count({
    where: {
      storeId: ownerBody.user.storeId,
      cardId: agendaCardId,
      alertType: "follow_up_overdue",
      status: { in: ["PENDING", "VIEWED"] },
    },
  });
  assert.equal(activeFollowUpAlertCount, 1);

  await prisma.commercialInteraction.updateMany({
    where: { storeId: ownerBody.user.storeId, cardId: agendaCardId, nextActionStatus: "PENDING", nextActionAt: { lt: new Date() } },
    data: { nextActionStatus: "DONE" },
  });
  const commercialAlertScanResolved = await app.inject({
    method: "POST",
    url: "/commercial-alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialAlertScanResolved.statusCode, 200);
  assert.ok(commercialAlertScanResolved.json().data.alertsResolved >= 1);
  const resolvedFollowUpAlert = await prisma.commercialAlert.findUnique({
    where: { id: activeFollowUpAlert.id },
  });
  assert.equal(resolvedFollowUpAlert?.status, "RESOLVED");
  assert.equal(resolvedFollowUpAlert?.resolvedByUserId, ownerBody.user.id);

  const resolvedCommercialAlerts = await app.inject({
    method: "GET",
    url: `/commercial-alerts?status=RESOLVED&type=follow_up_overdue&card_id=${agendaCardId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(resolvedCommercialAlerts.statusCode, 200);
  assert.ok(resolvedCommercialAlerts.json().items.some((item: { id: string }) => item.id === activeFollowUpAlert.id));
  checkpoint("commercial-interactions");

  // --- Commercial sales transition (S2-US04): SDR -> Sales creates a DRAFT Sale ---
  const sdrTransferToSales = await app.inject({
    method: "POST",
    url: "/commercial-sales/transfer",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, sellerUserId, customerArrivalStatus: "VISIT_SCHEDULED", transferReason: "Cliente confirmou visita" },
  });
  assert.equal(sdrTransferToSales.statusCode, 201);
  assert.equal(sdrTransferToSales.json().data.status, "DRAFT");
  assert.equal(sdrTransferToSales.json().data.sellerUserId, sellerUserId);
  assert.equal(sdrTransferToSales.json().data.leadCardId, agendaCardId);
  assert.equal(sdrTransferToSales.json().data.stageKey, "ASSUMED");
  const transferredSaleId = sdrTransferToSales.json().data.id as string;

  const sellerAssignedSaleNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=commercial_sale_assigned&entity_id=${transferredSaleId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerAssignedSaleNotifications.statusCode, 200);
  assert.ok(
    sellerAssignedSaleNotifications
      .json()
      .items.some(
        (notification: { actionUrl: string; priority: string; sourceModule: string }) =>
          notification.priority === "HIGH" &&
          notification.sourceModule === "commercial_sales" &&
          notification.actionUrl === `/commercial-sales/${transferredSaleId}`,
      ),
  );

  // Transfer requires a seller (AC2).
  const transferNoSeller = await app.inject({
    method: "POST",
    url: "/commercial-sales/transfer",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardNoVehicleId, customerArrivalStatus: "AT_STORE" },
  });
  assert.equal(transferNoSeller.statusCode, 400);

  // A seller cannot initiate the SDR -> Sales transfer.
  const sellerTransfer = await app.inject({
    method: "POST",
    url: "/commercial-sales/transfer",
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { cardId: agendaCardNoVehicleId, sellerUserId, customerArrivalStatus: "AT_STORE" },
  });
  assert.equal(sellerTransfer.statusCode, 403);

  // The same card cannot be transferred twice (one active sales process per card).
  const duplicateTransfer = await app.inject({
    method: "POST",
    url: "/commercial-sales/transfer",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: agendaCardId, sellerUserId, customerArrivalStatus: "AT_STORE" },
  });
  assert.equal(duplicateTransfer.statusCode, 409);

  // Seller creates a sales card directly from their own commercial card (AC5).
  const sellerOwnCommercialCard = await app.inject({
    method: "POST",
    url: "/commercial-kanban/cards",
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { name: "Cliente direto na loja", source: "loja" },
  });
  assert.equal(sellerOwnCommercialCard.statusCode, 201);
  const sellerCommercialCardId = sellerOwnCommercialCard.json().data.id as string;

  const sellerDirectSale = await app.inject({
    method: "POST",
    url: "/commercial-sales",
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { cardId: sellerCommercialCardId, customerArrivalStatus: "AT_STORE" },
  });
  assert.equal(sellerDirectSale.statusCode, 201);
  assert.equal(sellerDirectSale.json().data.sellerUserId, sellerUserId);

  // SDR does not operate the sales Kanban (direct create forbidden).
  const sdrDirectSale = await app.inject({
    method: "POST",
    url: "/commercial-sales",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { cardId: sellerCommercialCardId, customerArrivalStatus: "AT_STORE" },
  });
  assert.equal(sdrDirectSale.statusCode, 403);

  // The transferred sale is visible to the seller (own scope).
  const sellerSalesList = await app.inject({
    method: "GET",
    url: `/commercial-sales?customer_id=${createdCustomerId}&vehicle_id=${inventoryVehicleId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerSalesList.statusCode, 200);
  const transferredSaleListItem = sellerSalesList.json().items.find((sale: { id: string }) => sale.id === transferredSaleId);
  assert.ok(transferredSaleListItem);
  assert.ok(transferredSaleListItem.activeNotifications.count >= 1);
  assert.equal(transferredSaleListItem.activeNotifications.highestPriority, "HIGH");
  assert.ok(transferredSaleListItem.activeNotifications.types.includes("commercial_sale_assigned"));

  // --- Operate sales (S2-US04 stage 3): negotiation, own-financing alert, initial docs, LOST ---
  const updateNegotiation = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { salePrice: 95000, paymentMethodForecast: "financiamento", hasFinancing: true, financingType: "CUSTOMER_OWN", initialDocsStatus: "PARTIAL" },
  });
  assert.equal(updateNegotiation.statusCode, 200);
  assert.equal(updateNegotiation.json().data.financingType, "CUSTOMER_OWN");
  assert.equal(updateNegotiation.json().data.salePrice, "95000");
  // Own financing raises the alert (the value must land in the store account).
  assert.equal(updateNegotiation.json().financingAlert, true);

  // SDR does not operate the sales Kanban (PATCH forbidden).
  const sdrPatchSale = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { paymentMethodForecast: "PIX" },
  });
  assert.equal(sdrPatchSale.statusCode, 403);

  // --- Sprint 3 US07: additional sale revenue is separated from vehicle margin ---
  const additionalRevenue = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {
      itemType: "PPF",
      itemDescription: "PPF frontal",
      chargedAmount: 2500,
      includedInVehiclePrice: false,
      commercialNotes: "PPF vendido no fechamento",
    },
  });
  assert.equal(additionalRevenue.statusCode, 201);
  assert.equal(additionalRevenue.json().data.saleId, transferredSaleId);
  assert.equal(additionalRevenue.json().data.itemType, "PPF");
  assert.equal(additionalRevenue.json().data.financials.revenue, "2500.00");
  assert.equal(additionalRevenue.json().data.financials.spread, "2500.00");
  const additionalRevenueItemId = additionalRevenue.json().data.id as string;
  assert.ok(additionalRevenue.json().summary.pendingCostItems.includes(additionalRevenueItemId));

  const sdrAdditionalRevenue = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { itemType: "WINDOW_FILM", chargedAmount: 900 },
  });
  assert.equal(sdrAdditionalRevenue.statusCode, 403);

  const sellerAdditionalRevenueList = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerAdditionalRevenueList.statusCode, 200);
  assert.equal(sellerAdditionalRevenueList.json().data.summary.totalRevenue, "2500.00");
  assert.equal(sellerAdditionalRevenueList.json().data.summary.totalCost, "0.00");
  assert.ok(sellerAdditionalRevenueList.json().data.summary.pendingCostItems.includes(additionalRevenueItemId));

  const additionalCost = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues/${additionalRevenueItemId}/costs`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      costCategory: "THIRD_PARTY_SERVICE",
      expectedCostAmount: 1200,
      costStatus: "EXPECTED",
      notes: "Custo previsto do PPF",
    },
  });
  assert.equal(additionalCost.statusCode, 201);
  assert.equal(additionalCost.json().data.saleId, transferredSaleId);
  assert.equal(additionalCost.json().data.additionalRevenueItemId, additionalRevenueItemId);
  assert.equal(additionalCost.json().summary.totalCost, "1200.00");
  assert.equal(additionalCost.json().summary.totalSpread, "1300.00");
  assert.ok(additionalCost.json().summary.pendingCostItems.includes(additionalRevenueItemId));
  const additionalCostId = additionalCost.json().data.id as string;

  const realizedAdditionalCost = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues/${additionalRevenueItemId}/costs/${additionalCostId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      realizedCostAmount: 3000,
      costStatus: "REALIZED",
      notes: "Custo real maior que o valor vendido",
    },
  });
  assert.equal(realizedAdditionalCost.statusCode, 200);
  assert.equal(realizedAdditionalCost.json().summary.totalCost, "3000.00");
  assert.equal(realizedAdditionalCost.json().summary.totalSpread, "-500.00");
  assert.ok(realizedAdditionalCost.json().summary.negativeSpreadItems.includes(additionalRevenueItemId));
  assert.ok(!realizedAdditionalCost.json().summary.pendingCostItems.includes(additionalRevenueItemId));

  const finalAdditionalRevenueList = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/additional-revenues`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(finalAdditionalRevenueList.statusCode, 200);
  assert.equal(finalAdditionalRevenueList.json().data.summary.totalRevenue, "2500.00");
  assert.equal(finalAdditionalRevenueList.json().data.summary.totalCost, "3000.00");
  assert.equal(finalAdditionalRevenueList.json().data.summary.totalSpread, "-500.00");
  assert.ok(finalAdditionalRevenueList.json().data.summary.negativeSpreadItems.includes(additionalRevenueItemId));

  // Seller registers the buyer's initial documents -> REAL producer of the US06 prerequisite.
  const initialDocuments = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/initial-documents`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { status: "COLLECTED" },
  });
  assert.equal(initialDocuments.statusCode, 200);
  assert.equal(initialDocuments.json().data.initialDocsStatus, "COLLECTED");
  const buyerDocDelivered = await prisma.saleDocumentChecklist.findFirst({
    where: { saleId: transferredSaleId, itemKey: "buyer_document_delivered", isDone: true },
  });
  assert.ok(buyerDocDelivered);
  assert.equal(buyerDocDelivered.saleId, transferredSaleId);

  // Move the sales stage (negotiation).
  const moveToNegotiation = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/move`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { toStage: "IN_NEGOTIATION" },
  });
  assert.equal(moveToNegotiation.statusCode, 200);
  assert.equal(moveToNegotiation.json().data.stageKey, "IN_NEGOTIATION");

  // LOST cancels/soft-deletes the sale and removes it from lists/open-sales count.
  const openSalesBeforeLost = await app.inject({
    method: "GET",
    url: "/analytics/executive-summary",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(openSalesBeforeLost.statusCode, 200);
  const directSaleId = sellerDirectSale.json().data.id as string;
  const lostMove = await app.inject({
    method: "POST",
    url: `/commercial-sales/${directSaleId}/move`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { toStage: "LOST", reason: "Cliente desistiu da compra" },
  });
  assert.equal(lostMove.statusCode, 200);
  assert.equal(lostMove.json().data.status, "CANCELLED");
  const lostSaleGet = await app.inject({
    method: "GET",
    url: `/commercial-sales/${directSaleId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(lostSaleGet.statusCode, 404);
  const openSalesAfterLost = await app.inject({
    method: "GET",
    url: "/analytics/executive-summary",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(openSalesAfterLost.statusCode, 200);
  assert.equal(openSalesAfterLost.json().totals.openSales, openSalesBeforeLost.json().totals.openSales - 1);

  // --- Close the deal (S2-US04 stage 4): -> DOCUMENTATION queue, no release, own-financing alert ---
  // SDR cannot mark a deal closed (AC15).
  const sdrClose = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/close`,
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: {},
  });
  assert.equal(sdrClose.statusCode, 403);

  // Seller closes the deal -> moves to DOCUMENTATION; never releases documents/delivery.
  const closeDeal = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/close`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {},
  });
  assert.equal(closeDeal.statusCode, 200);
  assert.equal(closeDeal.json().data.status, "DOCUMENTATION");
  assert.equal(closeDeal.json().data.stageKey, "CLOSED_WON");
  assert.equal(closeDeal.json().releasesDocuments, false);
  // Own financing was set in stage 3 -> alert raised.
  assert.equal(closeDeal.json().financingAlert, true);
  const bornSaleDossier = await prisma.saleDossier.findFirst({ where: { saleId: transferredSaleId, storeId: ownerBody.user.storeId } });
  assert.ok(bornSaleDossier);
  assert.equal(bornSaleDossier.saleId, transferredSaleId);
  assert.equal(bornSaleDossier.status, "OPEN");

  const documentationNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=commercial_sale_documentation_pending&entity_id=${transferredSaleId}&status=NEW&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(documentationNotifications.statusCode, 200);
  assert.ok(
    documentationNotifications
      .json()
      .items.some(
        (notification: { actionUrl: string; priority: string; sourceModule: string; userId: string }) =>
          notification.userId === ownerBody.user.id &&
          notification.priority === "HIGH" &&
          notification.sourceModule === "commercial_sales" &&
          notification.actionUrl === `/commercial-sales/${transferredSaleId}`,
      ),
  );

  const sellerDocumentationNotificationScope = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=commercial_sale_documentation_pending&entity_id=${transferredSaleId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerDocumentationNotificationScope.statusCode, 200);
  assert.equal(sellerDocumentationNotificationScope.json().items.length, 0);

  const ownerCommercialSaleDetail = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerCommercialSaleDetail.statusCode, 200);
  assert.ok(ownerCommercialSaleDetail.json().data.activeNotifications.count >= 2);
  assert.equal(ownerCommercialSaleDetail.json().data.activeNotifications.highestPriority, "CRITICAL");
  assert.ok(ownerCommercialSaleDetail.json().data.activeNotifications.types.includes("commercial_sale_documentation_pending"));
  assert.ok(ownerCommercialSaleDetail.json().data.activeNotifications.types.includes("own_financing_alert"));

  // Closing again is blocked.
  const reClose = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/close`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {},
  });
  assert.equal(reClose.statusCode, 422);

  // Managerial own-financing notification was generated (deduped by active condition).
  const ownFinancingNotifications = await app.inject({
    method: "GET",
    url: "/notifications?entity_type=own_financing_alert&page_size=100",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownFinancingNotifications.statusCode, 200);
  assert.ok(ownFinancingNotifications.json().items.some((n: { entityId: string }) => n.entityId === transferredSaleId));

  // The seller cannot confer documents (Management/Administrative only).
  const sellerConfer = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/confer-documents`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {},
  });
  assert.equal(sellerConfer.statusCode, 403);

  // Administrative confers the buyer documents -> REAL producer of the US06 prerequisite (checked).
  const conferDocuments = await app.inject({
    method: "POST",
    url: `/commercial-sales/${transferredSaleId}/confer-documents`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {},
  });
  assert.equal(conferDocuments.statusCode, 200);
  const buyerDocChecked = await prisma.saleDocumentChecklist.findFirst({
    where: { saleId: transferredSaleId, itemKey: "buyer_document_checked", isDone: true },
  });
  assert.ok(buyerDocChecked);
  assert.equal(buyerDocChecked.saleId, transferredSaleId);

  // --- Sprint 3 US01: buyer document checklist is born from the DOCUMENTATION handoff ---
  const buyerChecklist = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/document-checklist`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(buyerChecklist.statusCode, 200);
  assert.ok(buyerChecklist.json().data.items.some((item: { itemKey: string; isRequired: boolean }) => item.itemKey === "person_identity_document" && item.isRequired));
  assert.ok(buyerChecklist.json().data.items.some((item: { itemKey: string; isRequired: boolean }) => item.itemKey === "person_address_proof" && item.isRequired));
  assert.equal(buyerChecklist.json().data.summary.blockedForContracts, true);

  // --- Sprint 3 US02: payment conference is created from the same DOCUMENTATION handoff ---
  const sellerPaymentChecks = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/payment-checks`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerPaymentChecks.statusCode, 200);
  assert.equal(sellerPaymentChecks.json().data.summary.blockedForRelease, true);
  assert.ok(
    sellerPaymentChecks
      .json()
      .data.items.some(
        (item: { paymentItemType: string; direction: string; expectedAmount: string }) =>
          item.paymentItemType === "own_financing_received_store_account" && item.direction === "INCOME" && item.expectedAmount === "95000",
      ),
  );

  const financePaymentChecks = await app.inject({
    method: "GET",
    url: `/finance/sale-payment-checks?sale_id=${transferredSaleId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(financePaymentChecks.statusCode, 200);
  assert.equal(financePaymentChecks.json().summary.blockedForRelease, true);
  const commercialGatePaymentCheck = financePaymentChecks
    .json()
    .items.find((item: { paymentItemType: string }) => item.paymentItemType === "own_financing_received_store_account");
  assert.ok(commercialGatePaymentCheck);
  const commercialGatePaymentCheckId = commercialGatePaymentCheck.id as string;

  const partialPaymentConference = await app.inject({
    method: "POST",
    url: `/finance/sale-payment-checks/${commercialGatePaymentCheckId}/confirm`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      confirmedAmount: 50000,
      bankMovementAt: financeDueAt,
      bankDescription: "Entrada parcial encontrada no extrato QA",
      bankTransactionId: "QA-PARTIAL-US02",
      notes: "Recebimento parcial nao libera entrega",
    },
  });
  assert.equal(partialPaymentConference.statusCode, 200);
  assert.equal(partialPaymentConference.json().data.paymentStatus, "PARTIAL_RECEIVED");
  assert.equal(partialPaymentConference.json().data.releaseStatus, "BLOCKED");
  assert.equal(partialPaymentConference.json().data.pendingAmount, "45000");

  const sellerCannotApproveBuyerDocument = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/document-checklist/person_identity_document`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { status: "CHECKED", notes: "tentativa de aprovar como vendedor" },
  });
  assert.equal(sellerCannotApproveBuyerDocument.statusCode, 403);

  const sellerReceivesBuyerDocument = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/document-checklist/person_identity_document`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: { status: "RECEIVED", notes: "RG/CNH entregue pelo comprador" },
  });
  assert.equal(sellerReceivesBuyerDocument.statusCode, 200);
  assert.equal(sellerReceivesBuyerDocument.json().data.status, "RECEIVED");
  assert.equal(sellerReceivesBuyerDocument.json().data.isDone, false);

  const blockedContractByBuyerDocs = await app.inject({
    method: "POST",
    url: "/contracts/generate",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      saleId: transferredSaleId,
      status: "GENERATED",
      snapshot: { qa: true, source: "s3-us01-blocked-by-docs" },
    },
  });
  assert.equal(blockedContractByBuyerDocs.statusCode, 422);
  assert.ok(
    blockedContractByBuyerDocs
      .json()
      .error.details.pendingDocumentItems.some((item: { itemKey: string; reason: string }) => item.itemKey === "person_identity_document" && item.reason === "required_pending"),
  );

  const staleAddressProofDate = new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString();
  const staleAddressProof = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/document-checklist/person_address_proof`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { status: "CHECKED", issueDate: staleAddressProofDate, notes: "comprovante antigo em QA" },
  });
  assert.equal(staleAddressProof.statusCode, 422);
  assert.equal(staleAddressProof.json().error.code, "BUSINESS_RULE_ERROR");

  const checkIdentityDocument = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/document-checklist/person_identity_document`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { status: "CHECKED", notes: "RG/CNH conferido pelo administrativo" },
  });
  assert.equal(checkIdentityDocument.statusCode, 200);
  assert.equal(checkIdentityDocument.json().data.isDone, true);

  const currentAddressProofDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const checkAddressProof = await app.inject({
    method: "PATCH",
    url: `/commercial-sales/${transferredSaleId}/document-checklist/person_address_proof`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: { status: "CHECKED", issueDate: currentAddressProofDate, notes: "comprovante atualizado conferido" },
  });
  assert.equal(checkAddressProof.statusCode, 200);
  assert.equal(checkAddressProof.json().summary.blockedForContracts, false);
  // --- Sprint 3 US04: required inspection reports are born from the DOCUMENTATION handoff ---
  const sellerInspectionReports = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/inspection-reports`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerInspectionReports.statusCode, 200);
  assert.equal(sellerInspectionReports.json().data.summary.blockedForRelease, true);
  type SmokeInspectionReport = {
    id: string;
    saleId: string;
    vehicleId: string;
    reportType: string;
    status: string;
    isRequired: boolean;
    reportFileId: string | null;
    printedAt: string | null;
  };
  const commercialGateInspectionReports = sellerInspectionReports.json().data.items as SmokeInspectionReport[];
  assert.equal(commercialGateInspectionReports.filter((item) => item.isRequired).length, 2);
  const cautionaryInspectionReport = commercialGateInspectionReports.find((item) => item.reportType === "CAUTIONARY");
  const transferInspectionReport = commercialGateInspectionReports.find((item) => item.reportType === "TRANSFER");
  assert.ok(cautionaryInspectionReport);
  assert.ok(transferInspectionReport);
  assert.equal(cautionaryInspectionReport.saleId, transferredSaleId);
  assert.equal(cautionaryInspectionReport.vehicleId, inventoryVehicleId);
  assert.equal(transferInspectionReport.saleId, transferredSaleId);
  assert.equal(transferInspectionReport.status, "PENDING");
  const cautionaryReportId = cautionaryInspectionReport.id;
  const transferReportId = transferInspectionReport.id;

  // --- US04 -> US06 final gate (stage 5): real producers unlock technical delivery ---
  const commercialGateContract = await app.inject({
    method: "POST",
    url: "/contracts/generate",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      saleId: transferredSaleId,
      status: "GENERATED",
      snapshot: {
        qa: true,
        source: "s2-us04-us06-gate",
      },
    },
  });
  assert.equal(commercialGateContract.statusCode, 201);
  assert.equal(commercialGateContract.json().data.saleId, transferredSaleId);
  const commercialGateContractId = commercialGateContract.json().data.id as string;
  assert.equal(commercialGateContract.json().warrantyTerm.saleId, transferredSaleId);
  assert.equal(commercialGateContract.json().warrantyTerm.sourceContractId, commercialGateContractId);
  const commercialGateWarrantyTermId = commercialGateContract.json().warrantyTerm.id as string;

  const commercialGateContractPackage = await app.inject({
    method: "POST",
    url: "/contracts/packages",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      saleId: transferredSaleId,
      contractId: commercialGateContractId,
      signatureProvider: "CDT_DIGITAL",
      vehicleTransferMode: "CDT_DIGITAL",
      vehicleDocumentEligibleForAtpve: true,
      metadata: { source: "s3-us03-assisted-signature" },
    },
  });
  assert.equal(commercialGateContractPackage.statusCode, 201);
  assert.equal(commercialGateContractPackage.json().data.saleId, transferredSaleId);
  assert.equal(commercialGateContractPackage.json().data.contractId, commercialGateContractId);
  assert.equal(commercialGateContractPackage.json().data.observationsReviewed, false);
  const commercialGatePackageId = commercialGateContractPackage.json().data.id as string;

  const blockedPackageWithoutReview = await app.inject({
    method: "POST",
    url: `/contracts/packages/${commercialGatePackageId}/send-signature`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      signatureProvider: "CDT_DIGITAL",
      vehicleTransferMode: "CDT_DIGITAL",
      govbrLevelRequired: "PRATA_OURO",
      vehicleDocumentEligibleForAtpve: true,
      buyerNotificationChannel: "WHATSAPP",
      buyerNotificationRecipient: "+5511999999999",
    },
  });
  assert.equal(blockedPackageWithoutReview.statusCode, 422);
  assert.equal(blockedPackageWithoutReview.json().error.code, "BUSINESS_RULE_ERROR");
  assert.ok(blockedPackageWithoutReview.json().error.details.missing.includes("observations_reviewed"));

  const reviewedCommercialGatePackage = await app.inject({
    method: "POST",
    url: `/contracts/packages/${commercialGatePackageId}/review`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      observationsReviewed: true,
      reviewNotes: "Dados e observacoes revisados para assinatura assistida CDT",
    },
  });
  assert.equal(reviewedCommercialGatePackage.statusCode, 200);
  assert.equal(reviewedCommercialGatePackage.json().data.status, "READY_FOR_SIGNATURE");
  assert.equal(reviewedCommercialGatePackage.json().data.observationsReviewed, true);
  const blockedPackageWithoutInspectionReports = await app.inject({
    method: "POST",
    url: `/contracts/packages/${commercialGatePackageId}/send-signature`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      signatureProvider: "CDT_DIGITAL",
      vehicleTransferMode: "CDT_DIGITAL",
      govbrLevelRequired: "PRATA_OURO",
      vehicleDocumentEligibleForAtpve: true,
      buyerNotificationChannel: "WHATSAPP",
      buyerNotificationRecipient: "+5511999999999",
    },
  });
  assert.equal(blockedPackageWithoutInspectionReports.statusCode, 422);
  assert.equal(blockedPackageWithoutInspectionReports.json().error.code, "BUSINESS_RULE_ERROR");
  assert.ok(
    blockedPackageWithoutInspectionReports
      .json()
      .error.details.pendingInspectionReports.some((item: { reportType: string; reason: string }) => item.reportType === "TRANSFER" && item.reason === "required_report_pending"),
  );

  const cautionaryReportUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "vehicle-documents",
      originalName: "laudo-cautelar-us04.pdf",
      mimeType: "application/pdf",
      sizeBytes: 45678,
      classification: "cautionary_report",
      link: { entityType: "vehicle", entityId: inventoryVehicleId, purpose: "cautionary_report" },
    },
  });
  assert.equal(cautionaryReportUpload.statusCode, 201);
  const cautionaryReportFileId = cautionaryReportUpload.json().data.id as string;

  const transferReportUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "laudo-transferencia-us04.pdf",
      mimeType: "application/pdf",
      sizeBytes: 56789,
      classification: "transfer_report",
      link: { entityType: "sale", entityId: transferredSaleId, purpose: "transfer_report" },
    },
  });
  assert.equal(transferReportUpload.statusCode, 201);
  const transferReportFileId = transferReportUpload.json().data.id as string;

  const checkedCautionaryReport = await app.inject({
    method: "PATCH",
    url: `/contracts/inspection-reports/${cautionaryReportId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      reportFileId: cautionaryReportFileId,
      reportDate: financeDueAt,
      status: "CHECKED",
      requestedByCustomer: true,
      replacementReason: "Atualizacao validada no smoke da US04",
      notes: "Laudo cautelar anexado e conferido para assinatura",
    },
  });
  assert.equal(checkedCautionaryReport.statusCode, 200);
  assert.equal(checkedCautionaryReport.json().data.status, "CHECKED");
  assert.equal(checkedCautionaryReport.json().data.reportFileId, cautionaryReportFileId);
  assert.equal(checkedCautionaryReport.json().summary.blockedForRelease, true);

  const checkedTransferReport = await app.inject({
    method: "PATCH",
    url: `/contracts/inspection-reports/${transferReportId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      reportFileId: transferReportFileId,
      reportDate: financeDueAt,
      status: "CHECKED",
      notes: "Laudo de transferencia anexado e conferido para assinatura",
    },
  });
  assert.equal(checkedTransferReport.statusCode, 200);
  assert.equal(checkedTransferReport.json().data.status, "CHECKED");
  assert.equal(checkedTransferReport.json().data.reportFileId, transferReportFileId);
  assert.equal(checkedTransferReport.json().summary.blockedForRelease, false);

  const sellerPrintsCautionaryReport = await app.inject({
    method: "POST",
    url: `/contracts/inspection-reports/${cautionaryReportId}/export`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {
      action: "PRINT",
      requestedByCustomer: true,
      notes: "Cliente solicitou copia impressa do laudo cautelar",
    },
  });
  assert.equal(sellerPrintsCautionaryReport.statusCode, 200);
  assert.equal(sellerPrintsCautionaryReport.json().data.action, "PRINT");
  assert.equal(sellerPrintsCautionaryReport.json().data.attachmentId, cautionaryReportFileId);

  const sellerInspectionReportsAfterCheck = await app.inject({
    method: "GET",
    url: `/commercial-sales/${transferredSaleId}/inspection-reports`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerInspectionReportsAfterCheck.statusCode, 200);
  assert.equal(sellerInspectionReportsAfterCheck.json().data.summary.blockedForRelease, false);
  assert.ok(
    (sellerInspectionReportsAfterCheck.json().data.items as SmokeInspectionReport[]).some(
      (item) => item.id === cautionaryReportId && item.status === "CHECKED" && Boolean(item.printedAt),
    ),
  );

  const sentCommercialGatePackage = await app.inject({
    method: "POST",
    url: `/contracts/packages/${commercialGatePackageId}/send-signature`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      signatureProvider: "CDT_DIGITAL",
      vehicleTransferMode: "CDT_DIGITAL",
      govbrLevelRequired: "PRATA_OURO",
      vehicleDocumentEligibleForAtpve: true,
      buyerNotificationChannel: "WHATSAPP",
      buyerNotificationRecipient: "+5511999999999",
    },
  });
  assert.equal(sentCommercialGatePackage.statusCode, 200);
  assert.equal(sentCommercialGatePackage.json().data.status, "SENT_TO_CDT");
  assert.equal(sentCommercialGatePackage.json().data.sellerSignatureStatus, "AWAITING");
  assert.equal(sentCommercialGatePackage.json().data.buyerSignatureStatus, "AWAITING");
  assert.equal(sentCommercialGatePackage.json().data.govbrLevelRequired, "PRATA_OURO");
  assert.ok(sentCommercialGatePackage.json().data.buyerNotifiedAt);

  const signedContractUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "contrato-assinado-cdt.pdf",
      mimeType: "application/pdf",
      sizeBytes: 34567,
      classification: "signed_contract",
      link: { entityType: "contract", entityId: commercialGateContractId, purpose: "signed_contract" },
    },
  });
  assert.equal(signedContractUpload.statusCode, 201);
  const signedContractFileId = signedContractUpload.json().data.id as string;

  const atpveEvidenceUpload = await app.inject({
    method: "POST",
    url: "/files/prepare-upload",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      bucket: "sale-documents",
      originalName: "evidencia-atpve-cdt.pdf",
      mimeType: "application/pdf",
      sizeBytes: 23456,
      classification: "atpve_evidence",
      link: { entityType: "sale", entityId: transferredSaleId, purpose: "atpve_evidence" },
    },
  });
  assert.equal(atpveEvidenceUpload.statusCode, 201);
  const atpveEvidenceFileId = atpveEvidenceUpload.json().data.id as string;

  const signedCommercialGatePackage = await app.inject({
    method: "POST",
    url: `/contracts/packages/${commercialGatePackageId}/signed-document`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      signedFileId: signedContractFileId,
      atpveEvidenceFileId,
      sellerSignatureStatus: "SIGNED",
      buyerSignatureStatus: "SIGNED",
      atpveStatus: "COMPLETED",
      signedAt: financeDueAt,
      signatureHash: "qa-s3-us03-signature-hash",
      notes: "Contrato e ATPV-e assinados via fluxo assistido CDT",
    },
  });
  assert.equal(signedCommercialGatePackage.statusCode, 200);
  assert.equal(signedCommercialGatePackage.json().data.status, "SIGNED_ALL");
  assert.equal(signedCommercialGatePackage.json().data.signedFileId, signedContractFileId);
  assert.equal(signedCommercialGatePackage.json().data.atpveEvidenceFileId, atpveEvidenceFileId);

  const signedCommercialGateContract = await app.inject({
    method: "GET",
    url: `/contracts/${commercialGateContractId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(signedCommercialGateContract.statusCode, 200);
  assert.equal(signedCommercialGateContract.json().data.saleId, transferredSaleId);
  assert.equal(signedCommercialGateContract.json().data.status, "SIGNED");
  assert.equal(signedCommercialGateContract.json().data.signedAt, financeDueAt);

  const blockedWithoutWarrantySignature = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      saleId: transferredSaleId,
      scheduledAt: new Date(new Date(financeDueAt).getTime() + 13800000).toISOString(),
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(blockedWithoutWarrantySignature.statusCode, 422);
  assert.ok(blockedWithoutWarrantySignature.json().error.details.pendingPrerequisites.includes("warranty_term_signed"));

  const printCommercialGateWarranty = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${commercialGateWarrantyTermId}/print`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { printerConfigured: true },
  });
  assert.equal(printCommercialGateWarranty.statusCode, 200);
  assert.equal(printCommercialGateWarranty.json().data.status, "PRINTED");

  const signCommercialGateWarranty = await app.inject({
    method: "POST",
    url: `/contracts/warranty-terms/${commercialGateWarrantyTermId}/confirm-signature`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      signedStatus: "SIGNED",
      observation: "Termo de garantia assinado no gate US04-US06",
      allDocumentsSignedStatus: "ALL_SIGNED",
    },
  });
  assert.equal(signCommercialGateWarranty.statusCode, 200);
  assert.equal(signCommercialGateWarranty.json().data.signedStatus, "SIGNED");

  const commercialGateSignatureSummary = await app.inject({
    method: "GET",
    url: `/contracts/sales/${transferredSaleId}/signature-summary`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(commercialGateSignatureSummary.statusCode, 200);
  assert.equal(commercialGateSignatureSummary.json().data.warrantyTerm.signedStatus, "SIGNED");
  assert.ok(!commercialGateSignatureSummary.json().data.pendingItems.includes("warranty_term_signed"));
  const blockedWithoutPaidIncome = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      saleId: transferredSaleId,
      scheduledAt: new Date(new Date(financeDueAt).getTime() + 14400000).toISOString(),
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(blockedWithoutPaidIncome.statusCode, 422);
  assert.equal(blockedWithoutPaidIncome.json().error.code, "BUSINESS_RULE_ERROR");
  assert.deepEqual(blockedWithoutPaidIncome.json().error.details.pendingPrerequisites, ["payment_confirmed"]);

  const commercialGateIncome = await app.inject({
    method: "POST",
    url: "/finance/transactions",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      type: "INCOME",
      status: "SCHEDULED",
      description: "Recebimento gate US04 US06",
      amount: 95000,
      dueAt: financeDueAt,
      entityType: "sale",
      entityId: transferredSaleId,
      snapshot: { source: "s2-us04-us06-gate" },
    },
  });
  assert.equal(commercialGateIncome.statusCode, 201);
  assert.equal(commercialGateIncome.json().data.entityId, transferredSaleId);
  const commercialGateIncomeId = commercialGateIncome.json().data.id as string;

  const paidCommercialGateIncome = await app.inject({
    method: "POST",
    url: `/finance/transactions/${commercialGateIncomeId}/settle`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      status: "PAID",
      paidAt: financeDueAt,
      reason: "Gate US04-US06 validado em QA",
    },
  });
  assert.equal(paidCommercialGateIncome.statusCode, 200);
  assert.equal(paidCommercialGateIncome.json().data.entityId, transferredSaleId);
  assert.equal(paidCommercialGateIncome.json().data.status, "PAID");

  const blockedWithoutPaymentRelease = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      saleId: transferredSaleId,
      scheduledAt: new Date(new Date(financeDueAt).getTime() + 16200000).toISOString(),
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(blockedWithoutPaymentRelease.statusCode, 422);
  assert.equal(blockedWithoutPaymentRelease.json().error.code, "BUSINESS_RULE_ERROR");
  assert.deepEqual(blockedWithoutPaymentRelease.json().error.details.pendingPrerequisites, ["payment_confirmed"]);
  assert.ok(
    blockedWithoutPaymentRelease
      .json()
      .error.details.paymentChecks.some((item: { id: string; releaseStatus: string }) => item.id === commercialGatePaymentCheckId && item.releaseStatus === "BLOCKED"),
  );

  const fullPaymentConference = await app.inject({
    method: "POST",
    url: `/finance/sale-payment-checks/${commercialGatePaymentCheckId}/confirm`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      confirmedAmount: 95000,
      bankMovementAt: financeDueAt,
      bankDescription: "Valor integral da financeira propria caiu na conta da loja",
      bankTransactionId: "QA-FULL-US02",
      notes: "Conferencia financeira liberada para documentacao e entrega",
    },
  });
  assert.equal(fullPaymentConference.statusCode, 200);
  assert.equal(fullPaymentConference.json().data.paymentStatus, "CONFIRMED_RECEIVED");
  assert.equal(fullPaymentConference.json().data.releaseStatus, "RELEASED_FOR_DOCUMENTATION");
  assert.equal(fullPaymentConference.json().data.pendingAmount, "0");

  const commercialGateDeliveryAt = new Date(new Date(financeDueAt).getTime() + 18000000).toISOString();
  const scheduledCommercialGateDelivery = await app.inject({
    method: "POST",
    url: "/technical-deliveries/schedule",
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      saleId: transferredSaleId,
      scheduledAt: commercialGateDeliveryAt,
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(scheduledCommercialGateDelivery.statusCode, 201);
  assert.equal(scheduledCommercialGateDelivery.json().data.saleId, transferredSaleId);
  assert.equal(scheduledCommercialGateDelivery.json().data.vehicleId, inventoryVehicleId);
  assert.equal(scheduledCommercialGateDelivery.json().data.customerId, createdCustomerId);
  assert.equal(scheduledCommercialGateDelivery.json().data.status, "SCHEDULED");
  const commercialGateDeliveryId = scheduledCommercialGateDelivery.json().data.id as string;

  const sellerCommercialSalesDocumentation = await app.inject({
    method: "GET",
    url: `/commercial-sales?status=DOCUMENTATION&customer_id=${createdCustomerId}&vehicle_id=${inventoryVehicleId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerCommercialSalesDocumentation.statusCode, 200);
  assert.ok(sellerCommercialSalesDocumentation.json().items.some((sale: { id: string }) => sale.id === transferredSaleId));

  const managerCommercialSalesDocumentation = await app.inject({
    method: "GET",
    url: `/commercial-sales?status=DOCUMENTATION&customer_id=${createdCustomerId}&vehicle_id=${inventoryVehicleId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(managerCommercialSalesDocumentation.statusCode, 200);
  assert.ok(managerCommercialSalesDocumentation.json().items.some((sale: { id: string }) => sale.id === transferredSaleId));

  const managementTechnicalDeliveryQueue = await app.inject({
    method: "GET",
    url: `/technical-deliveries?status=SCHEDULED&sale_id=${transferredSaleId}&page_size=100`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
  });
  assert.equal(managementTechnicalDeliveryQueue.statusCode, 200);
  assert.ok(managementTechnicalDeliveryQueue.json().items.some((delivery: { id: string }) => delivery.id === commercialGateDeliveryId));

  const sellerCommercialGateDeliveries = await app.inject({
    method: "GET",
    url: `/technical-deliveries?sale_id=${transferredSaleId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerCommercialGateDeliveries.statusCode, 200);
  assert.ok(sellerCommercialGateDeliveries.json().items.some((delivery: { id: string }) => delivery.id === commercialGateDeliveryId));

  // --- Sprint 3 US09: digital sale dossier consolidates the real US04 -> US06 gate ---
  const sdrCannotReadSaleDossier = await app.inject({
    method: "GET",
    url: `/sale-dossiers/${transferredSaleId}`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCannotReadSaleDossier.statusCode, 403);

  const sellerSaleDossier = await app.inject({
    method: "GET",
    url: `/sale-dossiers/${transferredSaleId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerSaleDossier.statusCode, 200);
  assert.equal(sellerSaleDossier.json().data.dossier.saleId, transferredSaleId);
  assert.equal(sellerSaleDossier.json().data.dossier.sellerUserId, sellerUserId);
  assert.equal(sellerSaleDossier.json().data.metrics.prerequisites.buyerDocumentsDelivered, true);
  assert.equal(sellerSaleDossier.json().data.metrics.prerequisites.buyerDocumentsChecked, true);
  assert.equal(sellerSaleDossier.json().data.metrics.prerequisites.contractSigned, true);
  assert.equal(sellerSaleDossier.json().data.metrics.prerequisites.warrantySigned, true);
  assert.equal(sellerSaleDossier.json().data.metrics.prerequisites.paymentConfirmed, true);
  assert.equal(sellerSaleDossier.json().data.metrics.operations.technicalDeliveryStatus, "SCHEDULED");
  assert.equal(sellerSaleDossier.json().data.metrics.finance.additionalRevenueTotal, "2500.00");
  assert.equal(sellerSaleDossier.json().data.metrics.finance.additionalCostTotal, "3000.00");
  assert.equal(sellerSaleDossier.json().data.metrics.finance.additionalSpreadTotal, "-500.00");
  assert.ok(sellerSaleDossier.json().data.documents.some((document: { attachmentId: string; documentType: string }) => document.attachmentId === signedContractFileId && document.documentType === "signed_contract"));
  assert.ok(sellerSaleDossier.json().data.documents.some((document: { attachmentId: string; documentType: string }) => document.attachmentId === atpveEvidenceFileId && document.documentType === "atpve_evidence"));
  assert.ok(sellerSaleDossier.json().data.recentEvents.some((event: { eventType: string }) => event.eventType === "technical_delivery_scheduled"));

  const attachDossierEvidence = await app.inject({
    method: "POST",
    url: `/sale-dossiers/${transferredSaleId}/documents`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      attachmentId: atpveEvidenceFileId,
      documentType: "administrative_evidence",
      sourceModule: "qa",
      metadata: { source: "s3-us09-smoke" },
    },
  });
  assert.equal(attachDossierEvidence.statusCode, 201);
  assert.equal(attachDossierEvidence.json().data.saleId, transferredSaleId);
  assert.equal(attachDossierEvidence.json().data.origin, "MANUAL");

  const saleDossierDocuments = await app.inject({
    method: "GET",
    url: `/sale-dossiers/${transferredSaleId}/documents?document_type=administrative_evidence`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(saleDossierDocuments.statusCode, 200);
  assert.ok(saleDossierDocuments.json().items.some((document: { attachmentId: string }) => document.attachmentId === atpveEvidenceFileId));

  const saleDossierEvents = await app.inject({
    method: "GET",
    url: `/sale-dossiers/${transferredSaleId}/events?event_type=payment_released_for_documentation`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(saleDossierEvents.statusCode, 200);
  assert.ok(saleDossierEvents.json().items.some((event: { sourceEntityId: string }) => event.sourceEntityId === commercialGatePaymentCheckId));

  const saleDossierMetrics = await app.inject({
    method: "GET",
    url: "/sale-dossiers/metrics/summary",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(saleDossierMetrics.statusCode, 200);
  assert.ok(saleDossierMetrics.json().data.totals.administrativeSales >= 1);
  assert.ok(Number(saleDossierMetrics.json().data.additionalRevenue.totalRevenue) >= 2500);
  assert.ok(Number(saleDossierMetrics.json().data.additionalRevenue.totalCost) >= 3000);
  assert.ok(Number.isFinite(Number(saleDossierMetrics.json().data.additionalRevenue.totalSpread)));
  checkpoint("commercial-sales");

  // --- Sprint 4 US01: 2-year post-sale alert from the real sale purchase date ---
  const postSalePurchaseDate = new Date("2024-06-10T12:00:00.000Z");
  const postSaleInitialScanNow = new Date("2026-06-10T13:00:00.000Z");
  const postSaleOverdueScanNow = new Date("2026-06-20T12:00:00.000Z");
  await prisma.sale.update({
    where: { id: transferredSaleId },
    data: { closedAt: postSalePurchaseDate },
  });

  const sdrCannotScanPostSaleAlerts = await app.inject({
    method: "POST",
    url: "/post-sale/alerts/scan",
    headers: { authorization: `Bearer ${sdrToken}` },
    payload: { now: postSaleInitialScanNow.toISOString() },
  });
  assert.equal(sdrCannotScanPostSaleAlerts.statusCode, 403);

  const postSaleAlertScan = await app.inject({
    method: "POST",
    url: "/post-sale/alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { now: postSaleInitialScanNow.toISOString() },
  });
  assert.equal(postSaleAlertScan.statusCode, 200);
  assert.ok(postSaleAlertScan.json().data.alertsCreated >= 1);
  const generatedPostSaleAlert = postSaleAlertScan.json().data.alerts.find((alert: { saleId: string }) => alert.saleId === transferredSaleId);
  assert.ok(generatedPostSaleAlert);
  assert.equal(generatedPostSaleAlert.status, "PENDING");
  assert.equal(generatedPostSaleAlert.customerId, createdCustomerId);
  assert.equal(generatedPostSaleAlert.vehicleId, inventoryVehicleId);
  assert.equal(generatedPostSaleAlert.assignedUserId, sellerUserId);
  assert.equal(generatedPostSaleAlert.context.customer.id, createdCustomerId);
  assert.equal(generatedPostSaleAlert.context.assignedUser.id, sellerUserId);
  const postSaleAlertId = generatedPostSaleAlert.id as string;

  const sellerPostSaleAlerts = await app.inject({
    method: "GET",
    url: `/post-sale/alerts?sale_id=${transferredSaleId}&page_size=100`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerPostSaleAlerts.statusCode, 200);
  assert.ok(sellerPostSaleAlerts.json().items.some((alert: { id: string }) => alert.id === postSaleAlertId));

  const sdrCannotListPostSaleAlerts = await app.inject({
    method: "GET",
    url: "/post-sale/alerts",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCannotListPostSaleAlerts.statusCode, 403);

  const duplicatePostSaleAlertScan = await app.inject({
    method: "POST",
    url: "/post-sale/alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { now: postSaleInitialScanNow.toISOString() },
  });
  assert.equal(duplicatePostSaleAlertScan.statusCode, 200);
  assert.equal(duplicatePostSaleAlertScan.json().data.alertsCreated, 0);
  assert.ok(duplicatePostSaleAlertScan.json().data.duplicated >= 1);
  const postSaleAlertCount = await prisma.postSaleAlert.count({
    where: { storeId: ownerBody.user.storeId, saleId: transferredSaleId },
  });
  assert.equal(postSaleAlertCount, 1);

  const overduePostSaleAlertScan = await app.inject({
    method: "POST",
    url: "/post-sale/alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { now: postSaleOverdueScanNow.toISOString() },
  });
  assert.equal(overduePostSaleAlertScan.statusCode, 200);
  assert.equal(overduePostSaleAlertScan.json().data.alertsCreated, 0);
  assert.ok(overduePostSaleAlertScan.json().data.overdueAlerts >= 1);
  assert.ok(overduePostSaleAlertScan.json().data.overdueNotificationsCreated >= 1);

  const overduePostSaleNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=post_sale_alert_overdue&entity_id=${postSaleAlertId}&status=NEW&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(overduePostSaleNotifications.statusCode, 200);
  assert.ok(
    overduePostSaleNotifications
      .json()
      .items.some(
        (notification: { actionUrl: string; priority: string; sourceModule: string }) =>
          notification.actionUrl === `/post-sale/alerts/${postSaleAlertId}` &&
          notification.priority === "CRITICAL" &&
          notification.sourceModule === "post_sale",
      ),
  );

  const reassignPostSaleAlert = await app.inject({
    method: "POST",
    url: `/post-sale/alerts/${postSaleAlertId}/reassign`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      assignedUserId: administrativeBody.user.id,
      reason: "Vendedor original indisponivel para contato pos-venda",
    },
  });
  assert.equal(reassignPostSaleAlert.statusCode, 200);
  assert.equal(reassignPostSaleAlert.json().data.status, "REASSIGNED");
  assert.equal(reassignPostSaleAlert.json().data.assignedUserId, administrativeBody.user.id);
  assert.equal(reassignPostSaleAlert.json().data.reassignedFromUserId, sellerUserId);

  const sellerCannotReadReassignedPostSaleAlert = await app.inject({
    method: "GET",
    url: `/post-sale/alerts/${postSaleAlertId}`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
  });
  assert.equal(sellerCannotReadReassignedPostSaleAlert.statusCode, 404);

  const postSaleAlertEvents = await app.inject({
    method: "GET",
    url: `/post-sale/alerts/${postSaleAlertId}/events`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(postSaleAlertEvents.statusCode, 200);
  assert.ok(postSaleAlertEvents.json().items.some((event: { eventType: string }) => event.eventType === "alert_created"));
  assert.ok(postSaleAlertEvents.json().items.some((event: { eventType: string }) => event.eventType === "alert_reassigned"));

  const postSaleFeedback = await app.inject({
    method: "POST",
    url: `/post-sale/alerts/${postSaleAlertId}/feedback`,
    headers: { authorization: `Bearer ${administrativeBody.token}` },
    payload: {
      contactAttemptedAt: postSaleOverdueScanNow.toISOString(),
      contactChannel: "WHATSAPP",
      contactResult: "INTERESTED_PURCHASE",
      feedbackNotes: "Cliente satisfeito com o veiculo e avaliando nova compra.",
      vehicleInterestNotes: "Procura SUV automatico seminovo",
      nextAction: "Retornar com opcoes de SUV",
      nextActionAt: new Date(postSaleOverdueScanNow.getTime() + 86400000).toISOString(),
      createCommercialCard: true,
      responsibleUserId: sellerUserId,
    },
  });
  assert.equal(postSaleFeedback.statusCode, 200);
  assert.equal(postSaleFeedback.json().data.status, "RESCHEDULED");
  assert.equal(postSaleFeedback.json().feedback.postSaleAlertId, postSaleAlertId);
  assert.equal(postSaleFeedback.json().feedback.interestType, "PURCHASE_OTHER");
  assert.equal(postSaleFeedback.json().feedback.hasPurchaseInterest, true);
  assert.ok(postSaleFeedback.json().feedback.createdCardId);
  assert.equal(postSaleFeedback.json().createdCommercialCard.id, postSaleFeedback.json().feedback.createdCardId);
  assert.equal(postSaleFeedback.json().commercialLeadPreparation.postSaleAlertId, postSaleAlertId);
  assert.equal(postSaleFeedback.json().commercialLeadPreparation.customerId, createdCustomerId);
  const postSaleFeedbackId = postSaleFeedback.json().feedback.id as string;
  const createdPostSaleCardId = postSaleFeedback.json().feedback.createdCardId as string;
  const createdPostSaleLead = await prisma.leadCard.findFirst({
    where: { id: createdPostSaleCardId, storeId: ownerBody.user.storeId },
    include: { lead: true },
  });
  assert.ok(createdPostSaleLead);
  assert.equal(createdPostSaleLead.lead.customerId, createdCustomerId);
  assert.equal(createdPostSaleLead.lead.source, "post_sale_2_years");
  assert.equal(createdPostSaleLead.lead.assignedUserId, sellerUserId);
  assert.equal(createdPostSaleLead.lead.interest, "PURCHASE_OTHER");

  const updatedPostSaleFeedback = await app.inject({
    method: "PATCH",
    url: `/post-sale/alerts/${postSaleAlertId}/feedback`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      feedbackNotes: "Gestao complementou: cliente quer receber opcoes ate amanha.",
      updateReason: "Complemento administrativo do feedback pos-venda",
    },
  });
  assert.equal(updatedPostSaleFeedback.statusCode, 200);
  assert.equal(updatedPostSaleFeedback.json().feedback.updatedByUserId, ownerBody.user.id);

  const postSaleFeedbackUpdateAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=post_sale&action=post_sale_feedback_updated&entity_type=post_sale_feedback&entity_id=${postSaleFeedbackId}&page=1&page_size=5`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(postSaleFeedbackUpdateAudit.statusCode, 200);
  assert.ok(postSaleFeedbackUpdateAudit.json().items.some((item: { entityId: string }) => item.entityId === postSaleFeedbackId));

  const postSaleHistory = await prisma.customerHistoryEvent.findFirst({
    where: { storeId: ownerBody.user.storeId, customerId: createdCustomerId, type: "post_sale_feedback_recorded" },
    orderBy: { occurredAt: "desc" },
  });
  assert.ok(postSaleHistory);
  assert.equal((postSaleHistory.metadata as { alertId?: string }).alertId, postSaleAlertId);
  const postSaleInteraction = await prisma.customerInteraction.findFirst({
    where: {
      storeId: ownerBody.user.storeId,
      customerId: createdCustomerId,
      entityType: "post_sale_alert",
      entityId: postSaleAlertId,
      channel: "WHATSAPP",
    },
  });
  assert.ok(postSaleInteraction);

  const resolvedPostSaleNotifications = await app.inject({
    method: "GET",
    url: `/notifications?entity_type=post_sale_alert_overdue&entity_id=${postSaleAlertId}&status=RESOLVED&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(resolvedPostSaleNotifications.statusCode, 200);
  assert.ok(resolvedPostSaleNotifications.json().items.some((notification: { entityId: string }) => notification.entityId === postSaleAlertId));

  const postSaleComplaintSale = await prisma.sale.create({
    data: {
      storeId: ownerBody.user.storeId,
      customerId: createdCustomerId,
      vehicleId: inventoryVehicleId,
      sellerUserId,
      status: "CLOSED",
      salePrice: 88000,
      closedAt: postSalePurchaseDate,
      snapshot: { source: "s4-us02-complaint-smoke" },
    },
  });

  const complaintPostSaleAlertScan = await app.inject({
    method: "POST",
    url: "/post-sale/alerts/scan",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: { now: postSaleInitialScanNow.toISOString() },
  });
  assert.equal(complaintPostSaleAlertScan.statusCode, 200);
  const complaintPostSaleAlert = complaintPostSaleAlertScan.json().data.alerts.find((alert: { saleId: string }) => alert.saleId === postSaleComplaintSale.id);
  assert.ok(complaintPostSaleAlert);

  const complaintPostSaleFeedback = await app.inject({
    method: "POST",
    url: `/post-sale/alerts/${complaintPostSaleAlert.id}/feedback`,
    headers: { authorization: `Bearer ${sellerInventoryToken}` },
    payload: {
      contactAttemptedAt: postSaleOverdueScanNow.toISOString(),
      contactChannel: "PHONE",
      contactResult: "VEHICLE_PROBLEM",
      feedbackNotes: "Cliente relatou barulho na suspensao e pediu acompanhamento da loja.",
      issueSeverity: "HIGH",
    },
  });
  assert.equal(complaintPostSaleFeedback.statusCode, 200);
  assert.equal(complaintPostSaleFeedback.json().feedback.contactResult, "VEHICLE_PROBLEM");
  assert.equal(complaintPostSaleFeedback.json().internalIssue.status, "PENDING_REVIEW");
  assert.equal(complaintPostSaleFeedback.json().internalIssue.severity, "HIGH");
  assert.equal(complaintPostSaleFeedback.json().internalIssue.customerId, createdCustomerId);
  const postSaleInternalIssueId = complaintPostSaleFeedback.json().internalIssue.id as string;

  const postSaleInternalIssues = await app.inject({
    method: "GET",
    url: `/post-sale/internal-issues?status=PENDING_REVIEW&customer_id=${createdCustomerId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(postSaleInternalIssues.statusCode, 200);
  assert.ok(postSaleInternalIssues.json().items.some((issue: { id: string }) => issue.id === postSaleInternalIssueId));

  const sdrCannotReadPostSaleIssues = await app.inject({
    method: "GET",
    url: "/post-sale/internal-issues",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCannotReadPostSaleIssues.statusCode, 403);

  const postSaleFeedbacksList = await app.inject({
    method: "GET",
    url: `/post-sale/feedbacks?customer_id=${createdCustomerId}&page_size=100`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(postSaleFeedbacksList.statusCode, 200);
  assert.ok(postSaleFeedbacksList.json().items.some((feedback: { id: string; createdCardId: string | null }) => feedback.id === postSaleFeedbackId && feedback.createdCardId === createdPostSaleCardId));
  assert.ok(postSaleFeedbacksList.json().items.some((feedback: { createdInternalIssueId: string | null }) => feedback.createdInternalIssueId === postSaleInternalIssueId));

  const postSaleFeedbackMetrics = await app.inject({
    method: "GET",
    url: "/post-sale/feedbacks/metrics/summary",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(postSaleFeedbackMetrics.statusCode, 200);
  assert.ok(postSaleFeedbackMetrics.json().data.total >= 2);
  assert.ok(postSaleFeedbackMetrics.json().data.createdCards >= 1);
  assert.ok(postSaleFeedbackMetrics.json().data.internalIssues >= 1);
  assert.ok(postSaleFeedbackMetrics.json().data.byResult.INTERESTED_PURCHASE >= 1);
  assert.ok(postSaleFeedbackMetrics.json().data.byResult.VEHICLE_PROBLEM >= 1);

  // --- Sprint 4 US03: assisted birthday relationship, no full birth date exposure ---
  const createBirthdayTemplate = await app.inject({
    method: "POST",
    url: "/settings/message-templates",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "birthday_greeting",
      channel: "WHATSAPP",
      content: "Ola [NOME], feliz aniversario! A equipe GT3 deseja um excelente dia.",
      variables: {
        customer: ["name"],
      },
    },
  });
  assert.equal(createBirthdayTemplate.statusCode, 201);
  assert.equal(createBirthdayTemplate.json().data.name, "birthday_greeting");
  const birthdayTemplateId = createBirthdayTemplate.json().data.id as string;

  const birthdayUnknownCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Cliente Aniversario Desconhecido QA",
      document: uniqueToken("BIRTH-UNKNOWN"),
      phone: "11997770001",
      origin: "qa-birthday",
    },
  });
  assert.equal(birthdayUnknownCustomer.statusCode, 201);
  const birthdayUnknownCustomerId = birthdayUnknownCustomer.json().data.id as string;

  const unknownBirthdays = await app.inject({
    method: "GET",
    url: "/post-sale/birthdays?range=UNKNOWN&page_size=100",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(unknownBirthdays.statusCode, 200);
  const unknownBirthdayItem = unknownBirthdays
    .json()
    .items.find((item: { customerId: string }) => item.customerId === birthdayUnknownCustomerId);
  assert.ok(unknownBirthdayItem);
  assert.equal(unknownBirthdayItem.birthDayMonth, null);
  assert.equal(unknownBirthdayItem.status, "UNKNOWN");

  const confirmBirthday = await app.inject({
    method: "POST",
    url: `/post-sale/birthdays/${createdCustomerId}/confirm`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      birthDate: "1990-06-15T12:00:00.000Z",
      source: "OCR",
      confidence: 0.93,
      status: "CONFIRMED",
      metadata: {
        source: "s4-us03-smoke",
      },
    },
  });
  assert.equal(confirmBirthday.statusCode, 201);
  assert.equal(confirmBirthday.json().data.birthDay, 15);
  assert.equal(confirmBirthday.json().data.birthMonth, 6);
  assert.equal(confirmBirthday.json().data.birthDayMonth, "15/06");
  assert.equal(confirmBirthday.json().data.birthDateSource, "OCR");
  assert.equal(confirmBirthday.json().data.birthDateConfidence, "0.93");
  assert.equal(Object.prototype.hasOwnProperty.call(confirmBirthday.json().data, "birthDate"), false);

  const monthlyBirthdays = await app.inject({
    method: "GET",
    url: "/post-sale/birthdays?range=MONTH&date=2026-06-01T12:00:00.000Z&page_size=100",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(monthlyBirthdays.statusCode, 200);
  const monthlyBirthdayItem = monthlyBirthdays
    .json()
    .items.find((item: { customerId: string }) => item.customerId === createdCustomerId);
  assert.ok(monthlyBirthdayItem);
  assert.equal(monthlyBirthdayItem.birthDayMonth, "15/06");
  assert.equal(monthlyBirthdayItem.messageStatus, "NOT_PREPARED");
  assert.equal(monthlyBirthdayItem.communicationAllowed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(monthlyBirthdayItem, "birthDate"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(monthlyBirthdayItem.customer, "birthDate"), false);

  const nextSevenBirthdayList = await app.inject({
    method: "GET",
    url: "/post-sale/birthdays?range=NEXT_7_DAYS&date=2026-06-10T12:00:00.000Z&page_size=100",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(nextSevenBirthdayList.statusCode, 200);
  assert.ok(nextSevenBirthdayList.json().items.some((item: { customerId: string }) => item.customerId === createdCustomerId));

  const sdrCannotReadBirthdays = await app.inject({
    method: "GET",
    url: "/post-sale/birthdays?range=MONTH&date=2026-06-01T12:00:00.000Z",
    headers: {
      authorization: `Bearer ${sdrToken}`,
    },
  });
  assert.equal(sdrCannotReadBirthdays.statusCode, 403);

  const createBirthdayOptOutCustomer = await app.inject({
    method: "POST",
    url: "/customers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Cliente Aniversario Optout QA",
      document: uniqueToken("BIRTH-OPTOUT"),
      phone: "11997770002",
      origin: "qa-birthday",
    },
  });
  assert.equal(createBirthdayOptOutCustomer.statusCode, 201);
  const birthdayOptOutCustomerId = createBirthdayOptOutCustomer.json().data.id as string;

  const confirmOptOutBirthday = await app.inject({
    method: "POST",
    url: `/post-sale/birthdays/${birthdayOptOutCustomerId}/confirm`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      birthDate: "1985-06-15T12:00:00.000Z",
      source: "DOCUMENT",
      confidence: 0.99,
      status: "CONFIRMED",
    },
  });
  assert.equal(confirmOptOutBirthday.statusCode, 201);

  await prisma.privacyPreference.upsert({
    where: { customerId_channel: { customerId: birthdayOptOutCustomerId, channel: "WHATSAPP" } },
    update: { allowed: false, reason: "Cliente nao quer mensagens de aniversario" },
    create: {
      storeId: ownerBody.user.storeId,
      customerId: birthdayOptOutCustomerId,
      channel: "WHATSAPP",
      allowed: false,
      reason: "Cliente nao quer mensagens de aniversario",
    },
  });

  const prepareOptOutBirthdayMessage = await app.inject({
    method: "POST",
    url: "/post-sale/birthday-messages/prepare",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: birthdayOptOutCustomerId,
      channel: "WHATSAPP",
      templateId: birthdayTemplateId,
    },
  });
  assert.equal(prepareOptOutBirthdayMessage.statusCode, 422);
  assert.equal(prepareOptOutBirthdayMessage.json().error.code, "BUSINESS_RULE_ERROR");

  const prepareBirthdayMessage = await app.inject({
    method: "POST",
    url: "/post-sale/birthday-messages/prepare",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      customerId: createdCustomerId,
      channel: "WHATSAPP",
      templateId: birthdayTemplateId,
      responsibleUserId: administrativeBody.user.id,
    },
  });
  assert.equal(prepareBirthdayMessage.statusCode, 201);
  assert.equal(prepareBirthdayMessage.json().data.sendStatus, "PREPARED");
  assert.equal(prepareBirthdayMessage.json().data.channel, "WHATSAPP");
  assert.equal(prepareBirthdayMessage.json().data.templateId, birthdayTemplateId);
  assert.equal(prepareBirthdayMessage.json().data.templateVersion, createBirthdayTemplate.json().data.version);
  assert.ok(prepareBirthdayMessage.json().data.messageTextSnapshot.includes("Cliente Contrato API"));
  assert.ok(prepareBirthdayMessage.json().data.messageTextSnapshot.includes("feliz aniversario"));
  assert.equal(prepareBirthdayMessage.json().data.responsibleUserId, administrativeBody.user.id);
  const birthdayMessageId = prepareBirthdayMessage.json().data.id as string;

  const sentBirthdayMessage = await app.inject({
    method: "POST",
    url: `/post-sale/birthday-messages/${birthdayMessageId}/send-assisted`,
    headers: {
      authorization: `Bearer ${administrativeBody.token}`,
    },
    payload: {
      sentAt: "2026-06-15T09:00:00.000Z",
    },
  });
  assert.equal(sentBirthdayMessage.statusCode, 200);
  assert.equal(sentBirthdayMessage.json().data.sendStatus, "SENT");
  assert.equal(sentBirthdayMessage.json().data.sentByUserId, administrativeBody.user.id);
  assert.equal(sentBirthdayMessage.json().data.sentAt, "2026-06-15T09:00:00.000Z");
  assert.equal(sentBirthdayMessage.json().data.messageTextSnapshot, prepareBirthdayMessage.json().data.messageTextSnapshot);

  const birthdayMessageResponse = await app.inject({
    method: "POST",
    url: `/post-sale/birthday-messages/${birthdayMessageId}/response`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      responseText: "Cliente agradeceu e pediu contato para proxima troca.",
      responseAt: "2026-06-15T10:00:00.000Z",
    },
  });
  assert.equal(birthdayMessageResponse.statusCode, 200);
  assert.equal(birthdayMessageResponse.json().data.sendStatus, "RESPONDED");
  assert.equal(birthdayMessageResponse.json().data.responseText, "Cliente agradeceu e pediu contato para proxima troca.");
  assert.equal(birthdayMessageResponse.json().data.messageTextSnapshot, prepareBirthdayMessage.json().data.messageTextSnapshot);

  const birthdayMessagesList = await app.inject({
    method: "GET",
    url: `/post-sale/birthday-messages?customer_id=${createdCustomerId}&page_size=100`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(birthdayMessagesList.statusCode, 200);
  assert.ok(
    birthdayMessagesList
      .json()
      .items.some(
        (message: { id: string; sendStatus: string; messageTextSnapshot: string }) =>
          message.id === birthdayMessageId &&
          message.sendStatus === "RESPONDED" &&
          message.messageTextSnapshot === prepareBirthdayMessage.json().data.messageTextSnapshot,
      ),
  );

  const birthdayResponseHistory = await prisma.customerHistoryEvent.findFirst({
    where: { storeId: ownerBody.user.storeId, customerId: createdCustomerId, type: "birthday_message_responded" },
    orderBy: { occurredAt: "desc" },
  });
  assert.ok(birthdayResponseHistory);
  assert.equal((birthdayResponseHistory.metadata as { birthdayMessageId?: string }).birthdayMessageId, birthdayMessageId);

  const birthdayMessageMetrics = await app.inject({
    method: "GET",
    url: "/post-sale/birthday-messages/metrics/summary",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(birthdayMessageMetrics.statusCode, 200);
  assert.ok(birthdayMessageMetrics.json().data.knownBirthdays >= 2);
  assert.ok(birthdayMessageMetrics.json().data.unknownBirthdays >= 1);
  assert.ok(birthdayMessageMetrics.json().data.optOuts >= 1);
  assert.ok(birthdayMessageMetrics.json().data.messagesByStatus.RESPONDED >= 1);
  checkpoint("post-sale-alerts");

  const sellerDeleteCustomer = await app.inject({
    method: "DELETE",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
    payload: {
      reason: "Tentativa sem permissao deve ser negada",
    },
  });
  assert.equal(sellerDeleteCustomer.statusCode, 403);
  assert.equal(sellerDeleteCustomer.json().error.code, "FORBIDDEN");

  const sellerSensitiveDownload = await app.inject({
    method: "GET",
    url: `/files/${sensitiveUpload.json().data.id}/download`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerSensitiveDownload.statusCode, 403);
  assert.equal(sellerSensitiveDownload.json().error.code, "FORBIDDEN");

  const createNotification = await app.inject({
    method: "POST",
    url: "/notifications",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      userId: sellerUserId,
      title: "Follow-up pendente QA",
      body: "Cliente precisa de retorno sobre proposta.",
      entityType: "customer",
      entityId: createdCustomerId,
      priority: "HIGH",
      sourceModule: "commercial",
      actionUrl: `/customers/${createdCustomerId}`,
      dueAt: "2030-01-15T10:00:00.000Z",
    },
  });
  assert.equal(createNotification.statusCode, 201);
  assert.equal(createNotification.json().data.userId, sellerUserId);
  assert.equal(createNotification.json().data.priority, "HIGH");
  assert.equal(createNotification.json().data.status, "NEW");
  assert.equal(createNotification.json().data.sourceModule, "commercial");
  assert.equal(createNotification.json().data.actionUrl, `/customers/${createdCustomerId}`);
  assert.equal(createNotification.json().data.dueAt, "2030-01-15T10:00:00.000Z");
  assert.equal(createNotification.json().data.readAt, null);
  const notificationId = createNotification.json().data.id as string;

  const sellerNotifications = await app.inject({
    method: "GET",
    url: `/notifications?unread_only=true&priority=HIGH&source_module=commercial&entity_id=${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerNotifications.statusCode, 200);
  const sellerNotificationItem = sellerNotifications.json().items.find((notification: { id: string }) => notification.id === notificationId);
  assert.ok(sellerNotificationItem);
  assert.equal(sellerNotificationItem.context.customer.id, createdCustomerId);
  assert.equal(sellerNotificationItem.context.customer.name, "Cliente Contrato API");
  assert.equal(sellerNotificationItem.context.responsibleUser.id, sellerUserId);

  const sellerNotificationsByCreatedPeriod = await app.inject({
    method: "GET",
    url: "/notifications?created_from=2000-01-01T00%3A00%3A00.000Z&created_to=2100-01-01T00%3A00%3A00.000Z&page_size=100",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerNotificationsByCreatedPeriod.statusCode, 200);
  assert.ok(sellerNotificationsByCreatedPeriod.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sellerNotificationsOutsideCreatedPeriod = await app.inject({
    method: "GET",
    url: "/notifications?created_to=2000-01-01T00%3A00%3A00.000Z&page_size=100",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerNotificationsOutsideCreatedPeriod.statusCode, 200);
  assert.ok(!sellerNotificationsOutsideCreatedPeriod.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sellerNotificationsByDuePeriod = await app.inject({
    method: "GET",
    url: "/notifications?due_from=2030-01-01T00%3A00%3A00.000Z&due_to=2030-01-31T23%3A59%3A59.999Z&page_size=100",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerNotificationsByDuePeriod.statusCode, 200);
  assert.ok(sellerNotificationsByDuePeriod.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sellerNotificationsOutsideDuePeriod = await app.inject({
    method: "GET",
    url: "/notifications?due_from=2030-02-01T00%3A00%3A00.000Z&page_size=100",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerNotificationsOutsideDuePeriod.statusCode, 200);
  assert.ok(!sellerNotificationsOutsideDuePeriod.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sdrNotificationScope = await app.inject({
    method: "GET",
    url: `/notifications?entity_id=${createdCustomerId}&page_size=100`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrNotificationScope.statusCode, 200);
  assert.ok(!sdrNotificationScope.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const ownerNotificationScope = await app.inject({
    method: "GET",
    url: `/notifications?user_id=${sellerUserId}&status=NEW&priority=HIGH&source_module=commercial&entity_id=${createdCustomerId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(ownerNotificationScope.statusCode, 200);
  assert.ok(ownerNotificationScope.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sellerNotificationSummary = await app.inject({
    method: "GET",
    url: "/notifications/summary",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerNotificationSummary.statusCode, 200);
  assert.ok(sellerNotificationSummary.json().data.unread >= 1);

  const sdrOpenSellerNotification = await app.inject({
    method: "POST",
    url: `/notifications/${notificationId}/open`,
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrOpenSellerNotification.statusCode, 404);

  const openNotification = await app.inject({
    method: "POST",
    url: `/notifications/${notificationId}/open`,
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(openNotification.statusCode, 200);
  assert.equal(openNotification.json().data.status, "SEEN");
  assert.ok(openNotification.json().data.readAt);
  assert.equal(openNotification.json().target.actionUrl, `/customers/${createdCustomerId}`);
  assert.equal(openNotification.json().target.entityType, "customer");
  assert.equal(openNotification.json().target.entityId, createdCustomerId);

  const readNotification = await app.inject({
    method: "POST",
    url: `/notifications/${notificationId}/read`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(readNotification.statusCode, 200);
  assert.ok(readNotification.json().data.readAt);
  assert.equal(readNotification.json().data.status, "SEEN");

  const sellerUnreadAfterRead = await app.inject({
    method: "GET",
    url: "/notifications?unread_only=true",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerUnreadAfterRead.statusCode, 200);
  assert.ok(!sellerUnreadAfterRead.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const resolveNotification = await app.inject({
    method: "POST",
    url: `/notifications/${notificationId}/resolve`,
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(resolveNotification.statusCode, 200);
  assert.equal(resolveNotification.json().data.status, "RESOLVED");
  assert.ok(resolveNotification.json().data.resolvedAt);
  assert.equal(resolveNotification.json().data.resolvedByUserId, sellerUserId);

  const sellerResolvedNotifications = await app.inject({
    method: "GET",
    url: `/notifications?status=RESOLVED&entity_id=${createdCustomerId}`,
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerResolvedNotifications.statusCode, 200);
  assert.ok(sellerResolvedNotifications.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const createDismissibleNotification = await app.inject({
    method: "POST",
    url: "/notifications",
    headers: { authorization: `Bearer ${ownerBody.token}` },
    payload: {
      userId: sellerUserId,
      title: "Aviso comercial para ignorar",
      body: "Aviso sem acao obrigatoria.",
      entityType: "customer",
      entityId: createdCustomerId,
      priority: "LOW",
      sourceModule: "commercial",
    },
  });
  assert.equal(createDismissibleNotification.statusCode, 201);
  const dismissibleNotificationId = createDismissibleNotification.json().data.id as string;

  const dismissNotification = await app.inject({
    method: "POST",
    url: `/notifications/${dismissibleNotificationId}/dismiss`,
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
    payload: { reason: "Aviso validado manualmente" },
  });
  assert.equal(dismissNotification.statusCode, 200);
  assert.equal(dismissNotification.json().data.status, "DISMISSED");
  assert.ok(dismissNotification.json().data.dismissedAt);
  assert.equal(dismissNotification.json().data.dismissedByUserId, sellerUserId);
  assert.equal(dismissNotification.json().data.dismissedReason, "Aviso validado manualmente");

  const resolveDismissedNotification = await app.inject({
    method: "POST",
    url: `/notifications/${dismissibleNotificationId}/resolve`,
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(resolveDismissedNotification.statusCode, 409);
  assert.equal(resolveDismissedNotification.json().error.code, "CONFLICT");

  const deleteAttachment = await app.inject({
    method: "POST",
    url: `/files/${attachmentId}/delete-customer-document`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      reason: "Remocao permitida em QA de documento de cliente",
    },
  });
  assert.equal(deleteAttachment.statusCode, 200);

  const deletedDownload = await app.inject({
    method: "GET",
    url: `/files/${attachmentId}/download`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(deletedDownload.statusCode, 404);
  checkpoint("files/rbac");

  const ocrJob = await app.inject({
    method: "POST",
    url: "/jobs/document-ocr",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      attachmentId: sensitiveUpload.json().data.id,
      provider: "manual",
    },
  });
  assert.equal(ocrJob.statusCode, 202);
  assert.equal(ocrJob.json().data.job.jobType, "document.ocr");
  const ocrJobId = ocrJob.json().data.ocrJob.id as string;

  const listOcrJobs = await app.inject({
    method: "GET",
    url: `/ocr/jobs?attachment_id=${sensitiveUpload.json().data.id}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listOcrJobs.statusCode, 200);
  assert.ok(listOcrJobs.json().items.some((job: { id: string }) => job.id === ocrJobId));

  const addOcrField = await app.inject({
    method: "POST",
    url: `/ocr/jobs/${ocrJobId}/fields`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      fieldKey: "invoice_number",
      value: "NF-123",
      confidence: 0.9876,
    },
  });
  assert.equal(addOcrField.statusCode, 201);
  assert.equal(addOcrField.json().data.confidence, "0.9876");
  const ocrFieldId = addOcrField.json().data.id as string;

  const reviewOcrField = await app.inject({
    method: "POST",
    url: `/ocr/fields/${ocrFieldId}/review`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      value: "NF-123-REV",
      reviewed: true,
    },
  });
  assert.equal(reviewOcrField.statusCode, 200);
  assert.equal(reviewOcrField.json().data.value, "NF-123-REV");
  assert.equal(reviewOcrField.json().data.reviewed, true);

  const finishOcrJob = await app.inject({
    method: "POST",
    url: `/ocr/jobs/${ocrJobId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SUCCEEDED",
      result: {
        fields: 1,
        reviewed: true,
      },
    },
  });
  assert.equal(finishOcrJob.statusCode, 200);
  assert.equal(finishOcrJob.json().data.status, "SUCCEEDED");
  assert.ok(finishOcrJob.json().data.reviewedAt);

  const getOcrJob = await app.inject({
    method: "GET",
    url: `/ocr/jobs/${ocrJobId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getOcrJob.statusCode, 200);
  assert.equal(getOcrJob.json().fields.length, 1);

  const idempotencyKey = uniqueToken("qa-job");
  const enqueueJob = await app.inject({
    method: "POST",
    url: "/jobs/enqueue",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      jobType: "qa.contract",
      entityType: "customer",
      entityId: createdCustomerId,
      idempotencyKey,
      payload: { source: "test" },
    },
  });
  assert.equal(enqueueJob.statusCode, 202);

  const duplicateJob = await app.inject({
    method: "POST",
    url: "/jobs/enqueue",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      jobType: "qa.contract",
      entityType: "customer",
      entityId: createdCustomerId,
      idempotencyKey,
      payload: { source: "test-duplicate" },
    },
  });
  assert.equal(duplicateJob.statusCode, 200);
  assert.equal(duplicateJob.json().idempotentHit, true);
  assert.equal(duplicateJob.json().data.id, enqueueJob.json().data.id);

  const concurrentJobKey = uniqueToken("qa-job-race");
  const concurrentJobs = await Promise.all([
    app.inject({
      method: "POST",
      url: "/jobs/enqueue",
      headers: {
        authorization: `Bearer ${ownerBody.token}`,
      },
      payload: {
        jobType: "qa.concurrent",
        entityType: "customer",
        entityId: createdCustomerId,
        idempotencyKey: concurrentJobKey,
        payload: { source: "race-a" },
      },
    }),
    app.inject({
      method: "POST",
      url: "/jobs/enqueue",
      headers: {
        authorization: `Bearer ${ownerBody.token}`,
      },
      payload: {
        jobType: "qa.concurrent",
        entityType: "customer",
        entityId: createdCustomerId,
        idempotencyKey: concurrentJobKey,
        payload: { source: "race-b" },
      },
    }),
  ]);
  assert.deepEqual(
    concurrentJobs.map((response) => response.statusCode).sort(),
    [200, 202],
  );
  assert.equal(concurrentJobs[0].json().data.id, concurrentJobs[1].json().data.id);
  const concurrentJobCount = await prisma.backgroundJob.count({
    where: { idempotencyKey: concurrentJobKey },
  });
  assert.equal(concurrentJobCount, 1);

  const listJobs = await app.inject({
    method: "GET",
    url: "/jobs?status=QUEUED&page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listJobs.statusCode, 200);
  assert.ok(listJobs.json().total >= 1);

  const failedJob = await prisma.backgroundJob.create({
    data: {
      storeId: ownerBody.user.storeId,
      jobType: "qa.failed",
      status: "FAILED",
      entityType: "customer",
      entityId: createdCustomerId,
      attempts: 1,
      lastError: "Falha simulada em QA",
    },
  });

  const retryJob = await app.inject({
    method: "POST",
    url: `/jobs/${failedJob.id}/retry`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(retryJob.statusCode, 202);
  assert.equal(retryJob.json().data.status, "QUEUED");
  checkpoint("ocr/jobs");

  const sellerAutomations = await app.inject({
    method: "GET",
    url: "/automations/rules",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerAutomations.statusCode, 403);
  assert.equal(sellerAutomations.json().error.code, "FORBIDDEN");

  const createAutomationRule = await app.inject({
    method: "POST",
    url: "/automations/rules",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: uniqueToken("Follow-up QA"),
      trigger: "lead.stage_changed",
      status: "DRAFT",
      definition: {
        conditions: [{ field: "toStage", equals: "CONTACTED" }],
        actions: [{ type: "create_task", dueInHours: 24 }],
      },
    },
  });
  assert.equal(createAutomationRule.statusCode, 201);
  assert.equal(createAutomationRule.json().data.currentVersion, 1);
  const automationRuleId = createAutomationRule.json().data.id as string;

  const updateAutomationRule = await app.inject({
    method: "PATCH",
    url: `/automations/rules/${automationRuleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "ACTIVE",
      definition: {
        conditions: [{ field: "toStage", equals: "CONTACTED" }],
        actions: [{ type: "send_message", template: "lead_followup_24h" }],
      },
    },
  });
  assert.equal(updateAutomationRule.statusCode, 200);
  assert.equal(updateAutomationRule.json().data.currentVersion, 2);
  assert.equal(updateAutomationRule.json().data.status, "ACTIVE");

  const testAutomationRule = await app.inject({
    method: "POST",
    url: `/automations/rules/${automationRuleId}/tests`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      input: {
        entityType: "lead",
        entityId: createdLeadId,
        toStage: "CONTACTED",
      },
    },
  });
  assert.equal(testAutomationRule.statusCode, 201);
  assert.equal(testAutomationRule.json().data.status, "PASSED");
  assert.equal(testAutomationRule.json().data.output.version, 2);

  const recordAutomationEvent = await app.inject({
    method: "POST",
    url: `/automations/rules/${automationRuleId}/events`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      entityType: "lead",
      entityId: createdLeadId,
      status: "SUCCEEDED",
      context: {
        toStage: "CONTACTED",
      },
      result: {
        action: "send_message",
        delivered: true,
      },
    },
  });
  assert.equal(recordAutomationEvent.statusCode, 201);
  assert.equal(recordAutomationEvent.json().data.ruleVersion, 2);

  const pauseAutomationRule = await app.inject({
    method: "POST",
    url: `/automations/rules/${automationRuleId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "PAUSED",
      reason: "Pausa validada no smoke test",
    },
  });
  assert.equal(pauseAutomationRule.statusCode, 200);
  assert.equal(pauseAutomationRule.json().data.status, "PAUSED");

  const getAutomationRule = await app.inject({
    method: "GET",
    url: `/automations/rules/${automationRuleId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getAutomationRule.statusCode, 200);
  assert.equal(getAutomationRule.json().versions.length, 2);
  assert.equal(getAutomationRule.json().events.length, 1);
  assert.equal(getAutomationRule.json().tests.length, 1);

  const sellerSettings = await app.inject({
    method: "GET",
    url: "/settings/summary",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerSettings.statusCode, 403);
  assert.equal(sellerSettings.json().error.code, "FORBIDDEN");

  const updateStoreSetting = await app.inject({
    method: "PUT",
    url: "/settings/store-settings/commercial",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      value: {
        defaultCurrency: "BRL",
        allowRepasse: true,
      },
    },
  });
  assert.equal(updateStoreSetting.statusCode, 201);
  assert.equal(updateStoreSetting.json().data.key, "commercial");

  const createBusinessHour = await app.inject({
    method: "POST",
    url: "/settings/business-hours",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      weekday: 1,
      opensAt: "09:00",
      closesAt: "18:00",
    },
  });
  assert.equal(createBusinessHour.statusCode, 201);
  assert.equal(createBusinessHour.json().data.weekday, 1);

  const createHoliday = await app.inject({
    method: "POST",
    url: "/settings/holidays",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      date: "2026-06-12T00:00:00.000Z",
      name: "Feriado QA",
      isRecurring: false,
    },
  });
  assert.equal(createHoliday.statusCode, 201);
  assert.equal(createHoliday.json().data.name, "Feriado QA");

  const createDeadline = await app.inject({
    method: "POST",
    url: "/settings/deadlines",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      module: "sales",
      action: "followup",
      hours: 24,
    },
  });
  assert.equal(createDeadline.statusCode, 201);
  assert.equal(createDeadline.json().data.hours, 24);

  const createCategory = await app.inject({
    method: "POST",
    url: "/settings/categories",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      domain: "vehicle_cost",
      name: uniqueToken("Preparacao QA"),
      metadata: {
        capitalizedDefault: true,
      },
    },
  });
  assert.equal(createCategory.statusCode, 201);
  assert.equal(createCategory.json().data.domain, "vehicle_cost");

  const createDocumentTemplate = await app.inject({
    method: "POST",
    url: "/settings/document-templates",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: uniqueToken("Contrato QA"),
      module: "sales",
      content: "Contrato {{sale.id}}",
      snapshot: {
        format: "text",
      },
    },
  });
  assert.equal(createDocumentTemplate.statusCode, 201);
  assert.equal(createDocumentTemplate.json().data.version, 1);

  const createMessageTemplate = await app.inject({
    method: "POST",
    url: "/settings/message-templates",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: uniqueToken("Followup QA"),
      channel: "whatsapp",
      content: "Ola {{customer.name}}, tudo bem?",
      variables: {
        customer: ["name"],
      },
    },
  });
  assert.equal(createMessageTemplate.statusCode, 201);
  assert.equal(createMessageTemplate.json().data.version, 1);

  const updateOperationalParameter = await app.inject({
    method: "PUT",
    url: "/settings/operational-parameters/sales_policy",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      value: {
        minGrossMargin: 0.08,
      },
      snapshot: {
        source: "qa",
      },
    },
  });
  assert.equal(updateOperationalParameter.statusCode, 201);
  assert.equal(updateOperationalParameter.json().data.key, "sales_policy");

  const invalidBirthdayNotificationResponsible = await app.inject({
    method: "PUT",
    url: "/settings/customer-birthday-notifications",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channel: "WHATSAPP",
      daysBefore: 7,
      enabled: true,
      responsibleUserId: "00000000-0000-0000-0000-000000000000",
    },
  });
  assert.equal(invalidBirthdayNotificationResponsible.statusCode, 404);
  assert.equal(invalidBirthdayNotificationResponsible.json().error.code, "NOT_FOUND");

  const updateBirthdayNotifications = await app.inject({
    method: "PUT",
    url: "/settings/customer-birthday-notifications",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channel: "WHATSAPP",
      daysBefore: 5,
      enabled: true,
      responsibleUserId: sellerUserId,
    },
  });
  assert.equal(updateBirthdayNotifications.statusCode, 201);
  assert.equal(updateBirthdayNotifications.json().data.key, "customer_birthday_notifications");
  assert.equal(updateBirthdayNotifications.json().data.value.responsibleUserId, sellerUserId);
  assert.equal(updateBirthdayNotifications.json().data.value.daysBefore, 5);

  const getBirthdayNotifications = await app.inject({
    method: "GET",
    url: "/settings/customer-birthday-notifications",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getBirthdayNotifications.statusCode, 200);
  assert.equal(getBirthdayNotifications.json().data.responsibleUser.id, sellerUserId);

  const createTaxSetting = await app.inject({
    method: "POST",
    url: "/settings/tax-settings",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Simples QA",
      taxRegime: "simples_nacional",
      profitTaxRate: 0.06,
      snapshot: {
        source: "qa",
      },
    },
  });
  assert.equal(createTaxSetting.statusCode, 201);
  assert.equal(createTaxSetting.json().data.profitTaxRate, "0.06");

  const createAccountant = await app.inject({
    method: "POST",
    url: "/settings/accountants",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Contabilidade QA",
      email: "contabilidade.qa@gt3.local",
      phone: "1133334444",
    },
  });
  assert.equal(createAccountant.statusCode, 201);
  assert.equal(createAccountant.json().data.name, "Contabilidade QA");

  const settingsSummary = await app.inject({
    method: "GET",
    url: "/settings/summary",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(settingsSummary.statusCode, 200);
  assert.ok(settingsSummary.json().storeSettings.some((setting: { key: string }) => setting.key === "commercial"));
  assert.ok(settingsSummary.json().operationalParameters.some((parameter: { key: string }) => parameter.key === "sales_policy"));
  checkpoint("automations/settings");

  const sellerUsers = await app.inject({
    method: "GET",
    url: "/users",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerUsers.statusCode, 403);
  assert.equal(sellerUsers.json().error.code, "FORBIDDEN");

  const qaUserEmail = `${uniqueToken("usuario.qa")}@gt3.local`;
  const createUser = await app.inject({
    method: "POST",
    url: "/users",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: "Usuario QA",
      email: qaUserEmail,
      role: "SDR",
      password: "Gt3@2026qa",
    },
  });
  assert.equal(createUser.statusCode, 201);
  assert.equal(createUser.json().data.email, qaUserEmail);
  assert.equal(createUser.json().data.mustChangePassword, true);
  const qaUserId = createUser.json().data.id as string;
  const qaUserHash = await prisma.user.findUniqueOrThrow({
    where: { id: qaUserId },
    select: { passwordHash: true },
  });
  assert.ok(qaUserHash.passwordHash.startsWith("$argon2id$"));

  const listUsers = await app.inject({
    method: "GET",
    url: `/users?search=${encodeURIComponent(qaUserEmail)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listUsers.statusCode, 200);
  assert.ok(listUsers.json().items.some((user: { id: string }) => user.id === qaUserId));

  const addUserPermission = await app.inject({
    method: "POST",
    url: `/users/${qaUserId}/permissions`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
      effect: "ALLOW",
    },
  });
  assert.equal(addUserPermission.statusCode, 201);
  assert.equal(addUserPermission.json().data.effect, "ALLOW");

  const addUserScope = await app.inject({
    method: "POST",
    url: `/users/${qaUserId}/scopes`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      module: "customers",
      entityType: "customer",
      entityId: createdCustomerId,
      scope: "OWN_PORTFOLIO",
    },
  });
  assert.equal(addUserScope.statusCode, 201);
  assert.equal(addUserScope.json().data.scope, "OWN_PORTFOLIO");

  const transferResponsibility = await app.inject({
    method: "POST",
    url: "/users/responsibility-transfers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      fromUserId: sellerUserId,
      toUserId: qaUserId,
      entityType: "customer",
      entityId: createdCustomerId,
      reason: "Transferencia validada no smoke test",
    },
  });
  assert.equal(transferResponsibility.statusCode, 201);
  assert.equal(transferResponsibility.json().data.toUserId, qaUserId);

  const activeUserLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: qaUserEmail,
      password: "Gt3@2026qa",
    },
  });
  assert.equal(activeUserLogin.statusCode, 200);
  const activeUserToken = activeUserLogin.json().token as string;

  const updateUser = await app.inject({
    method: "PATCH",
    url: `/users/${qaUserId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      isActive: false,
    },
  });
  assert.equal(updateUser.statusCode, 200);
  assert.equal(updateUser.json().data.isActive, false);

  const revokedInactiveUserSession = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: {
      authorization: `Bearer ${activeUserToken}`,
    },
  });
  assert.equal(revokedInactiveUserSession.statusCode, 401);

  const inactiveUserLogin = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: {
      email: qaUserEmail,
      password: "Gt3@2026qa",
    },
  });
  assert.equal(inactiveUserLogin.statusCode, 401);
  assert.deepEqual(inactiveUserLogin.json(), invalidLogin.json());

  const getUser = await app.inject({
    method: "GET",
    url: `/users/${qaUserId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getUser.statusCode, 200);
  assert.equal(getUser.json().overrides.length, 1);
  assert.ok(getUser.json().scopes.some((scope: { entityId: string }) => scope.entityId === createdCustomerId));
  assert.ok(getUser.json().transfersTo.some((transfer: { id: string }) => transfer.id === transferResponsibility.json().data.id));
  checkpoint("users/access");

  const executiveSummary = await app.inject({
    method: "GET",
    url: "/analytics/executive-summary",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(executiveSummary.statusCode, 200);
  assert.ok(executiveSummary.json().totals.customers >= 1);
  assert.ok(executiveSummary.json().totals.leads >= 1);
  assert.ok(Number(executiveSummary.json().totals.saleRevenue) >= 124000);

  const salesFunnel = await app.inject({
    method: "GET",
    url: "/analytics/sales-funnel",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(salesFunnel.statusCode, 200);
  assert.ok(salesFunnel.json().leadsByStatus.CONTACTED >= 1);
  assert.ok(salesFunnel.json().salesByStatus.CLOSED >= 1);

  const inventoryPerformance = await app.inject({
    method: "GET",
    url: "/analytics/inventory-performance",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(inventoryPerformance.statusCode, 200);
  assert.ok(inventoryPerformance.json().inventoryByStatus.SOLD >= 1);
  assert.equal(inventoryPerformance.json().inventoryByStatus.REPASSE, undefined);
  assert.equal(inventoryPerformance.json().inventoryByOwnership.REPASSE, undefined);
  assert.ok(inventoryPerformance.json().listingMetrics.views >= 100);
  assert.equal(inventoryPerformance.json().listingMetrics.ctr, "0.1200");

  const sellerCommercialOverview = await app.inject({
    method: "GET",
    url: "/analytics/commercial-overview",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerCommercialOverview.statusCode, 403);

  const commercialOverview = await app.inject({
    method: "GET",
    url: "/analytics/commercial-overview",
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialOverview.statusCode, 200);
  assert.ok(commercialOverview.json().modules.includes("commercial_kanban"));
  assert.ok(commercialOverview.json().totals.commercialCards >= 1);
  assert.ok(commercialOverview.json().totals.salesCards >= 1);
  assert.ok(commercialOverview.json().distributions.commercialCardsByStage.NEW_LEAD >= 0);
  assert.ok(commercialOverview.json().distributions.salesByStage.CLOSED_WON >= 1);

  const commercialOverviewBySdr = await app.inject({
    method: "GET",
    url: `/analytics/commercial-overview?responsible_user_id=${sdrUserId}`,
    headers: { authorization: `Bearer ${ownerBody.token}` },
  });
  assert.equal(commercialOverviewBySdr.statusCode, 200);
  assert.equal(commercialOverviewBySdr.json().filters.responsibleUserId, sdrUserId);

  const sdrCommercialDashboard = await app.inject({
    method: "GET",
    url: "/analytics/commercial-sdr",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCommercialDashboard.statusCode, 200);
  assert.equal(sdrCommercialDashboard.json().filters.responsibleUserId, sdrUserId);
  assert.ok(sdrCommercialDashboard.json().totals.cards >= 1);
  assert.ok(sdrCommercialDashboard.json().totals.transferredToSales >= 1);
  assert.ok(sdrCommercialDashboard.json().cardsByStage.NEW_LEAD >= 0);

  const sellerCannotOpenSdrDashboard = await app.inject({
    method: "GET",
    url: "/analytics/commercial-sdr",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerCannotOpenSdrDashboard.statusCode, 403);

  const sellerCommercialSalesDashboard = await app.inject({
    method: "GET",
    url: "/analytics/commercial-sales",
    headers: { authorization: `Bearer ${sellerTokenAgain}` },
  });
  assert.equal(sellerCommercialSalesDashboard.statusCode, 200);
  assert.equal(sellerCommercialSalesDashboard.json().filters.sellerUserId, sellerUserId);
  assert.ok(sellerCommercialSalesDashboard.json().totals.salesCards >= 1);
  assert.ok(sellerCommercialSalesDashboard.json().totals.receivedFromSdr >= 1);
  assert.ok(sellerCommercialSalesDashboard.json().salesByStage.CLOSED_WON >= 1);

  const sdrCannotOpenSalesDashboard = await app.inject({
    method: "GET",
    url: "/analytics/commercial-sales",
    headers: { authorization: `Bearer ${sdrToken}` },
  });
  assert.equal(sdrCannotOpenSalesDashboard.statusCode, 403);

  const sellerCompliance = await app.inject({
    method: "GET",
    url: "/compliance/legal-checks",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerCompliance.statusCode, 403);
  assert.equal(sellerCompliance.json().error.code, "FORBIDDEN");

  const createLegalCheck = await app.inject({
    method: "POST",
    url: "/compliance/legal-checks",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      vehicleId: inventoryVehicleId,
      customerId: createdCustomerId,
      provider: "detran-dev",
      status: "PENDING",
    },
  });
  assert.equal(createLegalCheck.statusCode, 201);
  assert.equal(createLegalCheck.json().data.vehicleId, inventoryVehicleId);
  const legalCheckId = createLegalCheck.json().data.id as string;

  const completeLegalCheck = await app.inject({
    method: "POST",
    url: `/compliance/legal-checks/${legalCheckId}/status`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SUCCEEDED",
      checkedAt: "2026-06-06T21:00:00.000Z",
      result: {
        restrictions: [],
        risk: "low",
      },
    },
  });
  assert.equal(completeLegalCheck.statusCode, 200);
  assert.equal(completeLegalCheck.json().data.status, "SUCCEEDED");
  assert.equal(completeLegalCheck.json().data.checkedAt, "2026-06-06T21:00:00.000Z");

  const createExternalQuery = await app.inject({
    method: "POST",
    url: "/compliance/external-jobs",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      provider: "bureau-dev",
      purpose: "vehicle_history",
      entityType: "vehicle",
      entityId: inventoryVehicleId,
      payload: {
        plate: inventoryPlate,
      },
    },
  });
  assert.equal(createExternalQuery.statusCode, 202);
  assert.equal(createExternalQuery.json().data.entityId, inventoryVehicleId);
  assert.equal(createExternalQuery.json().backgroundJob.jobType, "external-query.bureau-dev");
  const externalQueryId = createExternalQuery.json().data.id as string;

  const recordExternalResult = await app.inject({
    method: "POST",
    url: `/compliance/external-jobs/${externalQueryId}/results`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      status: "SUCCEEDED",
      result: {
        accidents: 0,
        auctions: 0,
      },
    },
  });
  assert.equal(recordExternalResult.statusCode, 201);
  assert.equal(recordExternalResult.json().data.status, "SUCCEEDED");

  const getExternalQuery = await app.inject({
    method: "GET",
    url: `/compliance/external-jobs/${externalQueryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getExternalQuery.statusCode, 200);
  assert.equal(getExternalQuery.json().data.status, "SUCCEEDED");
  assert.equal(getExternalQuery.json().results.length, 1);

  const sellerAudit = await app.inject({
    method: "GET",
    url: "/audit/logs",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerAudit.statusCode, 403);
  assert.equal(sellerAudit.json().error.code, "FORBIDDEN");

  const sdrAudit = await app.inject({
    method: "GET",
    url: "/audit/logs",
    headers: {
      authorization: `Bearer ${sdrToken}`,
    },
  });
  assert.equal(sdrAudit.statusCode, 403);
  assert.equal(sdrAudit.json().error.code, "FORBIDDEN");

  const auditLogs = await app.inject({
    method: "GET",
    url: "/audit/logs?module=customers&page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(auditLogs.statusCode, 200);
  assert.ok(auditLogs.json().items.some((log: { entityId: string }) => log.entityId === createdCustomerId));

  const sellerDeleteAuditLog = await app.inject({
    method: "DELETE",
    url: `/audit/logs/${auditLogs.json().items[0].id}`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerDeleteAuditLog.statusCode, 404);

  const technicalEvents = await app.inject({
    method: "GET",
    url: "/audit/technical-events?source=internal-event&page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(technicalEvents.statusCode, 200);
  assert.ok(technicalEvents.json().total >= 1);

  const securityEvent = await prisma.securityEvent.create({
    data: {
      storeId: ownerBody.user.storeId,
      userId: sellerUserId,
      type: "qa_security_event",
      severity: "medium",
      metadata: {
        source: "smoke-test",
      },
    },
  });

  const securityEvents = await app.inject({
    method: "GET",
    url: "/audit/security-events?severity=medium&page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(securityEvents.statusCode, 200);
  assert.ok(securityEvents.json().items.some((event: { id: string }) => event.id === securityEvent.id));

  const auditSummary = await app.inject({
    method: "GET",
    url: "/audit/summary",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(auditSummary.statusCode, 200);
  assert.ok(auditSummary.json().auditByResult.SUCCESS >= 1);
  assert.ok(auditSummary.json().technicalByLevel.info >= 1);
  assert.ok(auditSummary.json().securityBySeverity.medium >= 1);

  const webhookWithoutIdempotency = await app.inject({
    method: "POST",
    url: "/webhooks/evolution",
    payload: {
      event: "message.received",
    },
  });
  assert.equal(webhookWithoutIdempotency.statusCode, 400);
  assert.equal(webhookWithoutIdempotency.json().error.code, "VALIDATION_ERROR");

  const webhookKey = uniqueToken("qa-webhook");
  const webhook = await app.inject({
    method: "POST",
    url: "/webhooks/evolution",
    headers: {
      "x-idempotency-key": webhookKey,
    },
    payload: {
      event: "message.received",
      externalId: webhookKey,
    },
  });
  assert.equal(webhook.statusCode, 202);

  const duplicateWebhook = await app.inject({
    method: "POST",
    url: "/webhooks/evolution",
    headers: {
      "x-idempotency-key": webhookKey,
    },
    payload: {
      event: "message.received",
      externalId: webhookKey,
    },
  });
  assert.equal(duplicateWebhook.statusCode, 200);
  assert.equal(duplicateWebhook.json().idempotentHit, true);

  const deleteCustomerWithoutReason = await app.inject({
    method: "DELETE",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {},
  });
  assert.equal(deleteCustomerWithoutReason.statusCode, 400);
  assert.equal(deleteCustomerWithoutReason.json().error.code, "VALIDATION_ERROR");

  const deleteCustomer = await app.inject({
    method: "DELETE",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      reason: "Arquivamento validado pelo contrato de API",
    },
  });
  assert.equal(deleteCustomer.statusCode, 200);
  assert.equal(deleteCustomer.json().data.status, "ARCHIVED");

  const customerDeleteAudit = await app.inject({
    method: "GET",
    url: `/audit/logs?module=customers&action=delete&entity_type=customer&entity_id=${createdCustomerId}&page=1&page_size=5`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(customerDeleteAudit.statusCode, 200);
  assert.ok(
    customerDeleteAudit
      .json()
      .items.some((log: { metadata: { reason?: string } }) => log.metadata.reason === "Arquivamento validado pelo contrato de API"),
  );

  const deletedCustomer = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(deletedCustomer.statusCode, 404);
  checkpoint("analytics/compliance/audit/webhooks");
  smokeSucceeded = true;
} finally {
  writeTimingHistory(smokeSucceeded);
  await app.close();
  await prisma.$disconnect();
}
