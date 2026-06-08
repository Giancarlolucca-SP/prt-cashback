-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER_MANAGER', 'ADMIN', 'ADMINISTRATIVE', 'SELLER', 'SDR', 'APPRAISER', 'SERVICE_MANAGER');

-- CreateEnum
CREATE TYPE "PermissionScopeType" AS ENUM ('ALL', 'OWN_PORTFOLIO', 'OWN_LEAD', 'OWN_SALE', 'LINKED_VEHICLE', 'STORE', 'NONE');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'SCHEDULED', 'NEGOTIATION', 'WON', 'LOST', 'COLD');

-- CreateEnum
CREATE TYPE "VehicleOwnershipType" AS ENUM ('OWN', 'CONSIGNED', 'REPASSE', 'TRADE_IN');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_PREPARATION', 'AVAILABLE', 'RESERVED', 'SOLD', 'REPASSE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('VEHICLE', 'REPASSE', 'SERVICE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'PROPOSAL', 'APPROVED', 'DOCUMENTATION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('OPEN', 'EVALUATING', 'APPROVED', 'REJECTED', 'PURCHASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvaluationDecision" AS ENUM ('PENDING', 'APPROVED_BUY', 'APPROVED_REPASSE', 'REJECTED', 'NEGOTIATING');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "FinancialTransactionStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PAID', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'PAUSED', 'SOLD', 'ERROR');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'SCHEDULED', 'RUNNING', 'WAITING_PROVIDER', 'WAITING_INVOICE', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DONE', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "FileAttachmentStatus" AS ENUM ('ACTIVE', 'DELETED', 'RETAINED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_HUMAN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "cnpj" TEXT,
    "state_tax_id" TEXT,
    "tax_regime" TEXT,
    "cnaes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" "PermissionScopeType" NOT NULL,
    "sensitive_area" TEXT,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_scopes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "scope" "PermissionScopeType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "revoked_at" TIMESTAMP(3),
    "force_reauth_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_responsibility_transfers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "reason" TEXT,
    "transferred_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_responsibility_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_tax_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_regime" TEXT,
    "profit_tax_rate" DECIMAL(6,4),
    "snapshot" JSONB,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_tax_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_settings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "document" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accountant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens_at" TEXT,
    "closes_at" TEXT,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_holidays" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_deadlines" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurable_categories" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "configurable_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "snapshot" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "variables" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_parameters" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'PERSON',
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "birth_date" TIMESTAMP(3),
    "origin" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_sale_customers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "vehicle_info" TEXT,
    "recurrence_status" TEXT,
    "total_revenue" DECIMAL(14,2),
    "last_service_at" TIMESTAMP(3),
    "next_action_at" TIMESTAMP(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "post_sale_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_history_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_interactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "summary" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_preferences" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_relationship_flags" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_relationship_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "assigned_user_id" TEXT,
    "source" TEXT,
    "title" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "interest" TEXT,
    "temperature" INTEGER,
    "next_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_cards" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "board_key" TEXT NOT NULL,
    "stage_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "assigned_user_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "vehicle_id" TEXT,
    "assigned_user_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "assigned_user_id" TEXT,
    "type" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT,
    "year_model" INTEGER,
    "year_build" INTEGER,
    "plate" TEXT,
    "vin" TEXT,
    "color" TEXT,
    "mileage" INTEGER,
    "fipe_code" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_inventory_records" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "ownership_type" "VehicleOwnershipType" NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'IN_PREPARATION',
    "owner_customer_id" TEXT,
    "purchase_cost" DECIMAL(14,2),
    "asking_price" DECIMAL(14,2),
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exit_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_inventory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_costs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "inventory_id" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capitalized" BOOLEAN NOT NULL DEFAULT true,
    "financial_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_preparation_items" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "service_order_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_preparation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_inspections" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" TEXT,
    "checklist" JSONB,
    "inspected_by_user_id" TEXT,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_history" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_margin_snapshots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "inventory_id" TEXT,
    "sale_id" TEXT,
    "revenue" DECIMAL(14,2),
    "total_cost" DECIMAL(14,2),
    "margin_amount" DECIMAL(14,2),
    "margin_rate" DECIMAL(8,4),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_margin_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "seller_user_id" TEXT,
    "type" "SaleType" NOT NULL DEFAULT 'VEHICLE',
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "sale_price" DECIMAL(14,2),
    "gross_margin" DECIMAL(14,2),
    "snapshot" JSONB,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_cards" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "stage_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_stage_history" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payment_terms" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_at" TIMESTAMP(3),
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_document_checklists" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_document_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "template_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_terms" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_checklists" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatcher_processes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" TEXT NOT NULL,
    "channel" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatcher_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_leads" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "source" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'OPEN',
    "asking_price" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "purchase_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_evaluations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "purchase_lead_id" TEXT,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "appraiser_user_id" TEXT,
    "requested_price" DECIMAL(14,2),
    "fipe_value" DECIMAL(14,2),
    "suggested_price" DECIMAL(14,2),
    "expected_prep_cost" DECIMAL(14,2),
    "expected_margin" DECIMAL(14,2),
    "decision" "EvaluationDecision" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_checklists" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_approvals" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "evaluation_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "purchase_lead_id" TEXT,
    "vehicle_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasse_processes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" DECIMAL(14,2),
    "channelPlan" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "repasse_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasse_revenues" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "repasse_process_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "snapshot" JSONB,
    "recognized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repasse_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_restriction_checks" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "customer_id" TEXT,
    "provider" TEXT NOT NULL,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_restriction_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bank_name" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialTransactionType" NOT NULL,
    "dre_group" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "account_id" TEXT,
    "category_id" TEXT,
    "type" "FinancialTransactionType" NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "entity_type" TEXT,
    "entity_id" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_financial_results" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "revenue" DECIMAL(14,2),
    "total_cost" DECIMAL(14,2),
    "net_profit" DECIMAL(14,2),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_financial_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dre_snapshots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "view" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "data" JSONB NOT NULL,
    "closed_by_user_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dre_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_sheet_snapshots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "assets" JSONB NOT NULL,
    "liabilities" JSONB NOT NULL,
    "equity" JSONB NOT NULL,
    "is_balanced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_sheet_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "value" DECIMAL(12,4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "snapshot" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_calculations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT,
    "sale_id" TEXT,
    "service_order_id" TEXT,
    "rule_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_adjustments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "commission_calculation_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_settings_snapshots" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_settings_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "account_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "asking_price" DECIMAL(14,2),
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_channels" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "settings" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "listing_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_publications" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "external_id" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "unpublished_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_sync_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "listing_id" TEXT,
    "publication_id" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "response" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_metrics" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "channel_id" TEXT,
    "metric_date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(8,4),
    "conversion_rate" DECIMAL(8,4),
    "cost_per_lead" DECIMAL(14,2),
    "score" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_costs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_results" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "result_date" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "document" TEXT,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "access_url" TEXT,
    "access_login" TEXT,
    "access_secret_ref" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "base_price" DECIMAL(14,2),
    "sla_hours" INTEGER,
    "commission_rule_id" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "post_sale_customer_id" TEXT,
    "vehicle_id" TEXT,
    "sale_id" TEXT,
    "provider_id" TEXT,
    "type" TEXT NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "total_amount" DECIMAL(14,2),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_items" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2),
    "cost_amount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_appointments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "service_order_id" TEXT,
    "customer_id" TEXT,
    "provider_id" TEXT,
    "professional_user_id" TEXT,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_costs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_invoices" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "service_order_id" TEXT,
    "provider_id" TEXT,
    "number" TEXT,
    "amount" DECIMAL(14,2),
    "issued_at" TIMESTAMP(3),
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_payables" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "service_order_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "checksum" TEXT,
    "classification" TEXT,
    "status" "FileAttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachment_links" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "attachment_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "purpose" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_classifications" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "retention_policy" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "attachment_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "attachment_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_retention_records" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_retention_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_channels" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "communication_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instance_key" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "settings" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "channel_id" TEXT,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "sender" TEXT,
    "recipient" TEXT,
    "body" TEXT,
    "metadata" JSONB,
    "sent_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "subject" TEXT,
    "from_address" TEXT,
    "to_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "email_message_id" TEXT NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_preferences" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "channel" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rule_versions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "rule_id" TEXT,
    "rule_version" INTEGER,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "status" TEXT NOT NULL,
    "context" JSONB,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_tests" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "job_type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "idempotency_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "result" JSONB,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_execution_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "job_id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_ocr_jobs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "attachment_id" TEXT NOT NULL,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "result" JSONB,
    "error" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_ocr_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extracted_fields" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "ocr_job_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "value" TEXT,
    "confidence" DECIMAL(5,4),
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_query_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "user_id" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_cents" INTEGER,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "user_id" TEXT,
    "purpose" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "content" JSONB NOT NULL,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestion_feedback" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "suggestion_id" TEXT NOT NULL,
    "user_id" TEXT,
    "feedback" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestion_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_query_jobs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "status" "QueryStatus" NOT NULL DEFAULT 'PENDING',
    "requires_human_action" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_query_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_query_results" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "job_id" TEXT NOT NULL,
    "status" "QueryStatus" NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_query_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "module" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "store_id" TEXT,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_status_logs" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stores_cnpj_key" ON "stores"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_store_id_idx" ON "users"("store_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "roles_store_id_idx" ON "roles"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_store_id_code_key" ON "roles"("store_id", "code");

-- CreateIndex
CREATE INDEX "permissions_module_action_idx" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_scope_sensitive_area_key" ON "permissions"("module", "action", "scope", "sensitive_area");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");

-- CreateIndex
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_id_effect_key" ON "user_permissions"("user_id", "permission_id", "effect");

-- CreateIndex
CREATE INDEX "permission_scopes_user_id_idx" ON "permission_scopes"("user_id");

-- CreateIndex
CREATE INDEX "permission_scopes_module_idx" ON "permission_scopes"("module");

-- CreateIndex
CREATE INDEX "permission_scopes_entity_type_entity_id_idx" ON "permission_scopes"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions"("revoked_at");

-- CreateIndex
CREATE INDEX "user_responsibility_transfers_store_id_idx" ON "user_responsibility_transfers"("store_id");

-- CreateIndex
CREATE INDEX "user_responsibility_transfers_from_user_id_idx" ON "user_responsibility_transfers"("from_user_id");

-- CreateIndex
CREATE INDEX "user_responsibility_transfers_to_user_id_idx" ON "user_responsibility_transfers"("to_user_id");

-- CreateIndex
CREATE INDEX "user_responsibility_transfers_entity_type_entity_id_idx" ON "user_responsibility_transfers"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_store_id_key_key" ON "store_settings"("store_id", "key");

-- CreateIndex
CREATE INDEX "store_tax_settings_store_id_idx" ON "store_tax_settings"("store_id");

-- CreateIndex
CREATE INDEX "accountant_settings_store_id_idx" ON "accountant_settings"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_store_id_weekday_key" ON "business_hours"("store_id", "weekday");

-- CreateIndex
CREATE INDEX "store_holidays_store_id_date_idx" ON "store_holidays"("store_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "operational_deadlines_store_id_module_action_key" ON "operational_deadlines"("store_id", "module", "action");

-- CreateIndex
CREATE INDEX "configurable_categories_store_id_domain_idx" ON "configurable_categories"("store_id", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "configurable_categories_store_id_domain_name_key" ON "configurable_categories"("store_id", "domain", "name");

-- CreateIndex
CREATE INDEX "document_templates_store_id_module_idx" ON "document_templates"("store_id", "module");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_store_id_name_version_key" ON "document_templates"("store_id", "name", "version");

-- CreateIndex
CREATE INDEX "message_templates_store_id_channel_idx" ON "message_templates"("store_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_store_id_name_version_key" ON "message_templates"("store_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "operational_parameters_store_id_key_key" ON "operational_parameters"("store_id", "key");

-- CreateIndex
CREATE INDEX "customers_store_id_idx" ON "customers"("store_id");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_store_id_document_key" ON "customers"("store_id", "document");

-- CreateIndex
CREATE INDEX "post_sale_customers_store_id_idx" ON "post_sale_customers"("store_id");

-- CreateIndex
CREATE INDEX "post_sale_customers_customer_id_idx" ON "post_sale_customers"("customer_id");

-- CreateIndex
CREATE INDEX "customer_contacts_store_id_idx" ON "customer_contacts"("store_id");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");

-- CreateIndex
CREATE INDEX "customer_addresses_store_id_idx" ON "customer_addresses"("store_id");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "customer_history_events_store_id_idx" ON "customer_history_events"("store_id");

-- CreateIndex
CREATE INDEX "customer_history_events_customer_id_occurred_at_idx" ON "customer_history_events"("customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "customer_interactions_store_id_idx" ON "customer_interactions"("store_id");

-- CreateIndex
CREATE INDEX "customer_interactions_customer_id_occurred_at_idx" ON "customer_interactions"("customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "customer_interactions_entity_type_entity_id_idx" ON "customer_interactions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "privacy_preferences_store_id_idx" ON "privacy_preferences"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_preferences_customer_id_channel_key" ON "privacy_preferences"("customer_id", "channel");

-- CreateIndex
CREATE INDEX "customer_relationship_flags_store_id_idx" ON "customer_relationship_flags"("store_id");

-- CreateIndex
CREATE INDEX "customer_relationship_flags_customer_id_idx" ON "customer_relationship_flags"("customer_id");

-- CreateIndex
CREATE INDEX "leads_store_id_idx" ON "leads"("store_id");

-- CreateIndex
CREATE INDEX "leads_customer_id_idx" ON "leads"("customer_id");

-- CreateIndex
CREATE INDEX "leads_assigned_user_id_idx" ON "leads"("assigned_user_id");

-- CreateIndex
CREATE INDEX "leads_status_next_action_at_idx" ON "leads"("status", "next_action_at");

-- CreateIndex
CREATE INDEX "lead_cards_store_id_board_key_stage_key_idx" ON "lead_cards"("store_id", "board_key", "stage_key");

-- CreateIndex
CREATE INDEX "lead_cards_lead_id_idx" ON "lead_cards"("lead_id");

-- CreateIndex
CREATE INDEX "lead_stage_history_store_id_idx" ON "lead_stage_history"("store_id");

-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_created_at_idx" ON "lead_stage_history"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_assignments_store_id_idx" ON "lead_assignments"("store_id");

-- CreateIndex
CREATE INDEX "lead_assignments_lead_id_idx" ON "lead_assignments"("lead_id");

-- CreateIndex
CREATE INDEX "lead_assignments_assigned_user_id_idx" ON "lead_assignments"("assigned_user_id");

-- CreateIndex
CREATE INDEX "appointments_store_id_starts_at_idx" ON "appointments"("store_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_customer_id_idx" ON "appointments"("customer_id");

-- CreateIndex
CREATE INDEX "appointments_lead_id_idx" ON "appointments"("lead_id");

-- CreateIndex
CREATE INDEX "follow_ups_store_id_due_at_idx" ON "follow_ups"("store_id", "due_at");

-- CreateIndex
CREATE INDEX "follow_ups_lead_id_idx" ON "follow_ups"("lead_id");

-- CreateIndex
CREATE INDEX "follow_ups_customer_id_idx" ON "follow_ups"("customer_id");

-- CreateIndex
CREATE INDEX "vehicles_store_id_idx" ON "vehicles"("store_id");

-- CreateIndex
CREATE INDEX "vehicles_vin_idx" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_store_id_plate_key" ON "vehicles"("store_id", "plate");

-- CreateIndex
CREATE INDEX "vehicle_inventory_records_store_id_status_idx" ON "vehicle_inventory_records"("store_id", "status");

-- CreateIndex
CREATE INDEX "vehicle_inventory_records_vehicle_id_idx" ON "vehicle_inventory_records"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_inventory_records_ownership_type_idx" ON "vehicle_inventory_records"("ownership_type");

-- CreateIndex
CREATE INDEX "vehicle_costs_store_id_idx" ON "vehicle_costs"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_costs_vehicle_id_idx" ON "vehicle_costs"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_costs_inventory_id_idx" ON "vehicle_costs"("inventory_id");

-- CreateIndex
CREATE INDEX "vehicle_preparation_items_store_id_idx" ON "vehicle_preparation_items"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_preparation_items_vehicle_id_idx" ON "vehicle_preparation_items"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_inspections_store_id_idx" ON "vehicle_inspections"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_inspections_vehicle_id_idx" ON "vehicle_inspections"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_status_history_store_id_idx" ON "vehicle_status_history"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_status_history_vehicle_id_created_at_idx" ON "vehicle_status_history"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "vehicle_margin_snapshots_store_id_idx" ON "vehicle_margin_snapshots"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_margin_snapshots_vehicle_id_idx" ON "vehicle_margin_snapshots"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_margin_snapshots_sale_id_idx" ON "vehicle_margin_snapshots"("sale_id");

-- CreateIndex
CREATE INDEX "sales_store_id_status_idx" ON "sales"("store_id", "status");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_vehicle_id_idx" ON "sales"("vehicle_id");

-- CreateIndex
CREATE INDEX "sales_seller_user_id_idx" ON "sales"("seller_user_id");

-- CreateIndex
CREATE INDEX "sale_cards_store_id_stage_key_idx" ON "sale_cards"("store_id", "stage_key");

-- CreateIndex
CREATE INDEX "sale_cards_sale_id_idx" ON "sale_cards"("sale_id");

-- CreateIndex
CREATE INDEX "sale_stage_history_store_id_idx" ON "sale_stage_history"("store_id");

-- CreateIndex
CREATE INDEX "sale_stage_history_sale_id_created_at_idx" ON "sale_stage_history"("sale_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_payment_terms_store_id_idx" ON "sale_payment_terms"("store_id");

-- CreateIndex
CREATE INDEX "sale_payment_terms_sale_id_idx" ON "sale_payment_terms"("sale_id");

-- CreateIndex
CREATE INDEX "sale_document_checklists_store_id_idx" ON "sale_document_checklists"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_document_checklists_sale_id_item_key_key" ON "sale_document_checklists"("sale_id", "item_key");

-- CreateIndex
CREATE INDEX "contracts_store_id_idx" ON "contracts"("store_id");

-- CreateIndex
CREATE INDEX "contracts_sale_id_idx" ON "contracts"("sale_id");

-- CreateIndex
CREATE INDEX "warranty_terms_store_id_idx" ON "warranty_terms"("store_id");

-- CreateIndex
CREATE INDEX "warranty_terms_sale_id_idx" ON "warranty_terms"("sale_id");

-- CreateIndex
CREATE INDEX "delivery_checklists_store_id_idx" ON "delivery_checklists"("store_id");

-- CreateIndex
CREATE INDEX "delivery_checklists_sale_id_idx" ON "delivery_checklists"("sale_id");

-- CreateIndex
CREATE INDEX "dispatcher_processes_store_id_idx" ON "dispatcher_processes"("store_id");

-- CreateIndex
CREATE INDEX "dispatcher_processes_sale_id_idx" ON "dispatcher_processes"("sale_id");

-- CreateIndex
CREATE INDEX "purchase_leads_store_id_status_idx" ON "purchase_leads"("store_id", "status");

-- CreateIndex
CREATE INDEX "purchase_leads_customer_id_idx" ON "purchase_leads"("customer_id");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_store_id_idx" ON "vehicle_evaluations"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_purchase_lead_id_idx" ON "vehicle_evaluations"("purchase_lead_id");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_vehicle_id_idx" ON "vehicle_evaluations"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_evaluations_decision_idx" ON "vehicle_evaluations"("decision");

-- CreateIndex
CREATE INDEX "evaluation_checklists_store_id_idx" ON "evaluation_checklists"("store_id");

-- CreateIndex
CREATE INDEX "evaluation_checklists_evaluation_id_idx" ON "evaluation_checklists"("evaluation_id");

-- CreateIndex
CREATE INDEX "purchase_approvals_store_id_idx" ON "purchase_approvals"("store_id");

-- CreateIndex
CREATE INDEX "purchase_approvals_evaluation_id_idx" ON "purchase_approvals"("evaluation_id");

-- CreateIndex
CREATE INDEX "purchase_payments_store_id_idx" ON "purchase_payments"("store_id");

-- CreateIndex
CREATE INDEX "purchase_payments_purchase_lead_id_idx" ON "purchase_payments"("purchase_lead_id");

-- CreateIndex
CREATE INDEX "purchase_payments_vehicle_id_idx" ON "purchase_payments"("vehicle_id");

-- CreateIndex
CREATE INDEX "repasse_processes_store_id_status_idx" ON "repasse_processes"("store_id", "status");

-- CreateIndex
CREATE INDEX "repasse_processes_vehicle_id_idx" ON "repasse_processes"("vehicle_id");

-- CreateIndex
CREATE INDEX "repasse_revenues_store_id_idx" ON "repasse_revenues"("store_id");

-- CreateIndex
CREATE INDEX "repasse_revenues_repasse_process_id_idx" ON "repasse_revenues"("repasse_process_id");

-- CreateIndex
CREATE INDEX "legal_restriction_checks_store_id_idx" ON "legal_restriction_checks"("store_id");

-- CreateIndex
CREATE INDEX "legal_restriction_checks_vehicle_id_idx" ON "legal_restriction_checks"("vehicle_id");

-- CreateIndex
CREATE INDEX "legal_restriction_checks_customer_id_idx" ON "legal_restriction_checks"("customer_id");

-- CreateIndex
CREATE INDEX "financial_accounts_store_id_idx" ON "financial_accounts"("store_id");

-- CreateIndex
CREATE INDEX "financial_categories_store_id_idx" ON "financial_categories"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_categories_store_id_name_type_key" ON "financial_categories"("store_id", "name", "type");

-- CreateIndex
CREATE INDEX "financial_transactions_store_id_status_idx" ON "financial_transactions"("store_id", "status");

-- CreateIndex
CREATE INDEX "financial_transactions_due_at_idx" ON "financial_transactions"("due_at");

-- CreateIndex
CREATE INDEX "financial_transactions_entity_type_entity_id_idx" ON "financial_transactions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "vehicle_financial_results_store_id_idx" ON "vehicle_financial_results"("store_id");

-- CreateIndex
CREATE INDEX "vehicle_financial_results_vehicle_id_idx" ON "vehicle_financial_results"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_financial_results_sale_id_idx" ON "vehicle_financial_results"("sale_id");

-- CreateIndex
CREATE INDEX "dre_snapshots_store_id_idx" ON "dre_snapshots"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "dre_snapshots_store_id_period_start_period_end_view_key" ON "dre_snapshots"("store_id", "period_start", "period_end", "view");

-- CreateIndex
CREATE UNIQUE INDEX "balance_sheet_snapshots_store_id_period_end_key" ON "balance_sheet_snapshots"("store_id", "period_end");

-- CreateIndex
CREATE INDEX "commission_rules_store_id_idx" ON "commission_rules"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_store_id_name_version_key" ON "commission_rules"("store_id", "name", "version");

-- CreateIndex
CREATE INDEX "commission_calculations_store_id_status_idx" ON "commission_calculations"("store_id", "status");

-- CreateIndex
CREATE INDEX "commission_calculations_user_id_idx" ON "commission_calculations"("user_id");

-- CreateIndex
CREATE INDEX "commission_calculations_sale_id_idx" ON "commission_calculations"("sale_id");

-- CreateIndex
CREATE INDEX "commission_calculations_service_order_id_idx" ON "commission_calculations"("service_order_id");

-- CreateIndex
CREATE INDEX "commission_adjustments_store_id_idx" ON "commission_adjustments"("store_id");

-- CreateIndex
CREATE INDEX "commission_adjustments_commission_calculation_id_idx" ON "commission_adjustments"("commission_calculation_id");

-- CreateIndex
CREATE INDEX "tax_settings_snapshots_store_id_idx" ON "tax_settings_snapshots"("store_id");

-- CreateIndex
CREATE INDEX "tax_settings_snapshots_entity_type_entity_id_idx" ON "tax_settings_snapshots"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_store_id_idx" ON "bank_reconciliations"("store_id");

-- CreateIndex
CREATE INDEX "bank_reconciliations_account_id_idx" ON "bank_reconciliations"("account_id");

-- CreateIndex
CREATE INDEX "listings_store_id_status_idx" ON "listings"("store_id", "status");

-- CreateIndex
CREATE INDEX "listings_vehicle_id_idx" ON "listings"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_channels_store_id_name_key" ON "listing_channels"("store_id", "name");

-- CreateIndex
CREATE INDEX "listing_publications_store_id_status_idx" ON "listing_publications"("store_id", "status");

-- CreateIndex
CREATE INDEX "listing_publications_listing_id_idx" ON "listing_publications"("listing_id");

-- CreateIndex
CREATE INDEX "listing_publications_channel_id_idx" ON "listing_publications"("channel_id");

-- CreateIndex
CREATE INDEX "listing_sync_logs_store_id_idx" ON "listing_sync_logs"("store_id");

-- CreateIndex
CREATE INDEX "listing_sync_logs_listing_id_idx" ON "listing_sync_logs"("listing_id");

-- CreateIndex
CREATE INDEX "listing_metrics_store_id_idx" ON "listing_metrics"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_metrics_listing_id_channel_id_metric_date_key" ON "listing_metrics"("listing_id", "channel_id", "metric_date");

-- CreateIndex
CREATE INDEX "campaigns_store_id_idx" ON "campaigns"("store_id");

-- CreateIndex
CREATE INDEX "campaign_costs_store_id_idx" ON "campaign_costs"("store_id");

-- CreateIndex
CREATE INDEX "campaign_costs_campaign_id_idx" ON "campaign_costs"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_results_store_id_idx" ON "campaign_results"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_results_campaign_id_result_date_key" ON "campaign_results"("campaign_id", "result_date");

-- CreateIndex
CREATE INDEX "service_providers_store_id_idx" ON "service_providers"("store_id");

-- CreateIndex
CREATE INDEX "service_catalog_items_store_id_category_idx" ON "service_catalog_items"("store_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_store_id_name_key" ON "service_catalog_items"("store_id", "name");

-- CreateIndex
CREATE INDEX "service_orders_store_id_status_idx" ON "service_orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "service_orders_customer_id_idx" ON "service_orders"("customer_id");

-- CreateIndex
CREATE INDEX "service_orders_post_sale_customer_id_idx" ON "service_orders"("post_sale_customer_id");

-- CreateIndex
CREATE INDEX "service_orders_vehicle_id_idx" ON "service_orders"("vehicle_id");

-- CreateIndex
CREATE INDEX "service_order_items_store_id_idx" ON "service_order_items"("store_id");

-- CreateIndex
CREATE INDEX "service_order_items_service_order_id_idx" ON "service_order_items"("service_order_id");

-- CreateIndex
CREATE INDEX "service_appointments_store_id_starts_at_idx" ON "service_appointments"("store_id", "starts_at");

-- CreateIndex
CREATE INDEX "service_appointments_service_order_id_idx" ON "service_appointments"("service_order_id");

-- CreateIndex
CREATE INDEX "service_costs_store_id_idx" ON "service_costs"("store_id");

-- CreateIndex
CREATE INDEX "service_costs_service_order_id_idx" ON "service_costs"("service_order_id");

-- CreateIndex
CREATE INDEX "service_invoices_store_id_idx" ON "service_invoices"("store_id");

-- CreateIndex
CREATE INDEX "service_invoices_service_order_id_idx" ON "service_invoices"("service_order_id");

-- CreateIndex
CREATE INDEX "provider_payables_store_id_status_idx" ON "provider_payables"("store_id", "status");

-- CreateIndex
CREATE INDEX "provider_payables_provider_id_idx" ON "provider_payables"("provider_id");

-- CreateIndex
CREATE INDEX "file_attachments_store_id_idx" ON "file_attachments"("store_id");

-- CreateIndex
CREATE INDEX "file_attachments_classification_idx" ON "file_attachments"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachments_bucket_path_key" ON "file_attachments"("bucket", "path");

-- CreateIndex
CREATE INDEX "file_attachment_links_store_id_idx" ON "file_attachment_links"("store_id");

-- CreateIndex
CREATE INDEX "file_attachment_links_entity_type_entity_id_idx" ON "file_attachment_links"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_attachment_links_attachment_id_entity_type_entity_id_p_key" ON "file_attachment_links"("attachment_id", "entity_type", "entity_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "document_classifications_store_id_code_key" ON "document_classifications"("store_id", "code");

-- CreateIndex
CREATE INDEX "document_versions_store_id_idx" ON "document_versions"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_attachment_id_version_key" ON "document_versions"("attachment_id", "version");

-- CreateIndex
CREATE INDEX "document_access_logs_store_id_idx" ON "document_access_logs"("store_id");

-- CreateIndex
CREATE INDEX "document_access_logs_attachment_id_idx" ON "document_access_logs"("attachment_id");

-- CreateIndex
CREATE INDEX "privacy_retention_records_store_id_idx" ON "privacy_retention_records"("store_id");

-- CreateIndex
CREATE INDEX "privacy_retention_records_entity_type_entity_id_idx" ON "privacy_retention_records"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_channels_store_id_type_name_key" ON "communication_channels"("store_id", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_store_id_instance_key_key" ON "whatsapp_instances"("store_id", "instance_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_store_id_email_key" ON "email_accounts"("store_id", "email");

-- CreateIndex
CREATE INDEX "message_threads_store_id_status_idx" ON "message_threads"("store_id", "status");

-- CreateIndex
CREATE INDEX "message_threads_customer_id_idx" ON "message_threads"("customer_id");

-- CreateIndex
CREATE INDEX "message_threads_lead_id_idx" ON "message_threads"("lead_id");

-- CreateIndex
CREATE INDEX "messages_store_id_idx" ON "messages"("store_id");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "email_messages_store_id_idx" ON "email_messages"("store_id");

-- CreateIndex
CREATE INDEX "email_messages_thread_id_idx" ON "email_messages"("thread_id");

-- CreateIndex
CREATE INDEX "email_attachments_store_id_idx" ON "email_attachments"("store_id");

-- CreateIndex
CREATE INDEX "email_attachments_email_message_id_idx" ON "email_attachments"("email_message_id");

-- CreateIndex
CREATE INDEX "channel_preferences_store_id_idx" ON "channel_preferences"("store_id");

-- CreateIndex
CREATE INDEX "channel_preferences_customer_id_idx" ON "channel_preferences"("customer_id");

-- CreateIndex
CREATE INDEX "automation_rules_store_id_status_idx" ON "automation_rules"("store_id", "status");

-- CreateIndex
CREATE INDEX "automation_rule_versions_store_id_idx" ON "automation_rule_versions"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rule_versions_rule_id_version_key" ON "automation_rule_versions"("rule_id", "version");

-- CreateIndex
CREATE INDEX "automation_events_store_id_idx" ON "automation_events"("store_id");

-- CreateIndex
CREATE INDEX "automation_events_entity_type_entity_id_idx" ON "automation_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "automation_tests_store_id_idx" ON "automation_tests"("store_id");

-- CreateIndex
CREATE INDEX "automation_tests_rule_id_idx" ON "automation_tests"("rule_id");

-- CreateIndex
CREATE INDEX "notifications_store_id_idx" ON "notifications"("store_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_idempotency_key_key" ON "background_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "background_jobs_store_id_idx" ON "background_jobs"("store_id");

-- CreateIndex
CREATE INDEX "background_jobs_status_scheduled_at_idx" ON "background_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "background_jobs_job_type_idx" ON "background_jobs"("job_type");

-- CreateIndex
CREATE INDEX "background_jobs_entity_type_entity_id_idx" ON "background_jobs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "job_execution_logs_store_id_idx" ON "job_execution_logs"("store_id");

-- CreateIndex
CREATE INDEX "job_execution_logs_job_id_idx" ON "job_execution_logs"("job_id");

-- CreateIndex
CREATE INDEX "document_ocr_jobs_store_id_idx" ON "document_ocr_jobs"("store_id");

-- CreateIndex
CREATE INDEX "document_ocr_jobs_attachment_id_idx" ON "document_ocr_jobs"("attachment_id");

-- CreateIndex
CREATE INDEX "document_extracted_fields_store_id_idx" ON "document_extracted_fields"("store_id");

-- CreateIndex
CREATE INDEX "document_extracted_fields_ocr_job_id_idx" ON "document_extracted_fields"("ocr_job_id");

-- CreateIndex
CREATE INDEX "ai_query_logs_store_id_idx" ON "ai_query_logs"("store_id");

-- CreateIndex
CREATE INDEX "ai_query_logs_user_id_idx" ON "ai_query_logs"("user_id");

-- CreateIndex
CREATE INDEX "ai_query_logs_entity_type_entity_id_idx" ON "ai_query_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_suggestions_store_id_idx" ON "ai_suggestions"("store_id");

-- CreateIndex
CREATE INDEX "ai_suggestions_entity_type_entity_id_idx" ON "ai_suggestions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_suggestion_feedback_store_id_idx" ON "ai_suggestion_feedback"("store_id");

-- CreateIndex
CREATE INDEX "ai_suggestion_feedback_suggestion_id_idx" ON "ai_suggestion_feedback"("suggestion_id");

-- CreateIndex
CREATE INDEX "external_query_jobs_store_id_idx" ON "external_query_jobs"("store_id");

-- CreateIndex
CREATE INDEX "external_query_jobs_entity_type_entity_id_idx" ON "external_query_jobs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "external_query_jobs_status_idx" ON "external_query_jobs"("status");

-- CreateIndex
CREATE INDEX "external_query_results_store_id_idx" ON "external_query_results"("store_id");

-- CreateIndex
CREATE INDEX "external_query_results_job_id_idx" ON "external_query_results"("job_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_idx" ON "audit_logs"("store_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "technical_events_store_id_idx" ON "technical_events"("store_id");

-- CreateIndex
CREATE INDEX "technical_events_level_created_at_idx" ON "technical_events"("level", "created_at");

-- CreateIndex
CREATE INDEX "security_events_store_id_idx" ON "security_events"("store_id");

-- CreateIndex
CREATE INDEX "security_events_user_id_idx" ON "security_events"("user_id");

-- CreateIndex
CREATE INDEX "security_events_severity_created_at_idx" ON "security_events"("severity", "created_at");

-- CreateIndex
CREATE INDEX "backup_status_logs_environment_idx" ON "backup_status_logs"("environment");

-- CreateIndex
CREATE INDEX "backup_status_logs_status_created_at_idx" ON "backup_status_logs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
