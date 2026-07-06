CREATE TABLE "carts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "currency" text NOT NULL,
  "subtotal" numeric(12,2) NOT NULL,
  "discount_total" numeric(12,2) DEFAULT 0 NOT NULL,
  "total" numeric(12,2) NOT NULL,
  "catalog_revision" integer DEFAULT 1 NOT NULL,
  "verified_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "carts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "carts_location_fk" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "tenant_locations"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "carts_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "carts_status_check" CHECK ("status" IN ('open', 'validated', 'checkout_started', 'converted', 'expired')),
  CONSTRAINT "carts_currency_check" CHECK (char_length("currency") = 3),
  CONSTRAINT "carts_amounts_check" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "total" >= 0),
  CONSTRAINT "carts_version_check" CHECK ("version" > 0)
);
CREATE INDEX "carts_tenant_expires_idx" ON "carts" ("tenant_id", "expires_at");
CREATE INDEX "carts_tenant_status_updated_idx" ON "carts" ("tenant_id", "status", "updated_at");
--> statement-breakpoint
CREATE TABLE "cart_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cart_id" uuid NOT NULL,
  "item_id" uuid,
  "combo_id" uuid,
  "quantity" integer NOT NULL,
  "name_snapshot" text NOT NULL,
  "unit_price_snapshot" numeric(12,2) NOT NULL,
  "line_total" numeric(12,2) NOT NULL,
  "image_url_snapshot" text,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cart_lines_cart_fk" FOREIGN KEY ("tenant_id", "cart_id") REFERENCES "carts"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_lines_item_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "catalog_items"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_lines_combo_fk" FOREIGN KEY ("tenant_id", "combo_id") REFERENCES "catalog_combos"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_lines_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "cart_lines_one_resource_check" CHECK ((("item_id" IS NOT NULL)::int + ("combo_id" IS NOT NULL)::int) = 1),
  CONSTRAINT "cart_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "cart_lines_amount_check" CHECK ("unit_price_snapshot" >= 0 AND "line_total" >= 0)
);
CREATE INDEX "cart_lines_tenant_cart_idx" ON "cart_lines" ("tenant_id", "cart_id");
--> statement-breakpoint
CREATE TABLE "cart_line_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cart_line_id" uuid NOT NULL,
  "addon_group_id" uuid NOT NULL,
  "addon_option_id" uuid NOT NULL,
  "name_snapshot" text NOT NULL,
  "price_delta_snapshot" numeric(12,2) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "cart_line_options_line_fk" FOREIGN KEY ("tenant_id", "cart_line_id") REFERENCES "cart_lines"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_line_options_group_fk" FOREIGN KEY ("tenant_id", "addon_group_id") REFERENCES "addon_groups"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_line_options_option_fk" FOREIGN KEY ("tenant_id", "addon_option_id") REFERENCES "addon_options"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cart_line_options_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "cart_line_options_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "cart_line_options_tenant_line_idx" ON "cart_line_options" ("tenant_id", "cart_line_id");
--> statement-breakpoint
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cart_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cart_line_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_line_options" FORCE ROW LEVEL SECURITY;
CREATE POLICY "carts_runtime_isolation" ON "carts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "cart_lines_runtime_isolation" ON "cart_lines" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "cart_line_options_runtime_isolation" ON "cart_line_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "carts", "cart_lines", "cart_line_options" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "carts", "cart_lines", "cart_line_options" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "carts", "cart_lines", "cart_line_options" TO komanda_migration;
