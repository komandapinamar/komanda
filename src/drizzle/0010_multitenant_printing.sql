CREATE TABLE IF NOT EXISTS "print_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "name" text NOT NULL,
  "token_prefix" text NOT NULL,
  "token_digest" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "print_agents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "print_agents_location_fk" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "tenant_locations"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "print_agents_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "print_agents_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "print_agents_token_prefix_uidx" ON "print_agents" ("token_prefix");
CREATE INDEX IF NOT EXISTS "print_agents_tenant_location_status_idx" ON "print_agents" ("tenant_id", "location_id", "status");
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "location_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "claimed_by_agent_id" uuid;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamptz;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "last_error_code" text;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "last_error_message" text;
ALTER TABLE "print_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "print_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "print_jobs" ALTER COLUMN "checkout_payment_id" DROP NOT NULL;
ALTER TABLE "print_jobs" ALTER COLUMN "cart_id" DROP NOT NULL;
ALTER TABLE "print_jobs" ALTER COLUMN "payment_id" DROP NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_tenant_fk'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_location_fk'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_location_fk"
      FOREIGN KEY ("tenant_id", "location_id")
      REFERENCES "tenant_locations"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_agent_fk'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_agent_fk"
      FOREIGN KEY ("tenant_id", "claimed_by_agent_id")
      REFERENCES "print_agents"("tenant_id", "id") ON DELETE RESTRICT
      NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_tenant_id_id_key'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_tenant_id_id_key" UNIQUE ("tenant_id", "id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_tenant_idempotency_key'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_tenant_idempotency_key"
      UNIQUE ("tenant_id", "idempotency_key");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_status_check'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_status_check"
      CHECK ("status" IN ('pending', 'processing', 'printed', 'failed', 'cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_jobs_attempt_count_check'
  ) THEN
    ALTER TABLE "print_jobs"
      ADD CONSTRAINT "print_jobs_attempt_count_check"
      CHECK ("attempt_count" >= 0);
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "print_jobs_idempotency_key_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "print_jobs_tenant_location_status_idx" ON "print_jobs" ("tenant_id", "location_id", "status", "next_attempt_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "print_job_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "print_job_id" uuid NOT NULL,
  "agent_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "finished_at" timestamptz,
  CONSTRAINT "print_job_attempts_job_fk" FOREIGN KEY ("tenant_id", "print_job_id") REFERENCES "print_jobs"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "print_job_attempts_agent_fk" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "print_agents"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "print_job_attempts_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "print_job_attempts_job_attempt_key" UNIQUE ("tenant_id", "print_job_id", "attempt_number", "status"),
  CONSTRAINT "print_job_attempts_status_check" CHECK ("status" IN ('claimed', 'printed', 'failed', 'lease_expired')),
  CONSTRAINT "print_job_attempts_number_check" CHECK ("attempt_number" > 0)
);
CREATE INDEX IF NOT EXISTS "print_job_attempts_tenant_job_idx" ON "print_job_attempts" ("tenant_id", "print_job_id");
--> statement-breakpoint
ALTER TABLE "print_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_agents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "print_job_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_job_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "print_agents_runtime_isolation" ON "print_agents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-agent-auth') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "print_jobs_runtime_isolation" ON "print_jobs" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "print_job_attempts_runtime_isolation" ON "print_job_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "print_agents", "print_jobs", "print_job_attempts" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "print_agents", "print_jobs", "print_job_attempts" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "print_agents", "print_jobs", "print_job_attempts" TO komanda_migration;
