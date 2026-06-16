-- CreateTable
CREATE TABLE "Attendant" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "attendantKey" TEXT NOT NULL,
    "photoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendant_establishmentId_idx" ON "Attendant"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendant_establishmentId_attendantKey_key" ON "Attendant"("establishmentId", "attendantKey");

-- AddForeignKey
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
