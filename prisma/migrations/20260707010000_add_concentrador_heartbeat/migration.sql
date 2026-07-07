-- AlterTable: agent heartbeat fields, so the admin screen can show
-- online/offline instead of just the saved connection settings.
ALTER TABLE "ConcentradorConfig" ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "ConcentradorConfig" ADD COLUMN "lastHeartbeatOk" BOOLEAN;
ALTER TABLE "ConcentradorConfig" ADD COLUMN "lastError" TEXT;
ALTER TABLE "ConcentradorConfig" ADD COLUMN "agentVersion" TEXT;
