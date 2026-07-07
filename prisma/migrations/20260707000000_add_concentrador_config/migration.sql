-- CreateTable: per-establishment TCP connection settings for the pista-agent
-- (Companytec concentrador), so a station's agent can pick them up from the
-- cloud instead of requiring someone to edit its local .env by hand.
CREATE TABLE "ConcentradorConfig" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL DEFAULT 2001,
    "pollIntervalMs" INTEGER NOT NULL DEFAULT 1000,
    "retryIntervalMs" INTEGER NOT NULL DEFAULT 5000,
    "socketTimeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "useChecksum" BOOLEAN NOT NULL DEFAULT false,
    "readMode" TEXT NOT NULL DEFAULT 'identified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcentradorConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConcentradorConfig_establishmentId_key" ON "ConcentradorConfig"("establishmentId");

ALTER TABLE "ConcentradorConfig" ADD CONSTRAINT "ConcentradorConfig_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
