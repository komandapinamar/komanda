-- Expansion/backfill phase for populated legacy tables. Automatic migrations
-- only add compatible structure. Data changes require an explicit session gate:
--   SET app.multitenant_backfill_enabled = 'true';
--   SET app.initial_tenant_id = '<uuid>';
--   SET app.initial_location_id = '<uuid>';
ALTER TABLE "temporary_carts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "temporary_carts" ADD COLUMN IF NOT EXISTS "location_id" uuid;
ALTER TABLE "checkout_payments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "location_id" uuid;
--> statement-breakpoint
-- The Azure administrator and all controlled migration jobs connect as this
-- non-BYPASSRLS role. These policies are required before the gated updates.
DO $$
DECLARE
  protected_table text;
  policy_name text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY[
    'tenants',
    'tenant_locations',
    'tenant_counters',
    'orders',
    'print_jobs'
  ]
  LOOP
    policy_name := protected_table || '_migration_maintenance';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE polrelid = format('public.%I', protected_table)::regclass
        AND polname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I TO komanda_migration USING (true) WITH CHECK (true)',
        policy_name,
        protected_table
      );
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  backfill_enabled boolean := lower(coalesce(nullif(current_setting('app.multitenant_backfill_enabled', true), ''), 'false')) IN ('1', 'true', 'on', 'yes');
  initial_tenant_id uuid;
  initial_location_id uuid;
BEGIN
  IF NOT backfill_enabled THEN
    RAISE NOTICE 'Legacy data backfill skipped; app.multitenant_backfill_enabled is not true';
    RETURN;
  END IF;

  initial_tenant_id := nullif(current_setting('app.initial_tenant_id', true), '')::uuid;
  initial_location_id := nullif(current_setting('app.initial_location_id', true), '')::uuid;

  IF initial_tenant_id IS NULL OR initial_location_id IS NULL THEN
    RAISE EXCEPTION 'Backfill requires app.initial_tenant_id and app.initial_location_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "tenants" WHERE "id" = initial_tenant_id) THEN
    RAISE EXCEPTION 'Backfill tenant % does not exist', initial_tenant_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "tenant_locations"
    WHERE "tenant_id" = initial_tenant_id AND "id" = initial_location_id
  ) THEN
    RAISE EXCEPTION 'Backfill location % does not belong to tenant %', initial_location_id, initial_tenant_id;
  END IF;

  UPDATE "temporary_carts"
    SET "tenant_id" = initial_tenant_id,
        "location_id" = initial_location_id
    WHERE "tenant_id" IS NULL OR "location_id" IS NULL;

  UPDATE "checkout_payments"
    SET "tenant_id" = initial_tenant_id
    WHERE "tenant_id" IS NULL;

  WITH legacy_order_values AS (
    SELECT
      legacy_order."id",
      coalesce(
        legacy_order."metadata" ->> 'purchaseNumber',
        legacy_order."metadata" ->> 'purchase_number'
      ) AS metadata_purchase_number,
      coalesce(legacy_order."metadata" ->> 'source', legacy_order."source") AS legacy_source,
      legacy_order."status" AS legacy_fulfillment_status,
      payment."status" AS legacy_payment_status,
      cart."subtotal" AS cart_subtotal,
      cart."discount_total" AS cart_discount_total,
      cart."total" AS cart_total,
      cart."currency" AS cart_currency,
      payment."amount" AS payment_amount,
      payment."currency" AS payment_currency
    FROM "orders" legacy_order
    LEFT JOIN "checkout_payments" payment
      ON payment."id" = legacy_order."checkout_payment_id"
    LEFT JOIN "temporary_carts" cart
      ON cart."id" = legacy_order."cart_id"
  )
  UPDATE "orders" target
    SET "tenant_id" = coalesce(target."tenant_id", initial_tenant_id),
        "location_id" = coalesce(target."location_id", initial_location_id),
        "purchase_number" = coalesce(
          target."purchase_number",
          CASE
            WHEN legacy.metadata_purchase_number ~ '^[0-9]{1,18}$'
              THEN legacy.metadata_purchase_number::bigint
            ELSE NULL
          END
        ),
        "source" = CASE
          WHEN legacy.legacy_source IN ('mercadopago-webhook', 'mercadopago_webhook')
            THEN 'mercadopago_webhook'
          WHEN legacy.legacy_source IN ('admin-direct', 'admin_direct')
            THEN 'admin_direct'
          ELSE NULL
        END,
        "fulfillment_status" = CASE
          WHEN legacy.legacy_fulfillment_status IN ('approved', 'preparing', 'ready', 'delivered', 'cancelled')
            THEN legacy.legacy_fulfillment_status
          ELSE target."fulfillment_status"
        END,
        "payment_status" = CASE legacy.legacy_payment_status
          WHEN 'approved' THEN 'paid'
          WHEN 'rejected' THEN 'failed'
          WHEN 'failed' THEN 'failed'
          ELSE coalesce(target."payment_status", 'pending')
        END,
        "customer_snapshot" = coalesce(target."customer_snapshot", target."customer"),
        "subtotal" = coalesce(target."subtotal", legacy.cart_subtotal, legacy.payment_amount),
        "discount_total" = coalesce(target."discount_total", legacy.cart_discount_total, 0),
        "total" = coalesce(target."total", legacy.cart_total, legacy.payment_amount),
        "currency" = upper(coalesce(target."currency", legacy.cart_currency, legacy.payment_currency)),
        "idempotency_key" = coalesce(
          target."idempotency_key",
          target."metadata" ->> 'orderRequestIdempotencyKey',
          'legacy-order:' || target."id"::text
        ),
        "version" = coalesce(target."version", 1)
    FROM legacy_order_values legacy
    WHERE target."id" = legacy."id";

  UPDATE "print_jobs"
    SET "tenant_id" = initial_tenant_id,
        "location_id" = initial_location_id
    WHERE "tenant_id" IS NULL OR "location_id" IS NULL;

  INSERT INTO "tenant_counters" ("tenant_id", "counter_type", "current_value")
    SELECT initial_tenant_id, 'purchase_number', max("purchase_number")
    FROM "orders"
    WHERE "tenant_id" = initial_tenant_id AND "purchase_number" IS NOT NULL
    HAVING count(*) > 0
    ON CONFLICT ("tenant_id", "counter_type") DO UPDATE
      SET "current_value" = greatest("tenant_counters"."current_value", excluded."current_value"),
          "updated_at" = now();
