CREATE TABLE "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "storage_key" text NOT NULL,
  "public_url" text,
  "checksum_sha256" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "media_assets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "media_assets_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "media_assets_checksum_check" CHECK ("checksum_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "media_assets_size_check" CHECK ("byte_size" > 0),
  CONSTRAINT "media_assets_status_check" CHECK ("status" IN ('pending', 'ready', 'failed', 'archived'))
);
CREATE UNIQUE INDEX "media_assets_storage_key_uidx" ON "media_assets" ("storage_key");
CREATE INDEX "media_assets_tenant_status_idx" ON "media_assets" ("tenant_id", "status");
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
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_categories_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_categories_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "catalog_categories_sort_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "catalog_categories_version_check" CHECK ("version" > 0),
  CONSTRAINT "catalog_categories_status_check" CHECK ("status" IN ('draft', 'active', 'archived'))
);
CREATE UNIQUE INDEX "catalog_categories_tenant_name_active_uidx" ON "catalog_categories" ("tenant_id", "normalized_name") WHERE "archived_at" IS NULL;
CREATE INDEX "catalog_categories_tenant_status_sort_idx" ON "catalog_categories" ("tenant_id", "status", "sort_order");
--> statement-breakpoint
CREATE TABLE "catalog_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "description" text,
  "price" numeric(12,2) NOT NULL,
  "currency" text NOT NULL,
  "image_asset_id" uuid,
  "status" text DEFAULT 'draft' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_items_category_fk" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "catalog_categories"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_items_media_fk" FOREIGN KEY ("tenant_id", "image_asset_id") REFERENCES "media_assets"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_items_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "catalog_items_price_check" CHECK ("price" > 0),
  CONSTRAINT "catalog_items_currency_check" CHECK (char_length("currency") = 3),
  CONSTRAINT "catalog_items_sort_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "catalog_items_version_check" CHECK ("version" > 0),
  CONSTRAINT "catalog_items_status_check" CHECK ("status" IN ('draft', 'active', 'unavailable', 'archived'))
);
CREATE UNIQUE INDEX "catalog_items_tenant_name_active_uidx" ON "catalog_items" ("tenant_id", "normalized_name") WHERE "archived_at" IS NULL;
CREATE INDEX "catalog_items_tenant_category_status_sort_idx" ON "catalog_items" ("tenant_id", "category_id", "status", "sort_order");
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
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "addon_groups_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "addon_groups_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "addon_groups_bounds_check" CHECK ("min_selected" >= 0 AND "max_selected" >= "min_selected"),
  CONSTRAINT "addon_groups_version_check" CHECK ("version" > 0),
  CONSTRAINT "addon_groups_status_check" CHECK ("status" IN ('draft', 'active', 'archived'))
);
CREATE INDEX "addon_groups_tenant_status_sort_idx" ON "addon_groups" ("tenant_id", "status", "sort_order");
--> statement-breakpoint
CREATE TABLE "addon_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "name" text NOT NULL,
  "price_delta" numeric(12,2) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "addon_options_group_fk" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "addon_groups"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "addon_options_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "addon_options_price_check" CHECK ("price_delta" >= 0),
  CONSTRAINT "addon_options_version_check" CHECK ("version" > 0),
  CONSTRAINT "addon_options_status_check" CHECK ("status" IN ('active', 'unavailable', 'archived'))
);
CREATE INDEX "addon_options_tenant_group_sort_idx" ON "addon_options" ("tenant_id", "group_id", "sort_order");
--> statement-breakpoint
CREATE TABLE "item_addon_groups" (
  "tenant_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "addon_group_id" uuid NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "item_addon_groups_pkey" PRIMARY KEY ("tenant_id", "item_id", "addon_group_id"),
  CONSTRAINT "item_addon_groups_item_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "catalog_items"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "item_addon_groups_group_fk" FOREIGN KEY ("tenant_id", "addon_group_id") REFERENCES "addon_groups"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "item_addon_groups_sort_check" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_combos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "description" text,
  "price" numeric(12,2) NOT NULL,
  "currency" text NOT NULL,
  "image_asset_id" uuid,
  "status" text DEFAULT 'draft' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "catalog_combos_category_fk" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "catalog_categories"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_combos_media_fk" FOREIGN KEY ("tenant_id", "image_asset_id") REFERENCES "media_assets"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "catalog_combos_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "catalog_combos_price_check" CHECK ("price" > 0),
  CONSTRAINT "catalog_combos_currency_check" CHECK (char_length("currency") = 3),
  CONSTRAINT "catalog_combos_version_check" CHECK ("version" > 0),
  CONSTRAINT "catalog_combos_status_check" CHECK ("status" IN ('draft', 'active', 'unavailable', 'archived'))
);
CREATE UNIQUE INDEX "catalog_combos_tenant_name_active_uidx" ON "catalog_combos" ("tenant_id", "normalized_name") WHERE "archived_at" IS NULL;
CREATE INDEX "catalog_combos_tenant_category_status_idx" ON "catalog_combos" ("tenant_id", "category_id", "status");
--> statement-breakpoint
CREATE TABLE "combo_items" (
  "tenant_id" uuid NOT NULL,
  "combo_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "combo_items_pkey" PRIMARY KEY ("tenant_id", "combo_id", "item_id"),
  CONSTRAINT "combo_items_combo_fk" FOREIGN KEY ("tenant_id", "combo_id") REFERENCES "catalog_combos"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "combo_items_item_fk" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "catalog_items"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "combo_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "combo_items_sort_check" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "addon_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "addon_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_options" FORCE ROW LEVEL SECURITY;
ALTER TABLE "item_addon_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "item_addon_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "catalog_combos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_combos" FORCE ROW LEVEL SECURITY;
ALTER TABLE "combo_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "combo_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "media_assets_runtime_isolation" ON "media_assets" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "catalog_categories_runtime_isolation" ON "catalog_categories" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "catalog_items_runtime_isolation" ON "catalog_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "addon_groups_runtime_isolation" ON "addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "addon_options_runtime_isolation" ON "addon_options" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "item_addon_groups_runtime_isolation" ON "item_addon_groups" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "catalog_combos_runtime_isolation" ON "catalog_combos" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "combo_items_runtime_isolation" ON "combo_items" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "media_assets", "catalog_categories", "catalog_items", "addon_groups", "addon_options", "item_addon_groups", "catalog_combos", "combo_items" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "media_assets", "catalog_categories", "catalog_items", "addon_groups", "addon_options", "item_addon_groups", "catalog_combos", "combo_items" TO komanda_runtime;
GRANT DELETE ON "item_addon_groups", "combo_items" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "media_assets", "catalog_categories", "catalog_items", "addon_groups", "addon_options", "item_addon_groups", "catalog_combos", "combo_items" TO komanda_migration;
