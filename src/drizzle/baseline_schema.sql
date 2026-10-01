-- =====================================================================
-- KOMANDA DATABASE BASELINE SCHEMA
-- Auto-generated from Drizzle migrations (0000 to 0022_grant_all_runtime_tables_and_default_privileges)
-- Contains: Tables, Types, Triggers, Roles, Extensions, and FORCE RLS Policies.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- --- Migration 0000_initial_schema ---
CREATE TABLE "identity_verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text DEFAULT 'email_verification' NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_challenges_attempt_count_check" CHECK ("identity_verification_challenges"."attempt_count" >= 0)
);

CREATE TABLE "onboarding_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"counter_type" text NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_counter_type_pk" PRIMARY KEY("tenant_id","counter_type"),
	CONSTRAINT "tenant_counters_nonnegative_check" CHECK ("tenant_counters"."current_value" >= 0)
);

CREATE TABLE "tenant_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_locations_tenant_id_id_key" UNIQUE("tenant_id","id")
);

CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "tenant_memberships_tenant_user_key" UNIQUE("tenant_id","user_id")
);

CREATE TABLE "tenant_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"sales_enabled" boolean DEFAULT false NOT NULL,
	"printing_enabled" boolean DEFAULT false NOT NULL,
	"order_prefix" text DEFAULT 'K' NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_version_positive_check" CHECK ("tenant_settings"."version" > 0),
	CONSTRAINT "tenant_settings_order_prefix_check" CHECK ("tenant_settings"."order_prefix" ~ '^[A-Z0-9]{1,8}$')
);

CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"normalized_slug" text NOT NULL,
	"status" text DEFAULT 'onboarding' NOT NULL,
	"default_currency" text DEFAULT 'ARS' NOT NULL,
	"default_timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_currency_format_check" CHECK (char_length("tenants"."default_currency") = 3),
	CONSTRAINT "tenants_version_positive_check" CHECK ("tenants"."version" > 0)
);

CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"normalized_email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked_until" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_tenant_scope_key" UNIQUE NULLS NOT DISTINCT("tenant_id","scope","idempotency_key")
);

CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_user_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_events_tenant_sequence_key" UNIQUE("tenant_id","sequence")
);

CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sequence" bigint NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "outbox_events_tenant_sequence_key" UNIQUE("tenant_id","sequence"),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);

CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"correlation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "plan_definitions" (
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"entitlements" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_definitions_plan_id_version_pk" PRIMARY KEY("plan_id","version"),
	CONSTRAINT "plan_definitions_version_check" CHECK ("plan_definitions"."version" > 0)
);

CREATE TABLE "tenant_entitlement_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"entitlements" jsonb NOT NULL,
	"source_request_id" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_entitlement_snapshots_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "tenant_entitlement_snapshots_source_request_key" UNIQUE("tenant_id","source_request_id")
);

CREATE TABLE "addon_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"min_selected" integer DEFAULT 0 NOT NULL,
	"max_selected" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addon_groups_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "addon_groups_bounds_check" CHECK ("addon_groups"."min_selected" >= 0 and "addon_groups"."max_selected" >= "addon_groups"."min_selected"),
	CONSTRAINT "addon_groups_version_check" CHECK ("addon_groups"."version" > 0)
);

CREATE TABLE "addon_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_delta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addon_options_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "addon_options_price_check" CHECK ("addon_options"."price_delta" >= 0),
	CONSTRAINT "addon_options_version_check" CHECK ("addon_options"."version" > 0)
);

CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_categories_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "catalog_categories_sort_check" CHECK ("catalog_categories"."sort_order" >= 0),
	CONSTRAINT "catalog_categories_version_check" CHECK ("catalog_categories"."version" > 0)
);

CREATE TABLE "catalog_combos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"image_asset_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_combos_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "catalog_combos_price_check" CHECK ("catalog_combos"."price" > 0),
	CONSTRAINT "catalog_combos_currency_check" CHECK (char_length("catalog_combos"."currency") = 3),
	CONSTRAINT "catalog_combos_version_check" CHECK ("catalog_combos"."version" > 0)
);

CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"image_asset_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "catalog_items_price_check" CHECK ("catalog_items"."price" > 0),
	CONSTRAINT "catalog_items_currency_check" CHECK (char_length("catalog_items"."currency") = 3),
	CONSTRAINT "catalog_items_sort_check" CHECK ("catalog_items"."sort_order" >= 0),
	CONSTRAINT "catalog_items_version_check" CHECK ("catalog_items"."version" > 0)
);

CREATE TABLE "combo_items" (
	"tenant_id" uuid NOT NULL,
	"combo_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "combo_items_tenant_id_combo_id_item_id_pk" PRIMARY KEY("tenant_id","combo_id","item_id"),
	CONSTRAINT "combo_items_quantity_check" CHECK ("combo_items"."quantity" > 0),
	CONSTRAINT "combo_items_sort_check" CHECK ("combo_items"."sort_order" >= 0)
);

CREATE TABLE "item_addon_groups" (
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"addon_group_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_addon_groups_tenant_id_item_id_addon_group_id_pk" PRIMARY KEY("tenant_id","item_id","addon_group_id"),
	CONSTRAINT "item_addon_groups_sort_check" CHECK ("item_addon_groups"."sort_order" >= 0)
);

CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text,
	"checksum_sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "media_assets_checksum_check" CHECK ("media_assets"."checksum_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_assets_size_check" CHECK ("media_assets"."byte_size" > 0)
);

CREATE TABLE "cart_line_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cart_line_id" uuid NOT NULL,
	"addon_group_id" uuid NOT NULL,
	"addon_option_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_delta_snapshot" numeric(12, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "cart_line_options_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "cart_line_options_quantity_check" CHECK ("cart_line_options"."quantity" > 0)
);

CREATE TABLE "cart_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"item_id" uuid,
	"combo_id" uuid,
	"quantity" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_price_snapshot" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"image_url_snapshot" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_lines_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "cart_lines_one_resource_check" CHECK ((("cart_lines"."item_id" is not null)::int + ("cart_lines"."combo_id" is not null)::int) = 1),
	CONSTRAINT "cart_lines_quantity_check" CHECK ("cart_lines"."quantity" > 0),
	CONSTRAINT "cart_lines_amount_check" CHECK ("cart_lines"."unit_price_snapshot" >= 0 and "cart_lines"."line_total" >= 0)
);

CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"currency" text NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"catalog_revision" integer DEFAULT 1 NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "carts_currency_check" CHECK (char_length("carts"."currency") = 3),
	CONSTRAINT "carts_amounts_check" CHECK ("carts"."subtotal" >= 0 and "carts"."discount_total" >= 0 and "carts"."total" >= 0),
	CONSTRAINT "carts_version_check" CHECK ("carts"."version" > 0)
);

CREATE TABLE "order_line_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"addon_group_id" uuid,
	"addon_option_id" uuid,
	"name" text NOT NULL,
	"price_delta" numeric(12, 2) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_line_options_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_line_options_quantity_check" CHECK ("order_line_options"."quantity" > 0)
);

CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"source_item_id" uuid,
	"source_combo_id" uuid,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"image_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_lines_quantity_check" CHECK ("order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_amount_check" CHECK ("order_lines"."unit_price" >= 0 and "order_lines"."line_total" >= 0)
);

CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"provider_preference_id" text,
	"provider_payment_id" text,
	"status" text DEFAULT 'initiated' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"customer_snapshot" jsonb NOT NULL,
	"notes" text,
	"idempotency_key" text NOT NULL,
	"processed_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payment_attempts_tenant_idempotency_key" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "payment_attempts_amount_check" CHECK ("payment_attempts"."amount" > 0)
);

CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"payment_attempt_id" uuid,
	"purchase_number" bigint NOT NULL,
	"source" text NOT NULL,
	"fulfillment_status" text DEFAULT 'approved' NOT NULL,
	"payment_status" text NOT NULL,
	"customer_snapshot" jsonb NOT NULL,
	"notes" text,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"approved_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "orders_tenant_purchase_number_key" UNIQUE("tenant_id","purchase_number"),
	CONSTRAINT "orders_tenant_idempotency_key" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "orders_source_check" CHECK ("orders"."source" in ('mercadopago_webhook', 'admin_direct')),
	CONSTRAINT "orders_fulfillment_status_check" CHECK ("orders"."fulfillment_status" in ('approved', 'preparing', 'ready', 'delivered', 'cancelled')),
	CONSTRAINT "orders_payment_status_check" CHECK ("orders"."payment_status" in ('pending', 'paid', 'failed', 'refunded')),
	CONSTRAINT "orders_currency_check" CHECK (char_length("orders"."currency") = 3),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal" >= 0 and "orders"."discount_total" >= 0 and "orders"."total" >= 0),
	CONSTRAINT "orders_version_check" CHECK ("orders"."version" > 0)
);

