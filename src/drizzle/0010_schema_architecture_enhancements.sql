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
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_tenant_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_location_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printer_destinations_agent_fk') THEN
    ALTER TABLE "printer_destinations" ADD CONSTRAINT "printer_destinations_agent_fk" FOREIGN KEY ("tenant_id","assigned_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printer_destinations_tenant_loc_idx" ON "printer_destinations" USING btree ("tenant_id","location_id","is_active");
--> statement-breakpoint

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
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_tenant_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_location_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_levels_item_fk') THEN
    ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_levels_location_item_uidx" ON "inventory_levels" USING btree ("tenant_id","location_id","item_id");
--> statement-breakpoint

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
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_tenant_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_location_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_item_fk') THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_fk" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."catalog_items"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_lookup_idx" ON "inventory_movements" USING btree ("tenant_id","location_id","item_id","occurred_at");
--> statement-breakpoint

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
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_tenant_fk') THEN
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discounts_tenant_active_idx" ON "discounts" USING btree ("tenant_id","is_active","starts_at","ends_at");
--> statement-breakpoint

ALTER TABLE "cash_shifts" ADD COLUMN IF NOT EXISTS "register_identifier" text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "cash_shifts_one_open_per_tenant_uidx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_shifts_one_open_per_register_uidx" ON "cash_shifts" USING btree ("tenant_id","location_id","register_identifier") WHERE "cash_shifts"."status" = 'open';
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_shifts_location_fk') THEN
    ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "cash_register_movements" ADD COLUMN IF NOT EXISTS "shift_id" uuid;
--> statement-breakpoint
ALTER TABLE "cash_register_movements" ADD COLUMN IF NOT EXISTS "reason" text;
--> statement-breakpoint
ALTER TABLE "cash_register_movements" ALTER COLUMN "order_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_register_movements_shift_fk') THEN
    ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."cash_shifts"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movements_shift_idx" ON "cash_register_movements" USING btree ("tenant_id","shift_id");
--> statement-breakpoint
ALTER TABLE "cash_register_movements" DROP CONSTRAINT IF EXISTS "cash_movements_order_type_uniq";
--> statement-breakpoint
DROP INDEX IF EXISTS "cash_movements_order_type_uniq";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_movements_order_type_uniq" ON "cash_register_movements" USING btree ("tenant_id","order_id","type") WHERE "order_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_register_movements" DROP CONSTRAINT IF EXISTS "cash_movements_type_check";
--> statement-breakpoint
ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_movements_type_check" CHECK ("type" in ('sale_deposit', 'cancellation_withdrawal', 'opening_float', 'manual_cash_in', 'cash_drop', 'expense_payout'));
--> statement-breakpoint

ALTER TABLE "catalog_categories" ADD COLUMN IF NOT EXISTS "destination_station" text DEFAULT 'kitchen' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_categories_destination_station_check') THEN
    ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_destination_station_check" CHECK ("destination_station" in ('kitchen', 'bar', 'cashier', 'runner', 'custom'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "destination_station" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_destination_station_check') THEN
    ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_destination_station_check" CHECK ("destination_station" is null or "destination_station" in ('kitchen', 'bar', 'cashier', 'runner', 'custom'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "destination_station_id" uuid;
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "station_type" text DEFAULT 'all' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_station_fk') THEN
    ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_station_fk" FOREIGN KEY ("tenant_id","destination_station_id") REFERENCES "public"."printer_destinations"("tenant_id","id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_station_type_check') THEN
    ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_station_type_check" CHECK ("station_type" in ('kitchen', 'bar', 'cashier', 'runner', 'custom', 'all'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "related_document_id" uuid;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "vat_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_documents_related_fk') THEN
    ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_related_fk" FOREIGN KEY ("tenant_id","related_document_id") REFERENCES "public"."billing_documents"("tenant_id","id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_documents_tenant_related_idx" ON "billing_documents" USING btree ("tenant_id","related_document_id");
--> statement-breakpoint
ALTER TABLE "billing_documents" DROP CONSTRAINT IF EXISTS "billing_documents_document_type_check";
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_document_type_check" CHECK ("document_type" in ('factura_a', 'factura_b', 'factura_c', 'nota_credito_a', 'nota_credito_b', 'nota_credito_c', 'nota_debito_a', 'nota_debito_b', 'recibo_x', 'ticket_interno'));
--> statement-breakpoint

DROP INDEX IF EXISTS "outbox_events_delivery_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_delivery_idx" ON "outbox_events" USING btree ("published_at","available_at","sequence");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "item_events_tenant_occurred_idx" ON "storefront_item_events" USING btree ("tenant_id","occurred_at");
--> statement-breakpoint

ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "applied_discount_code_id" uuid;
--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "discount_metadata" jsonb;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carts_discount_fk') THEN
    ALTER TABLE "carts" ADD CONSTRAINT "carts_discount_fk" FOREIGN KEY ("applied_discount_code_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- RLS & Grants for newly created and updated tables
ALTER TABLE "printer_destinations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "printer_destinations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'printer_destinations' AND policyname = 'printer_destinations_runtime_isolation') THEN
    CREATE POLICY "printer_destinations_runtime_isolation" ON "printer_destinations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'printer_destinations' AND policyname = 'printer_destinations_migration_maintenance') THEN
    CREATE POLICY "printer_destinations_migration_maintenance" ON "printer_destinations" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "inventory_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inventory_levels" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_levels' AND policyname = 'inventory_levels_runtime_isolation') THEN
    CREATE POLICY "inventory_levels_runtime_isolation" ON "inventory_levels" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_levels' AND policyname = 'inventory_levels_migration_maintenance') THEN
    CREATE POLICY "inventory_levels_migration_maintenance" ON "inventory_levels" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inventory_movements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND policyname = 'inventory_movements_runtime_isolation') THEN
    CREATE POLICY "inventory_movements_runtime_isolation" ON "inventory_movements" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_movements' AND policyname = 'inventory_movements_migration_maintenance') THEN
    CREATE POLICY "inventory_movements_migration_maintenance" ON "inventory_movements" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discounts' AND policyname = 'discounts_runtime_isolation') THEN
    CREATE POLICY "discounts_runtime_isolation" ON "discounts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'discounts' AND policyname = 'discounts_migration_maintenance') THEN
    CREATE POLICY "discounts_migration_maintenance" ON "discounts" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "cash_shifts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cash_shifts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_shifts' AND policyname = 'cash_shifts_runtime_isolation') THEN
    CREATE POLICY "cash_shifts_runtime_isolation" ON "cash_shifts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cash_shifts' AND policyname = 'cash_shifts_migration_maintenance') THEN
    CREATE POLICY "cash_shifts_migration_maintenance" ON "cash_shifts" TO komanda_migration USING (true) WITH CHECK (true);
  END IF;
END $$;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "printer_destinations", "inventory_levels", "inventory_movements", "discounts", "cash_shifts" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "printer_destinations", "inventory_levels", "inventory_movements", "discounts", "cash_shifts" TO komanda_migration;
