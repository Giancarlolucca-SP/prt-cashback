-- CreateTable
CREATE TABLE "commercial_alerts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "alert_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "card_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "responsible_user_id" TEXT,
    "target_user_id" TEXT,
    "target_role" TEXT,
    "reason" TEXT NOT NULL,
    "suggested_action" TEXT,
    "due_at" TIMESTAMP(3),
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_alerts_store_id_status_severity_idx" ON "commercial_alerts"("store_id", "status", "severity");

-- CreateIndex
CREATE INDEX "commercial_alerts_store_id_alert_type_status_idx" ON "commercial_alerts"("store_id", "alert_type", "status");

-- CreateIndex
CREATE INDEX "commercial_alerts_store_id_responsible_user_id_status_idx" ON "commercial_alerts"("store_id", "responsible_user_id", "status");

-- CreateIndex
CREATE INDEX "commercial_alerts_store_id_target_user_id_status_idx" ON "commercial_alerts"("store_id", "target_user_id", "status");

-- CreateIndex
CREATE INDEX "commercial_alerts_card_id_idx" ON "commercial_alerts"("card_id");

-- CreateIndex
CREATE INDEX "commercial_alerts_lead_id_idx" ON "commercial_alerts"("lead_id");

-- CreateIndex
CREATE INDEX "commercial_alerts_due_at_idx" ON "commercial_alerts"("due_at");

-- Active-condition dedupe: one open alert per store + card + alert type.
-- RESOLVED/DISMISSED/EXPIRED alerts remain as history and allow future alerts.
CREATE UNIQUE INDEX "commercial_alerts_active_dedup_key" ON "commercial_alerts"("store_id", "card_id", "alert_type")
WHERE "status" IN ('PENDING', 'VIEWED');

-- AddForeignKey
ALTER TABLE "commercial_alerts" ADD CONSTRAINT "commercial_alerts_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "lead_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