CREATE TABLE "integration_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"status" text NOT NULL,
	"encrypted_payload" "bytea" NOT NULL,
	"encryption_iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"key_version" integer NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"webhook_routing_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_accounts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "integration_accounts_key_version_check" CHECK ("integration_accounts"."key_version" > 0),
	CONSTRAINT "integration_accounts_version_check" CHECK ("integration_accounts"."version" > 0)
);

CREATE TABLE "provider_resource_routes" (
	"provider" text NOT NULL,
	"resource_type" text NOT NULL,
	"external_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"integration_account_id" uuid NOT NULL,
	"local_resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_resource_routes_provider_resource_type_external_id_pk" PRIMARY KEY("provider","resource_type","external_id")
);

CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"topic" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_tenant_provider_event_topic_key" UNIQUE("tenant_id","provider","provider_event_id","topic"),
	CONSTRAINT "webhook_events_attempts_check" CHECK ("webhook_events"."attempts" >= 0)
);

CREATE TABLE "print_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_digest" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_agents_tenant_id_id_key" UNIQUE("tenant_id","id")
);

CREATE TABLE "print_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "print_job_attempts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "print_job_attempts_job_attempt_key" UNIQUE("tenant_id","print_job_id","attempt_number","status"),
	CONSTRAINT "print_job_attempts_number_check" CHECK ("print_job_attempts"."attempt_number" > 0)
);

CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_by_agent_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"printed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "print_jobs_tenant_idempotency_key" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "print_jobs_attempt_count_check" CHECK ("print_jobs"."attempt_count" >= 0)
);

CREATE TABLE "storefront_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_key" text NOT NULL,
	"device_type" text DEFAULT 'unknown' NOT NULL,
	"dwell_time_seconds" integer DEFAULT 0 NOT NULL,
	"category_dwell_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"item_views_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cart_created" boolean DEFAULT false NOT NULL,
	"order_placed" boolean DEFAULT false NOT NULL,
	"associated_order_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storefront_sessions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "storefront_sessions_tenant_session_key" UNIQUE("tenant_id","session_key"),
	CONSTRAINT "storefront_sessions_dwell_time_check" CHECK ("storefront_sessions"."dwell_time_seconds" >= 0),
	CONSTRAINT "storefront_sessions_device_type_check" CHECK ("storefront_sessions"."device_type" in ('mobile', 'tablet', 'desktop', 'unknown'))
);

CREATE TABLE "billing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"order_id" uuid NOT NULL,
	"document_type" text DEFAULT 'ticket_interno' NOT NULL,
	"point_of_sale" integer DEFAULT 1 NOT NULL,
	"document_number" bigint NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"customer_doc_type" text DEFAULT 'CF' NOT NULL,
	"customer_doc_number" text,
	"customer_name" text,
	"fiscal_status" text DEFAULT 'internal_issued' NOT NULL,
	"cae" text,
	"cae_expires_at" timestamp with time zone,
	"arca_error" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_documents_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "billing_documents_tenant_pos_type_number_key" UNIQUE("tenant_id","point_of_sale","document_type","document_number"),
	CONSTRAINT "billing_documents_document_type_check" CHECK ("billing_documents"."document_type" in ('factura_a', 'factura_b', 'factura_c', 'recibo_x', 'ticket_interno')),
	CONSTRAINT "billing_documents_fiscal_status_check" CHECK ("billing_documents"."fiscal_status" in ('internal_issued', 'pending_arca', 'approved_arca', 'rejected_arca')),
	CONSTRAINT "billing_documents_customer_doc_type_check" CHECK ("billing_documents"."customer_doc_type" in ('DNI', 'CUIT', 'CUIL', 'CF', 'PASSPORT', 'OTHER')),
	CONSTRAINT "billing_documents_amounts_check" CHECK ("billing_documents"."net_amount" >= 0 and "billing_documents"."vat_amount" >= 0 and "billing_documents"."discount_amount" >= 0 and "billing_documents"."total_amount" >= 0),
	CONSTRAINT "billing_documents_currency_check" CHECK (char_length("billing_documents"."currency") = 3),
	CONSTRAINT "billing_documents_point_of_sale_check" CHECK ("billing_documents"."point_of_sale" > 0),
	CONSTRAINT "billing_documents_document_number_check" CHECK ("billing_documents"."document_number" > 0)
);

