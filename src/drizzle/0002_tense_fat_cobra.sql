CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"customer" jsonb NOT NULL,
	"notes" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"idempotency_key" text,
	"checkout_payment_id" uuid,
	"payment_id" text,
	"preference_id" text,
	"source" text,
	"approved_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "orders_cart_id_idx" ON "orders" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "orders_checkout_payment_id_idx" ON "orders" USING btree ("checkout_payment_id");--> statement-breakpoint
CREATE INDEX "orders_payment_id_idx" ON "orders" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_idx" ON "orders" USING btree ("idempotency_key");