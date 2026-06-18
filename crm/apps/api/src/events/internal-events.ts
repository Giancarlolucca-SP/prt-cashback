import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";

export type InternalEventName =
  | "ai.query_logged"
  | "ai.suggestion_created"
  | "ai.suggestion_status_changed"
  | "ai.feedback_recorded"
  | "campaign.created"
  | "campaign.status_changed"
  | "campaign.cost_added"
  | "campaign.result_recorded"
  | "communication.thread_created"
  | "communication.message_received"
  | "communication.message_sent"
  | "communication.email_received"
  | "communication.email_sent"
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  | "customer.kanban_status_changed"
  | "customer.history_note_created"
  | "customer.sales_handoff_prepared"
  | "lead.created"
  | "lead.follow_up_completed"
  | "lead.follow_up_converted"
  | "lead.follow_up_scheduled"
  | "lead.stage_changed"
  | "commercial_card.created"
  | "commercial_card.moved"
  | "commercial_card.reassigned"
  | "commercial_appointment.created"
  | "commercial_appointment.status_changed"
  | "commercial_interaction.registered"
  | "commercial_sale.transferred"
  | "commercial_sale.created"
  | "appointment.created"
  | "appointment.updated"
  | "appointment.status_changed"
  | "inventory.created"
  | "sale.created"
  | "sale.status_changed"
  | "sale.closed"
  | "finance.transaction_created"
  | "finance.transaction_settled"
  | "commission.calculated"
  | "commission.status_changed"
  | "compliance.legal_check_created"
  | "compliance.legal_check_completed"
  | "contract.generated"
  | "contract.signed"
  | "document.uploaded"
  | "document.deleted"
  | "dispatch.process_created"
  | "dispatch.process_status_changed"
  | "external_query.created"
  | "external_query.result_recorded"
  | "vehicle.price_changed"
  | "listing.created"
  | "listing.published"
  | "listing.sold"
  | "notification.created"
  | "notification.read"
  | "ocr.status_changed"
  | "ocr.field_extracted"
  | "ocr.field_reviewed"
  | "purchase.lead_created"
  | "purchase.lead_status_changed"
  | "purchase.evaluation_created"
  | "purchase.evaluation_decision_changed"
  | "purchase.payment_created"
  | "purchase.payment_status_changed"
  | "repasse.created"
  | "repasse.status_changed"
  | "repasse.revenue_recognized"
  | "service_order.created"
  | "service_order.status_changed"
  | "service_order.delayed"
  | "settings.changed"
  | "permission.changed"
  | "automation.triggered";

export type InternalEvent = {
  name: InternalEventName;
  storeId?: string | null;
  actorId?: string | null;
  entityType: string;
  entityId: string;
  payload?: Prisma.InputJsonObject;
};

export async function emitInternalEvent(event: InternalEvent) {
  await prisma.technicalEvent.create({
    data: {
      storeId: event.storeId,
      level: "info",
      source: "internal-event",
      message: event.name,
      metadata: {
        actorId: event.actorId,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload ?? {},
      },
    },
  });
}
