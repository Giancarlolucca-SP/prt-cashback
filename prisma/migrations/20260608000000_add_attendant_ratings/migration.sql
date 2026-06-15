-- CreateTable
CREATE TABLE "AttendantRating" (
    "id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "attendantName" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendantRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendantRating_transactionId_key" ON "AttendantRating"("transactionId");

-- CreateIndex
CREATE INDEX "AttendantRating_establishmentId_idx" ON "AttendantRating"("establishmentId");

-- CreateIndex
CREATE INDEX "AttendantRating_attendantName_idx" ON "AttendantRating"("attendantName");

-- CreateIndex
CREATE INDEX "AttendantRating_createdAt_idx" ON "AttendantRating"("createdAt");

-- AddForeignKey
ALTER TABLE "AttendantRating" ADD CONSTRAINT "AttendantRating_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendantRating" ADD CONSTRAINT "AttendantRating_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendantRating" ADD CONSTRAINT "AttendantRating_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
