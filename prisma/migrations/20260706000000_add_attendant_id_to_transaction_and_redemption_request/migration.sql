-- AlterTable: resolve the individual frentista (Attendant) on Transaction, distinct
-- from the shared Operator login that always processes Pista requests.
ALTER TABLE "Transaction" ADD COLUMN "attendantId" TEXT;
CREATE INDEX "Transaction_attendantId_idx" ON "Transaction"("attendantId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: same for RedemptionRequest (the frentista who confirmed the baixa).
ALTER TABLE "RedemptionRequest" ADD COLUMN "attendantId" TEXT;
CREATE INDEX "RedemptionRequest_attendantId_idx" ON "RedemptionRequest"("attendantId");
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: same for Redemption (the actual ledger row), so caixaReport can
-- group by frentista instead of only by the shared operatorId.
ALTER TABLE "Redemption" ADD COLUMN "attendantId" TEXT;
CREATE INDEX "Redemption_attendantId_idx" ON "Redemption"("attendantId");
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
