CREATE TABLE "post_sale_alerts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "trigger_date" TIMESTAMP(3) NOT NULL,
    "feedback_due_at" TIMESTAMP(3) NOT NULL,
    "original_seller_user_id" TEXT,
    "assigned_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contact_attempted_at" TIMESTAMP(3),
    "contact_channel" TEXT,
    "contact_result" TEXT,
    "feedback_notes" TEXT,
    "next_action_at" TIMESTAMP(3),
    "overdue_notification_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "reassigned_from_user_id" TEXT,
    "reassigned_at" TIMESTAMP(3),
    "reassigned_by_user_id" TEXT,
    "reassigned_reason" TEXT,
    "created_by_automation" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "post_sale_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_sale_alert_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "post_sale_alert_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "from_assigned_user_id" TEXT,
    "to_assigned_user_id" TEXT,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_sale_alert_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_sale_alerts_store_id_sale_id_trigger_date_key" ON "post_sale_alerts"("store_id", "sale_id", "trigger_date");
CREATE INDEX "post_sale_alerts_store_id_status_idx" ON "post_sale_alerts"("store_id", "status");
CREATE INDEX "post_sale_alerts_customer_id_idx" ON "post_sale_alerts"("customer_id");
CREATE INDEX "post_sale_alerts_sale_id_idx" ON "post_sale_alerts"("sale_id");
CREATE INDEX "post_sale_alerts_vehicle_id_idx" ON "post_sale_alerts"("vehicle_id");
CREATE INDEX "post_sale_alerts_assigned_user_id_idx" ON "post_sale_alerts"("assigned_user_id");
CREATE INDEX "post_sale_alerts_feedback_due_at_idx" ON "post_sale_alerts"("feedback_due_at");
CREATE INDEX "post_sale_alert_events_store_id_idx" ON "post_sale_alert_events"("store_id");
CREATE INDEX "post_sale_alert_events_post_sale_alert_id_occurred_at_idx" ON "post_sale_alert_events"("post_sale_alert_id", "occurred_at");
CREATE INDEX "post_sale_alert_events_customer_id_occurred_at_idx" ON "post_sale_alert_events"("customer_id", "occurred_at");
CREATE INDEX "post_sale_alert_events_sale_id_occurred_at_idx" ON "post_sale_alert_events"("sale_id", "occurred_at");