ALTER TABLE "identity_verification_challenges" ADD CONSTRAINT "identity_verification_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "onboarding_handoffs" ADD CONSTRAINT "onboarding_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "onboarding_handoffs" ADD CONSTRAINT "onboarding_handoffs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_locations" ADD CONSTRAINT "tenant_locations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "tenant_entitlement_snapshots" ADD CONSTRAINT "tenant_entitlement_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_entitlement_snapshots" ADD CONSTRAINT "tenant_entitlement_snapshots_plan_fk" FOREIGN KEY ("plan_id","plan_version") REFERENCES "public"."plan_definitions"("plan_id","version") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_combos" ADD CONSTRAINT "catalog_combos_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."catalog_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_combos" ADD CONSTRAINT "catalog_combos_media_fk" FOREIGN KEY ("tenant_id","image_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."catalog_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_media_fk" FOREIGN KEY ("tenant_id","image_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_fk" FOREIGN KEY ("tenant_id","combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "item_addon_groups" ADD CONSTRAINT "item_addon_groups_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "item_addon_groups" ADD CONSTRAINT "item_addon_groups_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_line_fk" FOREIGN KEY ("tenant_id","cart_line_id") REFERENCES "public"."cart_lines"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_option_fk" FOREIGN KEY ("tenant_id","addon_option_id") REFERENCES "public"."addon_options"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_combo_fk" FOREIGN KEY ("tenant_id","combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "carts" ADD CONSTRAINT "carts_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_option_fk" FOREIGN KEY ("tenant_id","addon_option_id") REFERENCES "public"."addon_options"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_fk" FOREIGN KEY ("tenant_id","source_item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_combo_fk" FOREIGN KEY ("tenant_id","source_combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_integration_fk" FOREIGN KEY ("tenant_id","integration_account_id") REFERENCES "public"."integration_accounts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "orders" ADD CONSTRAINT "orders_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_attempt_fk" FOREIGN KEY ("tenant_id","payment_attempt_id") REFERENCES "public"."payment_attempts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "provider_resource_routes" ADD CONSTRAINT "provider_resource_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_job_fk" FOREIGN KEY ("tenant_id","print_job_id") REFERENCES "public"."print_jobs"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_agent_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_agent_fk" FOREIGN KEY ("tenant_id","claimed_by_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "storefront_sessions" ADD CONSTRAINT "storefront_sessions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "storefront_sessions" ADD CONSTRAINT "storefront_sessions_order_fk" FOREIGN KEY ("tenant_id","associated_order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "identity_challenges_token_digest_uidx" ON "identity_verification_challenges" USING btree ("token_digest");

CREATE UNIQUE INDEX "identity_challenges_one_active_uidx" ON "identity_verification_challenges" USING btree ("user_id","purpose") WHERE "identity_verification_challenges"."consumed_at" is null;

CREATE UNIQUE INDEX "onboarding_handoffs_token_digest_uidx" ON "onboarding_handoffs" USING btree ("token_digest");

CREATE UNIQUE INDEX "onboarding_handoffs_one_active_uidx" ON "onboarding_handoffs" USING btree ("tenant_id","user_id") WHERE "onboarding_handoffs"."consumed_at" is null;

CREATE UNIQUE INDEX "tenant_locations_one_primary_uidx" ON "tenant_locations" USING btree ("tenant_id") WHERE "tenant_locations"."is_primary" = true;

CREATE INDEX "tenant_locations_tenant_status_idx" ON "tenant_locations" USING btree ("tenant_id","status");

CREATE INDEX "tenant_memberships_user_status_idx" ON "tenant_memberships" USING btree ("user_id","status");

CREATE UNIQUE INDEX "tenants_normalized_slug_uidx" ON "tenants" USING btree ("normalized_slug");

CREATE UNIQUE INDEX "user_sessions_token_digest_uidx" ON "user_sessions" USING btree ("token_digest");

CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","expires_at");

CREATE UNIQUE INDEX "users_normalized_email_uidx" ON "users" USING btree ("normalized_email");

CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" USING btree ("expires_at");

CREATE INDEX "order_events_tenant_order_idx" ON "order_events" USING btree ("tenant_id","order_id");

CREATE INDEX "order_events_tenant_sequence_idx" ON "order_events" USING btree ("tenant_id","sequence");

CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events" USING btree ("published_at","available_at");

CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");

CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");

CREATE UNIQUE INDEX "tenant_entitlement_snapshots_one_current_uidx" ON "tenant_entitlement_snapshots" USING btree ("tenant_id") WHERE "tenant_entitlement_snapshots"."superseded_at" is null;

CREATE INDEX "tenant_entitlement_snapshots_tenant_effective_idx" ON "tenant_entitlement_snapshots" USING btree ("tenant_id","effective_at");

CREATE INDEX "addon_groups_tenant_status_sort_idx" ON "addon_groups" USING btree ("tenant_id","status","sort_order");

CREATE INDEX "addon_options_tenant_group_sort_idx" ON "addon_options" USING btree ("tenant_id","group_id","sort_order");

CREATE UNIQUE INDEX "catalog_categories_tenant_name_active_uidx" ON "catalog_categories" USING btree ("tenant_id","normalized_name") WHERE "catalog_categories"."archived_at" is null;

CREATE INDEX "catalog_categories_tenant_status_sort_idx" ON "catalog_categories" USING btree ("tenant_id","status","sort_order");

CREATE UNIQUE INDEX "catalog_combos_tenant_name_active_uidx" ON "catalog_combos" USING btree ("tenant_id","normalized_name") WHERE "catalog_combos"."archived_at" is null;

CREATE INDEX "catalog_combos_tenant_category_status_idx" ON "catalog_combos" USING btree ("tenant_id","category_id","status");

CREATE UNIQUE INDEX "catalog_items_tenant_name_active_uidx" ON "catalog_items" USING btree ("tenant_id","normalized_name") WHERE "catalog_items"."archived_at" is null;

CREATE INDEX "catalog_items_tenant_category_status_sort_idx" ON "catalog_items" USING btree ("tenant_id","category_id","status","sort_order");

CREATE UNIQUE INDEX "media_assets_storage_key_uidx" ON "media_assets" USING btree ("storage_key");

CREATE INDEX "media_assets_tenant_status_idx" ON "media_assets" USING btree ("tenant_id","status");

CREATE INDEX "cart_line_options_tenant_line_idx" ON "cart_line_options" USING btree ("tenant_id","cart_line_id");

CREATE INDEX "cart_lines_tenant_cart_idx" ON "cart_lines" USING btree ("tenant_id","cart_id");

CREATE INDEX "carts_tenant_expires_idx" ON "carts" USING btree ("tenant_id","expires_at");

CREATE INDEX "carts_tenant_status_updated_idx" ON "carts" USING btree ("tenant_id","status","updated_at");

CREATE INDEX "order_line_options_tenant_line_idx" ON "order_line_options" USING btree ("tenant_id","order_line_id");

CREATE INDEX "order_lines_tenant_order_idx" ON "order_lines" USING btree ("tenant_id","order_id");

CREATE INDEX "payment_attempts_tenant_payment_idx" ON "payment_attempts" USING btree ("tenant_id","provider_payment_id");

CREATE INDEX "orders_tenant_fulfillment_idx" ON "orders" USING btree ("tenant_id","fulfillment_status","approved_at");

CREATE INDEX "orders_tenant_created_idx" ON "orders" USING btree ("tenant_id","created_at");

CREATE UNIQUE INDEX "integration_accounts_provider_account_uidx" ON "integration_accounts" USING btree ("provider","provider_account_id");

CREATE UNIQUE INDEX "integration_accounts_routing_key_uidx" ON "integration_accounts" USING btree ("webhook_routing_key");

CREATE UNIQUE INDEX "integration_accounts_one_active_provider_uidx" ON "integration_accounts" USING btree ("tenant_id","provider") WHERE "integration_accounts"."status" in ('pending', 'active', 'expired', 'error');

CREATE INDEX "integration_accounts_tenant_status_idx" ON "integration_accounts" USING btree ("tenant_id","status");

CREATE INDEX "provider_resource_routes_tenant_idx" ON "provider_resource_routes" USING btree ("tenant_id");

CREATE INDEX "webhook_events_tenant_status_idx" ON "webhook_events" USING btree ("tenant_id","status");

CREATE UNIQUE INDEX "print_agents_token_prefix_uidx" ON "print_agents" USING btree ("token_prefix");

CREATE INDEX "print_agents_tenant_location_status_idx" ON "print_agents" USING btree ("tenant_id","location_id","status");

CREATE INDEX "print_job_attempts_tenant_job_idx" ON "print_job_attempts" USING btree ("tenant_id","print_job_id");

CREATE INDEX "print_jobs_tenant_location_status_idx" ON "print_jobs" USING btree ("tenant_id","location_id","status","next_attempt_at");

CREATE INDEX "storefront_sessions_tenant_created_idx" ON "storefront_sessions" USING btree ("tenant_id","created_at");

CREATE INDEX "storefront_sessions_tenant_last_active_idx" ON "storefront_sessions" USING btree ("tenant_id","last_active_at");

CREATE INDEX "billing_documents_tenant_issued_idx" ON "billing_documents" USING btree ("tenant_id","issued_at");

CREATE INDEX "billing_documents_tenant_order_idx" ON "billing_documents" USING btree ("tenant_id","order_id");

CREATE INDEX "billing_documents_tenant_fiscal_status_idx" ON "billing_documents" USING btree ("tenant_id","fiscal_status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_runtime') THEN
    CREATE ROLE komanda_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_migration') THEN
    CREATE ROLE komanda_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO komanda_runtime;

GRANT ALL ON ALL TABLES IN SCHEMA public TO komanda_migration;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO komanda_migration;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO komanda_runtime;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO komanda_runtime;

CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; updates and deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

ALTER TABLE "addon_groups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "addon_groups" FORCE ROW LEVEL SECURITY;

CREATE POLICY "addon_groups_runtime_isolation" ON "addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "addon_groups_migration_maintenance" ON "addon_groups" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "addon_options" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "addon_options" FORCE ROW LEVEL SECURITY;

CREATE POLICY "addon_options_runtime_isolation" ON "addon_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "addon_options_migration_maintenance" ON "addon_options" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_events_runtime_isolation" ON "audit_events" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) ) WITH CHECK ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) );

CREATE POLICY "audit_events_migration_maintenance" ON "audit_events" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "billing_documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "billing_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY "billing_documents_runtime_isolation" ON "billing_documents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "billing_documents_migration_maintenance" ON "billing_documents" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "cart_line_options" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "cart_line_options" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cart_line_options_runtime_isolation" ON "cart_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "cart_line_options_migration_maintenance" ON "cart_line_options" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "cart_lines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "cart_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY "cart_lines_runtime_isolation" ON "cart_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "cart_lines_migration_maintenance" ON "cart_lines" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "carts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "carts_runtime_isolation" ON "carts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "carts_migration_maintenance" ON "carts" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "catalog_categories" FORCE ROW LEVEL SECURITY;

CREATE POLICY "catalog_categories_runtime_isolation" ON "catalog_categories" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "catalog_categories_migration_maintenance" ON "catalog_categories" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "catalog_combos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "catalog_combos" FORCE ROW LEVEL SECURITY;

CREATE POLICY "catalog_combos_runtime_isolation" ON "catalog_combos" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "catalog_combos_migration_maintenance" ON "catalog_combos" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "catalog_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "catalog_items_runtime_isolation" ON "catalog_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "catalog_items_migration_maintenance" ON "catalog_items" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "combo_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "combo_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY "combo_items_runtime_isolation" ON "combo_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "combo_items_migration_maintenance" ON "combo_items" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY "idempotency_records_runtime_isolation" ON "idempotency_records" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) ) WITH CHECK ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) );

CREATE POLICY "idempotency_records_migration_maintenance" ON "idempotency_records" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "identity_verification_challenges" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "identity_verification_challenges" FORCE ROW LEVEL SECURITY;

CREATE POLICY "identity_challenges_runtime_identity" ON "identity_verification_challenges" TO komanda_runtime USING ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL ) WITH CHECK ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );

