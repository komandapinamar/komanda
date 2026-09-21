ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "pickup_pin" text,
  ADD COLUMN IF NOT EXISTS "estimated_wait_minutes" integer,
  ADD COLUMN IF NOT EXISTS "estimated_ready_at" timestamp with time zone;