END $$;
--> statement-breakpoint
-- The legacy column is text even though it has always carried an order UUID.
-- Validate every value before changing the type so upgrades fail diagnostically
-- instead of creating a mismatched foreign key or silently discarding a value.
DO $$
DECLARE
  order_id_type text;
  invalid_count bigint;
BEGIN
  SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO order_id_type
  FROM pg_attribute attribute
  WHERE attribute.attrelid = 'print_jobs'::regclass
    AND attribute.attname = 'order_id'
    AND NOT attribute.attisdropped;

  IF order_id_type = 'text' THEN
    SELECT count(*) INTO invalid_count
    FROM "print_jobs"
    WHERE "order_id" IS NOT NULL
      AND NOT pg_input_is_valid("order_id", 'uuid');

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'Cannot convert print_jobs.order_id to uuid: % invalid legacy value(s); repair them before retrying', invalid_count;
    END IF;

    ALTER TABLE "print_jobs"
      ALTER COLUMN "order_id" TYPE uuid USING "order_id"::uuid;
  ELSIF order_id_type <> 'uuid' THEN
    RAISE EXCEPTION 'Unexpected print_jobs.order_id type: %', order_id_type;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'checkout_payments'::regclass
      AND conname = 'checkout_payments_tenant_order_request_idempotency_key'
  ) THEN
    ALTER TABLE "checkout_payments"
      ADD CONSTRAINT "checkout_payments_tenant_order_request_idempotency_key"
      UNIQUE ("tenant_id", "order_request_idempotency_key");
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "checkout_payments_order_request_idempotency_key_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "temporary_carts_tenant_idx" ON "temporary_carts" ("tenant_id", "expires_at");
CREATE INDEX IF NOT EXISTS "checkout_payments_tenant_idx" ON "checkout_payments" ("tenant_id", "created_at");
