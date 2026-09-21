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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_tenant_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_order_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mp_financial_records_tenant_fk') THEN
    ALTER TABLE "mp_financial_records" ADD CONSTRAINT "mp_financial_records_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mp_financial_records_order_fk') THEN
    ALTER TABLE "mp_financial_records" ADD CONSTRAINT "mp_financial_records_order_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storefront_item_events_tenant_fk') THEN
    ALTER TABLE "storefront_item_events" ADD CONSTRAINT "storefront_item_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movements_tenant_location_idx" ON "cash_register_movements" USING btree ("tenant_id","location_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_financial_tenant_date_idx" ON "mp_financial_records" USING btree ("tenant_id","location_id","settlement_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mp_financial_release_expected_idx" ON "mp_financial_records" USING btree ("tenant_id","money_release_status","money_release_expected_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_events_tenant_item_idx" ON "storefront_item_events" USING btree ("tenant_id","item_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_events_purge_idx" ON "storefront_item_events" USING btree ("occurred_at");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tender" text DEFAULT 'cash' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tender_check') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_tender_check" CHECK ("orders"."tender" in ('cash', 'posnet'));
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "integration_accounts_provider_account_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_accounts_provider_account_uidx" ON "integration_accounts" USING btree ("provider","provider_account_id") WHERE "integration_accounts"."status" in ('pending', 'active', 'expired', 'error');
--> statement-breakpoint
ALTER TABLE "cash_register_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cash_register_movements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_register_movements' AND policyname = 'cash_register_movements_runtime_isolation') THEN
    CREATE POLICY "cash_register_movements_runtime_isolation" ON "cash_register_movements" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_register_movements' AND policyname = 'cash_register_movements_migration_maintenance') THEN
    CREATE POLICY "cash_register_movements_migration_maintenance" ON "cash_register_movements" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "mp_financial_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "mp_financial_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mp_financial_records' AND policyname = 'mp_financial_records_runtime_isolation') THEN
    CREATE POLICY "mp_financial_records_runtime_isolation" ON "mp_financial_records" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mp_financial_records' AND policyname = 'mp_financial_records_migration_maintenance') THEN
    CREATE POLICY "mp_financial_records_migration_maintenance" ON "mp_financial_records" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "storefront_item_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "storefront_item_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storefront_item_events' AND policyname = 'storefront_item_events_runtime_isolation') THEN
    CREATE POLICY "storefront_item_events_runtime_isolation" ON "storefront_item_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storefront_item_events' AND policyname = 'storefront_item_events_migration_maintenance') THEN
    CREATE POLICY "storefront_item_events_migration_maintenance" ON "storefront_item_events" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cash_register_movements", "mp_financial_records", "storefront_item_events" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "cash_register_movements", "mp_financial_records", "storefront_item_events" TO komanda_migration;
--> statement-breakpoint
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
