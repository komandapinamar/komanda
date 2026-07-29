CREATE TABLE IF NOT EXISTS "migration_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "target_tenant_id" uuid NOT NULL,
  "source" text NOT NULL,
  "phase" text NOT NULL,
  "status" text NOT NULL,
  "source_count" bigint DEFAULT 0 NOT NULL,
  "target_count" bigint DEFAULT 0 NOT NULL,
  "error_count" bigint DEFAULT 0 NOT NULL,
  "source_checksum" text,
  "target_checksum" text,
  "manifest" jsonb NOT NULL,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  CONSTRAINT "migration_runs_target_tenant_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "migration_runs_status_check" CHECK ("status" IN ('planned', 'running', 'reconciled', 'cutover_ready', 'completed', 'failed', 'rolled_back')),
  CONSTRAINT "migration_runs_counts_check" CHECK ("source_count" >= 0 AND "target_count" >= 0 AND "error_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "migration_runs_target_phase_idx" ON "migration_runs" ("target_tenant_id", "phase", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "migration_run_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "source_checksum" text NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "migrated_at" timestamptz,
  CONSTRAINT "migration_records_run_fk" FOREIGN KEY ("migration_run_id") REFERENCES "migration_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "migration_records_run_source_key" UNIQUE ("migration_run_id", "source_type", "source_id"),
  CONSTRAINT "migration_records_status_check" CHECK ("status" IN ('imported', 'skipped', 'failed'))
);
CREATE INDEX IF NOT EXISTS "migration_records_run_status_idx" ON "migration_records" ("migration_run_id", "status");
--> statement-breakpoint
ALTER TABLE "migration_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "migration_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "migration_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "migration_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "migration_runs_maintenance_only" ON "migration_runs" TO komanda_runtime USING (nullif(current_setting('app.service_id', true), '') = 'tenant-migration') WITH CHECK (nullif(current_setting('app.service_id', true), '') = 'tenant-migration');
CREATE POLICY "migration_records_maintenance_only" ON "migration_records" TO komanda_runtime USING (nullif(current_setting('app.service_id', true), '') = 'tenant-migration') WITH CHECK (nullif(current_setting('app.service_id', true), '') = 'tenant-migration');
--> statement-breakpoint
REVOKE ALL ON "migration_runs", "migration_records" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "migration_runs", "migration_records" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "migration_runs", "migration_records" TO komanda_migration;
