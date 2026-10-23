ALTER TABLE "discounts" ADD COLUMN IF NOT EXISTS "applicable_tender" text DEFAULT 'all' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_applicable_tender_check') THEN
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_applicable_tender_check" CHECK ("discounts"."applicable_tender" in ('all', 'cash'));
  END IF;
END $$;
