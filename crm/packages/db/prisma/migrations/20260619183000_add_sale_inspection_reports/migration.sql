CREATE TABLE "sale_inspection_reports" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "report_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "report_file_id" TEXT,
  "report_date" TIMESTAMP(3),
  "attached_by_user_id" TEXT,
  "attached_at" TIMESTAMP(3),
  "checked_by_user_id" TEXT,
  "checked_at" TIMESTAMP(3),
  "service_provider_id" TEXT,
  "requested_by_customer" BOOLEAN NOT NULL DEFAULT false,
  "printed_at" TIMESTAMP(3),
  "printed_by_user_id" TEXT,
  "exported_at" TIMESTAMP(3),
  "exported_by_user_id" TEXT,
  "retention_until" TIMESTAMP(3),
  "delete_after_retention_status" TEXT,
  "replacement_reason" TEXT,
  "rejection_reason" TEXT,
  "waiver_reason" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sale_inspection_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_inspection_reports_sale_id_report_type_key"
ON "sale_inspection_reports"("sale_id", "report_type");

CREATE INDEX "sale_inspection_reports_store_id_sale_id_idx"
ON "sale_inspection_reports"("store_id", "sale_id");

CREATE INDEX "sale_inspection_reports_store_id_vehicle_id_idx"
ON "sale_inspection_reports"("store_id", "vehicle_id");

CREATE INDEX "sale_inspection_reports_store_id_status_idx"
ON "sale_inspection_reports"("store_id", "status");

CREATE INDEX "sale_inspection_reports_report_file_id_idx"
ON "sale_inspection_reports"("report_file_id");
