ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "discount_snapshot" jsonb;
