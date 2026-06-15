-- AlterTable: link an Attendant to an Operator login (optional)
ALTER TABLE "Attendant" ADD COLUMN "operatorId" TEXT;
CREATE INDEX "Attendant_operatorId_idx" ON "Attendant"("operatorId");
ALTER TABLE "Attendant" ADD CONSTRAINT "Attendant_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: fuel classification + cashback-applied tracking on Abastecimento
ALTER TABLE "Abastecimento" ADD COLUMN "fuelName" TEXT;
ALTER TABLE "Abastecimento" ADD COLUMN "isAditivada" BOOLEAN;
ALTER TABLE "Abastecimento" ADD COLUMN "cashbackTransactionId" TEXT;
ALTER TABLE "Abastecimento" ADD COLUMN "cashbackCpf" TEXT;
ALTER TABLE "Abastecimento" ADD COLUMN "cashbackAppliedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Abastecimento_cashbackTransactionId_key" ON "Abastecimento"("cashbackTransactionId");

-- CreateTable: bico -> combustível map (per establishment)
CREATE TABLE "PistaFuelMap" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "nozzleCode" INTEGER NOT NULL,
    "fuelName" TEXT NOT NULL,
    "isAditivada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PistaFuelMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PistaFuelMap_establishmentId_nozzleCode_key" ON "PistaFuelMap"("establishmentId", "nozzleCode");
CREATE INDEX "PistaFuelMap_establishmentId_idx" ON "PistaFuelMap"("establishmentId");
ALTER TABLE "PistaFuelMap" ADD CONSTRAINT "PistaFuelMap_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Identfid card -> frentista (Attendant) map (per establishment)
CREATE TABLE "PistaCardMap" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "identfidCode" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PistaCardMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PistaCardMap_establishmentId_identfidCode_key" ON "PistaCardMap"("establishmentId", "identfidCode");
CREATE INDEX "PistaCardMap_establishmentId_idx" ON "PistaCardMap"("establishmentId");
CREATE INDEX "PistaCardMap_attendantId_idx" ON "PistaCardMap"("attendantId");
ALTER TABLE "PistaCardMap" ADD CONSTRAINT "PistaCardMap_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PistaCardMap" ADD CONSTRAINT "PistaCardMap_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "Attendant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
