import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { apiErrorHandler } from "./api/errors.js";
import { registerAiRoutes } from "./routes/ai.routes.js";
import { registerAnalyticsRoutes } from "./routes/analytics.routes.js";
import { registerAppointmentRoutes } from "./routes/appointments.routes.js";
import { registerAuditRoutes } from "./routes/audit.routes.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerAutomationRoutes } from "./routes/automations.routes.js";
import { registerCampaignRoutes } from "./routes/campaigns.routes.js";
import { registerCommissionRoutes } from "./routes/commissions.routes.js";
import { registerCommunicationRoutes } from "./routes/communications.routes.js";
import { registerComplianceRoutes } from "./routes/compliance.routes.js";
import { registerContractRoutes } from "./routes/contracts.routes.js";
import { registerCustomerRoutes } from "./routes/customers.routes.js";
import { registerDispatchRoutes } from "./routes/dispatch.routes.js";
import { registerFileRoutes } from "./routes/files.routes.js";
import { registerFinanceRoutes } from "./routes/finance.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerInventoryRoutes } from "./routes/inventory.routes.js";
import { registerJobRoutes } from "./routes/jobs.routes.js";
import { registerCommercialAgendaRoutes } from "./routes/commercial-agenda.routes.js";
import { registerCommercialInteractionRoutes } from "./routes/commercial-interactions.routes.js";
import { registerCommercialKanbanRoutes } from "./routes/commercial-kanban.routes.js";
import { registerLeadRoutes } from "./routes/leads.routes.js";
import { registerListingRoutes } from "./routes/listings.routes.js";
import { registerNotificationRoutes } from "./routes/notifications.routes.js";
import { registerOcrRoutes } from "./routes/ocr.routes.js";
import { registerOpsRoutes } from "./routes/ops.routes.js";
import { registerPurchaseRoutes } from "./routes/purchases.routes.js";
import { registerRepasseRoutes } from "./routes/repasse.routes.js";
import { registerSaleRoutes } from "./routes/sales.routes.js";
import { registerSecurityHoneypotRoutes } from "./routes/security-honeypot.routes.js";
import { registerServiceRoutes } from "./routes/services.routes.js";
import { registerSettingRoutes } from "./routes/settings.routes.js";
import { registerUserRoutes } from "./routes/users.routes.js";
import { registerTechnicalDeliveryRoutes } from "./routes/technical-deliveries.routes.js";
import { registerWebhookRoutes } from "./routes/webhooks.routes.js";
import { registerRateLimit } from "./security/rate-limit.js";

function apiBodyLimitBytes() {
  const value = Number(process.env.API_BODY_LIMIT_BYTES);
  return Number.isInteger(value) && value > 0 ? value : 256 * 1024;
}

export function buildApp() {
  const app = Fastify({
    bodyLimit: apiBodyLimitBytes(),
    logger: {
      level: process.env.LOG_LEVEL || "info"
    }
  });

  app.register(helmet);
  app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  app.setErrorHandler(apiErrorHandler);
  registerRateLimit(app);
  app.register(registerSecurityHoneypotRoutes);
  app.register(registerHealthRoutes, { prefix: "/health" });
  app.register(registerAuthRoutes, { prefix: "/auth" });
  app.register(registerAiRoutes, { prefix: "/ai" });
  app.register(registerAnalyticsRoutes, { prefix: "/analytics" });
  app.register(registerAuditRoutes, { prefix: "/audit" });
  app.register(registerAutomationRoutes, { prefix: "/automations" });
  app.register(registerCustomerRoutes, { prefix: "/customers" });
  app.register(registerLeadRoutes, { prefix: "/leads" });
  app.register(registerCommercialKanbanRoutes, { prefix: "/commercial-kanban" });
  app.register(registerCommercialAgendaRoutes, { prefix: "/commercial-agenda" });
  app.register(registerCommercialInteractionRoutes, { prefix: "/commercial-interactions" });
  app.register(registerAppointmentRoutes, { prefix: "/appointments" });
  app.register(registerCampaignRoutes, { prefix: "/campaigns" });
  app.register(registerCommunicationRoutes, { prefix: "/communications" });
  app.register(registerComplianceRoutes, { prefix: "/compliance" });
  app.register(registerInventoryRoutes, { prefix: "/inventory" });
  app.register(registerSaleRoutes, { prefix: "/sales" });
  app.register(registerFinanceRoutes, { prefix: "/finance" });
  app.register(registerCommissionRoutes, { prefix: "/commissions" });
  app.register(registerContractRoutes, { prefix: "/contracts" });
  app.register(registerDispatchRoutes, { prefix: "/dispatch" });
  app.register(registerListingRoutes, { prefix: "/listings" });
  app.register(registerNotificationRoutes, { prefix: "/notifications" });
  app.register(registerOcrRoutes, { prefix: "/ocr" });
  app.register(registerPurchaseRoutes, { prefix: "/purchases" });
  app.register(registerRepasseRoutes, { prefix: "/repasse" });
  app.register(registerServiceRoutes, { prefix: "/services" });
  app.register(registerSettingRoutes, { prefix: "/settings" });
  app.register(registerTechnicalDeliveryRoutes, { prefix: "/technical-deliveries" });
  app.register(registerUserRoutes, { prefix: "/users" });
  app.register(registerFileRoutes, { prefix: "/files" });
  app.register(registerJobRoutes, { prefix: "/jobs" });
  app.register(registerWebhookRoutes, { prefix: "/webhooks" });
  app.register(registerOpsRoutes, { prefix: "/ops" });

  return app;
}
