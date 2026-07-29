CREATE TABLE "plan_definitions" (
  "plan_id" text NOT NULL,
  "version" integer NOT NULL,
  "status" text NOT NULL,
  "entitlements" jsonb NOT NULL,
  "effective_from" timestamptz NOT NULL,
  "retired_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("plan_id", "version"),
  CONSTRAINT "plan_definitions_version_check" CHECK ("version" > 0),
  CONSTRAINT "plan_definitions_status_check" CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "plan_definitions_entitlements_check" CHECK (
    jsonb_typeof("entitlements"->'catalog_management') = 'boolean'
    AND jsonb_typeof("entitlements"->'online_payments') = 'boolean'
    AND jsonb_typeof("entitlements"->'printing') = 'boolean'
    AND "entitlements" - ARRAY['catalog_management', 'online_payments', 'printing'] = '{}'::jsonb
  )
);
--> statement-breakpoint
INSERT INTO "plan_definitions" ("plan_id", "version", "status", "entitlements", "effective_from")
VALUES
  ('development', 1, 'active', '{"catalog_management": true, "online_payments": true, "printing": true}', '2026-07-05T00:00:00Z'),
  ('starter', 1, 'active', '{"catalog_management": true, "online_payments": true, "printing": false}', '2026-07-05T00:00:00Z')
ON CONFLICT ("plan_id", "version") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "tenant_entitlement_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "plan_id" text NOT NULL,
  "plan_version" integer NOT NULL,
  "entitlements" jsonb NOT NULL,
  "source_request_id" text NOT NULL,
  "effective_at" timestamptz DEFAULT now() NOT NULL,
  "superseded_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_entitlement_snapshots_plan_fk" FOREIGN KEY ("plan_id", "plan_version") REFERENCES "plan_definitions"("plan_id", "version") ON DELETE RESTRICT,
  CONSTRAINT "tenant_entitlement_snapshots_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "tenant_entitlement_snapshots_source_request_key" UNIQUE ("tenant_id", "source_request_id")
);
CREATE UNIQUE INDEX "tenant_entitlement_snapshots_one_current_uidx" ON "tenant_entitlement_snapshots" ("tenant_id") WHERE "superseded_at" IS NULL;
CREATE INDEX "tenant_entitlement_snapshots_tenant_effective_idx" ON "tenant_entitlement_snapshots" ("tenant_id", "effective_at");
--> statement-breakpoint
ALTER TABLE "tenant_entitlement_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_entitlement_snapshots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_entitlement_snapshots_runtime_isolation" ON "tenant_entitlement_snapshots" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON "plan_definitions", "tenant_entitlement_snapshots" FROM PUBLIC;
GRANT SELECT ON "plan_definitions" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE ON "tenant_entitlement_snapshots" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "plan_definitions", "tenant_entitlement_snapshots" TO komanda_migration;
