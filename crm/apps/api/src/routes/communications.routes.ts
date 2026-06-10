import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const recordStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const messageDirectionSchema = z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]);

const channelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  type: z.string().trim().max(60).optional(),
  status: recordStatusSchema.optional(),
});

const channelSchema = z.object({
  type: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(120),
  settings: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const whatsappSchema = z.object({
  name: z.string().trim().min(2).max(120),
  instanceKey: z.string().trim().min(2).max(120),
  settings: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const emailAccountSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
  settings: z.record(z.unknown()).optional(),
  status: recordStatusSchema.default("ACTIVE"),
});

const threadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().trim().max(60).optional(),
  customer_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
});

const threadSchema = z.object({
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  subject: z.string().trim().max(180).optional(),
  status: z.string().trim().min(2).max(60).default("OPEN"),
});

const threadParamsSchema = z.object({ id: z.string().uuid() });

const messageSchema = z.object({
  direction: messageDirectionSchema,
  sender: z.string().trim().max(160).optional(),
  recipient: z.string().trim().max(160).optional(),
  body: z
    .string()
    .trim()
    .max(8000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Mensagem") })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  sentAt: z.coerce.date().optional(),
  receivedAt: z.coerce.date().optional(),
});

const emailMessageSchema = z.object({
  threadId: z.string().uuid().optional(),
  direction: messageDirectionSchema,
  subject: z.string().trim().max(180).optional(),
  fromAddress: z.string().email().optional(),
  toAddresses: z.array(z.string().email()).default([]),
  body: z
    .string()
    .trim()
    .max(16000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("E-mail") })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

const preferenceSchema = z.object({
  customerId: z.string().uuid().optional(),
  channel: z.string().trim().min(2).max(60),
  allowed: z.boolean().default(true),
});

type ThreadRecord = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  channelId: string | null;
  subject: string | null;
  status: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeThread(thread: ThreadRecord) {
  return {
    id: thread.id,
    customerId: thread.customerId,
    leadId: thread.leadId,
    channelId: thread.channelId,
    subject: thread.subject,
    status: thread.status,
    lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

async function ensureCustomer(storeId: string, customerId?: string | null) {
  if (!customerId) return;
  const customer = await prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null }, select: { id: true } });
  if (!customer) throw new ApiError("NOT_FOUND", "Cliente da comunicacao nao encontrado.");
}

async function ensureLead(storeId: string, leadId?: string | null) {
  if (!leadId) return;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, storeId, deletedAt: null }, select: { id: true } });
  if (!lead) throw new ApiError("NOT_FOUND", "Lead da comunicacao nao encontrado.");
}

async function ensureChannel(storeId: string, channelId?: string | null) {
  if (!channelId) return;
  const channel = await prisma.communicationChannel.findFirst({ where: { id: channelId, storeId, deletedAt: null, status: "ACTIVE" }, select: { id: true } });
  if (!channel) throw new ApiError("NOT_FOUND", "Canal de comunicacao nao encontrado.");
}

async function getThreadOrThrow(storeId: string, id: string) {
  const thread = await prisma.messageThread.findFirst({ where: { id, storeId } });
  if (!thread) throw new ApiError("NOT_FOUND", "Conversa nao encontrada.");
  return thread;
}

