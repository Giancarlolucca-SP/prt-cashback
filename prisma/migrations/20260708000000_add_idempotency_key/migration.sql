-- AlterTable: client-supplied idempotency key so accrueByCpf()/redeem() can
-- safely be retried after ANY failure (including one after the write already
-- committed) without double-crediting/double-debiting. NULL-able: Postgres
-- treats multiple NULLs as distinct under a unique constraint, so flows with
-- no natural key are unaffected.
ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Transaction_establishmentId_idempotencyKey_key" ON "Transaction"("establishmentId", "idempotencyKey");

ALTER TABLE "Redemption" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Redemption_establishmentId_idempotencyKey_key" ON "Redemption"("establishmentId", "idempotencyKey");
