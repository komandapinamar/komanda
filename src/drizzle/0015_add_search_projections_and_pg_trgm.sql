-- 1. Extension pg_trgm for typo-tolerant fuzzy searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

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
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_search_tenants_tenant_fk') THEN
    ALTER TABLE "public_search_tenants"
      ADD CONSTRAINT "public_search_tenants_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "public_search_tenants_eligible_idx"
  ON "public_search_tenants" USING btree ("is_publicly_eligible");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_search_tenants_name_trgm_idx"
  ON "public_search_tenants" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_search_tenants_loc_name_trgm_idx"
  ON "public_search_tenants" USING gin ("location_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_search_tenants_loc_addr_trgm_idx"
  ON "public_search_tenants" USING gin ("location_address" gin_trgm_ops);
--> statement-breakpoint

ALTER TABLE "public_search_tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public_search_tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

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
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public_search_tenants" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "public_search_tenants" TO komanda_migration;
--> statement-breakpoint

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
--> statement-breakpoint

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
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "catalog_search_entries_tenant_idx"
  ON "catalog_search_entries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_search_entries_category_idx"
  ON "catalog_search_entries" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_search_entries_available_idx"
  ON "catalog_search_entries" USING btree ("is_available");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_search_entries_item_name_trgm_idx"
  ON "catalog_search_entries" USING gin ("item_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_search_entries_cat_name_trgm_idx"
  ON "catalog_search_entries" USING gin ("category_name" gin_trgm_ops);
--> statement-breakpoint

ALTER TABLE "catalog_search_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_search_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

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
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "catalog_search_entries" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "catalog_search_entries" TO komanda_migration;
