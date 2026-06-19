CREATE TABLE "contract_document_packages" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "contract_id" TEXT,
  "document_type" TEXT NOT NULL DEFAULT 'SALE_CONTRACT_PACKAGE',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "generated_file_id" TEXT,
  "signed_file_id" TEXT,
  "signature_provider" TEXT,
  "seller_signature_status" TEXT NOT NULL DEFAULT 'PENDING',
  "buyer_signature_status" TEXT NOT NULL DEFAULT 'PENDING',
  "sent_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "buyer_notified_at" TIMESTAMP(3),
  "buyer_notification_channel" TEXT,
  "buyer_notification_recipient" TEXT,
  "vehicle_transfer_mode" TEXT,
  "atpve_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "atpve_file_id" TEXT,
  "atpve_evidence_file_id" TEXT,
  "govbr_level_required" TEXT,
  "vehicle_document_eligible_for_atpve" BOOLEAN,
  "observations_reviewed" BOOLEAN NOT NULL DEFAULT false,
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_notes" TEXT,
  "signature_hash" TEXT,
  "guidance" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "contract_document_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contract_document_packages_contract_id_key"
ON "contract_document_packages"("contract_id");

CREATE INDEX "contract_document_packages_store_id_sale_id_idx"
ON "contract_document_packages"("store_id", "sale_id");

CREATE INDEX "contract_document_packages_store_id_status_idx"
ON "contract_document_packages"("store_id", "status");

CREATE INDEX "contract_document_packages_signature_provider_idx"
ON "contract_document_packages"("signature_provider");

CREATE INDEX "contract_document_packages_signed_file_id_idx"
ON "contract_document_packages"("signed_file_id");

CREATE INDEX "contract_document_packages_atpve_file_id_idx"
ON "contract_document_packages"("atpve_file_id");

CREATE INDEX "contract_document_packages_atpve_evidence_file_id_idx"
ON "contract_document_packages"("atpve_evidence_file_id");
