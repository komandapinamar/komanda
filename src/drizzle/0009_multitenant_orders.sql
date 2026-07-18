ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "location_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_attempt_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "purchase_number" bigint;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillment_status" text DEFAULT 'approved';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'pending';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_snapshot" jsonb;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subtotal" numeric(12,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_total" numeric(12,2) DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "total" numeric(12,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "currency" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "orders" ALTER COLUMN "customer" DROP NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_location_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_location_fk"
      FOREIGN KEY ("tenant_id", "location_id")
      REFERENCES "tenant_locations"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_cart_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_cart_fk"
      FOREIGN KEY ("tenant_id", "cart_id")
      REFERENCES "carts"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_attempt_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_payment_attempt_fk"
      FOREIGN KEY ("tenant_id", "payment_attempt_id")
      REFERENCES "payment_attempts"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_id_id_key'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tenant_id_id_key" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_purchase_number_key'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tenant_purchase_number_key"
      UNIQUE ("tenant_id", "purchase_number");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_idempotency_key'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_tenant_idempotency_key"
      UNIQUE ("tenant_id", "idempotency_key");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_source_check"
      CHECK ("source" IS NULL OR "source" IN ('mercadopago_webhook', 'admin_direct'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_status_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_fulfillment_status_check"
      CHECK ("fulfillment_status" IS NULL OR "fulfillment_status" IN ('approved', 'preparing', 'ready', 'delivered', 'cancelled'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_payment_status_check"
      CHECK ("payment_status" IS NULL OR "payment_status" IN ('pending', 'paid', 'failed', 'refunded'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_currency_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_currency_check"
      CHECK ("currency" IS NULL OR char_length("currency") = 3)
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_amounts_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_amounts_check"
      CHECK (
        ("subtotal" IS NULL OR "subtotal" >= 0)
        AND ("discount_total" IS NULL OR "discount_total" >= 0)
        AND ("total" IS NULL OR "total" >= 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_version_check'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_version_check"
      CHECK ("version" IS NULL OR "version" > 0)
      NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "orders_idempotency_key_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tenant_fulfillment_idx" ON "orders" ("tenant_id", "fulfillment_status", "approved_at");
CREATE INDEX IF NOT EXISTS "orders_tenant_created_idx" ON "orders" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "source_item_id" uuid,
  "source_combo_id" uuid,
  "name" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" numeric(12,2) NOT NULL,
  "line_total" numeric(12,2) NOT NULL,
  "image_url" text,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_lines_item_fk" FOREIGN KEY ("tenant_id", "source_item_id") REFERENCES "catalog_items"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_lines_combo_fk" FOREIGN KEY ("tenant_id", "source_combo_id") REFERENCES "catalog_combos"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_lines_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "order_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_lines_amount_check" CHECK ("unit_price" >= 0 AND "line_total" >= 0)
);
CREATE INDEX IF NOT EXISTS "order_lines_tenant_order_idx" ON "order_lines" ("tenant_id", "order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_line_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_line_id" uuid NOT NULL,
  "addon_group_id" uuid,
  "addon_option_id" uuid,
  "name" text NOT NULL,
  "price_delta" numeric(12,2) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "order_line_options_line_fk" FOREIGN KEY ("tenant_id", "order_line_id") REFERENCES "order_lines"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_line_options_group_fk" FOREIGN KEY ("tenant_id", "addon_group_id") REFERENCES "addon_groups"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_line_options_option_fk" FOREIGN KEY ("tenant_id", "addon_option_id") REFERENCES "addon_options"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_line_options_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "order_line_options_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX IF NOT EXISTS "order_line_options_tenant_line_idx" ON "order_line_options" ("tenant_id", "order_line_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "sequence" bigint NOT NULL,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_user_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "order_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_events_order_fk" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_events_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "order_events_tenant_sequence_key" UNIQUE ("tenant_id", "sequence")
);
CREATE INDEX IF NOT EXISTS "order_events_tenant_order_idx" ON "order_events" ("tenant_id", "order_id");
CREATE INDEX IF NOT EXISTS "order_events_tenant_sequence_idx" ON "order_events" ("tenant_id", "sequence");
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_line_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_line_options" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "orders_runtime_isolation" ON "orders" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "order_lines_runtime_isolation" ON "order_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "order_line_options_runtime_isolation" ON "order_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "order_events_runtime_isolation" ON "order_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "orders", "order_lines", "order_line_options", "order_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "orders", "order_lines", "order_line_options", "order_events" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "orders", "order_lines", "order_line_options", "order_events" TO komanda_migration;