CREATE POLICY "identity_verification_challenges_migration_maintenance" ON "identity_verification_challenges" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "integration_accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "integration_accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "integration_accounts_runtime_isolation" ON "integration_accounts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "integration_accounts_migration_maintenance" ON "integration_accounts" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "item_addon_groups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "item_addon_groups" FORCE ROW LEVEL SECURITY;

CREATE POLICY "item_addon_groups_runtime_isolation" ON "item_addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "item_addon_groups_migration_maintenance" ON "item_addon_groups" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_runtime_isolation" ON "media_assets" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "media_assets_migration_maintenance" ON "media_assets" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "onboarding_handoffs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "onboarding_handoffs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_handoffs_runtime_isolation" ON "onboarding_handoffs" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "onboarding_handoffs_migration_maintenance" ON "onboarding_handoffs" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "order_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "order_events_runtime_isolation" ON "order_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "order_events_migration_maintenance" ON "order_events" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "order_line_options" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "order_line_options" FORCE ROW LEVEL SECURITY;

CREATE POLICY "order_line_options_runtime_isolation" ON "order_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "order_line_options_migration_maintenance" ON "order_line_options" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "order_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY "order_lines_runtime_isolation" ON "order_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "order_lines_migration_maintenance" ON "order_lines" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;

CREATE POLICY "orders_runtime_isolation" ON "orders" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "orders_migration_maintenance" ON "orders" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "outbox_events_runtime_isolation" ON "outbox_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "outbox_events_migration_maintenance" ON "outbox_events" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "payment_attempts_runtime_isolation" ON "payment_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "payment_attempts_migration_maintenance" ON "payment_attempts" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "print_agents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "print_agents" FORCE ROW LEVEL SECURITY;

CREATE POLICY "print_agents_runtime_isolation" ON "print_agents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-agent-auth') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "print_agents_migration_maintenance" ON "print_agents" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "print_job_attempts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "print_job_attempts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "print_job_attempts_runtime_isolation" ON "print_job_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "print_job_attempts_migration_maintenance" ON "print_job_attempts" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "print_jobs_runtime_isolation" ON "print_jobs" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "print_jobs_migration_maintenance" ON "print_jobs" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "provider_resource_routes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "provider_resource_routes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "provider_resource_routes_runtime_isolation" ON "provider_resource_routes" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "provider_resource_routes_migration_maintenance" ON "provider_resource_routes" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "storefront_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "storefront_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "storefront_sessions_runtime_isolation" ON "storefront_sessions" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "storefront_sessions_migration_maintenance" ON "storefront_sessions" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenant_counters" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenant_counters" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_counters_runtime_isolation" ON "tenant_counters" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "tenant_counters_migration_maintenance" ON "tenant_counters" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenant_entitlement_snapshots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenant_entitlement_snapshots" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_entitlement_snapshots_runtime_isolation" ON "tenant_entitlement_snapshots" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "tenant_entitlement_snapshots_migration_maintenance" ON "tenant_entitlement_snapshots" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenant_locations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenant_locations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_locations_runtime_isolation" ON "tenant_locations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "tenant_locations_migration_maintenance" ON "tenant_locations" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_memberships_runtime_isolation" ON "tenant_memberships" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR "user_id" = nullif(current_setting('app.user_id', true), '')::uuid ) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "tenant_memberships_migration_maintenance" ON "tenant_memberships" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_settings_runtime_isolation" ON "tenant_settings" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "tenant_settings_migration_maintenance" ON "tenant_settings" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenants_runtime_isolation" ON "tenants" TO komanda_runtime USING ( "id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL OR EXISTS ( SELECT 1 FROM "tenant_memberships" membership WHERE membership."tenant_id" = "tenants"."id" AND membership."user_id" = nullif(current_setting('app.user_id', true), '')::uuid AND membership."status" = 'active' ) ) WITH CHECK ( "id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );

CREATE POLICY "tenants_migration_maintenance" ON "tenants" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_runtime_identity" ON "user_sessions" TO komanda_runtime USING ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR "token_digest" = nullif(current_setting('app.session_token_digest', true), '') ) WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY "user_sessions_migration_maintenance" ON "user_sessions" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_runtime_identity" ON "users" TO komanda_runtime USING ( "id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL ) WITH CHECK ( "id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );

CREATE POLICY "users_migration_maintenance" ON "users" TO komanda_migration USING (true) WITH CHECK (true);

ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_runtime_isolation" ON "webhook_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY "webhook_events_migration_maintenance" ON "webhook_events" TO komanda_migration USING (true) WITH CHECK (true);

-- --- Migration 0001_supreme_yellow_claw ---
ALTER TABLE "tenant_settings" ADD COLUMN "menu_theme" text DEFAULT 'classic' NOT NULL;

ALTER TABLE "users" ADD COLUMN "password_plain" text;

ALTER TABLE "catalog_items" ADD COLUMN "video_asset_id" uuid;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_video_media_fk" FOREIGN KEY ("tenant_id","video_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_menu_theme_check" CHECK ("tenant_settings"."menu_theme" in ('classic', 'reels'));

-- --- Migration 0002_add_tenant_preset ---
ALTER TABLE "tenants" ADD COLUMN "preset" text DEFAULT 'gastronomy' NOT NULL;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_preset_check" CHECK ("tenants"."preset" in ('gastronomy', 'express_retail'));

-- --- Migration 0003_add_barcode_and_stock ---
ALTER TABLE "catalog_items" ADD COLUMN "barcode" text;

ALTER TABLE "catalog_items" ADD COLUMN "is_generic" boolean DEFAULT false NOT NULL;

ALTER TABLE "catalog_items" ADD COLUMN "generic_icon" text;

ALTER TABLE "catalog_items" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;

ALTER TABLE "catalog_items" ADD COLUMN "stock_quantity" integer DEFAULT 0 NOT NULL;

CREATE UNIQUE INDEX "catalog_items_tenant_barcode_uidx" ON "catalog_items" USING btree ("tenant_id","barcode") WHERE "catalog_items"."barcode" is not null and "catalog_items"."archived_at" is null;

ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_stock_quantity_check" CHECK ("catalog_items"."stock_quantity" >= 0);

CREATE TABLE "global_product_catalog" (
	"barcode" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"suggested_category" text,
	"image_url" text,
	"brand" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- --- Migration 0004_add_cash_shifts ---
CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"opened_by_user_id" text NOT NULL,
	"opening_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"closing_balance" numeric(12, 2),
	"expected_cash" numeric(12, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_shifts_status_check" CHECK ("cash_shifts"."status" in ('open', 'closed')),
	CONSTRAINT "cash_shifts_opening_balance_check" CHECK ("cash_shifts"."opening_balance" >= 0)
);

ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX "cash_shifts_one_open_per_tenant_uidx" ON "cash_shifts" USING btree ("tenant_id") WHERE "cash_shifts"."status" = 'open';

CREATE INDEX "cash_shifts_tenant_status_idx" ON "cash_shifts" USING btree ("tenant_id","status","opened_at");

-- --- Migration 0005_add_slack_cash_alert_webhook_url ---
ALTER TABLE "tenant_settings" ADD COLUMN "slack_cash_alert_webhook_url" text;

-- --- Migration 0006_add_print_pairings ---
CREATE TABLE "print_agent_pairings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "code_digest" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_agent_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "print_pairings_tenant_id_id_key" UNIQUE("tenant_id","id"),
  CONSTRAINT "print_pairings_status_check" CHECK ("status" IN ('pending','claimed','expired')),
  CONSTRAINT "print_pairings_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5)
);

ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict;

ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict;

ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_agent_fk" FOREIGN KEY ("tenant_id","claimed_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict;

CREATE UNIQUE INDEX "print_pairings_code_digest_uidx" ON "print_agent_pairings" ("code_digest");

CREATE INDEX "print_pairings_tenant_location_status_idx" ON "print_agent_pairings" ("tenant_id","location_id","status");

ALTER TABLE "print_agent_pairings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "print_agent_pairings" FORCE ROW LEVEL SECURITY;

CREATE POLICY "print_pairings_runtime_isolation" ON "print_agent_pairings" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');

CREATE POLICY "print_pairings_migration_maintenance" ON "print_agent_pairings" TO komanda_migration USING (true) WITH CHECK (true);

DROP POLICY "print_agents_runtime_isolation" ON "print_agents";

