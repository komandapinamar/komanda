-- this is the result of runing db:generate to patch the database to the latest schema
CREATE TABLE "checkout_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cart_id" uuid NOT NULL,
	"preference_id" text NOT NULL,
	"payment_id" text,
	"status" text NOT NULL,
	"customer" jsonb NOT NULL,
	"notes" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text NOT NULL,
	"order_id" text,
	"processed_at" timestamp with time zone,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporary_carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"items" jsonb NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount_total" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "checkout_payments_cart_id_idx" ON "checkout_payments" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "checkout_payments_preference_id_idx" ON "checkout_payments" USING btree ("preference_id");--> statement-breakpoint
CREATE INDEX "checkout_payments_payment_id_idx" ON "checkout_payments" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "temporary_carts_expires_at_idx" ON "temporary_carts" USING btree ("expires_at");