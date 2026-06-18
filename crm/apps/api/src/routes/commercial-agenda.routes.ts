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
  canCancelAppointment,
  canCompleteAppointment,
  canConfirmAppointment,
  canMarkAttended,
  canMarkNoResponse,
  canMarkNoShow,
  canRescheduleAppointment,
  commercialAppointmentLinkErrors,
  commercialAppointmentStatusLabel,
  commercialAppointmentTypeLabel,
  needsVisitConfirmation,
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

const appointmentReasonSchema = z
  .object({ reason: z.string().trim().max(300).optional() })
  .default({});

const rescheduleAppointmentSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((input) => !input.endsAt || input.endsAt > input.startsAt, {
    message: "Horario final deve ser posterior ao horario inicial.",
    path: ["endsAt"],
  });

type CommercialAppointmentRecord = Prisma.CommercialAppointmentGetPayload<Record<string, never>>;

function agendaScopeWhere(user: { id: string; role: string }): Prisma.CommercialAppointmentWhereInput {
  return AGENDA_FULL_VIEW_ROLES.has(user.role) ? {} : { responsibleUserId: user.id };
}

function sanitizeCommercialAppointment(appointment: CommercialAppointmentRecord, now: Date) {
  const type = appointment.type as CommercialAppointmentType;
  const status = appointment.status as CommercialAppointmentStatus;
  // Production projection of the 1h visit confirmation window (FR-022CC/FR-022CJ).
  const needsConfirmation = needsVisitConfirmation({ type, status, startsAt: appointment.startsAt, now });
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
    needsConfirmation,
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

type AgendaSession = Awaited<ReturnType<typeof requirePermission>>;

async function loadScopedAppointment(session: AgendaSession, id: string) {
  const appointment = await prisma.commercialAppointment.findFirst({
    where: { id, storeId: session.user.storeId, ...agendaScopeWhere(session.user) },
  });
  if (!appointment) {
    throw new ApiError("NOT_FOUND", "Agendamento comercial nao encontrado.");
  }
  return appointment;
}

async function transitionCommercialAppointment(
  session: AgendaSession,
  appointment: CommercialAppointmentRecord,
  options: {
    toStatus: CommercialAppointmentStatus;
    action: string;
    reason?: string | null;
    data?: { cancelReason?: string | null; noShowReason?: string | null };
  },
) {
  const fromStatus = appointment.status;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.commercialAppointment.update({
      where: { id: appointment.id },
      data: { status: options.toStatus, ...(options.data ?? {}) },
    });

    await tx.auditLog.create({
      data: {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        module: "commercial_appointments",
        action: "commercial_appointment_status_changed",
        entityType: "commercial_appointment",
        entityId: appointment.id,
        result: "SUCCESS",
        metadata: { fromStatus, toStatus: options.toStatus, action: options.action, reason: options.reason ?? null },
      },
    });

    if (appointment.leadId) {
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "leads",
          action: "commercial_appointment_status_changed",
          entityType: "lead",
          entityId: appointment.leadId,
          result: "SUCCESS",
          metadata: { appointmentId: appointment.id, fromStatus, toStatus: options.toStatus, action: options.action, reason: options.reason ?? null },
        },
      });
    }

    return next;
  });

  await emitInternalEvent({
    name: "commercial_appointment.status_changed",
    storeId: session.user.storeId,
    actorId: session.user.id,
    entityType: "commercial_appointment",
    entityId: appointment.id,
    payload: { fromStatus, toStatus: options.toStatus, action: options.action },
  });

  return updated;
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

    // Scope guard: SDR/Vendedor are always restricted to their own agenda. The
    // responsible_user_id filter is only honored for full-view roles, so a limited
    // role cannot widen scope via the param (no data leak).
    const scopedResponsibleUserId = AGENDA_FULL_VIEW_ROLES.has(session.user.role)
      ? query.responsible_user_id
      : session.user.id;

    const where: Prisma.CommercialAppointmentWhereInput = {
      storeId: session.user.storeId,
      ...(scopedResponsibleUserId ? { responsibleUserId: scopedResponsibleUserId } : {}),
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

    const now = new Date();
    const [items, total] = await Promise.all([
      prisma.commercialAppointment.findMany({ where, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], skip, take }),
      prisma.commercialAppointment.count({ where }),
    ]);

    return listResponse(items.map((item) => sanitizeCommercialAppointment(item, now)), query, total);
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

    return { data: sanitizeCommercialAppointment(appointment, new Date()) };
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

    // Limited roles cannot place an appointment on someone else's agenda: force self.
    // Full-view roles (manager/admin/administrative) may assign to another responsible.
    const responsibleUserId = AGENDA_FULL_VIEW_ROLES.has(session.user.role)
      ? input.responsibleUserId ?? card.lead.assignedUserId ?? session.user.id
      : session.user.id;
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

    return reply.code(201).send({ data: sanitizeCommercialAppointment(appointment, new Date()) });
  });

  app.post("/appointments/:id/confirm", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canConfirmAppointment(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser confirmado no status atual.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, { toStatus: "CONFIRMED", action: "confirm" });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/attended", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canMarkAttended(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser marcado como comparecido no status atual.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, { toStatus: "ATTENDED", action: "attended" });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/complete", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canCompleteAppointment(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser concluido no status atual.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, { toStatus: "COMPLETED", action: "complete" });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/no-response", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canMarkNoResponse(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser marcado como sem resposta no status atual.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, { toStatus: "NO_RESPONSE", action: "no_response" });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/no-show", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const input = appointmentReasonSchema.parse(request.body ?? {});
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canMarkNoShow(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser marcado como nao comparecido no status atual.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, {
      toStatus: "NO_SHOW",
      action: "no_show",
      reason: input.reason,
      data: { noShowReason: input.reason ?? null },
    });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/cancel", async (request) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const input = appointmentReasonSchema.parse(request.body ?? {});
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canCancelAppointment(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento finalizado nao pode ser cancelado.", { status: appointment.status });
    }
    const updated = await transitionCommercialAppointment(session, appointment, {
      toStatus: "CANCELLED",
      action: "cancel",
      reason: input.reason,
      data: { cancelReason: input.reason ?? null },
    });
    return { data: sanitizeCommercialAppointment(updated, new Date()) };
  });

  app.post("/appointments/:id/reschedule", async (request, reply) => {
    const session = await requirePermission(request, { module: "appointments", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = commercialAppointmentParamsSchema.parse(request.params);
    const input = rescheduleAppointmentSchema.parse(request.body);
    const appointment = await loadScopedAppointment(session, params.id);
    if (!canRescheduleAppointment(appointment.status as CommercialAppointmentStatus)) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Agendamento nao pode ser reagendado no status atual.", { status: appointment.status });
    }

    const result = await prisma.$transaction(async (tx) => {
      // The new appointment preserves the link to the previous one (reschedule chain).
      const created = await tx.commercialAppointment.create({
        data: {
          storeId: session.user.storeId,
          cardId: appointment.cardId,
          leadId: appointment.leadId,
          customerId: appointment.customerId,
          vehicleId: appointment.vehicleId,
          ...(appointment.vehicleInterest ? { vehicleInterest: appointment.vehicleInterest as Prisma.InputJsonValue } : {}),
          responsibleUserId: appointment.responsibleUserId,
          type: appointment.type,
          status: "SCHEDULED",
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: appointment.location,
          origin: appointment.origin,
          channel: appointment.channel,
          notes: appointment.notes,
          rescheduleFromId: appointment.id,
          createdByUserId: session.user.id,
        },
      });

      const previous = await tx.commercialAppointment.update({
        where: { id: appointment.id },
        data: { status: "RESCHEDULED" },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "commercial_appointments",
          action: "commercial_appointment_status_changed",
          entityType: "commercial_appointment",
          entityId: appointment.id,
          result: "SUCCESS",
          metadata: { fromStatus: appointment.status, toStatus: "RESCHEDULED", action: "reschedule", reason: input.reason ?? null, newAppointmentId: created.id },
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
          metadata: { rescheduleFromId: appointment.id, cardId: created.cardId, leadId: created.leadId, type: created.type, startsAt: created.startsAt.toISOString() },
        },
      });

      if (appointment.leadId) {
        await tx.auditLog.create({
          data: {
            storeId: session.user.storeId,
            actorId: session.user.id,
            actorRole: session.user.role,
            module: "leads",
            action: "commercial_appointment_status_changed",
            entityType: "lead",
            entityId: appointment.leadId,
            result: "SUCCESS",
            metadata: { appointmentId: appointment.id, newAppointmentId: created.id, fromStatus: appointment.status, toStatus: "RESCHEDULED", action: "reschedule" },
          },
        });
      }

      return { created, previous };
    });

    await emitInternalEvent({
      name: "commercial_appointment.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "commercial_appointment",
      entityId: appointment.id,
      payload: { fromStatus: appointment.status, toStatus: "RESCHEDULED", action: "reschedule", newAppointmentId: result.created.id },
    });

    return reply.code(201).send({
      data: sanitizeCommercialAppointment(result.created, new Date()),
      previous: sanitizeCommercialAppointment(result.previous, new Date()),
    });
  });
}
