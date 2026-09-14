ALTER TABLE "tenants" ADD COLUMN "preset" text DEFAULT 'gastronomy' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_preset_check" CHECK ("tenants"."preset" in ('gastronomy', 'express_retail'));
