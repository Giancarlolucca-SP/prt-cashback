import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const listingStatusSchema = z.enum(["DRAFT", "PENDING", "PUBLISHED", "PAUSED", "SOLD", "ERROR"]);

const listingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: listingStatusSchema.optional(),
  vehicle_id: z.string().uuid().optional(),
});

const createListingSchema = z.object({
  vehicleId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  description: z
    .string()
    .trim()
    .max(4000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Descricao do anuncio") })
    .optional(),
  askingPrice: z.number().nonnegative().optional(),
  status: listingStatusSchema.default("DRAFT"),
});

const updateListingSchema = createListingSchema
  .omit({ vehicleId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const listingParamsSchema = z.object({
  id: z.string().uuid(),
});

const upsertChannelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.string().trim().min(2).max(80),
  settings: z.record(z.unknown()).optional(),
});

const publishListingSchema = z.object({
  channelId: z.string().uuid(),
  externalId: z.string().trim().max(120).optional(),
  status: listingStatusSchema.default("PUBLISHED"),
  metadata: z.record(z.unknown()).optional(),
});

const listingStatusUpdateSchema = z.object({
  status: listingStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

const metricSchema = z.object({
  channelId: z.string().uuid(),
  metricDate: z.coerce.date(),
  views: z.number().int().min(0).default(0),
  leads: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  costPerLead: z.number().nonnegative().optional(),
  score: z.number().nonnegative().optional(),
});

type ListingRecord = {
  id: string;
  vehicleId: string;
  title: string;
  description: string | null;
  askingPrice: { toString(): string } | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeListing(listing: ListingRecord) {
  return {
    id: listing.id,
    vehicleId: listing.vehicleId,
    title: listing.title,
    description: listing.description,
    askingPrice: listing.askingPrice?.toString() ?? null,
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

async function ensureVehicleInStore(storeId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!vehicle) {
    throw new ApiError("NOT_FOUND", "Veiculo do anuncio nao encontrado.");
  }
}

async function getListingOrThrow(storeId: string, id: string) {
  const listing = await prisma.listing.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!listing) {
    throw new ApiError("NOT_FOUND", "Anuncio nao encontrado.");
  }

  return listing;
}

async function getChannelOrThrow(storeId: string, id: string) {
  const channel = await prisma.listingChannel.findFirst({
    where: { id, storeId, deletedAt: null, status: "ACTIVE" },
  });

  if (!channel) {
    throw new ApiError("NOT_FOUND", "Canal de anuncio nao encontrado.");
  }

  return channel;
}

export async function registerListingRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = listingsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.listing.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.listing.count({ where }),
    ]);

    return listResponse(items.map(sanitizeListing), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = listingParamsSchema.parse(request.params);
    const listing = await getListingOrThrow(session.user.storeId, params.id);
    const publications = await prisma.listingPublication.findMany({
      where: { storeId: session.user.storeId, listingId: listing.id },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: sanitizeListing(listing),
      publications: publications.map((publication) => ({
        id: publication.id,
        channelId: publication.channelId,
        externalId: publication.externalId,
        status: publication.status,
        publishedAt: publication.publishedAt?.toISOString() ?? null,
        unpublishedAt: publication.unpublishedAt?.toISOString() ?? null,
        metadata: publication.metadata,
      })),
    };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createListingSchema.parse(request.body);
    await ensureVehicleInStore(session.user.storeId, input.vehicleId);

    const listing = await prisma.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          storeId: session.user.storeId,
          vehicleId: input.vehicleId,
          title: input.title,
          description: input.description,
          askingPrice: input.askingPrice,
          status: input.status,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "listing_created",
          entityType: "listing",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            vehicleId: created.vehicleId,
            status: created.status,
            askingPrice: created.askingPrice?.toString() ?? null,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "listing.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "listing",
      entityId: listing.id,
      payload: { vehicleId: listing.vehicleId, status: listing.status },
    });

    return reply.code(201).send({ data: sanitizeListing(listing) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = listingParamsSchema.parse(request.params);
    const input = updateListingSchema.parse(request.body);
    const current = await getListingOrThrow(session.user.storeId, params.id);

    const listing = await prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id: current.id },
        data: input,
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "listing_updated",
          entityType: "listing",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });

      return updated;
    });

    return { data: sanitizeListing(listing) };
  });

  app.post("/:id/status", async (request) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = listingParamsSchema.parse(request.params);
    const input = listingStatusUpdateSchema.parse(request.body);
    const current = await getListingOrThrow(session.user.storeId, params.id);

    const listing = await prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id: current.id },
        data: { status: input.status, deletedAt: input.status === "SOLD" ? new Date() : null },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "listing_status_changed",
          entityType: "listing",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: input.status, reason: input.reason },
        },
      });

      return updated;
    });

    if (input.status === "SOLD") {
      await emitInternalEvent({
        name: "listing.sold",
        storeId: session.user.storeId,
        actorId: session.user.id,
        entityType: "listing",
        entityId: listing.id,
        payload: { vehicleId: listing.vehicleId, reason: input.reason },
      });
    }

    return { data: sanitizeListing(listing) };
  });

  app.post("/channels", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = upsertChannelSchema.parse(request.body);

    const channel = await prisma.listingChannel.upsert({
      where: { storeId_name: { storeId: session.user.storeId, name: input.name } },
      update: { type: input.type, settings: input.settings as Prisma.InputJsonObject | undefined, status: "ACTIVE" },
      create: {
        storeId: session.user.storeId,
        name: input.name,
        type: input.type,
        settings: input.settings as Prisma.InputJsonObject | undefined,
      },
    });

    return reply.code(201).send({
      data: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        settings: channel.settings,
        status: channel.status,
      },
    });
  });

  app.post("/:id/publications", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = listingParamsSchema.parse(request.params);
    const input = publishListingSchema.parse(request.body);
    const listing = await getListingOrThrow(session.user.storeId, params.id);
    await getChannelOrThrow(session.user.storeId, input.channelId);

    const publication = await prisma.$transaction(async (tx) => {
      const created = await tx.listingPublication.create({
        data: {
          storeId: session.user.storeId,
          listingId: listing.id,
          channelId: input.channelId,
          externalId: input.externalId,
          status: input.status,
          publishedAt: input.status === "PUBLISHED" ? new Date() : null,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.listing.update({
        where: { id: listing.id },
        data: { status: input.status },
      });

      await tx.listingSyncLog.create({
        data: {
          storeId: session.user.storeId,
          listingId: listing.id,
          publicationId: created.id,
          action: "publish",
          status: input.status,
          payload: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "ads",
          action: "listing_published",
          entityType: "listing_publication",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { listingId: listing.id, channelId: created.channelId, status: created.status },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "listing.published",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "listing_publication",
      entityId: publication.id,
      payload: { listingId: listing.id, channelId: publication.channelId, status: publication.status },
    });

    return reply.code(201).send({
      data: {
        id: publication.id,
        listingId: publication.listingId,
        channelId: publication.channelId,
        externalId: publication.externalId,
        status: publication.status,
        publishedAt: publication.publishedAt?.toISOString() ?? null,
      },
    });
  });

  app.post("/:id/metrics", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "ads",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = listingParamsSchema.parse(request.params);
    const input = metricSchema.parse(request.body);
    const listing = await getListingOrThrow(session.user.storeId, params.id);
    await getChannelOrThrow(session.user.storeId, input.channelId);
    const ctr = input.views > 0 ? input.clicks / input.views : null;
    const conversionRate = input.views > 0 ? input.leads / input.views : null;

    const metric = await prisma.listingMetric.upsert({
      where: {
        listingId_channelId_metricDate: {
          listingId: listing.id,
          channelId: input.channelId,
          metricDate: input.metricDate,
        },
      },
      update: {
        views: input.views,
        leads: input.leads,
        clicks: input.clicks,
        ctr,
        conversionRate,
        costPerLead: input.costPerLead,
        score: input.score,
      },
      create: {
        storeId: session.user.storeId,
        listingId: listing.id,
        channelId: input.channelId,
        metricDate: input.metricDate,
        views: input.views,
        leads: input.leads,
        clicks: input.clicks,
        ctr,
        conversionRate,
        costPerLead: input.costPerLead,
        score: input.score,
      },
    });

    return reply.code(201).send({
      data: {
        id: metric.id,
        listingId: metric.listingId,
        channelId: metric.channelId,
        metricDate: metric.metricDate.toISOString(),
        views: metric.views,
        leads: metric.leads,
        clicks: metric.clicks,
        ctr: metric.ctr?.toString() ?? null,
        conversionRate: metric.conversionRate?.toString() ?? null,
        costPerLead: metric.costPerLead?.toString() ?? null,
        score: metric.score?.toString() ?? null,
      },
    });
  });
}
