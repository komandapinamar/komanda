ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "claimed_by" text,
  ADD COLUMN IF NOT EXISTS "leased_until" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_error" text,
  ADD COLUMN IF NOT EXISTS "dead_letter_at" timestamp with time zone;
--> statement-breakpoint
DROP INDEX IF EXISTS "outbox_events_delivery_idx";
--> statement-breakpoint
CREATE INDEX "outbox_events_delivery_idx"
  ON "outbox_events" ("published_at", "dead_letter_at", "leased_until", "available_at", "sequence");
