ALTER POLICY "tenant_memberships_runtime_isolation" ON "tenant_memberships"
  USING (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR "user_id" = nullif(current_setting('app.user_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') = 'member-service'
  )
  WITH CHECK (
    "tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
    OR nullif(current_setting('app.service_id', true), '') = 'member-service'
  );
