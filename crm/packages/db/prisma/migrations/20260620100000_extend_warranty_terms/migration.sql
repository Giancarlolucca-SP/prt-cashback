ALTER TABLE "warranty_terms"
  ADD COLUMN "source_contract_id" TEXT,
  ADD COLUMN "template_id" TEXT,
  ADD COLUMN "generated_file_id" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'GENERATED',
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "generated_at" TIMESTAMP(3),
  ADD COLUMN "printed_at" TIMESTAMP(3),
  ADD COLUMN "printed_by_user_id" TEXT,
  ADD COLUMN "signed_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "signed_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "signed_confirmed_by_user_id" TEXT,
  ADD COLUMN "signature_observation" TEXT,
  ADD COLUMN "all_documents_signed_status" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURES',
  ADD COLUMN "reprint_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_reprint_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "warranty_terms"
SET "generated_at" = "created_at",
    "status" = 'GENERATED'
WHERE "generated_at" IS NULL;

CREATE INDEX "warranty_terms_source_contract_id_idx" ON "warranty_terms"("source_contract_id");
CREATE INDEX "warranty_terms_generated_file_id_idx" ON "warranty_terms"("generated_file_id");
CREATE INDEX "warranty_terms_store_id_status_idx" ON "warranty_terms"("store_id", "status");
CREATE INDEX "warranty_terms_store_id_signed_status_idx" ON "warranty_terms"("store_id", "signed_status");