-- CreateTable
CREATE TABLE "commercial_appointments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "vehicle_interest" JSONB,
    "responsible_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "location" TEXT,
    "origin" TEXT,
    "channel" TEXT,
    "notes" TEXT,
    "cancel_reason" TEXT,
    "no_show_reason" TEXT,
    "reschedule_from_id" TEXT,
    "source_appointment_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_appointments_store_id_starts_at_idx" ON "commercial_appointments"("store_id", "starts_at");

-- CreateIndex
CREATE INDEX "commercial_appointments_store_id_status_idx" ON "commercial_appointments"("store_id", "status");

-- CreateIndex
CREATE INDEX "commercial_appointments_card_id_idx" ON "commercial_appointments"("card_id");

-- CreateIndex
CREATE INDEX "commercial_appointments_responsible_user_id_idx" ON "commercial_appointments"("responsible_user_id");

-- CreateIndex
CREATE INDEX "commercial_appointments_lead_id_idx" ON "commercial_appointments"("lead_id");

-- AddForeignKey
ALTER TABLE "commercial_appointments" ADD CONSTRAINT "commercial_appointments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "lead_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_appointments" ADD CONSTRAINT "commercial_appointments_reschedule_from_id_fkey" FOREIGN KEY ("reschedule_from_id") REFERENCES "commercial_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
