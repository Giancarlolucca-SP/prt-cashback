CREATE TABLE "dispatch_document_ready" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "dispatch_process_id" TEXT,
  "sale_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "buyer_id" TEXT,
  "dispatcher_id" TEXT,
  "source_channel" TEXT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_from" TEXT,
  "file_id" TEXT,
  "file_name" TEXT,
  "document_type" TEXT NOT NULL DEFAULT 'VEHICLE_DOCUMENT',
  "linked_by_user_id" TEXT,
  "link_confidence" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'LINKED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_document_ready_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "buyer_document_ready_notifications" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "document_ready_id" TEXT NOT NULL,
  "dispatch_process_id" TEXT,
  "sale_id" TEXT NOT NULL,
  "buyer_id" TEXT,
  "vehicle_id" TEXT,
  "channel" TEXT NOT NULL,
  "recipient_contact" TEXT,
  "message_template_id" TEXT,
  "message_text_snapshot" TEXT NOT NULL,
  "attachment_file_id" TEXT,
  "sent_at" TIMESTAMP(3),
  "sent_by_user_id" TEXT,
  "sent_by" TEXT NOT NULL DEFAULT 'USER',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "failure_reason" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "buyer_document_ready_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_document_ready_store_id_idx" ON "dispatch_document_ready"("store_id");
CREATE INDEX "dispatch_document_ready_dispatch_process_id_idx" ON "dispatch_document_ready"("dispatch_process_id");
CREATE INDEX "dispatch_document_ready_sale_id_idx" ON "dispatch_document_ready"("sale_id");
CREATE INDEX "dispatch_document_ready_vehicle_id_idx" ON "dispatch_document_ready"("vehicle_id");
CREATE INDEX "dispatch_document_ready_buyer_id_idx" ON "dispatch_document_ready"("buyer_id");
CREATE INDEX "dispatch_document_ready_dispatcher_id_idx" ON "dispatch_document_ready"("dispatcher_id");
CREATE INDEX "dispatch_document_ready_file_id_idx" ON "dispatch_document_ready"("file_id");
CREATE INDEX "dispatch_document_ready_store_id_status_idx" ON "dispatch_document_ready"("store_id", "status");

CREATE INDEX "buyer_document_ready_notifications_store_id_idx" ON "buyer_document_ready_notifications"("store_id");
CREATE INDEX "buyer_document_ready_notifications_document_ready_id_idx" ON "buyer_document_ready_notifications"("document_ready_id");
CREATE INDEX "buyer_document_ready_notifications_dispatch_process_id_idx" ON "buyer_document_ready_notifications"("dispatch_process_id");
CREATE INDEX "buyer_document_ready_notifications_sale_id_idx" ON "buyer_document_ready_notifications"("sale_id");
CREATE INDEX "buyer_document_ready_notifications_buyer_id_idx" ON "buyer_document_ready_notifications"("buyer_id");
CREATE INDEX "buyer_document_ready_notifications_vehicle_id_idx" ON "buyer_document_ready_notifications"("vehicle_id");
CREATE INDEX "buyer_document_ready_notifications_attachment_file_id_idx" ON "buyer_document_ready_notifications"("attachment_file_id");
CREATE INDEX "buyer_document_ready_notifications_store_id_status_idx" ON "buyer_document_ready_notifications"("store_id", "status");