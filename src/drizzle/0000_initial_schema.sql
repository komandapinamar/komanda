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
--> statement-breakpoint
CREATE TABLE "onboarding_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
	"tenant_id" uuid NOT NULL,
	"counter_type" text NOT NULL,
	"current_value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_counters_tenant_id_counter_type_pk" PRIMARY KEY("tenant_id","counter_type"),
	CONSTRAINT "tenant_counters_nonnegative_check" CHECK ("tenant_counters"."current_value" >= 0)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "item_addon_groups" (
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"addon_group_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_addon_groups_tenant_id_item_id_addon_group_id_pk" PRIMARY KEY("tenant_id","item_id","addon_group_id"),
	CONSTRAINT "item_addon_groups_sort_check" CHECK ("item_addon_groups"."sort_order" >= 0)
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "identity_verification_challenges" ADD CONSTRAINT "identity_verification_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_handoffs" ADD CONSTRAINT "onboarding_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_handoffs" ADD CONSTRAINT "onboarding_handoffs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_locations" ADD CONSTRAINT "tenant_locations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlement_snapshots" ADD CONSTRAINT "tenant_entitlement_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlement_snapshots" ADD CONSTRAINT "tenant_entitlement_snapshots_plan_fk" FOREIGN KEY ("plan_id","plan_version") REFERENCES "public"."plan_definitions"("plan_id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_groups" ADD CONSTRAINT "addon_groups_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_combos" ADD CONSTRAINT "catalog_combos_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."catalog_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_combos" ADD CONSTRAINT "catalog_combos_media_fk" FOREIGN KEY ("tenant_id","image_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."catalog_categories"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_media_fk" FOREIGN KEY ("tenant_id","image_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_fk" FOREIGN KEY ("tenant_id","combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_addon_groups" ADD CONSTRAINT "item_addon_groups_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_addon_groups" ADD CONSTRAINT "item_addon_groups_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_line_fk" FOREIGN KEY ("tenant_id","cart_line_id") REFERENCES "public"."cart_lines"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_line_options" ADD CONSTRAINT "cart_line_options_option_fk" FOREIGN KEY ("tenant_id","addon_option_id") REFERENCES "public"."addon_options"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_combo_fk" FOREIGN KEY ("tenant_id","combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "public"."order_lines"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_group_fk" FOREIGN KEY ("tenant_id","addon_group_id") REFERENCES "public"."addon_groups"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_options" ADD CONSTRAINT "order_line_options_option_fk" FOREIGN KEY ("tenant_id","addon_option_id") REFERENCES "public"."addon_options"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_fk" FOREIGN KEY ("tenant_id","source_item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_combo_fk" FOREIGN KEY ("tenant_id","source_combo_id") REFERENCES "public"."catalog_combos"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_integration_fk" FOREIGN KEY ("tenant_id","integration_account_id") REFERENCES "public"."integration_accounts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_fk" FOREIGN KEY ("tenant_id","cart_id") REFERENCES "public"."carts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_attempt_fk" FOREIGN KEY ("tenant_id","payment_attempt_id") REFERENCES "public"."payment_attempts"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD CONSTRAINT "integration_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_resource_routes" ADD CONSTRAINT "provider_resource_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_agents" ADD CONSTRAINT "print_agents_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_job_fk" FOREIGN KEY ("tenant_id","print_job_id") REFERENCES "public"."print_jobs"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_agent_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_agent_fk" FOREIGN KEY ("tenant_id","claimed_by_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_sessions" ADD CONSTRAINT "storefront_sessions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_sessions" ADD CONSTRAINT "storefront_sessions_order_fk" FOREIGN KEY ("tenant_id","associated_order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_challenges_token_digest_uidx" ON "identity_verification_challenges" USING btree ("token_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_challenges_one_active_uidx" ON "identity_verification_challenges" USING btree ("user_id","purpose") WHERE "identity_verification_challenges"."consumed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_handoffs_token_digest_uidx" ON "onboarding_handoffs" USING btree ("token_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_handoffs_one_active_uidx" ON "onboarding_handoffs" USING btree ("tenant_id","user_id") WHERE "onboarding_handoffs"."consumed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_locations_one_primary_uidx" ON "tenant_locations" USING btree ("tenant_id") WHERE "tenant_locations"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "tenant_locations_tenant_status_idx" ON "tenant_locations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tenant_memberships_user_status_idx" ON "tenant_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_normalized_slug_uidx" ON "tenants" USING btree ("normalized_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_digest_uidx" ON "user_sessions" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_email_uidx" ON "users" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "order_events_tenant_order_idx" ON "order_events" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_events_tenant_sequence_idx" ON "order_events" USING btree ("tenant_id","sequence");--> statement-breakpoint
CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events" USING btree ("published_at","available_at");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlement_snapshots_one_current_uidx" ON "tenant_entitlement_snapshots" USING btree ("tenant_id") WHERE "tenant_entitlement_snapshots"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "tenant_entitlement_snapshots_tenant_effective_idx" ON "tenant_entitlement_snapshots" USING btree ("tenant_id","effective_at");--> statement-breakpoint
CREATE INDEX "addon_groups_tenant_status_sort_idx" ON "addon_groups" USING btree ("tenant_id","status","sort_order");--> statement-breakpoint
CREATE INDEX "addon_options_tenant_group_sort_idx" ON "addon_options" USING btree ("tenant_id","group_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_categories_tenant_name_active_uidx" ON "catalog_categories" USING btree ("tenant_id","normalized_name") WHERE "catalog_categories"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "catalog_categories_tenant_status_sort_idx" ON "catalog_categories" USING btree ("tenant_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_combos_tenant_name_active_uidx" ON "catalog_combos" USING btree ("tenant_id","normalized_name") WHERE "catalog_combos"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "catalog_combos_tenant_category_status_idx" ON "catalog_combos" USING btree ("tenant_id","category_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_tenant_name_active_uidx" ON "catalog_items" USING btree ("tenant_id","normalized_name") WHERE "catalog_items"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "catalog_items_tenant_category_status_sort_idx" ON "catalog_items" USING btree ("tenant_id","category_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_uidx" ON "media_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_tenant_status_idx" ON "media_assets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "cart_line_options_tenant_line_idx" ON "cart_line_options" USING btree ("tenant_id","cart_line_id");--> statement-breakpoint
CREATE INDEX "cart_lines_tenant_cart_idx" ON "cart_lines" USING btree ("tenant_id","cart_id");--> statement-breakpoint
CREATE INDEX "carts_tenant_expires_idx" ON "carts" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "carts_tenant_status_updated_idx" ON "carts" USING btree ("tenant_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "order_line_options_tenant_line_idx" ON "order_line_options" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE INDEX "order_lines_tenant_order_idx" ON "order_lines" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_tenant_payment_idx" ON "payment_attempts" USING btree ("tenant_id","provider_payment_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_fulfillment_idx" ON "orders" USING btree ("tenant_id","fulfillment_status","approved_at");--> statement-breakpoint
CREATE INDEX "orders_tenant_created_idx" ON "orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_provider_account_uidx" ON "integration_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_routing_key_uidx" ON "integration_accounts" USING btree ("webhook_routing_key");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_one_active_provider_uidx" ON "integration_accounts" USING btree ("tenant_id","provider") WHERE "integration_accounts"."status" in ('pending', 'active', 'expired', 'error');--> statement-breakpoint
CREATE INDEX "integration_accounts_tenant_status_idx" ON "integration_accounts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "provider_resource_routes_tenant_idx" ON "provider_resource_routes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhook_events_tenant_status_idx" ON "webhook_events" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "print_agents_token_prefix_uidx" ON "print_agents" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "print_agents_tenant_location_status_idx" ON "print_agents" USING btree ("tenant_id","location_id","status");--> statement-breakpoint
CREATE INDEX "print_job_attempts_tenant_job_idx" ON "print_job_attempts" USING btree ("tenant_id","print_job_id");--> statement-breakpoint
CREATE INDEX "print_jobs_tenant_location_status_idx" ON "print_jobs" USING btree ("tenant_id","location_id","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "storefront_sessions_tenant_created_idx" ON "storefront_sessions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "storefront_sessions_tenant_last_active_idx" ON "storefront_sessions" USING btree ("tenant_id","last_active_at");--> statement-breakpoint
CREATE INDEX "billing_documents_tenant_issued_idx" ON "billing_documents" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "billing_documents_tenant_order_idx" ON "billing_documents" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "billing_documents_tenant_fiscal_status_idx" ON "billing_documents" USING btree ("tenant_id","fiscal_status");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_runtime') THEN
    CREATE ROLE komanda_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_migration') THEN
    CREATE ROLE komanda_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA public TO komanda_migration;
--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO komanda_migration;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO komanda_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; updates and deletes are forbidden';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
--> statement-breakpoint
ALTER TABLE "addon_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "addon_groups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "addon_groups_runtime_isolation" ON "addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "addon_groups_migration_maintenance" ON "addon_groups" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "addon_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "addon_options" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "addon_options_runtime_isolation" ON "addon_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "addon_options_migration_maintenance" ON "addon_options" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_events_runtime_isolation" ON "audit_events" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) ) WITH CHECK ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) );
--> statement-breakpoint
CREATE POLICY "audit_events_migration_maintenance" ON "audit_events" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "billing_documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "billing_documents_runtime_isolation" ON "billing_documents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "billing_documents_migration_maintenance" ON "billing_documents" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "cart_line_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cart_line_options" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cart_line_options_runtime_isolation" ON "cart_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "cart_line_options_migration_maintenance" ON "cart_line_options" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "cart_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cart_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cart_lines_runtime_isolation" ON "cart_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "cart_lines_migration_maintenance" ON "cart_lines" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "carts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "carts_runtime_isolation" ON "carts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "carts_migration_maintenance" ON "carts" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "catalog_categories_runtime_isolation" ON "catalog_categories" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "catalog_categories_migration_maintenance" ON "catalog_categories" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "catalog_combos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_combos" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "catalog_combos_runtime_isolation" ON "catalog_combos" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "catalog_combos_migration_maintenance" ON "catalog_combos" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "catalog_items_runtime_isolation" ON "catalog_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "catalog_items_migration_maintenance" ON "catalog_items" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "combo_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "combo_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "combo_items_runtime_isolation" ON "combo_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "combo_items_migration_maintenance" ON "combo_items" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "idempotency_records_runtime_isolation" ON "idempotency_records" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) ) WITH CHECK ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL) );
--> statement-breakpoint
CREATE POLICY "idempotency_records_migration_maintenance" ON "idempotency_records" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "identity_verification_challenges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "identity_verification_challenges" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "identity_challenges_runtime_identity" ON "identity_verification_challenges" TO komanda_runtime USING ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL ) WITH CHECK ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );
--> statement-breakpoint
CREATE POLICY "identity_verification_challenges_migration_maintenance" ON "identity_verification_challenges" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "integration_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "integration_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "integration_accounts_runtime_isolation" ON "integration_accounts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "integration_accounts_migration_maintenance" ON "integration_accounts" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "item_addon_groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "item_addon_groups" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "item_addon_groups_runtime_isolation" ON "item_addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "item_addon_groups_migration_maintenance" ON "item_addon_groups" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "media_assets_runtime_isolation" ON "media_assets" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "media_assets_migration_maintenance" ON "media_assets" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "onboarding_handoffs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "onboarding_handoffs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "onboarding_handoffs_runtime_isolation" ON "onboarding_handoffs" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "onboarding_handoffs_migration_maintenance" ON "onboarding_handoffs" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "order_events_runtime_isolation" ON "order_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "order_events_migration_maintenance" ON "order_events" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "order_line_options" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_line_options" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "order_line_options_runtime_isolation" ON "order_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "order_line_options_migration_maintenance" ON "order_line_options" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_lines" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "order_lines_runtime_isolation" ON "order_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "order_lines_migration_maintenance" ON "order_lines" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orders_runtime_isolation" ON "orders" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "orders_migration_maintenance" ON "orders" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "outbox_events_runtime_isolation" ON "outbox_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "outbox_events_migration_maintenance" ON "outbox_events" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "payment_attempts_runtime_isolation" ON "payment_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "payment_attempts_migration_maintenance" ON "payment_attempts" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "print_agents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "print_agents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "print_agents_runtime_isolation" ON "print_agents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-agent-auth') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "print_agents_migration_maintenance" ON "print_agents" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "print_job_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "print_job_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "print_job_attempts_runtime_isolation" ON "print_job_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "print_job_attempts_migration_maintenance" ON "print_job_attempts" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "print_jobs_runtime_isolation" ON "print_jobs" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "print_jobs_migration_maintenance" ON "print_jobs" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "provider_resource_routes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provider_resource_routes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "provider_resource_routes_runtime_isolation" ON "provider_resource_routes" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "provider_resource_routes_migration_maintenance" ON "provider_resource_routes" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "storefront_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "storefront_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "storefront_sessions_runtime_isolation" ON "storefront_sessions" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "storefront_sessions_migration_maintenance" ON "storefront_sessions" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenant_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_counters" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_counters_runtime_isolation" ON "tenant_counters" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_counters_migration_maintenance" ON "tenant_counters" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenant_entitlement_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_entitlement_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_entitlement_snapshots_runtime_isolation" ON "tenant_entitlement_snapshots" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_entitlement_snapshots_migration_maintenance" ON "tenant_entitlement_snapshots" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenant_locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_locations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_locations_runtime_isolation" ON "tenant_locations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_locations_migration_maintenance" ON "tenant_locations" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_memberships_runtime_isolation" ON "tenant_memberships" TO komanda_runtime USING ( "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR "user_id" = nullif(current_setting('app.user_id', true), '')::uuid ) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_memberships_migration_maintenance" ON "tenant_memberships" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_settings_runtime_isolation" ON "tenant_settings" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tenant_settings_migration_maintenance" ON "tenant_settings" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenants_runtime_isolation" ON "tenants" TO komanda_runtime USING ( "id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL OR EXISTS ( SELECT 1 FROM "tenant_memberships" membership WHERE membership."tenant_id" = "tenants"."id" AND membership."user_id" = nullif(current_setting('app.user_id', true), '')::uuid AND membership."status" = 'active' ) ) WITH CHECK ( "id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );
--> statement-breakpoint
CREATE POLICY "tenants_migration_maintenance" ON "tenants" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_sessions_runtime_identity" ON "user_sessions" TO komanda_runtime USING ( "user_id" = nullif(current_setting('app.user_id', true), '')::uuid OR "token_digest" = nullif(current_setting('app.session_token_digest', true), '') ) WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_sessions_migration_maintenance" ON "user_sessions" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_runtime_identity" ON "users" TO komanda_runtime USING ( "id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL ) WITH CHECK ( "id" = nullif(current_setting('app.user_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IS NOT NULL );
--> statement-breakpoint
CREATE POLICY "users_migration_maintenance" ON "users" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "webhook_events_runtime_isolation" ON "webhook_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "webhook_events_migration_maintenance" ON "webhook_events" TO komanda_migration USING (true) WITH CHECK (true);
