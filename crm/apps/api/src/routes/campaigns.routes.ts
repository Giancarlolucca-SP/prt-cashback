import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const campaignStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);

const campaignsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: campaignStatusSchema.optional(),
  channel: z.string().trim().max(80).optional(),
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(160),
  channel: z.string().trim().min(2).max(80),
  status: campaignStatusSchema.default("ACTIVE"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

const updateCampaignSchema = createCampaignSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const campaignParamsSchema = z.object({ id: z.string().uuid() });

const campaignStatusUpdateSchema = z.object({
  status: campaignStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const campaignCostSchema = z.object({
  amount: z.number().positive(),
  occurredAt: z.coerce.date().optional(),
});

const campaignResultSchema = z.object({
  resultDate: z.coerce.date(),
  data: z.record(z.unknown()),
});

type CampaignRecord = {
  id: string;
  name: string;
  channel: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeCampaign(campaign: CampaignRecord) {
  return {
    id: campaign.id,
    name: campaign.name,
    channel: campaign.channel,
    status: campaign.status,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function numberFromResult(data: unknown, key: string) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function getCampaignOrThrow(storeId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!campaign) throw new ApiError("NOT_FOUND", "Campanha nao encontrada.");
  return campaign;
}

export async function registerCampaignRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = campaignsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.campaign.count({ where }),
    ]);

    return listResponse(items.map(sanitizeCampaign), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const campaign = await getCampaignOrThrow(session.user.storeId, params.id);
    const [costs, results] = await Promise.all([
      prisma.campaignCost.findMany({ where: { storeId: session.user.storeId, campaignId: campaign.id }, orderBy: { occurredAt: "desc" } }),
      prisma.campaignResult.findMany({ where: { storeId: session.user.storeId, campaignId: campaign.id }, orderBy: { resultDate: "desc" } }),
    ]);

    return {
      data: sanitizeCampaign(campaign),
      costs: costs.map((cost) => ({
        id: cost.id,
        amount: cost.amount.toString(),
        occurredAt: cost.occurredAt.toISOString(),
        createdAt: cost.createdAt.toISOString(),
      })),
      results: results.map((result) => ({
        id: result.id,
        resultDate: result.resultDate.toISOString(),
        data: result.data,
        createdAt: result.createdAt.toISOString(),
      })),
    };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = createCampaignSchema.parse(request.body);
    if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
      throw new ApiError("VALIDATION_ERROR", "Data final nao pode ser anterior a data inicial.");
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          storeId: session.user.storeId,
          name: input.name,
          channel: input.channel,
          status: input.status,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "campaign_created",
          entityType: "campaign",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { channel: created.channel, status: created.status },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "campaign.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "campaign",
      entityId: campaign.id,
      payload: { channel: campaign.channel, status: campaign.status },
    });

    return reply.code(201).send({ data: sanitizeCampaign(campaign) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const input = updateCampaignSchema.parse(request.body);
    const current = await getCampaignOrThrow(session.user.storeId, params.id);
    const startsAt = input.startsAt ?? current.startsAt ?? undefined;
    const endsAt = input.endsAt ?? current.endsAt ?? undefined;
    if (startsAt && endsAt && endsAt < startsAt) {
      throw new ApiError("VALIDATION_ERROR", "Data final nao pode ser anterior a data inicial.");
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({ where: { id: current.id }, data: input });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "campaign_updated",
          entityType: "campaign",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });
      return updated;
    });

    return { data: sanitizeCampaign(campaign) };
  });

  app.post("/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const input = campaignStatusUpdateSchema.parse(request.body);
    const current = await getCampaignOrThrow(session.user.storeId, params.id);

    const campaign = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({
        where: { id: current.id },
        data: { status: input.status, deletedAt: input.status === "ARCHIVED" ? new Date() : null },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "campaign_status_changed",
          entityType: "campaign",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: updated.status, reason: input.reason },
        },
      });
      return updated;
    });

    await emitInternalEvent({
      name: "campaign.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "campaign",
      entityId: campaign.id,
      payload: { fromStatus: current.status, toStatus: campaign.status, reason: input.reason },
    });

    return { data: sanitizeCampaign(campaign) };
  });

  app.post("/:id/costs", async (request, reply) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const input = campaignCostSchema.parse(request.body);
    const campaign = await getCampaignOrThrow(session.user.storeId, params.id);
    const cost = await prisma.campaignCost.create({
      data: {
        storeId: session.user.storeId,
        campaignId: campaign.id,
        amount: input.amount,
        occurredAt: input.occurredAt,
      },
    });

    await emitInternalEvent({
      name: "campaign.cost_added",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "campaign",
      entityId: campaign.id,
      payload: { costId: cost.id, amount: cost.amount.toString() },
    });

    return reply.code(201).send({
      data: {
        id: cost.id,
        campaignId: cost.campaignId,
        amount: cost.amount.toString(),
        occurredAt: cost.occurredAt.toISOString(),
        createdAt: cost.createdAt.toISOString(),
      },
    });
  });

  app.post("/:id/results", async (request, reply) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const input = campaignResultSchema.parse(request.body);
    const campaign = await getCampaignOrThrow(session.user.storeId, params.id);
    const result = await prisma.campaignResult.upsert({
      where: { campaignId_resultDate: { campaignId: campaign.id, resultDate: input.resultDate } },
      update: { data: input.data as Prisma.InputJsonObject },
      create: {
        storeId: session.user.storeId,
        campaignId: campaign.id,
        resultDate: input.resultDate,
        data: input.data as Prisma.InputJsonObject,
      },
    });

    await emitInternalEvent({
      name: "campaign.result_recorded",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "campaign",
      entityId: campaign.id,
      payload: { resultId: result.id, resultDate: result.resultDate.toISOString() },
    });

    return reply.code(201).send({
      data: {
        id: result.id,
        campaignId: result.campaignId,
        resultDate: result.resultDate.toISOString(),
        data: result.data,
        createdAt: result.createdAt.toISOString(),
      },
    });
  });

  app.get("/:id/summary", async (request) => {
    const session = await requirePermission(request, { module: "ads", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = campaignParamsSchema.parse(request.params);
    const campaign = await getCampaignOrThrow(session.user.storeId, params.id);
    const [costs, results] = await Promise.all([
      prisma.campaignCost.findMany({ where: { storeId: session.user.storeId, campaignId: campaign.id }, select: { amount: true } }),
      prisma.campaignResult.findMany({ where: { storeId: session.user.storeId, campaignId: campaign.id }, select: { data: true } }),
    ]);
    const totalCost = costs.reduce((sum, cost) => sum + Number(cost.amount.toString()), 0);
    const totals = results.reduce(
      (acc, result) => ({
        impressions: acc.impressions + numberFromResult(result.data, "impressions"),
        clicks: acc.clicks + numberFromResult(result.data, "clicks"),
        leads: acc.leads + numberFromResult(result.data, "leads"),
        sales: acc.sales + numberFromResult(result.data, "sales"),
      }),
      { impressions: 0, clicks: 0, leads: 0, sales: 0 },
    );

    return {
      data: sanitizeCampaign(campaign),
      summary: {
        totalCost: totalCost.toFixed(2),
        impressions: totals.impressions,
        clicks: totals.clicks,
        leads: totals.leads,
        sales: totals.sales,
        costPerLead: totals.leads > 0 ? (totalCost / totals.leads).toFixed(2) : null,
        costPerSale: totals.sales > 0 ? (totalCost / totals.sales).toFixed(2) : null,
        ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions).toFixed(4) : null,
      },
    };
  });
}
