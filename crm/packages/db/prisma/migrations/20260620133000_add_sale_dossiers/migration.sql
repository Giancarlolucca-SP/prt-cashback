CREATE TABLE "sale_dossiers" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "buyer_id" TEXT,
  "seller_user_id" TEXT,
  "lead_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "summary" JSONB,
  "metrics_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_dossiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_dossier_documents" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_dossier_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "buyer_id" TEXT,
  "attachment_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "source_module" TEXT NOT NULL,
  "source_entity_type" TEXT,
  "source_entity_id" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'SYSTEM',
  "responsible_user_id" TEXT,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_dossier_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_dossier_events" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_dossier_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "source_module" TEXT NOT NULL,
  "source_entity_type" TEXT,
  "source_entity_id" TEXT,
  "actor_user_id" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "from_status" TEXT,
  "to_status" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_dossier_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_dossiers_store_id_sale_id_key" ON "sale_dossiers"("store_id", "sale_id");
CREATE INDEX "sale_dossiers_store_id_idx" ON "sale_dossiers"("store_id");
CREATE INDEX "sale_dossiers_sale_id_idx" ON "sale_dossiers"("sale_id");
CREATE INDEX "sale_dossiers_vehicle_id_idx" ON "sale_dossiers"("vehicle_id");
CREATE INDEX "sale_dossiers_buyer_id_idx" ON "sale_dossiers"("buyer_id");
CREATE INDEX "sale_dossiers_seller_user_id_idx" ON "sale_dossiers"("seller_user_id");
CREATE INDEX "sale_dossiers_store_id_status_idx" ON "sale_dossiers"("store_id", "status");

CREATE UNIQUE INDEX "sale_dossier_documents_sale_dossier_id_attachment_id_document_type_key" ON "sale_dossier_documents"("sale_dossier_id", "attachment_id", "document_type");
CREATE INDEX "sale_dossier_documents_store_id_idx" ON "sale_dossier_documents"("store_id");
CREATE INDEX "sale_dossier_documents_sale_dossier_id_idx" ON "sale_dossier_documents"("sale_dossier_id");
CREATE INDEX "sale_dossier_documents_sale_id_idx" ON "sale_dossier_documents"("sale_id");
CREATE INDEX "sale_dossier_documents_vehicle_id_idx" ON "sale_dossier_documents"("vehicle_id");
CREATE INDEX "sale_dossier_documents_buyer_id_idx" ON "sale_dossier_documents"("buyer_id");
CREATE INDEX "sale_dossier_documents_attachment_id_idx" ON "sale_dossier_documents"("attachment_id");
CREATE INDEX "sale_dossier_documents_document_type_idx" ON "sale_dossier_documents"("document_type");
CREATE INDEX "sale_dossier_documents_source_module_idx" ON "sale_dossier_documents"("source_module");

CREATE INDEX "sale_dossier_events_store_id_idx" ON "sale_dossier_events"("store_id");
CREATE INDEX "sale_dossier_events_sale_dossier_id_occurred_at_idx" ON "sale_dossier_events"("sale_dossier_id", "occurred_at");
CREATE INDEX "sale_dossier_events_sale_id_idx" ON "sale_dossier_events"("sale_id");
CREATE INDEX "sale_dossier_events_event_type_idx" ON "sale_dossier_events"("event_type");
CREATE INDEX "sale_dossier_events_source_module_idx" ON "sale_dossier_events"("source_module");
