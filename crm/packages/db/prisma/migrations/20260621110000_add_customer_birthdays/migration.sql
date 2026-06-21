CREATE TABLE "customer_birthday_profiles" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "birth_day" INTEGER NOT NULL,
    "birth_month" INTEGER NOT NULL,
    "birth_date_source" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "birth_date_confidence" DECIMAL(5,4),
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "source_document_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customer_birthday_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "birthday_messages" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "birthday_profile_id" TEXT NOT NULL,
    "template_id" TEXT,
    "template_version" INTEGER,
    "message_text_snapshot" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "send_status" TEXT NOT NULL DEFAULT 'PREPARED',
    "responsible_user_id" TEXT,
    "prepared_by_user_id" TEXT,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "sent_by_user_id" TEXT,
    "response_text" TEXT,
    "response_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "opted_out_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "birthday_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_birthday_profiles_customer_id_key" ON "customer_birthday_profiles"("customer_id");
CREATE INDEX "customer_birthday_profiles_store_id_birth_month_birth_day_idx" ON "customer_birthday_profiles"("store_id", "birth_month", "birth_day");
CREATE INDEX "customer_birthday_profiles_store_id_status_idx" ON "customer_birthday_profiles"("store_id", "status");
CREATE INDEX "customer_birthday_profiles_customer_id_idx" ON "customer_birthday_profiles"("customer_id");
CREATE INDEX "birthday_messages_store_id_send_status_idx" ON "birthday_messages"("store_id", "send_status");
CREATE INDEX "birthday_messages_customer_id_idx" ON "birthday_messages"("customer_id");
CREATE INDEX "birthday_messages_birthday_profile_id_idx" ON "birthday_messages"("birthday_profile_id");
CREATE INDEX "birthday_messages_template_id_idx" ON "birthday_messages"("template_id");
CREATE INDEX "birthday_messages_prepared_at_idx" ON "birthday_messages"("prepared_at");
CREATE INDEX "birthday_messages_sent_at_idx" ON "birthday_messages"("sent_at");
