import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const recordStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const keyParamsSchema = z.object({ key: z.string().trim().min(2).max(120) });

const storeSettingSchema = z.object({
  value: z.record(z.unknown()),
});

const taxSettingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  taxRegime: z.string().trim().max(80).optional(),
  profitTaxRate: z.number().nonnegative().max(1).optional(),
  snapshot: z.record(z.unknown()).optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
});

const accountantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  document: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const businessHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  closesAt: z.string().trim().regex(/^\d{2}:\d{2}$/).optional(),
  isClosed: z.boolean().default(false),
});

const holidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().trim().min(2).max(120),
  isRecurring: z.boolean().default(false),
});

const deadlineSchema = z.object({
  module: z.string().trim().min(2).max(80),
  action: z.string().trim().min(2).max(80),
  hours: z.number().int().positive().max(24 * 365),
});

const categorySchema = z.object({
  domain: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  metadata: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const documentTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  module: z.string().trim().min(2).max(80),
  content: z
    .string()
    .trim()
    .min(2)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Template de documento") }),
  snapshot: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const messageTemplateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  channel: z.string().trim().min(2).max(80),
  content: z
    .string()
    .trim()
    .min(2)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Template de mensagem") }),
  variables: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const operationalParameterSchema = z.object({
  key: z.string().trim().min(2).max(120),
  value: z.record(z.unknown()),
  snapshot: z.record(z.unknown()).optional(),
});

const birthdayNotificationParameterKey = "customer_birthday_notifications";

const birthdayNotificationSchema = z.object({
  daysBefore: z.number().int().min(0).max(31).default(7),
  enabled: z.boolean().default(true),
  responsibleUserId: z.string().uuid().nullable().optional(),
  channel: z.string().trim().min(2).max(40).default("WHATSAPP"),
});

async function settingsSession(request: FastifyRequest) {
  return requirePermission(request, {
    module: "settings",
    action: "manage",
    scope: "ALL",
    sensitiveArea: "technical",
  });
}

async function emitSettingChanged(input: { storeId: string; actorId: string; entityType: string; entityId: string; key?: string }) {
  await emitInternalEvent({
    name: "settings.changed",
    storeId: input.storeId,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: { key: input.key },
  });
}

function sanitizeBirthdayNotificationSetting(parameter: {
  id: string;
  key: string;
  value: unknown;
  snapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
} | null, responsibleUser?: { id: string; name: string; email: string; role: string } | null) {
  const parsed = birthdayNotificationSchema.safeParse(parameter?.value ?? {});
  const value = parsed.success ? parsed.data : birthdayNotificationSchema.parse({});

  return {
    id: parameter?.id ?? null,
    key: birthdayNotificationParameterKey,
    value,
    responsibleUser: responsibleUser ?? null,
    createdAt: parameter?.createdAt.toISOString() ?? null,
    updatedAt: parameter?.updatedAt.toISOString() ?? null,
  };
}

export async function registerSettingRoutes(app: FastifyInstance) {
  app.get("/summary", async (request) => {
    const session = await settingsSession(request);
    const [
      storeSettings,
      taxSettings,
      accountantSettings,
      businessHours,
      holidays,
      deadlines,
      categories,
      documentTemplates,
      messageTemplates,
      operationalParameters,
    ] = await Promise.all([
      prisma.storeSetting.findMany({ where: { storeId: session.user.storeId }, orderBy: { key: "asc" } }),
      prisma.storeTaxSetting.findMany({ where: { storeId: session.user.storeId }, orderBy: { validFrom: "desc" }, take: 10 }),
      prisma.accountantSetting.findMany({ where: { storeId: session.user.storeId }, orderBy: { updatedAt: "desc" }, take: 5 }),
      prisma.businessHour.findMany({ where: { storeId: session.user.storeId }, orderBy: { weekday: "asc" } }),
      prisma.storeHoliday.findMany({ where: { storeId: session.user.storeId }, orderBy: { date: "asc" }, take: 30 }),
      prisma.operationalDeadline.findMany({ where: { storeId: session.user.storeId }, orderBy: [{ module: "asc" }, { action: "asc" }] }),
      prisma.configurableCategory.findMany({ where: { storeId: session.user.storeId, deletedAt: null }, orderBy: [{ domain: "asc" }, { name: "asc" }] }),
      prisma.documentTemplate.findMany({ where: { storeId: session.user.storeId, deletedAt: null }, orderBy: [{ module: "asc" }, { name: "asc" }, { version: "desc" }] }),
      prisma.messageTemplate.findMany({ where: { storeId: session.user.storeId, deletedAt: null }, orderBy: [{ channel: "asc" }, { name: "asc" }, { version: "desc" }] }),
      prisma.operationalParameter.findMany({ where: { storeId: session.user.storeId }, orderBy: { key: "asc" } }),
    ]);

    return {
      storeSettings,
      taxSettings,
      accountantSettings,
      businessHours,
      holidays,
      deadlines,
      categories,
      documentTemplates,
      messageTemplates,
      operationalParameters,
    };
  });

  app.put("/store-settings/:key", async (request, reply) => {
    const session = await settingsSession(request);
    const params = keyParamsSchema.parse(request.params);
    const input = storeSettingSchema.parse(request.body);
    const setting = await prisma.storeSetting.upsert({
      where: { storeId_key: { storeId: session.user.storeId, key: params.key } },
      update: { value: input.value as Prisma.InputJsonObject },
      create: { storeId: session.user.storeId, key: params.key, value: input.value as Prisma.InputJsonObject },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "store_setting", entityId: setting.id, key: setting.key });
    return reply.code(201).send({ data: setting });
  });

  app.get("/customer-birthday-notifications", async (request) => {
    const session = await settingsSession(request);
    const parameter = await prisma.operationalParameter.findUnique({
      where: { storeId_key: { storeId: session.user.storeId, key: birthdayNotificationParameterKey } },
    });
    const parsed = birthdayNotificationSchema.safeParse(parameter?.value ?? {});
    const responsibleUserId = parsed.success ? parsed.data.responsibleUserId : null;
    const responsibleUser = responsibleUserId
      ? await prisma.user.findFirst({
          where: { id: responsibleUserId, storeId: session.user.storeId, isActive: true, deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
        })
      : null;

    return { data: sanitizeBirthdayNotificationSetting(parameter, responsibleUser) };
  });

  app.put("/customer-birthday-notifications", async (request, reply) => {
    const session = await settingsSession(request);
    const input = birthdayNotificationSchema.parse(request.body);

    if (input.responsibleUserId) {
      const responsibleUser = await prisma.user.findFirst({
        where: { id: input.responsibleUserId, storeId: session.user.storeId, isActive: true, deletedAt: null },
        select: { id: true },
      });

      if (!responsibleUser) {
        throw new ApiError("NOT_FOUND", "Responsavel por aniversarios nao encontrado.");
      }
    }

    const parameter = await prisma.operationalParameter.upsert({
      where: { storeId_key: { storeId: session.user.storeId, key: birthdayNotificationParameterKey } },
      update: {
        value: input as Prisma.InputJsonObject,
        snapshot: { source: "customer_birthday_notifications" },
      },
      create: {
        storeId: session.user.storeId,
        key: birthdayNotificationParameterKey,
        value: input as Prisma.InputJsonObject,
        snapshot: { source: "customer_birthday_notifications" },
      },
    });
    const responsibleUser = input.responsibleUserId
      ? await prisma.user.findFirst({
          where: { id: input.responsibleUserId, storeId: session.user.storeId, isActive: true, deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
        })
      : null;

    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "operational_parameter", entityId: parameter.id, key: parameter.key });

    return reply.code(201).send({ data: sanitizeBirthdayNotificationSetting(parameter, responsibleUser) });
  });

  app.post("/tax-settings", async (request, reply) => {
    const session = await settingsSession(request);
    const input = taxSettingSchema.parse(request.body);
    const setting = await prisma.storeTaxSetting.create({
      data: {
        storeId: session.user.storeId,
        name: input.name,
        taxRegime: input.taxRegime,
        profitTaxRate: input.profitTaxRate,
        snapshot: input.snapshot as Prisma.InputJsonObject | undefined,
        validFrom: input.validFrom,
        validTo: input.validTo,
      },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "store_tax_setting", entityId: setting.id });
    return reply.code(201).send({ data: { ...setting, profitTaxRate: setting.profitTaxRate?.toString() ?? null } });
  });

  app.post("/accountants", async (request, reply) => {
    const session = await settingsSession(request);
    const input = accountantSchema.parse(request.body);
    const accountant = await prisma.accountantSetting.create({ data: { storeId: session.user.storeId, ...input } });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "accountant_setting", entityId: accountant.id });
    return reply.code(201).send({ data: accountant });
  });

  app.post("/business-hours", async (request, reply) => {
    const session = await settingsSession(request);
    const input = businessHourSchema.parse(request.body);
    const hour = await prisma.businessHour.upsert({
      where: { storeId_weekday: { storeId: session.user.storeId, weekday: input.weekday } },
      update: { opensAt: input.opensAt, closesAt: input.closesAt, isClosed: input.isClosed },
      create: { storeId: session.user.storeId, ...input },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "business_hour", entityId: hour.id, key: String(hour.weekday) });
    return reply.code(201).send({ data: hour });
  });

  app.post("/holidays", async (request, reply) => {
    const session = await settingsSession(request);
    const input = holidaySchema.parse(request.body);
    const holiday = await prisma.storeHoliday.create({ data: { storeId: session.user.storeId, ...input } });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "store_holiday", entityId: holiday.id });
    return reply.code(201).send({ data: holiday });
  });

  app.post("/deadlines", async (request, reply) => {
    const session = await settingsSession(request);
    const input = deadlineSchema.parse(request.body);
    const deadline = await prisma.operationalDeadline.upsert({
      where: { storeId_module_action: { storeId: session.user.storeId, module: input.module, action: input.action } },
      update: { hours: input.hours },
      create: { storeId: session.user.storeId, ...input },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "operational_deadline", entityId: deadline.id, key: `${deadline.module}:${deadline.action}` });
    return reply.code(201).send({ data: deadline });
  });

  app.post("/categories", async (request, reply) => {
    const session = await settingsSession(request);
    const input = categorySchema.parse(request.body);
    const category = await prisma.configurableCategory.upsert({
      where: { storeId_domain_name: { storeId: session.user.storeId, domain: input.domain, name: input.name } },
      update: { metadata: input.metadata as Prisma.InputJsonObject | undefined, status: input.status, deletedAt: null },
      create: { storeId: session.user.storeId, ...input, metadata: input.metadata as Prisma.InputJsonObject | undefined },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "configurable_category", entityId: category.id, key: `${category.domain}:${category.name}` });
    return reply.code(201).send({ data: category });
  });

  app.post("/document-templates", async (request, reply) => {
    const session = await settingsSession(request);
    const input = documentTemplateSchema.parse(request.body);
    const currentVersion = await prisma.documentTemplate.count({ where: { storeId: session.user.storeId, name: input.name } });
    const template = await prisma.documentTemplate.create({
      data: { storeId: session.user.storeId, ...input, version: currentVersion + 1, snapshot: input.snapshot as Prisma.InputJsonObject | undefined },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "document_template", entityId: template.id, key: template.name });
    return reply.code(201).send({ data: template });
  });

  app.post("/message-templates", async (request, reply) => {
    const session = await settingsSession(request);
    const input = messageTemplateSchema.parse(request.body);
    const currentVersion = await prisma.messageTemplate.count({ where: { storeId: session.user.storeId, name: input.name } });
    const template = await prisma.messageTemplate.create({
      data: { storeId: session.user.storeId, ...input, version: currentVersion + 1, variables: input.variables as Prisma.InputJsonObject | undefined },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "message_template", entityId: template.id, key: template.name });
    return reply.code(201).send({ data: template });
  });

  app.put("/operational-parameters/:key", async (request, reply) => {
    const session = await settingsSession(request);
    const params = keyParamsSchema.parse(request.params);
    const input = operationalParameterSchema.omit({ key: true }).parse(request.body);
    const parameter = await prisma.operationalParameter.upsert({
      where: { storeId_key: { storeId: session.user.storeId, key: params.key } },
      update: { value: input.value as Prisma.InputJsonObject, snapshot: input.snapshot as Prisma.InputJsonObject | undefined },
      create: { storeId: session.user.storeId, key: params.key, value: input.value as Prisma.InputJsonObject, snapshot: input.snapshot as Prisma.InputJsonObject | undefined },
    });
    await emitSettingChanged({ storeId: session.user.storeId, actorId: session.user.id, entityType: "operational_parameter", entityId: parameter.id, key: parameter.key });
    return reply.code(201).send({ data: parameter });
  });
}
