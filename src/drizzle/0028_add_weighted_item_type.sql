ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'unit' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_items_item_type_check') THEN
    ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_item_type_check" CHECK ("catalog_items"."item_type" in ('unit', 'weighted'));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "cart_lines" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'unit' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_lines_item_type_check') THEN
    ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_item_type_check" CHECK ("cart_lines"."item_type" in ('unit', 'weighted'));
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "item_type" text DEFAULT 'unit' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_item_type_check') THEN
    ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_item_type_check" CHECK ("order_lines"."item_type" in ('unit', 'weighted'));
  END IF;
END $$;
