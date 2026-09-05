ALTER TABLE "tenant_settings" ADD COLUMN "menu_theme" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_plain" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "video_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_video_media_fk" FOREIGN KEY ("tenant_id","video_asset_id") REFERENCES "public"."media_assets"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_menu_theme_check" CHECK ("tenant_settings"."menu_theme" in ('classic', 'reels'));