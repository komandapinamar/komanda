ALTER TABLE "payment_attempts" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
