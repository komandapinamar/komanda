-- Grants are enumerated per table on purpose. A blanket
-- `GRANT ... ON ALL TABLES IN SCHEMA public` would also grant the runtime role
-- INSERT/UPDATE/DELETE on `plan_definitions` and `global_product_catalog`,
-- which carry no RLS policy, and would attach rights to the security_barrier
-- analytics views whose boundary is owned by migration 0018.

-- 1. Operational tables the runtime role needs for DML.
--    Every table listed here has ENABLE + FORCE ROW LEVEL SECURITY and a
--    `*_runtime_isolation` policy (see migrations 0000..0021).
DO $$
DECLARE
  target text;
  tables text[] := ARRAY[
    'addon_groups', 'addon_options', 'audit_events', 'billing_documents',
    'cart_line_options', 'cart_lines', 'carts', 'cash_register_movements',
    'cash_shifts', 'catalog_categories', 'catalog_combos', 'catalog_items',
    'combo_items', 'discount_categories', 'discount_items', 'discount_redemptions',
    'discounts', 'idempotency_records', 'integration_accounts', 'inventory_levels',
    'inventory_movements', 'item_addon_groups', 'media_assets', 'mp_financial_records',
    'order_events', 'order_line_options', 'order_lines', 'orders', 'outbox_events',
    'payment_attempts', 'print_agent_pairings', 'print_agents', 'print_job_attempts',
    'print_jobs', 'printer_destinations', 'provider_resource_routes',
    'public_search_tenants', 'storefront_item_events', 'storefront_sessions',
    'tenant_counters', 'tenant_entitlement_snapshots', 'tenant_locations',
    'tenant_memberships', 'tenant_settings', 'tenants', 'user_sessions', 'users',
    'webhook_events'
  ];
BEGIN
  FOREACH target IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', target)) IS NULL THEN
      RAISE EXCEPTION '0022 expects table public.% to exist', target;
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO komanda_runtime', target);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO komanda_migration', target);
  END LOOP;

  -- Reference tables without a `tenant_id` column, so no RLS policy can exist.
  -- `global_product_catalog` is a cross-tenant cache that BarcodeLookupService
  -- reads and fills from inside a tenant transaction, so it needs INSERT.
  EXECUTE 'GRANT SELECT, INSERT ON TABLE public.global_product_catalog TO komanda_runtime';
  EXECUTE 'GRANT ALL ON TABLE public.global_product_catalog TO komanda_migration';
  -- `plan_definitions` is catalogue data for entitlements: read-only at runtime.
  EXECUTE 'GRANT SELECT ON TABLE public.plan_definitions TO komanda_runtime';
  EXECUTE 'GRANT ALL ON TABLE public.plan_definitions TO komanda_migration';

  -- Migration 0000 ran `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN
  -- SCHEMA public` before plan_definitions could be reviewed, which handed the
  -- runtime role write access to entitlement and pricing data that has no RLS.
  -- Enumerating the grants above is not enough on its own: the old blanket grant
  -- is still in force, so it has to be revoked explicitly.
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.plan_definitions FROM komanda_runtime';
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO komanda_runtime;
--> statement-breakpoint
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO komanda_migration;
--> statement-breakpoint

-- Default privileges are scoped to the migration role explicitly. Without
-- FOR ROLE they bind to whichever role happens to execute this migration, so a
-- table created by a different role would silently get no runtime grants.
ALTER DEFAULT PRIVILEGES FOR ROLE komanda_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO komanda_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE komanda_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO komanda_runtime;