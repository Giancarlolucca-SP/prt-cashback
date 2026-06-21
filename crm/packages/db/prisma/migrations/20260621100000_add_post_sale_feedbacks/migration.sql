CREATE TABLE "post_sale_feedbacks" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "post_sale_alert_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "original_seller_user_id" TEXT,
    "assigned_user_id" TEXT,
    "contact_at" TIMESTAMP(3) NOT NULL,
    "contact_channel" TEXT NOT NULL,
    "contact_result" TEXT NOT NULL,
    "feedback_notes" TEXT,
    "has_purchase_interest" BOOLEAN NOT NULL DEFAULT false,
    "interest_type" TEXT NOT NULL DEFAULT 'NONE',
    "vehicle_interest_id" TEXT,
    "vehicle_interest_notes" TEXT,
    "next_action" TEXT,
    "next_action_at" TIMESTAMP(3),
    "created_lead_id" TEXT,
    "created_card_id" TEXT,
    "created_internal_issue_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "audit_log_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "post_sale_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "post_sale_internal_issues" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "post_sale_feedback_id" TEXT NOT NULL,
    "post_sale_alert_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "issue_type" TEXT NOT NULL DEFAULT 'VEHICLE_PROBLEM',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "description" TEXT NOT NULL,
    "responsible_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "post_sale_internal_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_sale_feedbacks_post_sale_alert_id_key" ON "post_sale_feedbacks"("post_sale_alert_id");
CREATE INDEX "post_sale_feedbacks_store_id_idx" ON "post_sale_feedbacks"("store_id");
CREATE INDEX "post_sale_feedbacks_customer_id_idx" ON "post_sale_feedbacks"("customer_id");
CREATE INDEX "post_sale_feedbacks_sale_id_idx" ON "post_sale_feedbacks"("sale_id");
CREATE INDEX "post_sale_feedbacks_vehicle_id_idx" ON "post_sale_feedbacks"("vehicle_id");
CREATE INDEX "post_sale_feedbacks_assigned_user_id_idx" ON "post_sale_feedbacks"("assigned_user_id");
CREATE INDEX "post_sale_feedbacks_contact_result_idx" ON "post_sale_feedbacks"("contact_result");
CREATE INDEX "post_sale_feedbacks_contact_channel_idx" ON "post_sale_feedbacks"("contact_channel");
CREATE INDEX "post_sale_feedbacks_interest_type_idx" ON "post_sale_feedbacks"("interest_type");
CREATE INDEX "post_sale_feedbacks_created_card_id_idx" ON "post_sale_feedbacks"("created_card_id");
CREATE INDEX "post_sale_feedbacks_created_internal_issue_id_idx" ON "post_sale_feedbacks"("created_internal_issue_id");
CREATE INDEX "post_sale_internal_issues_store_id_status_idx" ON "post_sale_internal_issues"("store_id", "status");
CREATE INDEX "post_sale_internal_issues_post_sale_feedback_id_idx" ON "post_sale_internal_issues"("post_sale_feedback_id");
CREATE INDEX "post_sale_internal_issues_post_sale_alert_id_idx" ON "post_sale_internal_issues"("post_sale_alert_id");
CREATE INDEX "post_sale_internal_issues_customer_id_idx" ON "post_sale_internal_issues"("customer_id");
CREATE INDEX "post_sale_internal_issues_sale_id_idx" ON "post_sale_internal_issues"("sale_id");
CREATE INDEX "post_sale_internal_issues_vehicle_id_idx" ON "post_sale_internal_issues"("vehicle_id");
CREATE INDEX "post_sale_internal_issues_responsible_user_id_idx" ON "post_sale_internal_issues"("responsible_user_id");
