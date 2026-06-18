-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "financing_type" TEXT,
ADD COLUMN     "has_financing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initial_docs_status" TEXT,
ADD COLUMN     "lead_card_id" TEXT,
ADD COLUMN     "lead_id" TEXT,
ADD COLUMN     "payment_method_forecast" TEXT;

-- CreateIndex
CREATE INDEX "sales_lead_card_id_idx" ON "sales"("lead_card_id");