export async function registerCommunicationRoutes(app: FastifyInstance) {
  app.get("/channels", async (request) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = channelsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.communicationChannel.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.communicationChannel.count({ where }),
    ]);
    return listResponse(
      items.map((channel) => ({ ...channel, createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() })),
      query,
      total,
    );
  });

  app.post("/channels", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = channelSchema.parse(request.body);
    const channel = await prisma.communicationChannel.upsert({
      where: { storeId_type_name: { storeId: session.user.storeId, type: input.type, name: input.name } },
      update: { settings: input.settings as Prisma.InputJsonObject | undefined, status: input.status },
      create: {
        storeId: session.user.storeId,
        type: input.type,
        name: input.name,
        settings: input.settings as Prisma.InputJsonObject | undefined,
        status: input.status,
      },
    });
    return reply.code(201).send({ data: { ...channel, createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() } });
  });

  app.post("/whatsapp-instances", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = whatsappSchema.parse(request.body);
    const instance = await prisma.whatsappInstance.upsert({
      where: { storeId_instanceKey: { storeId: session.user.storeId, instanceKey: input.instanceKey } },
      update: { name: input.name, settings: input.settings as Prisma.InputJsonObject | undefined, status: input.status },
      create: { storeId: session.user.storeId, ...input, settings: input.settings as Prisma.InputJsonObject | undefined },
    });
    return reply.code(201).send({ data: { ...instance, createdAt: instance.createdAt.toISOString(), updatedAt: instance.updatedAt.toISOString() } });
  });

  app.post("/email-accounts", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = emailAccountSchema.parse(request.body);
    const account = await prisma.emailAccount.upsert({
      where: { storeId_email: { storeId: session.user.storeId, email: input.email } },
      update: { name: input.name, settings: input.settings as Prisma.InputJsonObject | undefined, status: input.status },
      create: { storeId: session.user.storeId, ...input, settings: input.settings as Prisma.InputJsonObject | undefined },
    });
    return reply.code(201).send({ data: { ...account, createdAt: account.createdAt.toISOString(), updatedAt: account.updatedAt.toISOString() } });
  });

  app.get("/threads", async (request) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = threadsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.lead_id ? { leadId: query.lead_id } : {}),
      ...(query.channel_id ? { channelId: query.channel_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.messageThread.findMany({ where, orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }], skip, take }),
      prisma.messageThread.count({ where }),
    ]);
    return listResponse(items.map(sanitizeThread), query, total);
  });

  app.get("/threads/:id", async (request) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = threadParamsSchema.parse(request.params);
    const thread = await getThreadOrThrow(session.user.storeId, params.id);
    const [messages, emails] = await Promise.all([
      prisma.message.findMany({ where: { storeId: session.user.storeId, threadId: thread.id }, orderBy: { createdAt: "asc" } }),
      prisma.emailMessage.findMany({ where: { storeId: session.user.storeId, threadId: thread.id }, orderBy: { createdAt: "asc" } }),
    ]);
    return {
      data: sanitizeThread(thread),
      messages: messages.map((message) => ({
        ...message,
        sentAt: message.sentAt?.toISOString() ?? null,
        receivedAt: message.receivedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
      emails: emails.map((email) => ({ ...email, createdAt: email.createdAt.toISOString() })),
    };
  });

  app.post("/threads", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = threadSchema.parse(request.body);
    await ensureCustomer(session.user.storeId, input.customerId);
    await ensureLead(session.user.storeId, input.leadId);
    await ensureChannel(session.user.storeId, input.channelId);
    const thread = await prisma.$transaction(async (tx) => {
      const created = await tx.messageThread.create({ data: { storeId: session.user.storeId, ...input } });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "communications",
          action: "thread_created",
          entityType: "message_thread",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { customerId: created.customerId, leadId: created.leadId, channelId: created.channelId },
        },
      });
      return created;
    });
    await emitInternalEvent({
      name: "communication.thread_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "message_thread",
      entityId: thread.id,
      payload: { customerId: thread.customerId, leadId: thread.leadId, channelId: thread.channelId },
    });
    return reply.code(201).send({ data: sanitizeThread(thread) });
  });

  app.post("/threads/:id/messages", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = threadParamsSchema.parse(request.params);
    const input = messageSchema.parse(request.body);
    const thread = await getThreadOrThrow(session.user.storeId, params.id);
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          storeId: session.user.storeId,
          threadId: thread.id,
          direction: input.direction,
          sender: input.sender,
          recipient: input.recipient,
          body: input.body,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
          sentAt: input.sentAt,
          receivedAt: input.receivedAt,
        },
      });
      await tx.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: input.sentAt ?? input.receivedAt ?? created.createdAt } });
      return created;
    });
    await emitInternalEvent({
      name: input.direction === "INBOUND" ? "communication.message_received" : "communication.message_sent",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "message",
      entityId: message.id,
      payload: { threadId: thread.id, direction: message.direction },
    });
    return reply.code(201).send({
      data: {
        ...message,
        sentAt: message.sentAt?.toISOString() ?? null,
        receivedAt: message.receivedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      },
    });
  });

  app.post("/emails", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = emailMessageSchema.parse(request.body);
    if (input.threadId) await getThreadOrThrow(session.user.storeId, input.threadId);
    const email = await prisma.emailMessage.create({
      data: {
        storeId: session.user.storeId,
        threadId: input.threadId,
        direction: input.direction,
        subject: input.subject,
        fromAddress: input.fromAddress,
        toAddresses: input.toAddresses,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });
    await emitInternalEvent({
      name: input.direction === "INBOUND" ? "communication.email_received" : "communication.email_sent",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "email_message",
      entityId: email.id,
      payload: { threadId: email.threadId, direction: email.direction },
    });
    return reply.code(201).send({ data: { ...email, createdAt: email.createdAt.toISOString() } });
  });

  app.post("/preferences", async (request, reply) => {
    const session = await requirePermission(request, { module: "communications", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = preferenceSchema.parse(request.body);
    await ensureCustomer(session.user.storeId, input.customerId);
    const existing = await prisma.channelPreference.findFirst({
      where: { storeId: session.user.storeId, customerId: input.customerId, channel: input.channel },
      select: { id: true },
    });
    const preference = existing
      ? await prisma.channelPreference.update({ where: { id: existing.id }, data: { allowed: input.allowed } })
      : await prisma.channelPreference.create({
          data: { storeId: session.user.storeId, customerId: input.customerId, channel: input.channel, allowed: input.allowed },
        });
    return reply.code(201).send({ data: { ...preference, createdAt: preference.createdAt.toISOString(), updatedAt: preference.updatedAt.toISOString() } });
  });
}
