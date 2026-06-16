import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { denyOwnershipAccess, requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";

const appointmentStatusSchema = z.enum(["SCHEDULED", "CONFIRMED", "DONE", "CANCELLED", "NO_SHOW"]);

const appointmentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: appointmentStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  assigned_user_id: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const appointmentPayloadSchema = z.object({
  customerId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  type: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(180),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Observacoes do agendamento") })
    .optional(),
});

const createAppointmentSchema = appointmentPayloadSchema.refine((input) => !input.endsAt || input.endsAt > input.startsAt, {
  message: "Horario final deve ser posterior ao horario inicial.",
  path: ["endsAt"],
});

const updateAppointmentSchema = appointmentPayloadSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  })
  .refine((input) => !input.endsAt || !input.startsAt || input.endsAt > input.startsAt, {
    message: "Horario final deve ser posterior ao horario inicial.",
    path: ["endsAt"],
  });

const appointmentParamsSchema = z.object({
  id: z.string().uuid(),
});

const updateAppointmentStatusSchema = z.object({
  status: appointmentStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

type AppointmentRecord = {
  id: string;
  customerId: string | null;
  leadId: string | null;
  vehicleId: string | null;
  assignedUserId: string | null;
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function sanitizeAppointment(appointment: AppointmentRecord) {
  return {
    id: appointment.id,
    customerId: appointment.customerId,
    leadId: appointment.leadId,
    vehicleId: appointment.vehicleId,
    assignedUserId: appointment.assignedUserId,
    type: appointment.type,
    title: appointment.title,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt?.toISOString() ?? null,
    status: appointment.status,
    notes: appointment.notes,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

function appointmentScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }

  return {};
}

function appointmentRelatedEntityScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { createdByUserId: user.id };
  }

  return {};
}

function appointmentLeadScopeWhere(user: { id: string; role: string }) {
  if (user.role === "SELLER" || user.role === "SDR") {
    return { assignedUserId: user.id };
  }

  return {};
}

async function ensureCustomerInStore(storeId: string, user: { id: string; role: string }, customerId?: string) {
  if (!customerId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null, ...appointmentRelatedEntityScopeWhere(user) },
    select: { id: true },
  });

  if (!customer) {
    throw new ApiError("NOT_FOUND", "Cliente vinculado ao agendamento nao encontrado.");
  }
}

async function ensureLeadInStore(storeId: string, user: { id: string; role: string }, leadId?: string) {
  if (!leadId) return;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, storeId, deletedAt: null, ...appointmentLeadScopeWhere(user) },
    select: { id: true },
  });

  if (!lead) {
    throw new ApiError("NOT_FOUND", "Lead vinculado ao agendamento nao encontrado.");
  }
}

async function ensureUserInStore(storeId: string, userId?: string) {
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError("NOT_FOUND", "Responsavel do agendamento nao encontrado.");
  }
}

async function ensureVehicleInStore(storeId: string, vehicleId?: string) {
  if (!vehicleId) return;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, storeId, deletedAt: null },
    select: { id: true },
  });

  if (!vehicle) {
    throw new ApiError("NOT_FOUND", "Veiculo vinculado ao agendamento nao encontrado.");
  }
}

