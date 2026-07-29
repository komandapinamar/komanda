-- komanda_migration is intentionally NOBYPASSRLS. Give only that controlled
-- role an explicit all-row maintenance policy while keeping runtime policies
-- tenant-scoped and default-deny.
DO $$
DECLARE
  protected_table text;
  policy_name text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY[
    'addon_groups',
    'addon_options',
    'audit_events',
    'cart_line_options',
    'cart_lines',
    'carts',
    'catalog_categories',
    'catalog_combos',
    'catalog_items',
    'combo_items',
    'idempotency_records',
    'identity_verification_challenges',
    'integration_accounts',
    'item_addon_groups',
    'media_assets',
    'migration_records',
    'migration_runs',
    'onboarding_handoffs',
    'order_events',
    'order_line_options',
    'order_lines',
    'orders',
    'outbox_events',
    'payment_attempts',
    'print_agents',
    'print_job_attempts',
    'print_jobs',
    'provider_resource_routes',
    'tenant_counters',
    'tenant_entitlement_snapshots',
    'tenant_locations',
    'tenant_memberships',
    'tenant_settings',
    'tenants',
    'user_sessions',
    'users',
    'webhook_events'
  ]
  LOOP
    policy_name := protected_table || '_migration_maintenance';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy
      WHERE polrelid = format('public.%I', protected_table)::regclass
        AND polname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I TO komanda_migration USING (true) WITH CHECK (true)',
        policy_name,
        protected_table
      );
    END IF;
  END LOOP;
END $$;
