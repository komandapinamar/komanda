CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_payment_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"cart_id" uuid NOT NULL,
	"payment_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"printed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "order_request_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "print_job_id" uuid;--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "print_status" text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "print_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "print_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_payments" ADD COLUMN "last_print_error" text;--> statement-breakpoint
CREATE INDEX "print_jobs_status_idx" ON "print_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "print_jobs_checkout_payment_id_idx" ON "print_jobs" USING btree ("checkout_payment_id");--> statement-breakpoint
CREATE INDEX "print_jobs_order_id_idx" ON "print_jobs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "print_jobs_next_attempt_at_idx" ON "print_jobs" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_idempotency_key_idx" ON "print_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "checkout_payments_print_status_idx" ON "checkout_payments" USING btree ("print_status");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_payments_order_request_idempotency_key_idx" ON "checkout_payments" USING btree ("order_request_idempotency_key");