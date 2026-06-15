-- CreateTable
CREATE TABLE "Abastecimento" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "registro" INTEGER NOT NULL,
    "nozzleCode" INTEGER NOT NULL,
    "fuelCode" INTEGER,
    "volumeLiters" DECIMAL(12,3) NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,3) NOT NULL,
    "fuelingDateTime" TIMESTAMP(3) NOT NULL,
    "encerranteFinal" DECIMAL(14,3) NOT NULL,
    "attendantTag" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CONCENTRADOR',
    "rawPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Abastecimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Abastecimento_establishmentId_registro_encerranteFinal_fueli_key" ON "Abastecimento"("establishmentId", "registro", "encerranteFinal", "fuelingDateTime");

-- CreateIndex
CREATE INDEX "Abastecimento_establishmentId_fuelingDateTime_idx" ON "Abastecimento"("establishmentId", "fuelingDateTime");

-- AddForeignKey
ALTER TABLE "Abastecimento" ADD CONSTRAINT "Abastecimento_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
