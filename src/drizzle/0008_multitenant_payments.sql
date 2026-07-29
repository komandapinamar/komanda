CREATE TABLE "integration_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "status" text NOT NULL,
  "encrypted_payload" bytea NOT NULL,
  "encryption_iv" bytea NOT NULL,
  "auth_tag" bytea NOT NULL,
  "key_version" integer NOT NULL,
  "scopes" text[] DEFAULT '{}' NOT NULL,
  "expires_at" timestamptz,
  "last_verified_at" timestamptz,
  "webhook_routing_key" uuid DEFAULT gen_random_uuid() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "integration_accounts_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "integration_accounts_status_check" CHECK ("status" IN ('pending', 'active', 'expired', 'revoked', 'error')),
  CONSTRAINT "integration_accounts_key_version_check" CHECK ("key_version" > 0),
  CONSTRAINT "integration_accounts_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "integration_accounts_provider_account_uidx" ON "integration_accounts" ("provider", "provider_account_id");
CREATE UNIQUE INDEX "integration_accounts_routing_key_uidx" ON "integration_accounts" ("webhook_routing_key");
CREATE UNIQUE INDEX "integration_accounts_one_active_provider_uidx" ON "integration_accounts" ("tenant_id", "provider") WHERE "status" IN ('pending', 'active', 'expired', 'error');
CREATE INDEX "integration_accounts_tenant_status_idx" ON "integration_accounts" ("tenant_id", "status");
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cart_id" uuid NOT NULL,
  "integration_account_id" uuid NOT NULL,
  "provider_preference_id" text,
  "provider_payment_id" text,
  "status" text DEFAULT 'initiated' NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency" text NOT NULL,
  "customer_snapshot" jsonb NOT NULL,
  "notes" text,
  "idempotency_key" text NOT NULL,
  "processed_at" timestamptz,
  "failure_code" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "payment_attempts_cart_fk" FOREIGN KEY ("tenant_id", "cart_id") REFERENCES "carts"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "payment_attempts_integration_fk" FOREIGN KEY ("tenant_id", "integration_account_id") REFERENCES "integration_accounts"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "payment_attempts_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "payment_attempts_tenant_idempotency_key" UNIQUE ("tenant_id", "idempotency_key"),
  CONSTRAINT "payment_attempts_status_check" CHECK ("status" IN ('initiated', 'processing', 'pending', 'approved', 'rejected', 'failed', 'duplicate')),
  CONSTRAINT "payment_attempts_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "payment_attempts_tenant_payment_idx" ON "payment_attempts" ("tenant_id", "provider_payment_id");
--> statement-breakpoint
CREATE TABLE "provider_resource_routes" (
  "provider" text NOT NULL,
  "resource_type" text NOT NULL,
  "external_id" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "integration_account_id" uuid NOT NULL,
  "local_resource_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "provider_resource_routes_pkey" PRIMARY KEY ("provider", "resource_type", "external_id"),
  CONSTRAINT "provider_resource_routes_integration_fk" FOREIGN KEY ("tenant_id", "integration_account_id") REFERENCES "integration_accounts"("tenant_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "provider_resource_routes_payment_fk" FOREIGN KEY ("tenant_id", "local_resource_id") REFERENCES "payment_attempts"("tenant_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "provider_resource_routes_tenant_idx" ON "provider_resource_routes" ("tenant_id");
--> statement-breakpoint
CREATE TABLE "webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "topic" text NOT NULL,
  "signature_valid" boolean NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" uuid NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "processed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "webhook_events_tenant_provider_event_topic_key" UNIQUE ("tenant_id", "provider", "provider_event_id", "topic"),
  CONSTRAINT "webhook_events_status_check" CHECK ("status" IN ('received', 'processing', 'processed', 'ignored', 'failed')),
  CONSTRAINT "webhook_events_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "webhook_events_tenant_status_idx" ON "webhook_events" ("tenant_id", "status");
--> statement-breakpoint
ALTER TABLE "integration_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "provider_resource_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_resource_routes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "integration_accounts_runtime_isolation" ON "integration_accounts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "payment_attempts_runtime_isolation" ON "payment_attempts" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "provider_resource_routes_runtime_isolation" ON "provider_resource_routes" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'mercadopago:webhook-router') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "webhook_events_runtime_isolation" ON "webhook_events" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "integration_accounts", "payment_attempts", "provider_resource_routes", "webhook_events" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "integration_accounts", "payment_attempts", "provider_resource_routes", "webhook_events" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "integration_accounts", "payment_attempts", "provider_resource_routes", "webhook_events" TO komanda_migration;
