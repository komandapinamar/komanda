DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_migration') THEN
    CREATE ROLE komanda_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'komanda_runtime') THEN
    RAISE EXCEPTION 'komanda_runtime must be created by the controlled role bootstrap before migrations';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'komanda_runtime'
      AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'komanda_runtime must not have SUPERUSER or BYPASSRLS';
  END IF;
  IF EXISTS (
    SELECT 1
    WHERE to_regrole('neon_superuser') IS NOT NULL
      AND pg_has_role(
        to_regrole('komanda_runtime'),
        to_regrole('neon_superuser'),
        'member'
      )
  ) THEN
    RAISE EXCEPTION 'komanda_runtime must not inherit neon_superuser';
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "normalized_slug" text NOT NULL,
  "status" text DEFAULT 'onboarding' NOT NULL,
  "default_currency" text DEFAULT 'ARS' NOT NULL,
  "default_timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "activated_at" timestamptz,
  "suspended_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenants_normalized_slug_key" UNIQUE ("normalized_slug"),
  CONSTRAINT "tenants_currency_format_check" CHECK (char_length("default_currency") = 3),
  CONSTRAINT "tenants_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "tenants_status_check" CHECK ("status" IN ('onboarding', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "tenant_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "timezone" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "address" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_locations_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "tenant_locations_status_check" CHECK ("status" IN ('active', 'inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_locations_one_primary_uidx" ON "tenant_locations" ("tenant_id") WHERE "is_primary" = true;
CREATE INDEX "tenant_locations_tenant_status_idx" ON "tenant_locations" ("tenant_id", "status");
--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "normalized_email" text NOT NULL,
  "password_hash" text NOT NULL,
  "status" text DEFAULT 'pending_verification' NOT NULL,
  "email_verified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "users_normalized_email_key" UNIQUE ("normalized_email"),
  CONSTRAINT "users_status_check" CHECK ("status" IN ('pending_verification', 'active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_digest" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_sessions_token_digest_key" UNIQUE ("token_digest")
);
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" ("user_id", "expires_at");
--> statement-breakpoint
CREATE TABLE "identity_verification_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" text DEFAULT 'email_verification' NOT NULL,
  "token_digest" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "identity_challenges_token_digest_key" UNIQUE ("token_digest"),
  CONSTRAINT "identity_challenges_attempt_count_check" CHECK ("attempt_count" >= 0)
);
CREATE UNIQUE INDEX "identity_challenges_one_active_uidx" ON "identity_verification_challenges" ("user_id", "purpose") WHERE "consumed_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "onboarding_handoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_digest" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "onboarding_handoffs_token_digest_key" UNIQUE ("token_digest")
);
CREATE UNIQUE INDEX "onboarding_handoffs_one_active_uidx" ON "onboarding_handoffs" ("tenant_id", "user_id") WHERE "consumed_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "role" text DEFAULT 'owner' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_memberships_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "tenant_memberships_tenant_user_key" UNIQUE ("tenant_id", "user_id"),
  CONSTRAINT "tenant_memberships_role_check" CHECK ("role" = 'owner'),
  CONSTRAINT "tenant_memberships_status_check" CHECK ("status" IN ('active', 'revoked'))
);
CREATE INDEX "tenant_memberships_user_status_idx" ON "tenant_memberships" ("user_id", "status");
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "contact_name" text,
  "contact_email" text,
  "contact_phone" text,
  "sales_enabled" boolean DEFAULT false NOT NULL,
  "printing_enabled" boolean DEFAULT false NOT NULL,
  "order_prefix" text DEFAULT 'K' NOT NULL,
  "branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_settings_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "tenant_settings_order_prefix_check" CHECK ("order_prefix" ~ '^[A-Z0-9]{1,8}$')
);
--> statement-breakpoint
CREATE TABLE "tenant_counters" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "counter_type" text NOT NULL,
  "current_value" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "counter_type"),
  CONSTRAINT "tenant_counters_nonnegative_check" CHECK ("current_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_locations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_counters" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "identity_verification_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "identity_verification_challenges" FORCE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_handoffs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenants_runtime_isolation" ON "tenants" TO komanda_runtime
  USING (
    "id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM "tenant_memberships" membership
      WHERE membership."tenant_id" = "tenants"."id"
        AND membership."user_id" = nullif(current_setting('app.user_id', true), '')::uuid
        AND membership."status" = 'active'
    )
  )
  WITH CHECK (
    "id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
  );
CREATE POLICY "tenant_locations_runtime_isolation" ON "tenant_locations" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_memberships_runtime_isolation" ON "tenant_memberships" TO komanda_runtime
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_settings_runtime_isolation" ON "tenant_settings" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "tenant_counters_runtime_isolation" ON "tenant_counters" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY "users_runtime_identity" ON "users" TO komanda_runtime
  USING (
    "id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    "id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
  );
CREATE POLICY "user_sessions_runtime_identity" ON "user_sessions" TO komanda_runtime
  USING (
    "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR "token_digest" = nullif(current_setting('app.session_token_digest', true), '')
  )
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY "identity_challenges_runtime_identity" ON "identity_verification_challenges" TO komanda_runtime
  USING (
    "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') IS NOT NULL
  );
CREATE POLICY "onboarding_handoffs_runtime_isolation" ON "onboarding_handoffs" TO komanda_runtime
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON "tenants", "tenant_locations", "users", "user_sessions", "identity_verification_challenges", "onboarding_handoffs", "tenant_memberships", "tenant_settings", "tenant_counters" FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE ON "tenants", "tenant_locations", "users", "user_sessions", "identity_verification_challenges", "onboarding_handoffs", "tenant_memberships", "tenant_settings", "tenant_counters" TO komanda_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON "tenants", "tenant_locations", "users", "user_sessions", "identity_verification_challenges", "onboarding_handoffs", "tenant_memberships", "tenant_settings", "tenant_counters" TO komanda_migration;
