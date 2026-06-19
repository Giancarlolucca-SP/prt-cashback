CREATE TABLE "sale_payment_checks" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "payment_item_type" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "expected_amount" DECIMAL(14, 2) NOT NULL,
  "confirmed_amount" DECIMAL(14, 2),
  "pending_amount" DECIMAL(14, 2),
  "payment_method" TEXT,
  "expected_at" TIMESTAMP(3),
  "bank_movement_at" TIMESTAMP(3),
  "bank_account_id" TEXT,
  "bank_description" TEXT,
  "bank_transaction_id" TEXT,
  "payer_or_receiver_name" TEXT,
  "payer_or_receiver_document" TEXT,
  "proof_file_id" TEXT,
  "bank_evidence_file_id" TEXT,
  "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
  "release_status" TEXT NOT NULL DEFAULT 'BLOCKED',
  "checked_by_user_id" TEXT,
  "checked_at" TIMESTAMP(3),
  "release_approved_by_user_id" TEXT,
  "release_approved_at" TIMESTAMP(3),
  "divergence_reason" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sale_payment_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_payment_checks_sale_id_payment_item_type_direction_key"
ON "sale_payment_checks"("sale_id", "payment_item_type", "direction");

CREATE INDEX "sale_payment_checks_store_id_sale_id_idx"
ON "sale_payment_checks"("store_id", "sale_id");

CREATE INDEX "sale_payment_checks_store_id_payment_status_idx"
ON "sale_payment_checks"("store_id", "payment_status");

CREATE INDEX "sale_payment_checks_store_id_release_status_idx"
ON "sale_payment_checks"("store_id", "release_status");

CREATE INDEX "sale_payment_checks_proof_file_id_idx"
ON "sale_payment_checks"("proof_file_id");

CREATE INDEX "sale_payment_checks_bank_evidence_file_id_idx"
ON "sale_payment_checks"("bank_evidence_file_id");
