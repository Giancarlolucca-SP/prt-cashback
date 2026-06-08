import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

const DEV_PASSWORD = "Gt3@2026dev";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:16384:8:1:${salt}:${hash}`;
}

const roles = [
  ["OWNER_MANAGER", "Dono/Gestor", "Acesso executivo completo, financeiro, margens, auditoria e configuracoes."],
  ["ADMIN", "Administrador", "Administracao operacional ampla, usuarios, cadastros, vendas e configuracoes permitidas."],
  ["ADMINISTRATIVE", "Administrativo", "Rotinas administrativas, documentos, agenda, clientes, fornecedores e lancamentos."],
  ["SELLER", "Vendedor", "Carteira propria, leads, vendas, estoque permitido e comissoes proprias."],
  ["SDR", "SDR", "Prospeccao, leads, agendamentos e qualificacao inicial."],
  ["APPRAISER", "Avaliador", "Avaliacoes, compras e historico operacional permitido."],
  ["SERVICE_MANAGER", "Responsavel por Servicos", "Pos-venda, servicos, prestadores operacionais e agenda de estetica."],
];

const permissions = [
  ["dashboard", "read", "STORE", "general", "Visualizar painel operacional."],
  ["ai", "use", "STORE", "general", "Usar sugestoes assistidas e registrar consultas de IA."],
  ["customers", "read", "STORE", "general", "Visualizar clientes permitidos."],
  ["customers", "create", "STORE", "general", "Criar clientes."],
  ["customers", "update", "STORE", "general", "Editar clientes."],
  ["customers", "update_status", "STORE", "general", "Mover status operacional de clientes/leads permitidos."],
  ["customers", "delete", "STORE", "general", "Arquivar clientes com justificativa e auditoria."],
  ["leads", "read", "STORE", "general", "Visualizar leads permitidos."],
  ["leads", "create", "STORE", "general", "Criar leads."],
  ["leads", "update", "STORE", "general", "Atualizar leads e kanbans."],
  ["communications", "manage", "STORE", "general", "Gerenciar canais, conversas e mensagens."],
  ["appointments", "manage", "STORE", "general", "Gerenciar agendamentos."],
  ["inventory", "read", "STORE", "general", "Visualizar estoque permitido."],
  ["inventory", "manage", "STORE", "general", "Gerenciar estoque."],
  ["inventory", "read_costs", "ALL", "margin", "Visualizar custos e margens de estoque."],
  ["purchases", "read", "STORE", "general", "Visualizar leads de compra e avaliacoes."],
  ["purchases", "manage", "STORE", "general", "Gerenciar captacao, avaliacoes e pagamentos de compra."],
  ["purchases", "approve", "ALL", "sensitive_approval", "Aprovar avaliacoes e decisoes de compra."],
  ["sales", "read", "STORE", "general", "Visualizar vendas permitidas."],
  ["sales", "create", "STORE", "general", "Criar vendas."],
  ["sales", "update", "STORE", "general", "Atualizar propostas e dados operacionais de vendas."],
  ["sales", "approve", "ALL", "sensitive_approval", "Aprovar venda e condicoes sensiveis."],
  ["documents", "manage", "STORE", "documents", "Gerenciar documentos e anexos permitidos."],
  ["dispatch", "manage", "STORE", "general", "Gerenciar processos de despachante e transferencia."],
  ["finance", "read", "ALL", "financial", "Visualizar financeiro e resultados globais."],
  ["finance", "manage", "ALL", "financial", "Gerenciar contas, despesas, DRE e conciliacao."],
  ["commissions", "read_all", "ALL", "financial", "Visualizar comissoes de todos os usuarios."],
  ["commissions", "read_own", "OWN_PORTFOLIO", "general", "Visualizar comissoes proprias."],
  ["commissions", "manage", "ALL", "financial", "Calcular, aprovar, bloquear e pagar comissoes."],
  ["ads", "manage", "STORE", "general", "Gerenciar anuncios e campanhas."],
  ["repasse", "manage", "STORE", "general", "Gerenciar repasses e listas de transmissao."],
  ["services", "manage", "STORE", "general", "Gerenciar servicos, pos-venda e prestadores operacionais."],
  ["suppliers", "manage", "ALL", "credentials", "Gerenciar fornecedores e referencias de credenciais."],
  ["automation", "manage", "ALL", "technical", "Gerenciar automacoes e jobs."],
  ["audit", "read", "ALL", "audit", "Visualizar auditoria e logs sensiveis."],
  ["settings", "manage", "ALL", "technical", "Gerenciar configuracoes da loja e sistema."],
  ["users", "manage", "ALL", "security", "Gerenciar usuarios, roles e permissoes."],
];

const rolePermissionCodes = {
  OWNER_MANAGER: "ALL",
  ADMIN: [
    "dashboard:read:STORE:general",
    "ai:use:STORE:general",
    "customers:read:STORE:general",
    "customers:create:STORE:general",
    "customers:update:STORE:general",
    "customers:update_status:STORE:general",
    "leads:read:STORE:general",
    "leads:create:STORE:general",
    "leads:update:STORE:general",
    "communications:manage:STORE:general",
    "appointments:manage:STORE:general",
    "inventory:read:STORE:general",
    "inventory:manage:STORE:general",
    "inventory:read_costs:ALL:margin",
    "purchases:read:STORE:general",
    "purchases:manage:STORE:general",
    "purchases:approve:ALL:sensitive_approval",
    "sales:read:STORE:general",
    "sales:create:STORE:general",
    "sales:update:STORE:general",
    "documents:manage:STORE:documents",
    "dispatch:manage:STORE:general",
    "finance:read:ALL:financial",
    "commissions:read_all:ALL:financial",
    "commissions:manage:ALL:financial",
    "ads:manage:STORE:general",
    "repasse:manage:STORE:general",
    "services:manage:STORE:general",
    "suppliers:manage:ALL:credentials",
    "automation:manage:ALL:technical",
    "settings:manage:ALL:technical",
    "users:manage:ALL:security",
  ],
  ADMINISTRATIVE: [
    "dashboard:read:STORE:general",
    "ai:use:STORE:general",
    "customers:read:STORE:general",
    "customers:create:STORE:general",
    "customers:update:STORE:general",
    "customers:update_status:STORE:general",
    "leads:read:STORE:general",
    "communications:manage:STORE:general",
    "appointments:manage:STORE:general",
    "inventory:read:STORE:general",
    "purchases:read:STORE:general",
    "purchases:manage:STORE:general",
    "sales:read:STORE:general",
    "sales:create:STORE:general",
    "sales:update:STORE:general",
    "documents:manage:STORE:documents",
    "dispatch:manage:STORE:general",
    "finance:manage:ALL:financial",
    "ads:manage:STORE:general",
    "repasse:manage:STORE:general",
    "services:manage:STORE:general",
    "suppliers:manage:ALL:credentials",
  ],
  SELLER: [
    "dashboard:read:STORE:general",
    "ai:use:STORE:general",
    "customers:read:STORE:general",
    "customers:create:STORE:general",
    "customers:update_status:STORE:general",
    "leads:read:STORE:general",
    "leads:create:STORE:general",
    "leads:update:STORE:general",
    "communications:manage:STORE:general",
    "appointments:manage:STORE:general",
    "inventory:read:STORE:general",
    "sales:read:STORE:general",
    "sales:create:STORE:general",
    "sales:update:STORE:general",
    "documents:manage:STORE:documents",
    "commissions:read_own:OWN_PORTFOLIO:general",
  ],
  SDR: [
    "dashboard:read:STORE:general",
    "ai:use:STORE:general",
    "customers:read:STORE:general",
    "customers:update_status:STORE:general",
    "leads:read:STORE:general",
    "leads:create:STORE:general",
    "leads:update:STORE:general",
    "communications:manage:STORE:general",
    "appointments:manage:STORE:general",
  ],
  APPRAISER: [
    "dashboard:read:STORE:general",
    "customers:read:STORE:general",
    "inventory:read:STORE:general",
    "inventory:manage:STORE:general",
    "purchases:read:STORE:general",
    "purchases:manage:STORE:general",
  ],
  SERVICE_MANAGER: [
    "dashboard:read:STORE:general",
    "ai:use:STORE:general",
    "customers:read:STORE:general",
    "customers:create:STORE:general",
    "communications:manage:STORE:general",
    "appointments:manage:STORE:general",
    "documents:manage:STORE:documents",
    "dispatch:manage:STORE:general",
    "services:manage:STORE:general",
    "commissions:read_own:OWN_PORTFOLIO:general",
  ],
};

const users = [
  ["Dono GT3", "dono@gt3.local", "OWNER_MANAGER"],
  ["Administrador GT3", "admin@gt3.local", "ADMIN"],
  ["Administrativo GT3", "administrativo@gt3.local", "ADMINISTRATIVE"],
  ["Vendedor GT3", "vendedor@gt3.local", "SELLER"],
  ["SDR GT3", "sdr@gt3.local", "SDR"],
  ["Avaliador GT3", "avaliador@gt3.local", "APPRAISER"],
  ["Servicos GT3", "servicos@gt3.local", "SERVICE_MANAGER"],
];

async function ensurePermissionScope(userId, module, scope) {
  const existing = await prisma.permissionScope.findFirst({
    where: { userId, module, scope },
    select: { id: true },
  });

  if (!existing) {
    await prisma.permissionScope.create({
      data: { userId, module, scope },
    });
  }
}

function daysFromNow(days, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function findOrCreate(model, where, create, update = {}) {
  const existing = await prisma[model].findFirst({ where });
  if (!existing) {
    return prisma[model].create({ data: create });
  }

  if (Object.keys(update).length === 0) {
    return existing;
  }

  return prisma[model].update({ where: { id: existing.id }, data: update });
}

async function seedDemoData(store, userByRole) {
  const seller = userByRole.get("SELLER");
  const sdr = userByRole.get("SDR");
  const appraiser = userByRole.get("APPRAISER");
  const serviceManager = userByRole.get("SERVICE_MANAGER");
  const admin = userByRole.get("ADMIN");

  const customers = await Promise.all([
    findOrCreate(
      "customer",
      { storeId: store.id, document: "12345678901" },
      { storeId: store.id, type: "PERSON", name: "Marina Souza", document: "12345678901", email: "marina@exemplo.com", phone: "(11) 99999-0001", origin: "WhatsApp", createdByUserId: sdr?.id, updatedByUserId: sdr?.id },
      { name: "Marina Souza", phone: "(11) 99999-0001", origin: "WhatsApp" },
    ),
    findOrCreate(
      "customer",
      { storeId: store.id, document: "23456789012" },
      { storeId: store.id, type: "PERSON", name: "Paulo Lima", document: "23456789012", email: "paulo@exemplo.com", phone: "(11) 99999-0002", origin: "Loja", createdByUserId: seller?.id, updatedByUserId: seller?.id },
      { name: "Paulo Lima", phone: "(11) 99999-0002", origin: "Loja" },
    ),
    findOrCreate(
      "customer",
      { storeId: store.id, document: "34567890000190" },
      { storeId: store.id, type: "COMPANY", name: "Auto Giro Repasse", document: "34567890000190", email: "compras@autogiro.example", phone: "(19) 99888-7777", origin: "Repasse", createdByUserId: admin?.id, updatedByUserId: admin?.id },
      { name: "Auto Giro Repasse", phone: "(19) 99888-7777", origin: "Repasse" },
    ),
    findOrCreate(
      "customer",
      { storeId: store.id, document: "45678901234" },
      { storeId: store.id, type: "PERSON", name: "Roberto Alves", document: "45678901234", email: "roberto@exemplo.com", phone: "(19) 99744-3200", origin: "Pos-venda", createdByUserId: serviceManager?.id, updatedByUserId: serviceManager?.id },
      { name: "Roberto Alves", phone: "(19) 99744-3200", origin: "Pos-venda" },
    ),
  ]);

  const [marina, paulo, autoGiro, roberto] = customers;

  const vehicles = await Promise.all([
    findOrCreate(
      "vehicle",
      { storeId: store.id, plate: "GT30001" },
      { storeId: store.id, brand: "Toyota", model: "Corolla", version: "XEI", yearModel: 2021, yearBuild: 2020, plate: "GT30001", color: "Prata", mileage: 52000 },
      { brand: "Toyota", model: "Corolla", version: "XEI", yearModel: 2021, mileage: 52000 },
    ),
    findOrCreate(
      "vehicle",
      { storeId: store.id, plate: "GT30002" },
      { storeId: store.id, brand: "Jeep", model: "Compass", version: "Longitude", yearModel: 2020, yearBuild: 2020, plate: "GT30002", color: "Branco", mileage: 68000 },
      { brand: "Jeep", model: "Compass", version: "Longitude", yearModel: 2020, mileage: 68000 },
    ),
    findOrCreate(
      "vehicle",
      { storeId: store.id, plate: "GT30003" },
      { storeId: store.id, brand: "Honda", model: "HR-V", version: "Touring", yearModel: 2022, yearBuild: 2021, plate: "GT30003", color: "Cinza", mileage: 39000 },
      { brand: "Honda", model: "HR-V", version: "Touring", yearModel: 2022, mileage: 39000 },
    ),
    findOrCreate(
      "vehicle",
      { storeId: store.id, plate: "GT30004" },
      { storeId: store.id, brand: "Chevrolet", model: "Onix", version: "LTZ", yearModel: 2019, yearBuild: 2019, plate: "GT30004", color: "Preto", mileage: 74000 },
      { brand: "Chevrolet", model: "Onix", version: "LTZ", yearModel: 2019, mileage: 74000 },
    ),
  ]);

  const [corolla, compass, hrv, onix] = vehicles;

  const inventory = await Promise.all([
    findOrCreate(
      "vehicleInventoryRecord",
      { storeId: store.id, vehicleId: corolla.id },
      { storeId: store.id, vehicleId: corolla.id, ownershipType: "OWN", status: "AVAILABLE", purchaseCost: 94000, askingPrice: 112900, entryDate: daysFromNow(-34), notes: "Pronto para venda e anuncios ativos." },
      { ownershipType: "OWN", status: "AVAILABLE", purchaseCost: 94000, askingPrice: 112900 },
    ),
    findOrCreate(
      "vehicleInventoryRecord",
      { storeId: store.id, vehicleId: compass.id },
      { storeId: store.id, vehicleId: compass.id, ownershipType: "OWN", status: "IN_PREPARATION", purchaseCost: 86500, askingPrice: 104900, entryDate: daysFromNow(-18), notes: "Aguardando PPF e polimento." },
      { ownershipType: "OWN", status: "IN_PREPARATION", purchaseCost: 86500, askingPrice: 104900 },
    ),
    findOrCreate(
      "vehicleInventoryRecord",
      { storeId: store.id, vehicleId: hrv.id },
      { storeId: store.id, vehicleId: hrv.id, ownershipType: "CONSIGNED", ownerCustomerId: paulo.id, status: "RESERVED", purchaseCost: 0, askingPrice: 128900, entryDate: daysFromNow(-9), notes: "Consignado com proposta em andamento." },
      { ownershipType: "CONSIGNED", ownerCustomerId: paulo.id, status: "RESERVED", askingPrice: 128900 },
    ),
    findOrCreate(
      "vehicleInventoryRecord",
      { storeId: store.id, vehicleId: onix.id },
      { storeId: store.id, vehicleId: onix.id, ownershipType: "REPASSE", status: "REPASSE", purchaseCost: 43500, askingPrice: 48900, entryDate: daysFromNow(-42), notes: "Enviar para lista de lojistas." },
      { ownershipType: "REPASSE", status: "REPASSE", purchaseCost: 43500, askingPrice: 48900 },
    ),
  ]);

  await Promise.all([
    findOrCreate("vehicleCost", { storeId: store.id, vehicleId: compass.id, description: "Polimento tecnico" }, { storeId: store.id, vehicleId: compass.id, inventoryId: inventory[1].id, category: "Preparacao", description: "Polimento tecnico", amount: 950, occurredAt: daysFromNow(-5), capitalized: true }, { amount: 950, inventoryId: inventory[1].id }),
    findOrCreate("vehicleCost", { storeId: store.id, vehicleId: compass.id, description: "Higienizacao interna" }, { storeId: store.id, vehicleId: compass.id, inventoryId: inventory[1].id, category: "Preparacao", description: "Higienizacao interna", amount: 480, occurredAt: daysFromNow(-4), capitalized: true }, { amount: 480, inventoryId: inventory[1].id }),
    findOrCreate("vehicleCost", { storeId: store.id, vehicleId: corolla.id, description: "Vistoria cautelar" }, { storeId: store.id, vehicleId: corolla.id, inventoryId: inventory[0].id, category: "Vistoria", description: "Vistoria cautelar", amount: 420, occurredAt: daysFromNow(-30), capitalized: true }, { amount: 420, inventoryId: inventory[0].id }),
  ]);

  const leads = await Promise.all([
    findOrCreate("lead", { storeId: store.id, title: "Marina Souza" }, { storeId: store.id, customerId: marina.id, assignedUserId: seller?.id, source: "WhatsApp", title: "Marina Souza", status: "NEW", interest: "Corolla XEI 2021", temperature: 92, nextActionAt: daysFromNow(0, 15) }, { customerId: marina.id, assignedUserId: seller?.id, status: "NEW", temperature: 92 }),
    findOrCreate("lead", { storeId: store.id, title: "Paulo Lima" }, { storeId: store.id, customerId: paulo.id, assignedUserId: seller?.id, source: "Loja", title: "Paulo Lima", status: "SCHEDULED", interest: "HR-V Touring consignado", temperature: 88, nextActionAt: daysFromNow(1, 10) }, { customerId: paulo.id, assignedUserId: seller?.id, status: "SCHEDULED", temperature: 88 }),
    findOrCreate("lead", { storeId: store.id, title: "Carlos Tracker" }, { storeId: store.id, assignedUserId: sdr?.id, source: "Site", title: "Carlos Tracker", status: "COLD", interest: "Tracker Premier", temperature: 48, nextActionAt: daysFromNow(2, 11) }, { assignedUserId: sdr?.id, status: "COLD", temperature: 48 }),
  ]);

  await Promise.all([
    findOrCreate("appointment", { storeId: store.id, title: "Visita Marina - Corolla" }, { storeId: store.id, customerId: marina.id, leadId: leads[0].id, vehicleId: corolla.id, assignedUserId: seller?.id, type: "Visita", title: "Visita Marina - Corolla", startsAt: daysFromNow(0, 16), endsAt: daysFromNow(0, 17), status: "CONFIRMED", notes: "Cliente pediu simulacao com entrada." }, { startsAt: daysFromNow(0, 16), status: "CONFIRMED" }),
    findOrCreate("appointment", { storeId: store.id, title: "Avaliacao HR-V consignado" }, { storeId: store.id, customerId: paulo.id, leadId: leads[1].id, vehicleId: hrv.id, assignedUserId: appraiser?.id, type: "Avaliacao", title: "Avaliacao HR-V consignado", startsAt: daysFromNow(1, 10), endsAt: daysFromNow(1, 11), status: "SCHEDULED", notes: "Conferir contrato de consignacao." }, { startsAt: daysFromNow(1, 10), status: "SCHEDULED" }),
  ]);

  const providers = await Promise.all([
    findOrCreate("serviceProvider", { storeId: store.id, name: "Locadora Alfa" }, { storeId: store.id, name: "Locadora Alfa", serviceTypes: ["Frota", "Compra", "Preparacao"], contactName: "Marcos Andrade", phone: "(11) 98822-1140", email: "marcos@locadoraalfa.example", accessUrl: "portal.locadoraalfa.example", accessLogin: "gt3.compras", accessSecretRef: "vault://gt3/locadora-alfa" }, { serviceTypes: ["Frota", "Compra", "Preparacao"], contactName: "Marcos Andrade", accessSecretRef: "vault://gt3/locadora-alfa" }),
    findOrCreate("serviceProvider", { storeId: store.id, name: "Equipe PPF Prime" }, { storeId: store.id, name: "Equipe PPF Prime", serviceTypes: ["PPF", "Insulfilme", "Vitrificacao"], contactName: "Lucas", phone: "(11) 97777-2200" }, { serviceTypes: ["PPF", "Insulfilme", "Vitrificacao"], contactName: "Lucas" }),
    findOrCreate("serviceProvider", { storeId: store.id, name: "Despachante Veneto" }, { storeId: store.id, name: "Despachante Veneto", serviceTypes: ["Documentacao", "Transferencia"], contactName: "Juliana Veneto", phone: "(19) 99744-3200", accessUrl: "veneto.parceiros.example", accessLogin: "gt3.parceiro", accessSecretRef: "vault://gt3/veneto" }, { serviceTypes: ["Documentacao", "Transferencia"], contactName: "Juliana Veneto", accessSecretRef: "vault://gt3/veneto" }),
  ]);

  await Promise.all([
    findOrCreate("serviceCatalogItem", { storeId: store.id, name: "PPF" }, { storeId: store.id, name: "PPF", category: "Protecao", basePrice: 3800, slaHours: 8 }, { category: "Protecao", basePrice: 3800, slaHours: 8 }),
    findOrCreate("serviceCatalogItem", { storeId: store.id, name: "Insulfilme" }, { storeId: store.id, name: "Insulfilme", category: "Pelicula", basePrice: 1200, slaHours: 3 }, { category: "Pelicula", basePrice: 1200, slaHours: 3 }),
    findOrCreate("serviceCatalogItem", { storeId: store.id, name: "Polimento" }, { storeId: store.id, name: "Polimento", category: "Estetica", basePrice: 1450, slaHours: 6 }, { category: "Estetica", basePrice: 1450, slaHours: 6 }),
    findOrCreate("serviceCatalogItem", { storeId: store.id, name: "Higienizacao" }, { storeId: store.id, name: "Higienizacao", category: "Estetica", basePrice: 480, slaHours: 4 }, { category: "Estetica", basePrice: 480, slaHours: 4 }),
  ]);

  const postSaleCustomer = await findOrCreate(
    "postSaleCustomer",
    { storeId: store.id, name: "Roberto Alves" },
    { storeId: store.id, customerId: roberto.id, name: "Roberto Alves", phone: roberto.phone, email: roberto.email, vehicleInfo: "Honda Civic Touring", recurrenceStatus: "Manutencao vitrificacao", totalRevenue: 2180, lastServiceAt: daysFromNow(-28), nextActionAt: daysFromNow(7) },
    { customerId: roberto.id, phone: roberto.phone, recurrenceStatus: "Manutencao vitrificacao", totalRevenue: 2180, nextActionAt: daysFromNow(7) },
  );

  const serviceOrders = await Promise.all([
    findOrCreate("serviceOrder", { storeId: store.id, type: "PPF Compass" }, { storeId: store.id, vehicleId: compass.id, providerId: providers[1].id, type: "PPF Compass", status: "RUNNING", totalAmount: 3800, startedAt: daysFromNow(-1), createdAt: daysFromNow(-2) }, { vehicleId: compass.id, providerId: providers[1].id, status: "RUNNING", totalAmount: 3800 }),
    findOrCreate("serviceOrder", { storeId: store.id, type: "NF vistoria Onix" }, { storeId: store.id, vehicleId: onix.id, providerId: providers[2].id, type: "NF vistoria Onix", status: "WAITING_INVOICE", totalAmount: 420, startedAt: daysFromNow(-3), createdAt: daysFromNow(-4) }, { vehicleId: onix.id, providerId: providers[2].id, status: "WAITING_INVOICE", totalAmount: 420 }),
    findOrCreate("serviceOrder", { storeId: store.id, type: "Vitrificacao pos-venda" }, { storeId: store.id, postSaleCustomerId: postSaleCustomer.id, providerId: providers[1].id, type: "Vitrificacao pos-venda", status: "SCHEDULED", totalAmount: 1450, startedAt: daysFromNow(3, 14), createdAt: daysFromNow(-1) }, { postSaleCustomerId: postSaleCustomer.id, providerId: providers[1].id, status: "SCHEDULED", totalAmount: 1450, startedAt: daysFromNow(3, 14) }),
  ]);

  const sales = await Promise.all([
    findOrCreate("sale", { storeId: store.id, vehicleId: corolla.id, customerId: marina.id }, { storeId: store.id, customerId: marina.id, vehicleId: corolla.id, sellerUserId: seller?.id, type: "VEHICLE", status: "CLOSED", salePrice: 111500, grossMargin: 17100, closedAt: daysFromNow(-3), snapshot: { source: "seed-demo" } }, { sellerUserId: seller?.id, status: "CLOSED", salePrice: 111500, grossMargin: 17100, closedAt: daysFromNow(-3), snapshot: { source: "seed-demo" } }),
    findOrCreate("sale", { storeId: store.id, vehicleId: hrv.id, customerId: paulo.id }, { storeId: store.id, customerId: paulo.id, vehicleId: hrv.id, sellerUserId: null, type: "VEHICLE", status: "DOCUMENTATION", salePrice: 126900, grossMargin: 9500, snapshot: { source: "seed-demo", pendingSeller: true } }, { sellerUserId: null, status: "DOCUMENTATION", salePrice: 126900, grossMargin: 9500 }),
    findOrCreate("sale", { storeId: store.id, vehicleId: onix.id, customerId: autoGiro.id }, { storeId: store.id, customerId: autoGiro.id, vehicleId: onix.id, sellerUserId: null, type: "REPASSE", status: "DRAFT", salePrice: 47500, grossMargin: 3500, snapshot: { source: "seed-demo", channel: "lista lojistas" } }, { sellerUserId: null, type: "REPASSE", status: "DRAFT", salePrice: 47500, grossMargin: 3500 }),
  ]);

  await Promise.all([
    findOrCreate("contract", { storeId: store.id, saleId: sales[0].id }, { storeId: store.id, saleId: sales[0].id, status: "SIGNED", snapshot: { customer: marina.name, vehicle: "Corolla XEI" }, signedAt: daysFromNow(-2) }, { status: "SIGNED", signedAt: daysFromNow(-2), snapshot: { customer: marina.name, vehicle: "Corolla XEI" } }),
    findOrCreate("contract", { storeId: store.id, saleId: sales[1].id }, { storeId: store.id, saleId: sales[1].id, status: "GENERATED", snapshot: { customer: paulo.name, vehicle: "HR-V Touring" } }, { status: "GENERATED", snapshot: { customer: paulo.name, vehicle: "HR-V Touring" } }),
  ]);

  const purchaseLead = await findOrCreate(
    "purchaseLead",
    { storeId: store.id, vehicleId: onix.id },
    { storeId: store.id, customerId: autoGiro.id, vehicleId: onix.id, source: "Grupo parceiro", status: "EVALUATING", askingPrice: 44000 },
    { customerId: autoGiro.id, source: "Grupo parceiro", status: "EVALUATING", askingPrice: 44000 },
  );

  await findOrCreate(
    "vehicleEvaluation",
    { storeId: store.id, purchaseLeadId: purchaseLead.id },
    { storeId: store.id, purchaseLeadId: purchaseLead.id, customerId: autoGiro.id, vehicleId: onix.id, appraiserUserId: appraiser?.id, requestedPrice: 44000, fipeValue: 48500, suggestedPrice: 41800, expectedPrepCost: 1800, expectedMargin: 3900, decision: "NEGOTIATING", snapshot: { checklist: "seed-demo" }, evaluatedAt: daysFromNow(-2) },
    { appraiserUserId: appraiser?.id, requestedPrice: 44000, suggestedPrice: 41800, expectedPrepCost: 1800, expectedMargin: 3900, decision: "NEGOTIATING" },
  );

  await findOrCreate(
    "repasseProcess",
    { storeId: store.id, vehicleId: onix.id },
    { storeId: store.id, vehicleId: onix.id, status: "READY_TO_SEND", price: 47500, channelPlan: { channels: ["lista lojistas", "instagram"], message: "Onix LTZ repasse, revisado e pronto para visita." } },
    { status: "READY_TO_SEND", price: 47500, channelPlan: { channels: ["lista lojistas", "instagram"], message: "Onix LTZ repasse, revisado e pronto para visita." } },
  );

  const account = await findOrCreate("financialAccount", { storeId: store.id, name: "Conta GT3 Principal" }, { storeId: store.id, name: "Conta GT3 Principal", type: "CHECKING", bankName: "Banco Demo" }, { type: "CHECKING", bankName: "Banco Demo" });
  const incomeCategory = await findOrCreate("financialCategory", { storeId: store.id, name: "Receita de vendas", type: "INCOME" }, { storeId: store.id, name: "Receita de vendas", type: "INCOME", dreGroup: "receita_bruta" }, { dreGroup: "receita_bruta" });
  const expenseCategory = await findOrCreate("financialCategory", { storeId: store.id, name: "Preparacao de veiculos", type: "EXPENSE" }, { storeId: store.id, name: "Preparacao de veiculos", type: "EXPENSE", dreGroup: "custos_operacionais" }, { dreGroup: "custos_operacionais" });

  await Promise.all([
    findOrCreate("financialTransaction", { storeId: store.id, description: "Recebimento Corolla Marina" }, { storeId: store.id, accountId: account.id, categoryId: incomeCategory.id, type: "INCOME", status: "PAID", description: "Recebimento Corolla Marina", amount: 111500, dueAt: daysFromNow(-3), paidAt: daysFromNow(-3), entityType: "sale", entityId: sales[0].id, snapshot: { source: "seed-demo" } }, { accountId: account.id, categoryId: incomeCategory.id, status: "PAID", amount: 111500, entityId: sales[0].id }),
    findOrCreate("financialTransaction", { storeId: store.id, description: "Entrada proposta HR-V" }, { storeId: store.id, accountId: account.id, categoryId: incomeCategory.id, type: "INCOME", status: "SCHEDULED", description: "Entrada proposta HR-V", amount: 25000, dueAt: daysFromNow(2), entityType: "sale", entityId: sales[1].id, snapshot: { source: "seed-demo" } }, { accountId: account.id, categoryId: incomeCategory.id, status: "SCHEDULED", amount: 25000, entityId: sales[1].id }),
    findOrCreate("financialTransaction", { storeId: store.id, description: "Pagamento PPF Compass" }, { storeId: store.id, accountId: account.id, categoryId: expenseCategory.id, type: "EXPENSE", status: "PENDING", description: "Pagamento PPF Compass", amount: 2600, dueAt: daysFromNow(4), entityType: "service_order", entityId: serviceOrders[0].id, snapshot: { source: "seed-demo" } }, { accountId: account.id, categoryId: expenseCategory.id, status: "PENDING", amount: 2600, entityId: serviceOrders[0].id }),
  ]);

  const channel = await findOrCreate(
    "communicationChannel",
    { storeId: store.id, type: "whatsapp", name: "WhatsApp Loja" },
    { storeId: store.id, type: "whatsapp", name: "WhatsApp Loja", settings: { instance: "gt3-demo" } },
    { settings: { instance: "gt3-demo" } },
  );
  const thread = await findOrCreate(
    "messageThread",
    { storeId: store.id, subject: "Atendimento Marina Corolla" },
    { storeId: store.id, customerId: marina.id, leadId: leads[0].id, channelId: channel.id, subject: "Atendimento Marina Corolla", status: "OPEN", lastMessageAt: daysFromNow(0, 9) },
    { customerId: marina.id, leadId: leads[0].id, channelId: channel.id, status: "OPEN", lastMessageAt: daysFromNow(0, 9) },
  );
  await findOrCreate(
    "message",
    { storeId: store.id, threadId: thread.id, body: "Tenho interesse no Corolla XEI." },
    { storeId: store.id, threadId: thread.id, direction: "INBOUND", sender: marina.phone, recipient: "GT3", body: "Tenho interesse no Corolla XEI.", receivedAt: daysFromNow(0, 9), metadata: { source: "seed-demo" } },
  );

  await findOrCreate(
    "automationRule",
    { storeId: store.id, name: "Alerta lead frio" },
    { storeId: store.id, name: "Alerta lead frio", trigger: "lead.cold", status: "ACTIVE", currentVersion: 1 },
    { trigger: "lead.cold", status: "ACTIVE", currentVersion: 1 },
  );

  await Promise.all([
    findOrCreate("auditLog", { storeId: store.id, entityType: "seed", entityId: store.id, action: "demo_data_seeded" }, { storeId: store.id, actorId: admin?.id, actorRole: admin?.role, module: "seed", action: "demo_data_seeded", entityType: "seed", entityId: store.id, result: "SUCCESS", metadata: { version: "live-workspaces-demo" } }),
    findOrCreate("fileAttachment", { storeId: store.id, bucket: "documents", path: "demo/contrato-corolla.pdf" }, { storeId: store.id, bucket: "documents", path: "demo/contrato-corolla.pdf", originalName: "contrato-corolla.pdf", mimeType: "application/pdf", sizeBytes: 184000, classification: "contract", uploadedByUserId: admin?.id }),
  ]);
}

async function main() {
  const store = await prisma.store.upsert({
    where: { cnpj: "00000000000100" },
    update: {
      name: "GT3 Veiculos",
      legalName: "GT3 Veiculos Ltda",
      taxRegime: "simples_nacional",
      status: "ACTIVE",
    },
    create: {
      name: "GT3 Veiculos",
      legalName: "GT3 Veiculos Ltda",
      cnpj: "00000000000100",
      taxRegime: "simples_nacional",
      cnaes: ["4511-1/01"],
    },
  });

  await prisma.storeSetting.upsert({
    where: { storeId_key: { storeId: store.id, key: "ui.brand" } },
    update: {
      value: {
        name: "GT3 Veiculos",
        theme: "modern-light",
        darkModeEnabled: true,
      },
    },
    create: {
      storeId: store.id,
      key: "ui.brand",
      value: {
        name: "GT3 Veiculos",
        theme: "modern-light",
        darkModeEnabled: true,
      },
    },
  });

  const roleByCode = new Map();
  for (const [code, name, description] of roles) {
    const role = await prisma.role.upsert({
      where: { storeId_code: { storeId: store.id, code } },
      update: { name, description, isSystem: true, status: "ACTIVE" },
      create: { storeId: store.id, code, name, description, isSystem: true },
    });
    roleByCode.set(code, role);
  }

  const permissionByCode = new Map();
  for (const [module, action, scope, sensitiveArea, description] of permissions) {
    const permission = await prisma.permission.upsert({
      where: {
        module_action_scope_sensitiveArea: {
          module,
          action,
          scope,
          sensitiveArea,
        },
      },
      update: { description, status: "ACTIVE" },
      create: { module, action, scope, sensitiveArea, description },
    });
    permissionByCode.set(`${module}:${action}:${scope}:${sensitiveArea}`, permission);
  }

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionCodes)) {
    const role = roleByCode.get(roleCode);
    const selectedPermissions =
      permissionCodes === "ALL"
        ? [...permissionByCode.values()]
        : permissionCodes.map((code) => permissionByCode.get(code)).filter(Boolean);

    for (const permission of selectedPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const userByRole = new Map();
  for (const [name, email, role] of users) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        storeId: store.id,
        name,
        role,
        isActive: true,
        mustChangePassword: true,
      },
      create: {
        storeId: store.id,
        name,
        email,
        role,
        passwordHash: hashPassword(DEV_PASSWORD),
        isActive: true,
        mustChangePassword: true,
      },
    });

    await ensurePermissionScope(user.id, "store", "STORE");
    userByRole.set(role, user);
  }

  await seedDemoData(store, userByRole);

  console.log("Seed concluido.");
  console.log(`Loja: ${store.name}`);
  console.log("Usuarios dev:");
  for (const [, email] of users) {
    console.log(`- ${email}`);
  }
  console.log(`Senha dev: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
