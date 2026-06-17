CREATE TABLE "technical_deliveries" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "seller_user_id" TEXT,
    "scheduled_by_user_id" TEXT NOT NULL,
    "responsible_user_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "checklist_snapshot" JSONB,
    "document_generated_at" TIMESTAMP(3),
    "document_file_id" TEXT,
    "print_status" TEXT NOT NULL DEFAULT 'PENDING',
    "printed_at" TIMESTAMP(3),
    "signed_copy_status" TEXT NOT NULL DEFAULT 'PENDING',
    "signed_copy_file_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technical_deliveries_store_id_sale_id_key" ON "technical_deliveries"("store_id", "sale_id");

CREATE INDEX "technical_deliveries_store_id_scheduled_at_idx" ON "technical_deliveries"("store_id", "scheduled_at");

CREATE INDEX "technical_deliveries_store_id_delivery_status_idx" ON "technical_deliveries"("store_id", "delivery_status");

CREATE INDEX "technical_deliveries_seller_user_id_idx" ON "technical_deliveries"("seller_user_id");