CREATE POLICY "print_agents_runtime_isolation" ON "print_agents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IN ('print-agent-auth','print-pairing')) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');

DROP POLICY "tenant_locations_runtime_isolation" ON "tenant_locations";

CREATE POLICY "tenant_locations_runtime_isolation" ON "tenant_locations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');

-- --- Migration 0007_allow_member_service_account_cleanup ---
ALTER POLICY "tenant_memberships_runtime_isolation" ON "tenant_memberships"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') = 'member-service'
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') = 'member-service'
  );

-- --- Migration 0008_seed_starter_plan ---
INSERT INTO "plan_definitions" (
  "plan_id",
  "version",
  "status",
  "entitlements",
  "effective_from"
)
VALUES (
  'starter',
  1,
  'active',
  '{"catalog_management": true, "online_payments": true, "printing": true}'::jsonb,
  now()
)
ON CONFLICT ("plan_id", "version") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "entitlements" = EXCLUDED."entitlements";

-- --- Migration 0009_add_analytics_records_and_tender ---
CREATE TABLE IF NOT EXISTS "cash_register_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_user_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_register_movements_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "cash_movements_order_type_uniq" UNIQUE("tenant_id","order_id","type"),
	CONSTRAINT "cash_movements_type_check" CHECK ("cash_register_movements"."type" in ('sale_deposit', 'cancellation_withdrawal')),
	CONSTRAINT "cash_movements_amount_check" CHECK ("cash_register_movements"."amount" >= 0)
);

CREATE TABLE IF NOT EXISTS "mp_financial_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"mp_payment_id" text NOT NULL,
	"gross_amount" numeric(12, 2) NOT NULL,
	"fee_amount" numeric(12, 2) NOT NULL,
	"fee_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taxes_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"taxes_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"net_received_amount" numeric(12, 2) NOT NULL,
	"is_fee_inclusive_of_tax" boolean DEFAULT false NOT NULL,
	"money_release_status" text DEFAULT 'pending' NOT NULL,
	"money_release_expected_at" timestamp with time zone,
	"money_released_at" timestamp with time zone,
	"settlement_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mp_financial_records_mp_payment_id_unique" UNIQUE("mp_payment_id"),
	CONSTRAINT "mp_financial_tenant_payment_uniq" UNIQUE("tenant_id","mp_payment_id"),
	CONSTRAINT "mp_financial_release_status_check" CHECK ("mp_financial_records"."money_release_status" in ('pending', 'released'))
);

CREATE TABLE IF NOT EXISTS "storefront_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"surface" text NOT NULL,
	"event_type" text NOT NULL,
	"dwell_duration_ms" integer DEFAULT 0 NOT NULL,
	"exposure_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_events_surface_check" CHECK ("storefront_item_events"."surface" in ('classic', 'reels')),
	CONSTRAINT "item_events_event_type_check" CHECK ("storefront_item_events"."event_type" in ('impression', 'qualified_view', 'dwell_heartbeat', 'cart_add')),
	CONSTRAINT "item_events_dwell_check" CHECK ("storefront_item_events"."dwell_duration_ms" >= 0)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_tenant_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_order_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mp_financial_records_tenant_fk') THEN
    ALTER TABLE "mp_financial_records" ADD CONSTRAINT "mp_financial_records_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mp_financial_records_order_fk') THEN
    ALTER TABLE "mp_financial_records" ADD CONSTRAINT "mp_financial_records_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_item_events_tenant_fk') THEN
    ALTER TABLE "storefront_item_events" ADD CONSTRAINT "storefront_item_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cash_movements_tenant_location_idx" ON "cash_register_movements" USING btree ("tenant_id","location_id","occurred_at");

CREATE INDEX IF NOT EXISTS "mp_financial_tenant_date_idx" ON "mp_financial_records" USING btree ("tenant_id","location_id","settlement_date");

CREATE INDEX IF NOT EXISTS "mp_financial_release_expected_idx" ON "mp_financial_records" USING btree ("tenant_id","money_release_status","money_release_expected_at");

CREATE INDEX IF NOT EXISTS "item_events_tenant_item_idx" ON "storefront_item_events" USING btree ("tenant_id","item_id","occurred_at");

CREATE INDEX IF NOT EXISTS "item_events_purge_idx" ON "storefront_item_events" USING btree ("occurred_at");

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tender" text DEFAULT 'cash' NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tender_check') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_tender_check" CHECK ("orders"."tender" in ('cash', 'posnet'));
  END IF;
END $$;

DROP INDEX IF EXISTS "integration_accounts_provider_account_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "integration_accounts_provider_account_uidx" ON "integration_accounts" USING btree ("provider","provider_account_id") WHERE "integration_accounts"."status" in ('pending', 'active', 'expired', 'error');

ALTER TABLE "cash_register_movements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "cash_register_movements" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_register_movements' AND policyname = 'cash_register_movements_runtime_isolation') THEN
    CREATE POLICY "cash_register_movements_runtime_isolation" ON "cash_register_movements" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_register_movements' AND policyname = 'cash_register_movements_migration_maintenance') THEN
    CREATE POLICY "cash_register_movements_migration_maintenance" ON "cash_register_movements" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "mp_financial_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mp_financial_records" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mp_financial_records' AND policyname = 'mp_financial_records_runtime_isolation') THEN
    CREATE POLICY "mp_financial_records_runtime_isolation" ON "mp_financial_records" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mp_financial_records' AND policyname = 'mp_financial_records_migration_maintenance') THEN
    CREATE POLICY "mp_financial_records_migration_maintenance" ON "mp_financial_records" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "storefront_item_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "storefront_item_events" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storefront_item_events' AND policyname = 'storefront_item_events_runtime_isolation') THEN
    CREATE POLICY "storefront_item_events_runtime_isolation" ON "storefront_item_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storefront_item_events' AND policyname = 'storefront_item_events_migration_maintenance') THEN
    CREATE POLICY "storefront_item_events_migration_maintenance" ON "storefront_item_events" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cash_register_movements", "mp_financial_records", "storefront_item_events" TO komanda_runtime;

GRANT ALL ON TABLE "cash_register_movements", "mp_financial_records", "storefront_item_events" TO komanda_migration;

INSERT INTO "plan_definitions" (
  "plan_id",
  "version",
  "status",
  "entitlements",
  "effective_from"
)
VALUES (
  'development',
  1,
  'active',
  '{"catalog_management": true, "online_payments": true, "printing": true}'::jsonb,
  now()
)
ON CONFLICT ("plan_id", "version") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "entitlements" = EXCLUDED."entitlements";

-- --- Migration 0010_schema_architecture_enhancements ---
CREATE TABLE IF NOT EXISTS "printer_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"station_type" text DEFAULT 'kitchen' NOT NULL,
	"connection_type" text DEFAULT 'network_tcp' NOT NULL,
	"ip_address" text,
	"port" integer DEFAULT 9100 NOT NULL,
	"assigned_agent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printer_destinations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "printer_destinations_station_type_check" CHECK ("printer_destinations"."station_type" in ('kitchen', 'bar', 'cashier', 'runner', 'custom')),
	CONSTRAINT "printer_destinations_connection_type_check" CHECK ("printer_destinations"."connection_type" in ('network_tcp', 'usb', 'bluetooth', 'agent')),
	CONSTRAINT "printer_destinations_port_check" CHECK ("printer_destinations"."port" > 0 and "printer_destinations"."port" <= 65535),
	CONSTRAINT "printer_destinations_sort_order_check" CHECK ("printer_destinations"."sort_order" >= 0)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_tenant_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_location_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_agent_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_agent_fk" FOREIGN KEY ("tenant_id","assigned_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "printer_destinations_tenant_loc_idx" ON "printer_destinations" USING btree ("tenant_id","location_id","is_active");

CREATE TABLE IF NOT EXISTS "inventory_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"min_alert_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_levels_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "inventory_levels_available_check" CHECK ("inventory_levels"."available_quantity" >= 0),
	CONSTRAINT "inventory_levels_reserved_check" CHECK ("inventory_levels"."reserved_quantity" >= 0),
	CONSTRAINT "inventory_levels_alert_check" CHECK ("inventory_levels"."min_alert_quantity" >= 0)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_tenant_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_location_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_item_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_levels_location_item_uidx" ON "inventory_levels" USING btree ("tenant_id","location_id","item_id");

CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_order_id" uuid,
	"actor_user_id" text,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "inventory_movements_reason_check" CHECK ("inventory_movements"."reason" in ('sale', 'cancellation_restock', 'manual_adjustment', 'waste_spoilage', 'initial_intake', 'transfer')),
	CONSTRAINT "inventory_movements_delta_check" CHECK ("inventory_movements"."quantity_delta" != 0)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_tenant_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_location_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_item_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "inventory_movements_lookup_idx" ON "inventory_movements" USING btree ("tenant_id","location_id","item_id","occurred_at");

CREATE TABLE IF NOT EXISTS "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" numeric(12, 2) NOT NULL,
	"min_order_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"max_redemptions" integer,
	"redemptions_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"scope" text DEFAULT 'global' NOT NULL,
	"target_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_tenant_code_key" UNIQUE("tenant_id","code"),
	CONSTRAINT "discounts_type_check" CHECK ("discounts"."discount_type" in ('percentage', 'fixed_amount')),
	CONSTRAINT "discounts_scope_check" CHECK ("discounts"."scope" in ('global', 'category', 'item')),
	CONSTRAINT "discounts_value_positive_check" CHECK ("discounts"."discount_value" > 0 and "discounts"."min_order_amount" >= 0),
	CONSTRAINT "discounts_percentage_bounds_check" CHECK ("discounts"."discount_type" != 'percentage' or "discounts"."discount_value" <= 100),
	CONSTRAINT "discounts_dates_order_check" CHECK ("discounts"."ends_at" is null or "discounts"."ends_at" >= "discounts"."starts_at"),
	CONSTRAINT "discounts_redemptions_bounds_check" CHECK ("discounts"."redemptions_count" >= 0 and ("discounts"."max_redemptions" is null or "discounts"."max_redemptions" >= "discounts"."redemptions_count")),
	CONSTRAINT "discounts_version_positive_check" CHECK ("discounts"."version" > 0)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_tenant_fk') THEN
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "discounts_tenant_active_idx" ON "discounts" USING btree ("tenant_id","is_active","starts_at","ends_at");

ALTER TABLE "cash_shifts" ADD COLUMN IF NOT EXISTS "register_identifier" text DEFAULT 'default' NOT NULL;

DROP INDEX IF EXISTS "cash_shifts_one_open_per_tenant_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "cash_shifts_one_open_per_register_uidx" ON "cash_shifts" USING btree ("tenant_id","location_id","register_identifier") WHERE "cash_shifts"."status" = 'open';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_shifts_location_fk') THEN
    ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "cash_register_movements" ADD COLUMN IF NOT EXISTS "shift_id" uuid;

ALTER TABLE "cash_register_movements" ADD COLUMN IF NOT EXISTS "reason" text;

ALTER TABLE "cash_register_movements" ALTER COLUMN "order_id" DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_shift_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cash_movements_shift_idx" ON "cash_register_movements" USING btree ("tenant_id","shift_id");

ALTER TABLE "cash_register_movements" DROP CONSTRAINT IF EXISTS "cash_movements_order_type_uniq";

DROP INDEX IF EXISTS "cash_movements_order_type_uniq";

CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_order_type_uniq" ON "cash_register_movements" USING btree ("tenant_id","order_id","type") WHERE "order_id" IS NOT NULL;

ALTER TABLE "cash_register_movements" DROP CONSTRAINT IF EXISTS "cash_movements_type_check";

ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_movements_type_check" CHECK ("type" in ('sale_deposit', 'cancellation_withdrawal', 'opening_float', 'manual_cash_in', 'cash_drop', 'expense_payout'));

ALTER TABLE "catalog_categories" ADD COLUMN IF NOT EXISTS "destination_station" text DEFAULT 'kitchen' NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_categories_destination_station_check') THEN
    ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_destination_station_check" CHECK ("destination_station" in ('kitchen', 'bar', 'cashier', 'runner', 'custom'));
  END IF;
END $$;

ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "destination_station" text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_destination_station_check') THEN
    ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_destination_station_check" CHECK ("destination_station" is null or "destination_station" in ('kitchen', 'bar', 'cashier', 'runner', 'custom'));
  END IF;
END $$;

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "destination_station_id" uuid;

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "station_type" text DEFAULT 'all' NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_station_fk') THEN
    ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_station_fk" FOREIGN KEY ("tenant_id","destination_station_id") REFERENCES "public"."printer_destinations"("tenant_id","id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_station_type_check') THEN
    ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_station_type_check" CHECK ("station_type" in ('kitchen', 'bar', 'cashier', 'runner', 'custom', 'all'));
  END IF;
END $$;

ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "related_document_id" uuid;

ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "vat_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_documents_related_fk') THEN
    ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_related_fk" FOREIGN KEY ("tenant_id","related_document_id") REFERENCES "public"."billing_documents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "billing_documents_tenant_related_idx" ON "billing_documents" USING btree ("tenant_id","related_document_id");

ALTER TABLE "billing_documents" DROP CONSTRAINT IF EXISTS "billing_documents_document_type_check";

ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_document_type_check" CHECK ("document_type" in ('factura_a', 'factura_b', 'factura_c', 'nota_credito_a', 'nota_credito_b', 'nota_credito_c', 'nota_debito_a', 'nota_debito_b', 'recibo_x', 'ticket_interno'));

DROP INDEX IF EXISTS "outbox_events_delivery_idx";

CREATE INDEX IF NOT EXISTS "outbox_events_delivery_idx" ON "outbox_events" USING btree ("published_at","available_at","sequence");

CREATE INDEX IF NOT EXISTS "item_events_tenant_occurred_idx" ON "storefront_item_events" USING btree ("tenant_id","occurred_at");

ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "applied_discount_code_id" uuid;

ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "discount_metadata" jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carts_discount_fk') THEN
    ALTER TABLE "carts" ADD CONSTRAINT "carts_discount_fk" FOREIGN KEY ("applied_discount_code_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- RLS & Grants for newly created and updated tables
ALTER TABLE "printer_destinations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "printer_destinations" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'printer_destinations' AND policyname = 'printer_destinations_runtime_isolation') THEN
    CREATE POLICY "printer_destinations_runtime_isolation" ON "printer_destinations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'printer_destinations' AND policyname = 'printer_destinations_migration_maintenance') THEN
    CREATE POLICY "printer_destinations_migration_maintenance" ON "printer_destinations" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "inventory_levels" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "inventory_levels" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_levels' AND policyname = 'inventory_levels_runtime_isolation') THEN
    CREATE POLICY "inventory_levels_runtime_isolation" ON "inventory_levels" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_levels' AND policyname = 'inventory_levels_migration_maintenance') THEN
    CREATE POLICY "inventory_levels_migration_maintenance" ON "inventory_levels" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND policyname = 'inventory_movements_runtime_isolation') THEN
    CREATE POLICY "inventory_movements_runtime_isolation" ON "inventory_movements" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND policyname = 'inventory_movements_migration_maintenance') THEN
    CREATE POLICY "inventory_movements_migration_maintenance" ON "inventory_movements" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "discounts" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discounts' AND policyname = 'discounts_runtime_isolation') THEN
    CREATE POLICY "discounts_runtime_isolation" ON "discounts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discounts' AND policyname = 'discounts_migration_maintenance') THEN
    CREATE POLICY "discounts_migration_maintenance" ON "discounts" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE "cash_shifts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "cash_shifts" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_shifts' AND policyname = 'cash_shifts_runtime_isolation') THEN
    CREATE POLICY "cash_shifts_runtime_isolation" ON "cash_shifts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_shifts' AND policyname = 'cash_shifts_migration_maintenance') THEN
    CREATE POLICY "cash_shifts_migration_maintenance" ON "cash_shifts" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "printer_destinations", "inventory_levels", "inventory_movements", "discounts", "cash_shifts" TO komanda_runtime;

GRANT ALL ON TABLE "printer_destinations", "inventory_levels", "inventory_movements", "discounts", "cash_shifts" TO komanda_migration;

-- --- Migration 0011_add_order_discount_snapshot ---
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "discount_snapshot" jsonb;

