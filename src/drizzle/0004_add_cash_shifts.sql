CREATE TABLE "cash_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"opened_by_user_id" text NOT NULL,
	"opening_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"closing_balance" numeric(12, 2),
	"expected_cash" numeric(12, 2),
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_shifts_status_check" CHECK ("cash_shifts"."status" in ('open', 'closed')),
	CONSTRAINT "cash_shifts_opening_balance_check" CHECK ("cash_shifts"."opening_balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_shifts_one_open_per_tenant_uidx" ON "cash_shifts" USING btree ("tenant_id") WHERE "cash_shifts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "cash_shifts_tenant_status_idx" ON "cash_shifts" USING btree ("tenant_id","status","opened_at");