export async function registerAppointmentRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const query = appointmentsQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      deletedAt: null,
      ...appointmentScopeWhere(session.user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.lead_id ? { leadId: query.lead_id } : {}),
      ...(query.assigned_user_id ? { assignedUserId: query.assigned_user_id } : {}),
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { startsAt: "asc" },
        skip,
        take,
      }),
      prisma.appointment.count({ where }),
    ]);

    return listResponse(items.map(sanitizeAppointment), query, total);
  });

  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = appointmentParamsSchema.parse(request.params);

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, storeId: session.user.storeId, deletedAt: null, ...appointmentScopeWhere(session.user) },
    });

    if (!appointment) {
      throw new ApiError("NOT_FOUND", "Agendamento nao encontrado.");
    }

    return { data: sanitizeAppointment(appointment) };
  });

  app.post("/", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const input = createAppointmentSchema.parse(request.body);
    const assignedUserId = input.assignedUserId ?? session.user.id;

    await ensureCustomerInStore(session.user.storeId, session.user, input.customerId);
    await ensureLeadInStore(session.user.storeId, session.user, input.leadId);
    await ensureVehicleInStore(session.user.storeId, input.vehicleId);
    await ensureUserInStore(session.user.storeId, assignedUserId);

    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          storeId: session.user.storeId,
          customerId: input.customerId,
          leadId: input.leadId,
          vehicleId: input.vehicleId,
          assignedUserId,
          type: input.type,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          notes: input.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "appointments",
          action: "create",
          entityType: "appointment",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            customerId: created.customerId,
            leadId: created.leadId,
            assignedUserId: created.assignedUserId,
            startsAt: created.startsAt.toISOString(),
          },
        },
      });

      if (created.customerId) {
        await tx.customerHistoryEvent.create({
          data: {
            storeId: session.user.storeId,
            customerId: created.customerId,
            type: "customer.appointment_created",
            title: "Agendamento criado",
            description: created.notes,
            metadata: {
              appointmentId: created.id,
              leadId: created.leadId,
              vehicleId: created.vehicleId,
              assignedUserId: created.assignedUserId,
              appointmentType: created.type,
              status: created.status,
              startsAt: created.startsAt.toISOString(),
              endsAt: created.endsAt?.toISOString() ?? null,
              origin: "appointment",
              actorRole: session.user.role,
            },
          },
        });
      }

      return created;
    });

    await emitInternalEvent({
      name: "appointment.created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "appointment",
      entityId: appointment.id,
      payload: { leadId: appointment.leadId, startsAt: appointment.startsAt.toISOString() },
    });

    return reply.code(201).send({ data: sanitizeAppointment(appointment) });
  });

  app.patch("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = appointmentParamsSchema.parse(request.params);
    const input = updateAppointmentSchema.parse(request.body);

    const current = await prisma.appointment.findFirst({
      where: { id: params.id, storeId: session.user.storeId, deletedAt: null, ...appointmentScopeWhere(session.user) },
    });

    if (!current) {
      return denyOwnershipAccess({
        action: "update",
        entityId: params.id,
        entityType: "appointment",
        message: "Agendamento nao encontrado.",
        module: "appointments",
        request,
        session,
      });
    }

    await ensureCustomerInStore(session.user.storeId, session.user, input.customerId);
    await ensureLeadInStore(session.user.storeId, session.user, input.leadId);
    await ensureVehicleInStore(session.user.storeId, input.vehicleId);
    await ensureUserInStore(session.user.storeId, input.assignedUserId);

    const appointment = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: current.id },
        data: input,
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "appointments",
          action: "update",
          entityType: "appointment",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { changedFields: Object.keys(input) },
        },
      });

      if (updated.customerId) {
        await tx.customerHistoryEvent.create({
          data: {
            storeId: session.user.storeId,
            customerId: updated.customerId,
            type: "customer.appointment_updated",
            title: "Agendamento atualizado",
            description: updated.notes,
            metadata: {
              appointmentId: updated.id,
              changedFields: Object.keys(input),
              fromStartsAt: current.startsAt.toISOString(),
              toStartsAt: updated.startsAt.toISOString(),
              status: updated.status,
              origin: "appointment",
              actorRole: session.user.role,
            },
          },
        });
      }

      return updated;
    });

    await emitInternalEvent({
      name: "appointment.updated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "appointment",
      entityId: appointment.id,
      payload: { changedFields: Object.keys(input), customerId: appointment.customerId },
    });

    return { data: sanitizeAppointment(appointment) };
  });

  app.post("/:id/status", async (request) => {
    const session = await requirePermission(request, {
      module: "appointments",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = appointmentParamsSchema.parse(request.params);
    const input = updateAppointmentStatusSchema.parse(request.body);

    const current = await prisma.appointment.findFirst({
      where: { id: params.id, storeId: session.user.storeId, deletedAt: null, ...appointmentScopeWhere(session.user) },
    });

    if (!current) {
      return denyOwnershipAccess({
        action: "status_changed",
        entityId: params.id,
        entityType: "appointment",
        message: "Agendamento nao encontrado.",
        module: "appointments",
        request,
        session,
      });
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: current.id },
        data: {
          status: input.status,
          deletedAt: input.status === "CANCELLED" ? new Date() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "appointments",
          action: "status_changed",
          entityType: "appointment",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            fromStatus: current.status,
            toStatus: input.status,
            reason: input.reason,
          },
        },
      });

      if (updated.customerId) {
        await tx.customerHistoryEvent.create({
          data: {
            storeId: session.user.storeId,
            customerId: updated.customerId,
            type: "customer.appointment_status_changed",
            title: "Status de agendamento atualizado",
            description: input.reason,
            metadata: {
              appointmentId: updated.id,
              fromStatus: current.status,
              toStatus: input.status,
              reason: input.reason,
              origin: "appointment",
              actorRole: session.user.role,
            },
          },
        });
      }

      return updated;
    });

    await emitInternalEvent({
      name: "appointment.status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "appointment",
      entityId: appointment.id,
      payload: {
        fromStatus: current.status,
        toStatus: input.status,
        reason: input.reason,
      },
    });

    return { data: sanitizeAppointment(appointment) };
  });
}
