import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
import { COMMERCIAL_BOARD_KEY } from "../services/commercial-kanban.js";
import {
  COMMERCIAL_APPOINTMENT_STATUSES,
  COMMERCIAL_APPOINTMENT_TYPES,
  commercialAppointmentLinkErrors,
  commercialAppointmentStatusLabel,
  commercialAppointmentTypeLabel,
  type CommercialAppointmentStatus,
  type CommercialAppointmentType,
} from "../services/commercial-appointment.js";

const typeKeys = COMMERCIAL_APPOINTMENT_TYPES.map((entry) => entry.key) as [CommercialAppointmentType, ...CommercialAppointmentType[]];
const statusKeys = COMMERCIAL_APPOINTMENT_STATUSES.map((entry) => entry.key) as [CommercialAppointmentStatus, ...CommercialAppointmentStatus[]];
const appointmentTypeSchema = z.enum(typeKeys);
const appointmentStatusSchema = z.enum(statusKeys);

// Roles that see/operate the whole agenda; everyone else is scoped to their own.
const AGENDA_FULL_VIEW_ROLES = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);

const vehicleInterestSchema = z
  .object({
    brand: z.string().trim().max(80).optional(),
    model: z.string().trim().max(80).optional(),
    version: z.string().trim().max(80).optional(),
    color: z.string().trim().max(40).optional(),
    expectedTerm: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .partial();

const createCommercialAppointmentSchema = z.object({
  cardId: z.string().uuid(),
  type: appointmentTypeSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  vehicleId: z.string().uuid().optional(),
  vehicleInterest: vehicleInterestSchema.optional(),
  responsibleUserId: z.string().uuid().optional(),
  location: z.string().trim().max(180).optional(),
  origin: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(80).optional(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do agendamento") })
    .optional(),
});

const commercialAppointmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  responsible_user_id: z.string().uuid().optional(),
  type: appointmentTypeSchema.optional(),
  status: appointmentStatusSchema.optional(),
  card_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  origin: z.string().trim().max(80).optional(),
});

const commercialAppointmentParamsSchema = z.object({
  id: z.string().uuid(),
});

type CommercialAppointmentRecord = Prisma.CommercialAppointmentGetPayload<Record<string, never>>;

function agendaScopeWhere(user: { id: string; role: string }): Prisma.CommercialAppointmentWhereInput {
  return AGENDA_FULL_VIEW_ROLES.has(user.role) ? {} : { responsibleUserId: user.id };
}

function sanitizeCommercialAppointment(appointment: CommercialAppointmentRecord) {
  const type = appointment.type as CommercialAppointmentType;
  const status = appointment.status as CommercialAppointmentStatus;
  return {
    id: appointment.id,
    cardId: appointment.cardId,
    leadId: appointment.leadId,
    customerId: appointment.customerId,
    vehicleId: appointment.vehicleId,
    vehicleInterest: appointment.vehicleInterest,
    responsibleUserId: appointment.responsibleUserId,
    type,
    typeLabel: commercialAppointmentTypeLabel(type),
    status,
    statusLabel: commercialAppointmentStatusLabel(status),
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt?.toISOString() ?? null,
    location: appointment.location,
    origin: appointment.origin,
    channel: appointment.channel,
    notes: appointment.notes,
    cancelReason: appointment.cancelReason,
    noShowReason: appointment.noShowReason,
    rescheduleFromId: appointment.rescheduleFromId,
    sourceAppointmentId: appointment.sourceAppointmentId,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

async function ensureUserInStore(storeId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel do agendamento nao encontrado.");
  }
}

export async function registerCommercialAgendaRoutes(app: FastifyInstance) {
  app.get("/appointments", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = commercialAppointmentsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where: Prisma.CommercialAppointmentWhereInput = {
      storeId: session.user.storeId,
      ...agendaScopeWhere(session.user),
      ...(query.responsible_user_id ? { responsibleUserId: query.responsible_user_id } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.card_id ? { cardId: query.card_id } : {}),
      ...(query.lead_id ? { leadId: query.lead_id } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.origin ? { origin: { contains: query.origin, mode: "insensitive" } } : {}),
      ...(query.from || query.to
        ? { startsAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.commercialAppointment.findMany({ where, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], skip, take }),
      prisma.commercialAppointment.count({ where }),
    ]);

    return listResponse(items.map(sanitizeCommercialAppointment), query, total);
  });

  app.get("/appointments/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = commercialAppointmentParamsSchema.parse(request.params);

    const appointment = await prisma.commercialAppointment.findFirst({
      where: { id: params.id, storeId: session.user.storeId, ...agendaScopeWhere(session.user) },
    });
    if (!appointment) {
      throw new ApiError("NOT_FOUND", "Agendamento comercial nao encontrado.");
    }

    return { data: sanitizeCommercialAppointment(appointment) };
  });

  app.post("/appointments", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createCommercialAppointmentSchema.parse(request.body);

    // SDR/Vendedor can only schedule for cards in their own portfolio; managers/administrative any.
    const cardScope: Prisma.LeadCardWhereInput = AGENDA_FULL_VIEW_ROLES.has(session.user.role)
      ? {}
      : { lead: { assignedUserId: session.user.id } };
    const card = await prisma.leadCard.findFirst({
      where: { id: input.cardId, storeId: session.user.storeId, boardKey: COMMERCIAL_BOARD_KEY, ...cardScope },
      include: { lead: true },
    });
    if (!card) {
      return denyOwnershipAccess({
        action: "commercial_appointment_created",
        entityId: input.cardId,
        entityType: "lead_card",
        message: "Card comercial nao encontrado.",
        module: "appointments",
        request,
        session,
      });
    }

    if (input.endsAt && input.endsAt <= input.startsAt) {
      throw new ApiError("VALIDATION_ERROR", "Horario final deve ser posterior ao horario inicial.");
    }

    const effectiveVehicleId = input.vehicleId ?? card.lead.vehicleId;
    const linkErrors = commercialAppointmentLinkErrors({
      cardId: card.id,
      customerId: card.lead.customerId,
      leadId: card.leadId,
      vehicleId: effectiveVehicleId,
      vehicleInterest: input.vehicleInterest,
    });
    if (linkErrors.length > 0) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento comercial exige card, cliente/lead e veiculo ou interesse/encomenda.", {
        missingLinks: linkErrors,
      });
    }

    if (input.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: input.vehicleId, storeId: session.user.storeId, deletedAt: null },
        select: { id: true },
      });
      if (!vehicle) {
        throw new ApiError("NOT_FOUND", "Veiculo do agendamento nao encontrado.");
      }
    }

    const responsibleUserId = input.responsibleUserId ?? card.lead.assignedUserId ?? session.user.id;
    await ensureUserInStore(session.user.storeId, responsibleUserId);

    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.commercialAppointment.create({
        data: {
          storeId: session.user.storeId,
          cardId: card.id,
          leadId: card.leadId,
          customerId: card.lead.customerId,
          vehicleId: effectiveVehicleId,
          vehicleInterest: input.vehicleInterest ? (input.vehicleInterest as Prisma.InputJsonValue) : undefined,
          responsibleUserId,
          type: input.type,
          status: "SCHEDULED",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          origin: input.origin,
          channel: input.channel,
          notes: input.notes,
          createdByUserId: session.user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_appointments",
          action: "commercial_appointment_created",
          entityType: "commercial_appointment",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            cardId: card.id,
            leadId: card.leadId,
            customerId: card.lead.customerId,
            vehicleId: effectiveVehicleId ?? null,
            type: created.type,
            startsAt: created.startsAt.toISOString(),
            responsibleUserId,
          },
        },
      });

      // Lead-scoped audit so the appointment appears in the lead/customer history.
      if (card.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_appointment_scheduled",
            entityType: "lead",
            entityId: card.leadId,
            result: "SUCCESS",
            metadata: { appointmentId: created.id, type: created.type, startsAt: created.startsAt.toISOString() },
          },
        });
      }

      return created;
    });

    await emitInternalEvent({
      name: "commercial_appointment.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "commercial_appointment",
      entityId: appointment.id,
      payload: { cardId: card.id, leadId: card.leadId, type: appointment.type, startsAt: appointment.startsAt.toISOString() },
    });

    return reply.code(201).send({ data: sanitizeCommercialAppointment(appointment) });
  });
}
