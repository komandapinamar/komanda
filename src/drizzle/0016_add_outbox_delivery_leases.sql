ALTER TABLE "outbox_events"
  ADD COLUMN "claimed_by" text,
  ADD COLUMN "leased_until" timestamp with time zone,
  ADD COLUMN "last_error" text,
  ADD COLUMN "dead_letter_at" timestamp with time zone;
--> statement-breakpoint
DROP INDEX "outbox_events_delivery_idx";
--> statement-breakpoint
CREATE INDEX "outbox_events_delivery_idx"
  ON "outbox_events" ("published_at", "dead_letter_at", "leased_until", "available_at", "sequence");
