CREATE TABLE "print_agent_pairings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "code_digest" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "claimed_agent_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "print_pairings_tenant_id_id_key" UNIQUE("tenant_id","id"),
  CONSTRAINT "print_pairings_status_check" CHECK ("status" IN ('pending','claimed','expired')),
  CONSTRAINT "print_pairings_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 5)
);
--> statement-breakpoint
ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."tenant_locations"("tenant_id","id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "print_agent_pairings" ADD CONSTRAINT "print_pairings_agent_fk" FOREIGN KEY ("tenant_id","claimed_agent_id") REFERENCES "public"."print_agents"("tenant_id","id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX "print_pairings_code_digest_uidx" ON "print_agent_pairings" ("code_digest");
--> statement-breakpoint
CREATE INDEX "print_pairings_tenant_location_status_idx" ON "print_agent_pairings" ("tenant_id","location_id","status");
--> statement-breakpoint
ALTER TABLE "print_agent_pairings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "print_agent_pairings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "print_pairings_runtime_isolation" ON "print_agent_pairings" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');
--> statement-breakpoint
CREATE POLICY "print_pairings_migration_maintenance" ON "print_agent_pairings" TO komanda_migration USING (true) WITH CHECK (true);
--> statement-breakpoint
DROP POLICY "print_agents_runtime_isolation" ON "print_agents";
--> statement-breakpoint
CREATE POLICY "print_agents_runtime_isolation" ON "print_agents" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') IN ('print-agent-auth','print-pairing')) WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');
--> statement-breakpoint
DROP POLICY "tenant_locations_runtime_isolation" ON "tenant_locations";
--> statement-breakpoint
CREATE POLICY "tenant_locations_runtime_isolation" ON "tenant_locations" TO komanda_runtime USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing') WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid OR nullif(current_setting('app.service_id', true), '') = 'print-pairing');
