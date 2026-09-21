DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_tenant_id_id_key') THEN
    ALTER TABLE "discounts"
      ADD CONSTRAINT "discounts_tenant_id_id_key" UNIQUE ("tenant_id", "id");
  END IF;
END $$;
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discount_redemptions_discount_idx"
  ON "discount_redemptions" USING btree ("tenant_id", "discount_id");
--> statement-breakpoint
ALTER TABLE "discount_redemptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discount_redemptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
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
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "discount_redemptions" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "discount_redemptions" TO komanda_migration;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "print_agent_pairings" TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON TABLE "print_agent_pairings" TO komanda_migration;
