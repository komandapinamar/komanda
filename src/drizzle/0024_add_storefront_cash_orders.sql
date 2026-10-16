-- Storefront cash orders: expiry timestamp, source enum extension and lookup index.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_expires_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_source_check";
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_check') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_source_check" CHECK ("orders"."source" in ('mercadopago_webhook', 'admin_direct', 'storefront_cash'));
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "orders_cash_expiry_idx" ON "orders" USING btree ("tenant_id","payment_status","payment_expires_at");
