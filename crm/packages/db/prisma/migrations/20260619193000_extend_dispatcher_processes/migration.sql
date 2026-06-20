ALTER TABLE "service_providers"
  ADD COLUMN "preferred_dispatch_channel" TEXT;

ALTER TABLE "dispatcher_processes"
  ADD COLUMN "vehicle_id" TEXT,
  ADD COLUMN "customer_id" TEXT,
  ADD COLUMN "seller_user_id" TEXT,
  ADD COLUMN "dispatcher_preferred_channel" TEXT,
  ADD COLUMN "transfer_mode" TEXT,
  ADD COLUMN "document_package_id" TEXT,
  ADD COLUMN "package_status" TEXT NOT NULL DEFAULT 'AWAITING_DOCUMENTS',
  ADD COLUMN "documents_included" JSONB,
  ADD COLUMN "missing_documents" JSONB,
  ADD COLUMN "sent_channel" TEXT,
  ADD COLUMN "sent_to" TEXT,
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "sent_by_user_id" TEXT,
  ADD COLUMN "printed_at" TIMESTAMP(3),
  ADD COLUMN "printed_by_user_id" TEXT,
  ADD COLUMN "delivered_to_dispatcher_at" TIMESTAMP(3),
  ADD COLUMN "protocol_number" TEXT,
  ADD COLUMN "protocol_file_id" TEXT,
  ADD COLUMN "status_notes" TEXT;

CREATE INDEX "dispatcher_processes_store_id_status_idx" ON "dispatcher_processes"("store_id", "status");
CREATE INDEX "dispatcher_processes_store_id_package_status_idx" ON "dispatcher_processes"("store_id", "package_status");
CREATE INDEX "dispatcher_processes_provider_id_idx" ON "dispatcher_processes"("provider_id");
CREATE INDEX "dispatcher_processes_document_package_id_idx" ON "dispatcher_processes"("document_package_id");
CREATE INDEX "dispatcher_processes_protocol_file_id_idx" ON "dispatcher_processes"("protocol_file_id");