CREATE TABLE "outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sequence" bigint NOT NULL,
  "available_at" timestamptz DEFAULT now() NOT NULL,
  "published_at" timestamptz,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "outbox_events_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "outbox_events_tenant_sequence_key" UNIQUE ("tenant_id", "sequence"),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events" ("published_at", "available_at");
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "scope" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "state" text NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "locked_until" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "idempotency_records_tenant_scope_key" UNIQUE NULLS NOT DISTINCT ("tenant_id", "scope", "idempotency_key"),
  CONSTRAINT "idempotency_records_state_check" CHECK ("state" IN ('processing', 'completed', 'failed'))
);
CREATE INDEX "idempotency_records_expiry_idx" ON "idempotency_records" ("expires_at");
--> statement-breakpoint
CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "correlation_id" uuid NOT NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "outcome" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "audit_events_outcome_check" CHECK ("outcome" IN ('allowed', 'denied', 'failed'))
);
CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" ("tenant_id", "occurred_at");
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" ("correlation_id");
--> statement-breakpoint
CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "outbox_events_runtime_isolation" ON "outbox_events" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "idempotency_records_runtime_isolation" ON "idempotency_records" TO komanda_runtime
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL)
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL)
  );
CREATE POLICY "audit_events_runtime_isolation" ON "audit_events" TO komanda_runtime
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL)
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR ("tenant_id" IS NULL AND nullif(current_setting('app.service_id', true), '') IS NOT NULL)
  );
--> statement-breakpoint
REVOKE ALL ON "outbox_events", "idempotency_records", "audit_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "outbox_events", "idempotency_records" TO komanda_runtime;
GRANT SELECT, INSERT ON "audit_events" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "outbox_events", "idempotency_records", "audit_events" TO komanda_migration;
