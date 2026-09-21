-- 1. Location coordinates
ALTER TABLE "tenant_locations"
  ADD COLUMN IF NOT EXISTS "latitude" numeric(9, 6),
  ADD COLUMN IF NOT EXISTS "longitude" numeric(9, 6);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_locations_coords_idx"
  ON "tenant_locations" USING btree ("latitude", "longitude");
--> statement-breakpoint

-- 2. FK indexes for carts, inventory_movements, and billing_documents
CREATE INDEX IF NOT EXISTS "carts_tenant_discount_idx"
  ON "carts" USING btree ("tenant_id", "applied_discount_code_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_tenant_order_idx"
  ON "inventory_movements" USING btree ("tenant_id", "reference_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_documents_tenant_location_issued_idx"
  ON "billing_documents" USING btree ("tenant_id", "location_id", "issued_at");
--> statement-breakpoint

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
--> statement-breakpoint

-- 4. Discount Categories Junction Table
CREATE TABLE IF NOT EXISTS "discount_categories" (
  "tenant_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_categories_pkey" PRIMARY KEY("tenant_id", "discount_id", "category_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_categories_category_idx"
  ON "discount_categories" USING btree ("tenant_id", "category_id");
--> statement-breakpoint
ALTER TABLE "discount_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discount_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
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
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_categories" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "discount_categories" TO komanda_migration;
--> statement-breakpoint

-- 5. Discount Items Junction Table
CREATE TABLE IF NOT EXISTS "discount_items" (
  "tenant_id" uuid NOT NULL,
  "discount_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_items_pkey" PRIMARY KEY("tenant_id", "discount_id", "item_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_items_item_idx"
  ON "discount_items" USING btree ("tenant_id", "item_id");
--> statement-breakpoint
ALTER TABLE "discount_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discount_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
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
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_items" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "discount_items" TO komanda_migration;
