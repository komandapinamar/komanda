-- The first multi-tenant release starts with no legacy operational data.
-- Refuse to destroy anything if that invariant is not true.
DO $$
DECLARE
  legacy_rows bigint;
BEGIN
  SELECT
    (SELECT count(*) FROM "temporary_carts") +
    (SELECT count(*) FROM "checkout_payments") +
    (SELECT count(*) FROM "admin_users")
  INTO legacy_rows;
  IF legacy_rows > 0 THEN
    RAISE EXCEPTION 'Legacy operational tables are not empty; contract cleanup is blocked (% rows)', legacy_rows;
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "temporary_carts";
DROP TABLE IF EXISTS "checkout_payments";
DROP TABLE IF EXISTS "admin_users";
DROP TABLE IF EXISTS "migration_records";
DROP TABLE IF EXISTS "migration_runs";
--> statement-breakpoint
ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "customer",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "checkout_payment_id",
  DROP COLUMN IF EXISTS "payment_id",
  DROP COLUMN IF EXISTS "preference_id",
  DROP COLUMN IF EXISTS "metadata";
--> statement-breakpoint
ALTER TABLE "print_jobs"
  DROP COLUMN IF EXISTS "checkout_payment_id",
  DROP COLUMN IF EXISTS "cart_id",
  DROP COLUMN IF EXISTS "payment_id",
  DROP COLUMN IF EXISTS "claimed_at",
  DROP COLUMN IF EXISTS "last_error";
