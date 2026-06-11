import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { buildApp } from "../apps/api/src/app.js";
import { prisma } from "../apps/api/src/lib/db.js";

execSync("npm run db:seed", {
  cwd: process.cwd(),
  stdio: "ignore",
  env: process.env,
});

const app = buildApp();

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
  const sellerBody = sellerLogin.json() as { token: string; user: { role: string } };
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
  const ownerBody = ownerLogin.json() as { token: string; user: { storeId: string } };

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
      email: `cliente.email.${Date.now()}@gt3.local`,
      name: "Cliente Somente Email API",
      origin: "qa-email",
    },
  });
  assert.equal(emailOnlyCustomer.statusCode, 201);
  assert.equal(emailOnlyCustomer.json().data.phone, null);

  const document = `QA-${Date.now()}`;
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

  const concurrentDocument = `QA-RACE-${Date.now()}`;
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

  const serviceToken = `QA-${Date.now()}`;
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
  const createCatalogItem = await app.inject({
    method: "POST",
    url: "/services/catalog",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      basePrice: 990,
      category: "QA",
      name: postSaleCatalogName,
      slaHours: 4,
    },
  });
  assert.equal(createCatalogItem.statusCode, 201);
  assert.equal(createCatalogItem.json().data.basePrice, "990");

  const listCatalog = await app.inject({
    method: "GET",
    url: "/services/catalog?page=1&page_size=100&category=QA",
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

  const leadSearchToken = `Civic-${Date.now()}`;
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

  const leadStageHistory = await prisma.leadStageHistory.findFirst({
    where: {
      leadId: createdLeadId,
      fromStage: "NEW",
      toStage: "CONTACTED",
    },
  });
  assert.ok(leadStageHistory);

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
      name: `WhatsApp QA ${Date.now()}`,
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
      instanceKey: `whatsapp-qa-${Date.now()}`,
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
      email: `qa-${Date.now()}@gt3.local`,
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
        plate: `QA${Date.now().toString().slice(-5)}`,
      },
      ownershipType: "OWN",
      askingPrice: 125000,
    },
  });
  assert.equal(sellerInventoryCreate.statusCode, 403);
  assert.equal(sellerInventoryCreate.json().error.code, "FORBIDDEN");

  const inventoryPlate = `QA${Date.now().toString().slice(-5)}`;
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
        yearModel: 2021,
        yearBuild: 2020,
        plate: inventoryPlate,
        color: "Prata",
        mileage: 42000,
      },
      ownershipType: "OWN",
      status: "IN_PREPARATION",
      purchaseCost: 101000,
      askingPrice: 124900,
      entryDate: "2026-06-06T12:00:00.000Z",
      notes: "Entrada criada pelo contrato de API.",
    },
  });
  assert.equal(createInventory.statusCode, 201);
  assert.equal(createInventory.json().data.vehicle.plate, inventoryPlate);
  assert.equal(createInventory.json().data.purchaseCost, "101000");
  const inventoryId = createInventory.json().data.id as string;
  const inventoryVehicleId = createInventory.json().data.vehicle.id as string;

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
        plate: inventoryPlate,
      },
      ownershipType: "OWN",
    },
  });
  assert.equal(duplicateInventory.statusCode, 409);
  assert.equal(duplicateInventory.json().error.code, "CONFLICT");

  const listInventory = await app.inject({
    method: "GET",
    url: `/inventory?page=1&page_size=5&search=${encodeURIComponent(inventoryPlate)}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(listInventory.statusCode, 200);
  assert.ok(listInventory.json().items.some((item: { id: string }) => item.id === inventoryId));

  const getInventory = await app.inject({
    method: "GET",
    url: `/inventory/${inventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(getInventory.statusCode, 200);
  assert.equal(getInventory.json().data.vehicle.model, "Civic");

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

  const providerName = `Oficina QA ${Date.now()}`;
  const createServiceProvider = await app.inject({
    method: "POST",
    url: "/services/providers",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      name: providerName,
      serviceTypes: ["preparacao", "mecanica"],
      contactName: "Carlos Servicos",
      phone: "11988887777",
    },
  });
  assert.equal(createServiceProvider.statusCode, 201);
  assert.equal(createServiceProvider.json().data.name, providerName);
  const serviceProviderId = createServiceProvider.json().data.id as string;

  const catalogName = `Polimento QA ${Date.now()}`;
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
    },
  });
  assert.equal(createServiceOrder.statusCode, 201);
  assert.equal(createServiceOrder.json().data.vehicleId, inventoryVehicleId);
  assert.equal(createServiceOrder.json().data.totalAmount, "900");
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
      number: `NF-QA-${Date.now()}`,
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
      externalId: `qa-listing-${Date.now()}`,
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

  const campaignName = `Campanha QA ${Date.now()}`;
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

  const repassePlate = `RP${Date.now().toString().slice(-5)}`;
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
        plate: repassePlate,
        color: "Preto",
        mileage: 88000,
      },
      ownershipType: "REPASSE",
      status: "REPASSE",
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

  const repasseInventory = await app.inject({
    method: "GET",
    url: `/inventory/${repasseInventoryId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(repasseInventory.statusCode, 200);
  assert.equal(repasseInventory.json().data.status, "REPASSE");

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
  assert.ok(customerHistory.json().events.length >= 1);

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

  const warrantyTerm = await app.inject({
    method: "POST",
    url: "/contracts/warranty-terms",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      terms: {
        prazoDias: 90,
        cobertura: ["motor", "cambio"],
      },
    },
  });
  assert.equal(warrantyTerm.statusCode, 201);
  assert.equal(warrantyTerm.json().data.saleId, saleId);

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

  const sellerDispatch = await app.inject({
    method: "GET",
    url: "/dispatch/processes",
    headers: {
      authorization: `Bearer ${sellerInventoryToken}`,
    },
  });
  assert.equal(sellerDispatch.statusCode, 403);
  assert.equal(sellerDispatch.json().error.code, "FORBIDDEN");

  const createDispatch = await app.inject({
    method: "POST",
    url: "/dispatch/processes",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      saleId,
      providerId: serviceProviderId,
      status: "OPEN",
      channel: "detran-sp",
      metadata: {
        protocol: `DSP-QA-${Date.now()}`,
        vehicleId: inventoryVehicleId,
      },
    },
  });
  assert.equal(createDispatch.statusCode, 201);
  assert.equal(createDispatch.json().data.saleId, saleId);
  assert.equal(createDispatch.json().data.providerId, serviceProviderId);
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

  const updateDispatch = await app.inject({
    method: "PATCH",
    url: `/dispatch/processes/${dispatchId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
    payload: {
      channel: "detran-digital",
      metadata: {
        protocol: "DSP-QA-UPDATED",
        stage: "documentacao",
      },
    },
  });
  assert.equal(updateDispatch.statusCode, 200);
  assert.equal(updateDispatch.json().data.channel, "detran-digital");

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
      .columns.some((column: { status: string; items: Array<{ id: string }> }) => column.status === "NEGOTIATION" && column.items.some((item) => item.id === sellerCustomerId)),
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
    },
  });
  assert.equal(createNotification.statusCode, 201);
  assert.equal(createNotification.json().data.userId, sellerUserId);
  assert.equal(createNotification.json().data.readAt, null);
  const notificationId = createNotification.json().data.id as string;

  const sellerNotifications = await app.inject({
    method: "GET",
    url: "/notifications?unread_only=true",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerNotifications.statusCode, 200);
  assert.ok(sellerNotifications.json().items.some((notification: { id: string }) => notification.id === notificationId));

  const sellerNotificationSummary = await app.inject({
    method: "GET",
    url: "/notifications/summary",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerNotificationSummary.statusCode, 200);
  assert.ok(sellerNotificationSummary.json().data.unread >= 1);

  const readNotification = await app.inject({
    method: "POST",
    url: `/notifications/${notificationId}/read`,
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(readNotification.statusCode, 200);
  assert.ok(readNotification.json().data.readAt);

  const sellerUnreadAfterRead = await app.inject({
    method: "GET",
    url: "/notifications?unread_only=true",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerUnreadAfterRead.statusCode, 200);
  assert.ok(!sellerUnreadAfterRead.json().items.some((notification: { id: string }) => notification.id === notificationId));

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

  const idempotencyKey = `qa-job-${Date.now()}`;
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

  const concurrentJobKey = `qa-job-race-${Date.now()}`;
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
      name: `Follow-up QA ${Date.now()}`,
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
      name: `Preparacao QA ${Date.now()}`,
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
      name: `Contrato QA ${Date.now()}`,
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
      name: `Followup QA ${Date.now()}`,
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

  const sellerUsers = await app.inject({
    method: "GET",
    url: "/users",
    headers: {
      authorization: `Bearer ${sellerTokenAgain}`,
    },
  });
  assert.equal(sellerUsers.statusCode, 403);
  assert.equal(sellerUsers.json().error.code, "FORBIDDEN");

  const qaUserEmail = `usuario.qa.${Date.now()}@gt3.local`;
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
  assert.ok(inventoryPerformance.json().listingMetrics.views >= 100);
  assert.equal(inventoryPerformance.json().listingMetrics.ctr, "0.1200");

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

  const auditLogs = await app.inject({
    method: "GET",
    url: "/audit/logs?module=customers&page=1&page_size=10",
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(auditLogs.statusCode, 200);
  assert.ok(auditLogs.json().items.some((log: { entityId: string }) => log.entityId === createdCustomerId));

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

  const webhookKey = `qa-webhook-${Date.now()}`;
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

  const deletedCustomer = await app.inject({
    method: "GET",
    url: `/customers/${createdCustomerId}`,
    headers: {
      authorization: `Bearer ${ownerBody.token}`,
    },
  });
  assert.equal(deletedCustomer.statusCode, 404);
} finally {
  await app.close();
  await prisma.$disconnect();
}