-- --- Migration 0012_add_discount_redemptions ---
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_tenant_id_id_key') THEN
    ALTER TABLE "discounts"
      ADD CONSTRAINT "discounts_tenant_id_id_key" UNIQUE ("tenant_id", "id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "discount_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "cart_id" uuid NOT NULL,
  "amount_deducted" numeric(12, 2) NOT NULL,
  "code_snapshot" text NOT NULL,
  "status" text DEFAULT 'redeemed' NOT NULL,
  "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_redemptions_order_key" UNIQUE("tenant_id", "order_id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_redemptions_tenant_fk') THEN
    ALTER TABLE "discount_redemptions"
      ADD CONSTRAINT "discount_redemptions_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_redemptions_discount_fk') THEN
    ALTER TABLE "discount_redemptions"
      ADD CONSTRAINT "discount_redemptions_discount_fk"
      FOREIGN KEY ("tenant_id", "discount_id")
      REFERENCES "public"."discounts"("tenant_id", "id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_redemptions_order_fk') THEN
    ALTER TABLE "discount_redemptions"
      ADD CONSTRAINT "discount_redemptions_order_fk"
      FOREIGN KEY ("tenant_id", "order_id")
      REFERENCES "public"."orders"("tenant_id", "id") ON DELETE restrict;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "discount_redemptions_discount_idx"
  ON "discount_redemptions" USING btree ("tenant_id", "discount_id");

ALTER TABLE "discount_redemptions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "discount_redemptions" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_redemptions' AND policyname = 'discount_redemptions_runtime_isolation') THEN
    CREATE POLICY "discount_redemptions_runtime_isolation" ON "discount_redemptions"
      TO komanda_runtime
      USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_redemptions' AND policyname = 'discount_redemptions_migration_maintenance') THEN
    CREATE POLICY "discount_redemptions_migration_maintenance" ON "discount_redemptions"
      TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_redemptions" TO komanda_runtime;

GRANT ALL ON TABLE "discount_redemptions" TO komanda_migration;

-- --- Migration 0013_add_order_pickup_pin_and_eta ---
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "pickup_pin" text,
  ADD COLUMN IF NOT EXISTS "estimated_wait_minutes" integer,
  ADD COLUMN IF NOT EXISTS "estimated_ready_at" timestamp with time zone;

-- --- Migration 0014_schema_optimizations_and_normalization ---
-- 1. Location coordinates
ALTER TABLE "tenant_locations"
  ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6),
  ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);

CREATE INDEX IF NOT EXISTS "tenant_locations_coords_idx"
  ON "tenant_locations" USING btree ("latitude", "longitude");

-- 2. FK indexes for carts, inventory_movements, and billing_documents
CREATE INDEX IF NOT EXISTS "carts_tenant_discount_idx"
  ON "carts" USING btree ("tenant_id", "applied_discount_code_id");

CREATE INDEX IF NOT EXISTS "inventory_movements_tenant_order_idx"
  ON "inventory_movements" USING btree ("tenant_id", "reference_order_id");

CREATE INDEX IF NOT EXISTS "billing_documents_tenant_location_issued_idx"
  ON "billing_documents" USING btree ("tenant_id", "location_id", "issued_at");

-- 3. Composite FKs & Keys on cash_register_movements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_tenant_id_id_key') THEN
    ALTER TABLE "cash_register_movements"
      ADD CONSTRAINT "cash_register_movements_tenant_id_id_key" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_location_fk') THEN
    ALTER TABLE "cash_register_movements"
      ADD CONSTRAINT "cash_register_movements_location_fk"
      FOREIGN KEY ("tenant_id", "location_id")
      REFERENCES "public"."tenant_locations"("tenant_id", "id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_shift_fk') THEN
    ALTER TABLE "cash_register_movements"
      ADD CONSTRAINT "cash_register_movements_shift_fk"
      FOREIGN KEY ("tenant_id", "shift_id")
      REFERENCES "public"."cash_shifts"("tenant_id", "id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_order_fk') THEN
    ALTER TABLE "cash_register_movements"
      ADD CONSTRAINT "cash_register_movements_order_fk"
      FOREIGN KEY ("tenant_id", "order_id")
      REFERENCES "public"."orders"("tenant_id", "id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_tenant_idempotency_key') THEN
    ALTER TABLE "cash_register_movements"
      ADD CONSTRAINT "cash_movements_tenant_idempotency_key"
      UNIQUE ("tenant_id", "idempotency_key");
  END IF;
END $$;

-- 4. Discount Categories Junction Table
CREATE TABLE IF NOT EXISTS "discount_categories" (
  "tenant_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_categories_pkey" PRIMARY KEY("tenant_id", "discount_id", "category_id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_categories_tenant_fk') THEN
    ALTER TABLE "discount_categories"
      ADD CONSTRAINT "discount_categories_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_categories_discount_fk') THEN
    ALTER TABLE "discount_categories"
      ADD CONSTRAINT "discount_categories_discount_fk"
      FOREIGN KEY ("tenant_id", "discount_id")
      REFERENCES "public"."discounts"("tenant_id", "id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_categories_category_fk') THEN
    ALTER TABLE "discount_categories"
      ADD CONSTRAINT "discount_categories_category_fk"
      FOREIGN KEY ("tenant_id", "category_id")
      REFERENCES "public"."catalog_categories"("tenant_id", "id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "discount_categories_category_idx"
  ON "discount_categories" USING btree ("tenant_id", "category_id");

ALTER TABLE "discount_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "discount_categories" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_categories' AND policyname = 'discount_categories_runtime_isolation') THEN
    CREATE POLICY "discount_categories_runtime_isolation" ON "discount_categories"
      TO komanda_runtime
      USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_categories' AND policyname = 'discount_categories_migration_maintenance') THEN
    CREATE POLICY "discount_categories_migration_maintenance" ON "discount_categories"
      TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_categories" TO komanda_runtime;

GRANT ALL ON TABLE "discount_categories" TO komanda_migration;

-- 5. Discount Items Junction Table
CREATE TABLE IF NOT EXISTS "discount_items" (
  "tenant_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_items_pkey" PRIMARY KEY("tenant_id", "discount_id", "item_id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_items_tenant_fk') THEN
    ALTER TABLE "discount_items"
      ADD CONSTRAINT "discount_items_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_items_discount_fk') THEN
    ALTER TABLE "discount_items"
      ADD CONSTRAINT "discount_items_discount_fk"
      FOREIGN KEY ("tenant_id", "discount_id")
      REFERENCES "public"."discounts"("tenant_id", "id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_items_item_fk') THEN
    ALTER TABLE "discount_items"
      ADD CONSTRAINT "discount_items_item_fk"
      FOREIGN KEY ("tenant_id", "item_id")
      REFERENCES "public"."catalog_items"("tenant_id", "id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "discount_items_item_idx"
  ON "discount_items" USING btree ("tenant_id", "item_id");

ALTER TABLE "discount_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "discount_items" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_items' AND policyname = 'discount_items_runtime_isolation') THEN
    CREATE POLICY "discount_items_runtime_isolation" ON "discount_items"
      TO komanda_runtime
      USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discount_items' AND policyname = 'discount_items_migration_maintenance') THEN
    CREATE POLICY "discount_items_migration_maintenance" ON "discount_items"
      TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_items" TO komanda_runtime;

GRANT ALL ON TABLE "discount_items" TO komanda_migration;

-- --- Migration 0015_add_search_projections_and_pg_trgm ---
-- 1. Extension pg_trgm for typo-tolerant fuzzy searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Public Search Tenants Projection Table
CREATE TABLE IF NOT EXISTS "public_search_tenants" (
  "tenant_id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "location_name" text,
  "location_address" text,
  "lat" numeric(9, 6),
  "lng" numeric(9, 6),
  "categories_count" integer DEFAULT 0 NOT NULL,
  "is_publicly_eligible" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "public_search_tenants_slug_key" UNIQUE("slug")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_search_tenants_tenant_fk') THEN
    ALTER TABLE "public_search_tenants"
      ADD CONSTRAINT "public_search_tenants_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "public_search_tenants_eligible_idx"
  ON "public_search_tenants" USING btree ("is_publicly_eligible");

CREATE INDEX IF NOT EXISTS "public_search_tenants_name_trgm_idx"
  ON "public_search_tenants" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "public_search_tenants_loc_name_trgm_idx"
  ON "public_search_tenants" USING gin ("location_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "public_search_tenants_loc_addr_trgm_idx"
  ON "public_search_tenants" USING gin ("location_address" gin_trgm_ops);

ALTER TABLE "public_search_tenants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public_search_tenants" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'public_search_tenants' AND policyname = 'public_search_tenants_runtime_isolation') THEN
    CREATE POLICY "public_search_tenants_runtime_isolation" ON "public_search_tenants"
      TO komanda_runtime
      USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL)
      WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'public_search_tenants' AND policyname = 'public_search_tenants_migration_maintenance') THEN
    CREATE POLICY "public_search_tenants_migration_maintenance" ON "public_search_tenants"
      TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public_search_tenants" TO komanda_runtime;

GRANT ALL ON TABLE "public_search_tenants" TO komanda_migration;

-- 3. Catalog Search Entries Projection Table
CREATE TABLE IF NOT EXISTS "catalog_search_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tenant_slug" text NOT NULL,
  "tenant_name" text NOT NULL,
  "item_id" uuid NOT NULL,
  "item_name" text NOT NULL,
  "category_id" uuid NOT NULL,
  "category_name" text NOT NULL,
  "description" text,
  "price" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL,
  "image_url" text,
  "is_available" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_search_entries_item_id_key" UNIQUE("item_id"),
  CONSTRAINT "catalog_search_entries_tenant_item_unique" UNIQUE("tenant_id", "item_id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_search_entries_tenant_fk') THEN
    ALTER TABLE "catalog_search_entries"
      ADD CONSTRAINT "catalog_search_entries_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_search_entries_public_tenant_fk') THEN
    ALTER TABLE "catalog_search_entries"
      ADD CONSTRAINT "catalog_search_entries_public_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."public_search_tenants"("tenant_id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_search_entries_tenant_item_fk') THEN
    ALTER TABLE "catalog_search_entries"
      ADD CONSTRAINT "catalog_search_entries_tenant_item_fk"
      FOREIGN KEY ("tenant_id", "item_id")
      REFERENCES "public"."catalog_items"("tenant_id", "id") ON DELETE cascade;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "catalog_search_entries_tenant_idx"
  ON "catalog_search_entries" USING btree ("tenant_id");

CREATE INDEX IF NOT EXISTS "catalog_search_entries_category_idx"
  ON "catalog_search_entries" USING btree ("category_id");

CREATE INDEX IF NOT EXISTS "catalog_search_entries_available_idx"
  ON "catalog_search_entries" USING btree ("is_available");

CREATE INDEX IF NOT EXISTS "catalog_search_entries_item_name_trgm_idx"
  ON "catalog_search_entries" USING gin ("item_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "catalog_search_entries_cat_name_trgm_idx"
  ON "catalog_search_entries" USING gin ("category_name" gin_trgm_ops);

ALTER TABLE "catalog_search_entries" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "catalog_search_entries" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalog_search_entries' AND policyname = 'catalog_search_entries_runtime_isolation') THEN
    CREATE POLICY "catalog_search_entries_runtime_isolation" ON "catalog_search_entries"
      TO komanda_runtime
      USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL)
      WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'catalog_search_entries' AND policyname = 'catalog_search_entries_migration_maintenance') THEN
    CREATE POLICY "catalog_search_entries_migration_maintenance" ON "catalog_search_entries"
      TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "catalog_search_entries" TO komanda_runtime;

GRANT ALL ON TABLE "catalog_search_entries" TO komanda_migration;

-- --- Migration 0016_add_outbox_delivery_leases ---
ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "claimed_by" text,
  ADD COLUMN IF NOT EXISTS "leased_until" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_error" text,
  ADD COLUMN IF NOT EXISTS "dead_letter_at" timestamp with time zone;

DROP INDEX IF EXISTS "outbox_events_delivery_idx";

CREATE INDEX "outbox_events_delivery_idx"
  ON "outbox_events" ("published_at", "dead_letter_at", "leased_until", "available_at", "sequence");

-- --- Migration 0017_add_verification_required_payment_status ---
ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_status_check";

ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_check" CHECK ("payment_status" in ('pending', 'paid', 'failed', 'refunded', 'verification_required'));

-- --- Migration 0018_add_sanitized_analytics_views ---
-- 1. Rol de analítica
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_analytics') THEN
    CREATE ROLE komanda_analytics NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO komanda_analytics;

-- 2. Vistas Sanitizadas con Security Barrier
CREATE OR REPLACE VIEW public.v_analytics_tenants
WITH (security_barrier = true) AS
SELECT 
  id AS tenant_id,
  name,
  slug,
  status,
  preset,
  default_currency,
  default_timezone,
  created_at,
  activated_at,
  suspended_at
FROM public.tenants;

CREATE OR REPLACE VIEW public.v_analytics_orders
WITH (security_barrier = true) AS
SELECT 
  id AS order_id,
  tenant_id,
  location_id,
  purchase_number,
  source,
  fulfillment_status,
  payment_status,
  tender,
  subtotal,
  discount_total,
  total,
  currency,
  created_at,
  approved_at,
  delivered_at
FROM public.orders;

CREATE OR REPLACE VIEW public.v_analytics_order_items
WITH (security_barrier = true) AS
SELECT 
  id AS order_line_id,
  tenant_id,
  order_id,
  name AS item_name,
  quantity,
  unit_price,
  line_total,
  created_at
FROM public.order_lines;

CREATE OR REPLACE VIEW public.v_analytics_tenant_activity
WITH (security_barrier = true) AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.status AS tenant_status,
  t.preset AS tenant_preset,
  EXISTS (
    SELECT 1 FROM public.cash_shifts cs 
    WHERE cs.tenant_id = t.id AND cs.status = 'open'
  ) AS has_open_cash_shift,
  (
    SELECT count(*)::int FROM public.print_agents pa 
    WHERE pa.tenant_id = t.id 
      AND pa.status = 'active' 
      AND pa.last_seen_at >= (NOW() - INTERVAL '15 minutes')
  ) AS active_printers_count,
  (
    SELECT count(*)::int FROM public.orders o 
    WHERE o.tenant_id = t.id 
      AND o.created_at >= date_trunc('day', NOW() AT TIME ZONE t.default_timezone)
  ) AS orders_today_count,
  (
    SELECT max(o.created_at) FROM public.orders o 
    WHERE o.tenant_id = t.id
  ) AS last_order_at
FROM public.tenants t;

-- 3. Privilegios de Solo Lectura para komanda_analytics
GRANT SELECT ON public.v_analytics_tenants TO komanda_analytics;

GRANT SELECT ON public.v_analytics_orders TO komanda_analytics;

GRANT SELECT ON public.v_analytics_order_items TO komanda_analytics;

GRANT SELECT ON public.v_analytics_tenant_activity TO komanda_analytics;

-- --- Migration 0019_grant_print_agent_pairings ---
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "print_agent_pairings" TO komanda_runtime;

GRANT ALL ON TABLE "print_agent_pairings" TO komanda_migration;

-- --- Migration 0020_allow_audit_purge_for_tenant_erasure ---
-- Tenant erasure must be able to remove audit_events, but audit_events must stay
-- append-only for every other code path. The trigger therefore only rejects a
-- DELETE when the transaction has not explicitly opted in via app.allow_audit_purge.
CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND nullif(current_setting('app.allow_audit_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only; updates and deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();

-- --- Migration 0021_purge_user_password_plain ---
-- Komanda never stores retrievable credentials. The plaintext column was added
-- in 0001 and written by the member service, so every row that ever received a
-- member password exposes that password to anyone able to read the table, its
-- replicas or its backups.
--
-- Detection (run BEFORE this migration, it never prints the secret itself):
--   select id, email, status
--     from users
--    where password_plain is not null
--    order by created_at;
-- Keep that list out of version control: it is the rotation worklist for the
-- accounts whose credentials were exposed at rest.
--
-- This migration only erases the stored copies. Application code stops reading
-- and writing the column in the same release (see features/members), so the
-- column is left in place for one release cycle to keep a previous version
-- deployable during a rolling deploy. A follow-up migration drops it.
UPDATE users SET password_plain = NULL WHERE password_plain IS NOT NULL;

COMMENT ON COLUMN users.password_plain IS
  'Deprecated. Komanda never stores retrievable credentials; this column is purged and no longer written. Scheduled for removal.';

-- --- Migration 0022_grant_all_runtime_tables_and_default_privileges ---
-- 1. Ensure komanda_runtime has permissions on all operational tables and sequences (including global_product_catalog)
GRANT USAGE ON SCHEMA public TO komanda_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO komanda_runtime;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO komanda_runtime;

-- 2. Ensure komanda_migration has full maintenance access
GRANT ALL ON ALL TABLES IN SCHEMA public TO komanda_migration;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO komanda_migration;

-- 3. Set default privileges so future tables and sequences automatically inherit permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO komanda_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO komanda_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO komanda_migration;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO komanda_migration;
