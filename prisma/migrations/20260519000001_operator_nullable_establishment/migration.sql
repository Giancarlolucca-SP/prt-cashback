-- AlterTable: make Operator.establishmentId nullable to support SUPERADMIN accounts
ALTER TABLE "Operator" ALTER COLUMN "establishmentId" DROP NOT NULL;
