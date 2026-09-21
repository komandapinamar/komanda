INSERT INTO "plan_definitions" (
  "plan_id",
  "version",
  "status",
  "entitlements",
  "effective_from"
)
VALUES (
  'starter',
  1,
  'active',
  '{"catalog_management": true, "online_payments": true, "printing": true}'::jsonb,
  now()
)
ON CONFLICT ("plan_id", "version") DO UPDATE
SET
  "status" = EXCLUDED."status",
  "entitlements" = EXCLUDED."entitlements";
