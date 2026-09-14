ALTER TABLE "catalog_items" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "is_generic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "generic_icon" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "stock_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_tenant_barcode_uidx" ON "catalog_items" USING btree ("tenant_id","barcode") WHERE "catalog_items"."barcode" is not null and "catalog_items"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_stock_quantity_check" CHECK ("catalog_items"."stock_quantity" >= 0);--> statement-breakpoint
CREATE TABLE "global_product_catalog" (
	"barcode" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"suggested_category" text,
	"image_url" text,
	"brand" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
