ALTER TABLE "tenant_locations"
  ADD COLUMN IF NOT EXISTS "opening_hours" jsonb DEFAULT '{}'::jsonb NOT NULL;
