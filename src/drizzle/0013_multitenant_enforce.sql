-- Contract/enforcement phase. Empty databases are enforced immediately. An
-- upgrade with operational rows defers this procedure until import and
-- reconciliation have completed, so expand can deploy before the data move.
CREATE OR REPLACE PROCEDURE "apply_multitenant_enforcement"()
LANGUAGE plpgsql
AS $$
DECLARE
  incomplete_orders bigint;
  incomplete_print_jobs bigint;
BEGIN
  SELECT count(*) INTO incomplete_orders
  FROM "orders"
  WHERE "tenant_id" IS NULL
     OR "location_id" IS NULL
     OR "purchase_number" IS NULL
     OR "source" IS NULL
     OR "source" NOT IN ('mercadopago_webhook', 'admin_direct')
     OR "fulfillment_status" IS NULL
     OR "payment_status" IS NULL
     OR "customer_snapshot" IS NULL
     OR "subtotal" IS NULL
     OR "discount_total" IS NULL
     OR "total" IS NULL
     OR "currency" IS NULL
     OR "idempotency_key" IS NULL
     OR "version" IS NULL;

  SELECT count(*) INTO incomplete_print_jobs
  FROM "print_jobs"
  WHERE "tenant_id" IS NULL
     OR "location_id" IS NULL
     OR "order_id" IS NULL;

  IF incomplete_orders > 0 OR incomplete_print_jobs > 0 THEN
    RAISE EXCEPTION
      'Multitenant contract blocked by incomplete rows: orders=%, print_jobs=%',
      incomplete_orders,
      incomplete_print_jobs;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'print_jobs'::regclass
      AND conname = 'print_jobs_order_fk'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_order_fk"
      FOREIGN KEY ("tenant_id", "order_id")
      REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;

  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_tenant_fk";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_location_fk";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_cart_fk";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_payment_attempt_fk";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_source_check";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_fulfillment_status_check";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_payment_status_check";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_currency_check";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_amounts_check";
  ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_version_check";
  ALTER TABLE "print_jobs" VALIDATE CONSTRAINT "print_jobs_tenant_fk";
  ALTER TABLE "print_jobs" VALIDATE CONSTRAINT "print_jobs_location_fk";
  ALTER TABLE "print_jobs" VALIDATE CONSTRAINT "print_jobs_order_fk";
  ALTER TABLE "print_jobs" VALIDATE CONSTRAINT "print_jobs_agent_fk";

  ALTER TABLE "orders" ALTER COLUMN "tenant_id" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "location_id" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "purchase_number" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "source" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "fulfillment_status" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "payment_status" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "customer_snapshot" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "subtotal" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "discount_total" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "total" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "currency" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "idempotency_key" SET NOT NULL;
  ALTER TABLE "orders" ALTER COLUMN "version" SET NOT NULL;

  ALTER TABLE "print_jobs" ALTER COLUMN "tenant_id" SET NOT NULL;
  ALTER TABLE "print_jobs" ALTER COLUMN "location_id" SET NOT NULL;
  ALTER TABLE "print_jobs" ALTER COLUMN "order_id" SET NOT NULL;
END $$;
--> statement-breakpoint
REVOKE ALL ON PROCEDURE "apply_multitenant_enforcement"() FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE "apply_multitenant_enforcement"() TO komanda_migration;
--> statement-breakpoint
DO $$
DECLARE
  enforcement_ready boolean := lower(
    coalesce(
      nullif(current_setting('app.multitenant_enforcement_ready', true), ''),
      'false'
    )
  ) IN ('1', 'true', 'on', 'yes');
  has_operational_rows boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM "orders") OR EXISTS (SELECT 1 FROM "print_jobs")
    INTO has_operational_rows;

  IF has_operational_rows AND NOT enforcement_ready THEN
    RAISE NOTICE
      'Multitenant contract deferred until import reconciliation and cutover';
    RETURN;
  END IF;

  CALL "apply_multitenant_enforcement"();
END $$;
