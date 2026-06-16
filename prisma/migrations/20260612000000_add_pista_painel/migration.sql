-- AlterTable: stub flag for pista accruals (CPF without account yet)
ALTER TABLE "Customer" ADD COLUMN "registered" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: tag pista redemptions + non-fiscal comprovante reference
ALTER TABLE "Redemption" ADD COLUMN "source" TEXT;
ALTER TABLE "Redemption" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "RedemptionRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "operatorId" TEXT,
    "redemptionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RedemptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionRequest_redemptionId_key" ON "RedemptionRequest"("redemptionId");

-- CreateIndex
CREATE INDEX "RedemptionRequest_establishmentId_status_idx" ON "RedemptionRequest"("establishmentId", "status");

-- CreateIndex
CREATE INDEX "RedemptionRequest_customerId_idx" ON "RedemptionRequest"("customerId");

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionRequest" ADD CONSTRAINT "RedemptionRequest_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
